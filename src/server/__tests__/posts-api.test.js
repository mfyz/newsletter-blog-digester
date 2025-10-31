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

  // Create some posts with explicit dates to ensure predictable ordering
  const post1 = db.createPost({
    url: 'https://example.com/post1',
    title: 'Post 1',
    site_id: site.id,
    date: '2024-01-01T00:00:00Z',
  });
  const post2 = db.createPost({
    url: 'https://example.com/post2',
    title: 'Post 2',
    site_id: site.id,
    date: '2024-01-02T00:00:00Z',
  });

  const result = await postsAPI.getAll({ query: {} }, mockReply);

  assert.equal(result.length, 2);
  // Posts are sorted by date DESC - so Post 2 (newer date) comes first
  assert.equal(result[0].title, 'Post 2');
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

// ========== Additional GET /api/posts filter tests ==========
PostsAPITests('getAll should filter by search parameter', async () => {
  const site = db.createSite({ url: 'https://example.com/rss', title: 'Test Site', type: 'rss' });

  db.createPost({ url: 'https://example.com/post1', title: 'JavaScript Tutorial', site_id: site.id, content: 'Learn JavaScript basics' });
  db.createPost({ url: 'https://example.com/post2', title: 'Python Guide', site_id: site.id, content: 'Python programming tips' });
  db.createPost({ url: 'https://example.com/post3', title: 'JavaScript Advanced', site_id: site.id, content: 'Advanced JS concepts' });

  const result = await postsAPI.getAll({ query: { search: 'JavaScript' } }, mockReply);

  assert.equal(result.length, 2);
  assert.ok(result.every(post => post.title.includes('JavaScript') || post.content.includes('JavaScript')));
});

PostsAPITests('getAll should respect limit parameter', async () => {
  const site = db.createSite({ url: 'https://example.com/rss', title: 'Test Site', type: 'rss' });

  // Create 5 posts
  for (let i = 1; i <= 5; i++) {
    db.createPost({ url: `https://example.com/post${i}`, title: `Post ${i}`, site_id: site.id });
  }

  const result = await postsAPI.getAll({ query: { limit: '3' } }, mockReply);

  assert.equal(result.length, 3);
});

PostsAPITests('getAll should handle combined filters (site_id + search + limit)', async () => {
  const site1 = db.createSite({ url: 'https://site1.com/rss', title: 'Site 1', type: 'rss' });
  const site2 = db.createSite({ url: 'https://site2.com/rss', title: 'Site 2', type: 'rss' });

  // Create posts for both sites
  db.createPost({ url: 'https://site1.com/post1', title: 'React Tutorial', site_id: site1.id });
  db.createPost({ url: 'https://site1.com/post2', title: 'React Advanced', site_id: site1.id });
  db.createPost({ url: 'https://site1.com/post3', title: 'Vue Tutorial', site_id: site1.id });
  db.createPost({ url: 'https://site2.com/post1', title: 'React Guide', site_id: site2.id });

  const result = await postsAPI.getAll({
    query: {
      site_id: String(site1.id),
      search: 'React',
      limit: '10'
    }
  }, mockReply);

  assert.equal(result.length, 2);
  assert.ok(result.every(post => post.site_id === site1.id && post.title.includes('React')));
});

// ========== DELETE /api/posts/:id tests ==========
PostsAPITests('remove should delete a post successfully', async () => {
  const site = db.createSite({ url: 'https://example.com/rss', title: 'Test Site', type: 'rss' });
  const post = db.createPost({ url: 'https://example.com/post1', title: 'Test Post', site_id: site.id });

  const result = await postsAPI.remove({ params: { id: String(post.id) } }, mockReply);

  assert.equal(result.success, true);

  // Verify post was deleted
  const deletedPost = db.getPost(post.id);
  assert.is(deletedPost, undefined);
});

PostsAPITests('remove should handle deletion of non-existent post', async () => {
  // Try to delete non-existent post - deletePost doesn't throw error for non-existent IDs
  const result = await postsAPI.remove({ params: { id: '999' } }, mockReply);

  // Should still return success (deletePost doesn't fail for non-existent IDs)
  assert.equal(result.success, true);
});

