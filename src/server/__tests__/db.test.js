import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import Database from 'better-sqlite3';
import {
  initDb,
  getDb,
  getAllSites,
  createSite,
  getSite,
  updateSite,
  deleteSite,
  getAllConfig,
  getConfig,
  setConfig,
  closeDb,
} from '../db.js';

const DbTests = suite('Database Tests');

let testDb;

DbTests.before(() => {
  // Use in-memory database for tests
  testDb = initDb(':memory:');
});

DbTests.after(() => {
  closeDb();
});

DbTests('should initialize database with tables', () => {
  const tables = testDb
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('sites', 'posts', 'config', 'logs')",
    )
    .all();

  assert.is(tables.length, 4);
});

DbTests('should seed default config', () => {
  const config = getAllConfig();

  assert.ok(config.schedule);
  assert.ok(config.prompt_summarization);
  assert.ok(config.prompt_html_extract_base);
});

DbTests('should create and retrieve a site', () => {
  const site = createSite({
    url: 'https://example.com/rss',
    title: 'Test Blog',
    type: 'rss',
  });

  assert.ok(site.id);
  assert.is(site.title, 'Test Blog');
  assert.is(site.type, 'rss');

  const retrieved = getSite(site.id);
  assert.equal(retrieved, site);
});

DbTests('should update a site', () => {
  const site = createSite({
    url: 'https://example2.com/rss',
    title: 'Another Blog',
    type: 'rss',
  });

  const updated = updateSite(site.id, {
    title: 'Updated Blog Title',
    is_active: 0,
  });

  assert.is(updated.title, 'Updated Blog Title');
  assert.is(updated.is_active, 0);
});

DbTests('should delete a site', () => {
  const site = createSite({
    url: 'https://example3.com/rss',
    title: 'To Be Deleted',
    type: 'rss',
  });

  deleteSite(site.id);

  const retrieved = getSite(site.id);
  assert.is(retrieved, undefined);
});

DbTests('should get all sites', () => {
  // Clear existing sites first
  const existing = getAllSites();
  existing.forEach((s) => deleteSite(s.id));

  createSite({ url: 'https://site1.com/rss', title: 'Site 1', type: 'rss' });
  createSite({ url: 'https://site2.com/rss', title: 'Site 2', type: 'rss' });

  const sites = getAllSites();
  assert.is(sites.length, 2);
});

DbTests('should set and get config', () => {
  setConfig('test_key', 'test_value');
  const value = getConfig('test_key');

  assert.is(value, 'test_value');
});

DbTests.run();
