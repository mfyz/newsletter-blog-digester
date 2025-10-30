import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import sinon from 'sinon';
import axios from 'axios';
import * as sitesAPI from '../api/sites.js';
import * as db from '../db.js';
import * as extractors from '../extractors.js';

const SitesAPITests = suite('Sites API Tests');

let testDb;
let mockReply;
let axiosStub;
let extractorStub;

SitesAPITests.before(() => {
  try {
    testDb = db.initDb(':memory:');
  } catch (e) {
    testDb = db.getDb();
  }
});

SitesAPITests.before.each(() => {
  // Clean up sites before each test
  const sites = db.getAllSites();
  sites.forEach(site => db.deleteSite(site.id));

  mockReply = {
    _code: null,
    _sent: null,
    code: function(val) { this._code = val; return this; },
    send: function(val) { this._sent = val; return this; },
  };
});

SitesAPITests.after.each(() => {
  // Restore all stubs after each test
  sinon.restore();
});

SitesAPITests.after(() => {
  // Don't close the database - it might be shared with other tests
});

SitesAPITests('getAll should return all sites', async () => {
  db.createSite({ url: 'https://site1.com/rss', title: 'Site 1', type: 'rss' });
  db.createSite({ url: 'https://site2.com/rss', title: 'Site 2', type: 'rss' });

  const result = await sitesAPI.getAll({}, mockReply);

  assert.ok(result.length >= 2);
});

SitesAPITests('create should create a new site', async () => {
  const reqBody = { url: 'https://example.com/rss', title: 'New Site', type: 'rss' };

  const result = await sitesAPI.create({ body: reqBody }, mockReply);

  assert.ok(result.id);
  assert.equal(result.title, 'New Site');
});

SitesAPITests('create should fail without required fields', async () => {
  const reqBody = { url: 'https://example.com/rss' }; // Missing title

  await sitesAPI.create({ body: reqBody }, mockReply);

  assert.equal(mockReply._code, 400);
  assert.equal(mockReply._sent.error, 'URL and title are required');
});

// ========== getOne() Tests ==========
SitesAPITests('getOne should return site by id', async () => {
  const site = db.createSite({ url: 'https://example.com/rss', title: 'Test Site', type: 'rss' });

  const result = await sitesAPI.getOne({ params: { id: String(site.id) } }, mockReply);

  assert.equal(result.id, site.id);
  assert.equal(result.title, 'Test Site');
});

SitesAPITests('getOne should return 404 for non-existent site', async () => {
  await sitesAPI.getOne({ params: { id: '999' } }, mockReply);

  assert.equal(mockReply._code, 404);
  assert.equal(mockReply._sent.error, 'Site not found');
});

// ========== update() Tests ==========
SitesAPITests('update should update site fields', async () => {
  const site = db.createSite({ url: 'https://example.com/rss', title: 'Old Title', type: 'rss' });

  const reqBody = { title: 'New Title', url: 'https://newurl.com/rss' };
  const result = await sitesAPI.update({ params: { id: String(site.id) }, body: reqBody }, mockReply);

  assert.equal(result.title, 'New Title');
  assert.equal(result.url, 'https://newurl.com/rss');
});

SitesAPITests('update should handle partial updates', async () => {
  const site = db.createSite({ url: 'https://example.com/rss', title: 'Test Site', type: 'rss' });

  const reqBody = { title: 'Updated Title' };
  const result = await sitesAPI.update({ params: { id: String(site.id) }, body: reqBody }, mockReply);

  assert.equal(result.title, 'Updated Title');
  assert.equal(result.url, site.url); // URL should remain unchanged
});

SitesAPITests('update should handle is_active status', async () => {
  const site = db.createSite({ url: 'https://example.com/rss', title: 'Test Site', type: 'rss', is_active: 1 });

  const reqBody = { is_active: 0 };
  const result = await sitesAPI.update({ params: { id: String(site.id) }, body: reqBody }, mockReply);

  assert.equal(result.is_active, 0);
});

// ========== remove() Tests ==========
SitesAPITests('remove should delete site', async () => {
  const site = db.createSite({ url: 'https://example.com/rss', title: 'Test Site', type: 'rss' });

  const result = await sitesAPI.remove({ params: { id: String(site.id) } }, mockReply);

  assert.equal(result.success, true);

  // Verify site was deleted
  const deletedSite = db.getSite(site.id);
  assert.is(deletedSite, undefined);
});

// ========== toggleActive() Tests ==========
SitesAPITests('toggleActive should toggle active to inactive', async () => {
  const site = db.createSite({ url: 'https://example.com/rss', title: 'Test Site', type: 'rss', is_active: 1 });

  const result = await sitesAPI.toggleActive({ params: { id: String(site.id) } }, mockReply);

  assert.equal(result.success, true);
  assert.equal(result.is_active, 0);
});

