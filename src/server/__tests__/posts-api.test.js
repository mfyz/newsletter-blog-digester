import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import * as postsAPI from '../api/posts.js';
import * as db from '../db.js';

const PostsAPITests = suite('Posts API Tests');

let testDb;
let mockReply;

PostsAPITests.before(() => {
  try {
    testDb = db.initDb(':memory:');
  } catch (e) {
    // Database might already be initialized by a previous test
    testDb = db.getDb();
  }
});

PostsAPITests.before.each(() => {
  // Clean up sites and posts before each test
  const sites = db.getAllSites();
  sites.forEach(site => db.deleteSite(site.id));

  mockReply = {
    _code: null,
    _sent: null,
    code: function(val) { this._code = val; return this; },
    send: function(val) { this._sent = val; return this; },
  };
});

PostsAPITests.after(() => {
  // Don't close the database - it might be shared with other tests
});

// GET /api/posts - Get all posts
PostsAPITests('getAll should return all posts', async () => {
  // Create a site first
  const site = db.createSite({ url: 'https://example.com/rss', title: 'Test Site', type: 'rss' });

  // Create some posts
  db.createPost({ url: 'https://example.com/post1', title: 'Post 1', site_id: site.id });
  db.createPost({ url: 'https://example.com/post2', title: 'Post 2', site_id: site.id });

  const result = await postsAPI.getAll({ query: {} }, mockReply);

  assert.equal(result.length, 2);
  assert.equal(result[0].title, 'Post 1');
});

PostsAPITests('getAll should filter by site_id', async () => {
  const site1 = db.createSite({ url: 'https://site1.com/rss', title: 'Site 1', type: 'rss' });
  const site2 = db.createSite({ url: 'https://site2.com/rss', title: 'Site 2', type: 'rss' });

  db.createPost({ url: 'https://site1.com/post1', title: 'Site 1 Post', site_id: site1.id });
  db.createPost({ url: 'https://site2.com/post1', title: 'Site 2 Post', site_id: site2.id });

  const result = await postsAPI.getAll({ query: { site_id: String(site1.id) } }, mockReply);

  assert.equal(result.length, 1);
  assert.equal(result[0].title, 'Site 1 Post');
});

PostsAPITests('getOne should return post by id', async () => {
  const site = db.createSite({ url: 'https://example.com/rss', title: 'Test Site', type: 'rss' });
  const post = db.createPost({ url: 'https://example.com/post1', title: 'Test Post', site_id: site.id });

  const result = await postsAPI.getOne({ params: { id: String(post.id) } }, mockReply);

  assert.equal(result.title, 'Test Post');
});

PostsAPITests('getOne should return 404 for non-existent post', async () => {
  await postsAPI.getOne({ params: { id: '999' } }, mockReply);

  assert.equal(mockReply._code, 404);
  assert.equal(mockReply._sent.error, 'Post not found');
});

PostsAPITests.run();
