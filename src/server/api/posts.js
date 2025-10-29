import * as db from '../db.js';
import { logger } from '../utils.js';

/**
 * GET /api/posts - Get all posts with optional filters
 */
export async function getAll(req, reply) {
  try {
    const { site_id, search, limit = 100 } = req.query;

    const posts = db.getPosts({
      site_id: site_id ? parseInt(site_id) : undefined,
      search,
      limit: parseInt(limit),
    });

    return posts;
  } catch (error) {
    logger.error('Failed to get posts', { error: error.message });
    return reply.code(500).send({ error: 'Failed to fetch posts' });
  }
}

/**
 * GET /api/posts/:id - Get single post
 */
export async function getOne(req, reply) {
  try {
    const post = db.getPost(req.params.id);
    if (!post) {
      return reply.code(404).send({ error: 'Post not found' });
    }
    return post;
  } catch (error) {
    logger.error('Failed to get post', { error: error.message });
    return reply.code(500).send({ error: 'Failed to fetch post' });
  }
}
