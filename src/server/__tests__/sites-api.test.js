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

SitesAPITests.run();
