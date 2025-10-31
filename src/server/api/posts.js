import * as db from '../db.js';
import { logger, fetchUrlAsMarkdown, sendToSlack } from '../utils.js';
import { summarizePost } from '../extractors.js';

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

/**
 * POST /api/posts/truncate - Delete all posts
 */
export async function truncate(req, reply) {
  try {
    const result = db.truncatePosts();
    logger.info(`Truncated posts table, deleted ${result.deletedCount} posts`);
    return { success: true, deletedCount: result.deletedCount };
  } catch (error) {
    logger.error('Failed to truncate posts', { error: error.message });
    return reply.code(500).send({ error: 'Failed to truncate posts' });
  }
}

/**
 * DELETE /api/posts/:id - Delete a single post
 */
export async function remove(req, reply) {
  try {
    db.deletePost(req.params.id);
    logger.info('Post deleted', { id: req.params.id });
    return { success: true };
  } catch (error) {
    logger.error('Failed to delete post', { error: error.message });
    return reply.code(500).send({ error: 'Failed to delete post' });
  }
}

/**
 * POST /api/posts/:id/fetch-and-summarize - Fetch post URL, convert to markdown, and summarize
 */
export async function fetchAndSummarize(req, reply) {
  try {
    const postId = req.params.id;
    const post = db.getPost(postId);

    if (!post) {
      return reply.code(404).send({ error: 'Post not found' });
    }

    if (!post.url) {
      return reply.code(400).send({ error: 'Post has no URL' });
    }

    logger.info('Fetching and summarizing post', { postId, url: post.url });

    // Fetch URL and convert to markdown
    const { markdown } = await fetchUrlAsMarkdown(post.url);

    if (!markdown || markdown.trim().length === 0) {
      return reply.code(400).send({ error: 'Failed to extract content from URL' });
    }

    // Summarize the markdown content
    const summary = await summarizePost(markdown);

    // Update the post with content_full and new summary
    db.updatePost(postId, {
      content_full: markdown,
      summary: summary,
    });

    logger.info('Successfully fetched and summarized post, updated database', { postId });

    // Return updated post
    const updatedPost = db.getPost(postId);

    return {
      success: true,
      post: updatedPost,
    };
  } catch (error) {
    logger.error('Failed to fetch and summarize post', {
      postId: req.params.id,
      error: error.message,
    });
    return reply.code(500).send({ error: `Failed to fetch and summarize: ${error.message}` });
  }
}

/**
 * PUT /api/posts/:id/flag - Toggle flagged status for a post
 */
export async function toggleFlag(req, reply) {
  try {
    const postId = req.params.id;
    const { flagged } = req.body;

    if (flagged !== 0 && flagged !== 1) {
      return reply.code(400).send({ error: 'Flagged must be 0 or 1' });
    }

    const post = db.getPost(postId);
    if (!post) {
      return reply.code(404).send({ error: 'Post not found' });
    }

    db.updatePost(postId, { flagged });
    logger.info('Post flagged status updated', { postId, flagged });

    return { success: true, flagged };
  } catch (error) {
    logger.error('Failed to update post flagged status', { error: error.message });
    return reply.code(500).send({ error: 'Failed to update flagged status' });
  }
}

/**
 * POST /api/posts/:id/notify - Send a single post to Slack
 * Body: { channel: 'optional-channel-name' }
 */
export async function notify(req, reply) {
  try {
    const postId = req.params.id;
    const { channel } = req.body || {};
    const post = db.getPost(postId);

    if (!post) {
      return reply.code(404).send({ error: 'Post not found' });
    }

    // Check if Slack webhook URL is configured
    const webhookUrl = db.getConfig('slack_webhook_url');
    if (!webhookUrl) {
      return reply.code(400).send({ error: 'Slack webhook URL not configured' });
    }

    // Get configured channels and validate if channel is specified
    const slackChannelsConfig = db.getConfig('slack_channels');
    const availableChannels = slackChannelsConfig
      ? slackChannelsConfig.split(',').map(c => c.trim().replace(/^#/, '')).filter(c => c)
      : [];

    // Normalize and validate channel if provided
    let targetChannel = null;
    if (channel) {
      if (availableChannels.length === 0) {
        return reply.code(400).send({
          error: 'No Slack channels configured. Please configure channels in Settings.'
        });
      }

      const normalizedChannel = channel.trim().replace(/^#/, '');
      const isValidChannel = availableChannels.some(c => c === normalizedChannel);

      if (!isValidChannel) {
        return reply.code(400).send({
          error: `Invalid channel: ${channel}. Available channels: ${availableChannels.join(', ')}`
        });
      }

      targetChannel = normalizedChannel;
    } else {
      // Use first channel as default if no channel specified
      targetChannel = availableChannels.length > 0 ? availableChannels[0] : null;
    }

    // Send to Slack using utility function
    try {
      const botName = db.getConfig('slack_bot_name');
      const botIcon = db.getConfig('slack_bot_icon');

      await sendToSlack(post, {
        webhookUrl,
        channel: targetChannel,
        botName,
        botIcon,
      });

      // Update post as notified
      db.updatePost(postId, { notified: 1 });

      return {
        success: true,
        notified: true,
        channel: targetChannel || 'default'
      };
    } catch (slackError) {
      return reply.code(502).send({
        error: `Failed to send to Slack: ${slackError.message}`,
      });
    }
  } catch (error) {
    logger.error('Failed to notify post', { error: error.message });
    return reply.code(500).send({ error: 'Failed to notify post' });
  }
}