SitesAPITests('toggleActive should toggle inactive to active', async () => {
  const site = db.createSite({ url: 'https://example.com/rss', title: 'Test Site', type: 'rss', is_active: 0 });

  const result = await sitesAPI.toggleActive({ params: { id: String(site.id) } }, mockReply);

  assert.equal(result.success, true);
  assert.equal(result.is_active, 1);
});

SitesAPITests('toggleActive should return 404 for non-existent site', async () => {
  await sitesAPI.toggleActive({ params: { id: '999' } }, mockReply);

  assert.equal(mockReply._code, 404);
  assert.equal(mockReply._sent.error, 'Site not found');
});

// ========== testLLMExtraction() Tests ==========
// Note: testLLMExtraction uses dynamic imports, making it difficult to mock in ES modules
// We test validation and error handling here. The actual extraction logic is tested in extractors.test.js

SitesAPITests('testLLMExtraction should validate URL is required', async () => {
  const reqBody = {}; // Missing URL

  await sitesAPI.testLLMExtraction({ body: reqBody }, mockReply);

  assert.equal(mockReply._code, 400);
  assert.equal(mockReply._sent.error, 'URL is required');
});

SitesAPITests('testLLMExtraction should handle missing OpenAI API key', async () => {
  // Store original OpenAI key
  const originalKey = db.getConfig('openai_api_key');

  // Clear OpenAI key to simulate missing key
  db.setConfig('openai_api_key', '');

  const reqBody = { url: 'https://example.com', extraction_instructions: 'Test' };

  try {
    await sitesAPI.testLLMExtraction({ body: reqBody }, mockReply);

    // Should return 500 with error message about missing API key
    assert.equal(mockReply._code, 500);
    assert.ok(mockReply._sent.error);
  } finally {
    // Restore original key
    if (originalKey) {
      db.setConfig('openai_api_key', originalKey);
    }
  }
});

SitesAPITests('testLLMExtraction should handle invalid URL gracefully', async () => {
  const reqBody = { url: 'not-a-valid-url-format', extraction_instructions: 'Test' };

  await sitesAPI.testLLMExtraction({ body: reqBody }, mockReply);

  // Should return 500 with error message (axios will fail on invalid URL)
  assert.equal(mockReply._code, 500);
  assert.ok(mockReply._sent.error);
});

// ========== fetchHTML() Tests ==========
SitesAPITests('fetchHTML should validate URL is required', async () => {
  const reqBody = {}; // Missing URL

  await sitesAPI.fetchHTML({ body: reqBody }, mockReply);

  assert.equal(mockReply._code, 400);
  assert.equal(mockReply._sent.error, 'URL is required');
});

SitesAPITests('fetchHTML should successfully fetch HTML from valid URL', async () => {
  const reqBody = { url: 'https://example.com' };
  const mockHTML = '<html><body><h1>Test Page</h1><p>Test content</p></body></html>';

  // Mock axios.get to return HTML
  axiosStub = sinon.stub(axios, 'get').resolves({
    data: mockHTML,
  });

  const result = await sitesAPI.fetchHTML({ body: reqBody }, mockReply);

  assert.equal(result.success, true);
  assert.equal(result.html, mockHTML);
  assert.equal(result.url, 'https://example.com');

  // Verify axios was called with correct parameters
  assert.ok(axiosStub.calledOnce);
  assert.equal(axiosStub.firstCall.args[0], 'https://example.com');
  assert.ok(axiosStub.firstCall.args[1].headers['User-Agent']);
  assert.equal(axiosStub.firstCall.args[1].timeout, 30000);

  axiosStub.restore();
});

SitesAPITests('fetchHTML should handle network errors', async () => {
  const reqBody = { url: 'https://nonexistent-domain-12345.com' };

  // Mock axios.get to throw network error
  axiosStub = sinon.stub(axios, 'get').rejects(new Error('getaddrinfo ENOTFOUND'));

  await sitesAPI.fetchHTML({ body: reqBody }, mockReply);

  // Should return 500 with error message
  assert.equal(mockReply._code, 500);
  assert.ok(mockReply._sent.error);

  axiosStub.restore();
});

SitesAPITests('fetchHTML should handle timeout errors', async () => {
  const reqBody = { url: 'https://example.com' };

  // Mock axios.get to throw timeout error
  axiosStub = sinon.stub(axios, 'get').rejects(new Error('timeout of 30000ms exceeded'));

  await sitesAPI.fetchHTML({ body: reqBody }, mockReply);

  // Should return 500 with error message
  assert.equal(mockReply._code, 500);
  assert.ok(mockReply._sent.error);
  assert.ok(mockReply._sent.error.includes('timeout'));

  axiosStub.restore();
});

SitesAPITests.run();
