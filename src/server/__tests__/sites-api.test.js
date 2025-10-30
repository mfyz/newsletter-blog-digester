import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import * as sitesAPI from '../api/sites.js';
import * as db from '../db.js';

const SitesAPITests = suite('Sites API Tests');

let testDb;
let mockReply;

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

SitesAPITests.run();