// ========== POST /api/posts/truncate tests ==========
PostsAPITests('truncate should delete all posts', async () => {
  const site = db.createSite({ url: 'https://example.com/rss', title: 'Test Site', type: 'rss' });

  // Create several posts
  db.createPost({ url: 'https://example.com/post1', title: 'Post 1', site_id: site.id });
  db.createPost({ url: 'https://example.com/post2', title: 'Post 2', site_id: site.id });
  db.createPost({ url: 'https://example.com/post3', title: 'Post 3', site_id: site.id });

  const result = await postsAPI.truncate({}, mockReply);

  assert.equal(result.success, true);
  assert.equal(result.deletedCount, 3);

  // Verify all posts were deleted
  const remainingPosts = db.getPosts({});
  assert.equal(remainingPosts.length, 0);
});

PostsAPITests('truncate should return 0 count when no posts exist', async () => {
  const result = await postsAPI.truncate({}, mockReply);

  assert.equal(result.success, true);
  assert.equal(result.deletedCount, 0);
});

// ========== PUT /api/posts/:id/flag tests ==========
PostsAPITests('toggleFlag should flag a post successfully', async () => {
  const site = db.createSite({ url: 'https://example.com/rss', title: 'Test Site', type: 'rss' });
  const post = db.createPost({ url: 'https://example.com/post1', title: 'Test Post', site_id: site.id });

  // Flag the post
  const result = await postsAPI.toggleFlag(
    { params: { id: String(post.id) }, body: { flagged: 1 } },
    mockReply
  );

  assert.equal(result.success, true);
  assert.equal(result.flagged, 1);

  // Verify post was flagged in database
  const updatedPost = db.getPost(post.id);
  assert.equal(updatedPost.flagged, 1);
});

PostsAPITests('toggleFlag should unflag a post successfully', async () => {
  const site = db.createSite({ url: 'https://example.com/rss', title: 'Test Site', type: 'rss' });
  const post = db.createPost({ url: 'https://example.com/post1', title: 'Test Post', site_id: site.id });

  // Flag the post first
  db.updatePost(post.id, { flagged: 1 });

  // Unflag the post
  const result = await postsAPI.toggleFlag(
    { params: { id: String(post.id) }, body: { flagged: 0 } },
    mockReply
  );

  assert.equal(result.success, true);
  assert.equal(result.flagged, 0);

  // Verify post was unflagged in database
  const updatedPost = db.getPost(post.id);
  assert.equal(updatedPost.flagged, 0);
});

PostsAPITests('toggleFlag should return 404 for non-existent post', async () => {
  await postsAPI.toggleFlag(
    { params: { id: '999' }, body: { flagged: 1 } },
    mockReply
  );

  assert.equal(mockReply._code, 404);
  assert.equal(mockReply._sent.error, 'Post not found');
});

PostsAPITests('toggleFlag should return 400 for invalid flagged value', async () => {
  const site = db.createSite({ url: 'https://example.com/rss', title: 'Test Site', type: 'rss' });
  const post = db.createPost({ url: 'https://example.com/post1', title: 'Test Post', site_id: site.id });

  // Try to set invalid flagged value
  await postsAPI.toggleFlag(
    { params: { id: String(post.id) }, body: { flagged: 2 } },
    mockReply
  );

  assert.equal(mockReply._code, 400);
  assert.equal(mockReply._sent.error, 'Flagged must be 0 or 1');
});

PostsAPITests('toggleFlag should return 400 for missing flagged value', async () => {
  const site = db.createSite({ url: 'https://example.com/rss', title: 'Test Site', type: 'rss' });
  const post = db.createPost({ url: 'https://example.com/post1', title: 'Test Post', site_id: site.id });

  // Try to call without flagged value
  await postsAPI.toggleFlag(
    { params: { id: String(post.id) }, body: {} },
    mockReply
  );

  assert.equal(mockReply._code, 400);
  assert.equal(mockReply._sent.error, 'Flagged must be 0 or 1');
});

PostsAPITests.run();
