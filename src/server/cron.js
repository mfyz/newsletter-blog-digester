import cron from 'node-cron';
import * as db from './db.js';
import { logger, sendToSlack } from './utils.js';
import {
  fetchSiteContent,
  summarizePost,
  cleanupOldContent,
} from './extractors.js';

let cronTask = null;

/**
 * Cron job status tracking
 * @type {{
 *   running: boolean,
 *   phase: 'idle' | 'fetching' | 'summarizing' | 'complete',
 *   sites: { processed: number, total: number },
 *   newPosts: number,
 *   summaries: { processed: number, total: number },
 *   startedAt: string | null,
 *   completedAt: string | null,
 *   error: string | null
 * }}
 */
let cronStatus = {
  running: false,
  phase: 'idle',
  sites: { processed: 0, total: 0 },
  newPosts: 0, // Total new posts found
  summaries: { processed: 0, total: 0 }, // Posts that needed summarization
  startedAt: null,
  completedAt: null,
  error: null,
};

/**
 * Get current cron job status
 * @returns {typeof cronStatus}
 */
export function getStatus() {
  return { ...cronStatus };
}

/**
 * Reset status to initial state
 */
function resetStatus() {
  cronStatus = {
    running: false,
    phase: 'idle',
    sites: { processed: 0, total: 0 },
    newPosts: 0,
    summaries: { processed: 0, total: 0 },
    startedAt: null,
    completedAt: null,
    error: null,
  };
}

/**
 * Main cron job function - checks all active sites and processes new posts
 * Phase 1: Fetch all sites and save posts to DB
 * Phase 2: Summarize all queued posts with LLM
 */
export async function runCheck() {
  if (cronStatus.running) {
    logger.warn('Cron check already running, skipping');
    return;
  }

  // Initialize status
  resetStatus();
  cronStatus.running = true;
  cronStatus.phase = 'fetching';
  cronStatus.startedAt = new Date().toISOString();
  logger.info('Starting cron check');

  try {
    const sites = db.getActiveSites();
    cronStatus.sites.total = sites.length;
    logger.info(`Checking ${sites.length} active sites`);

    // Queue for posts that need summarization
    const summarizationQueue = [];
    const newPostsForSlack = [];

    // ============================================
    // PHASE 1: Fetch all sites and save posts
    // ============================================
    for (const site of sites) {
      try {
        logger.info(`Checking site: ${site.title}`, { site_id: site.id });

        // Fetch posts from site
        const posts = await fetchSiteContent(site);

        // Update last_checked timestamp
        db.updateSite(site.id, {
          last_checked: new Date().toISOString(),
        });

        logger.info(`Fetched ${posts.length} posts from ${site.title}`);

        // Process each post - save to DB and queue for summarization
        for (const post of posts) {
          // Try to create post (will return null if duplicate)
          const savedPost = db.createPost({
            site_id: site.id,
            date: post.date,
            url: post.url,
            title: post.title,
            content: post.content,
            summary: null, // Will be filled in summarization phase
            notified: 0,
          });

          // If post was saved (not duplicate)
          if (savedPost) {
            // Track new posts count
            cronStatus.newPosts++;

            // Add site title for Slack message
            savedPost.site_title = site.title;
            newPostsForSlack.push(savedPost);

            // Queue for summarization if we have enough content
            if (post.content && post.content.length > 100) {
              summarizationQueue.push({
                postId: savedPost.id,
                content: post.content,
                title: post.title,
              });
            }

            logger.info(`Saved new post: ${post.title}`, {
              site_id: site.id,
              post_id: savedPost.id,
            });
          }
        }
      } catch (error) {
        logger.error(`Failed to process site ${site.title}`, {
          error: error.message,
          site_id: site.id,
        });
      }

      // Update sites progress
      cronStatus.sites.processed++;
    }

    logger.info(
      `Phase 1 complete: ${newPostsForSlack.length} new posts found, ${summarizationQueue.length} queued for summarization`,
    );

    // ============================================
    // PHASE 2: Summarize all queued posts
    // ============================================
    cronStatus.phase = 'summarizing';
    cronStatus.summaries.total = summarizationQueue.length;

    for (const item of summarizationQueue) {
      try {
        const summary = await summarizePost(item.content);
        if (summary) {
          db.updatePost(item.postId, { summary });

          // Update the post in newPostsForSlack with the summary
          const slackPost = newPostsForSlack.find((p) => p.id === item.postId);
          if (slackPost) {
            slackPost.summary = summary;
          }
        }
      } catch (error) {
        logger.error(`Failed to summarize post ${item.postId}`, {
          error: error.message,
        });
      }

      // Update summaries progress
      cronStatus.summaries.processed++;
    }

    logger.info(
      `Phase 2 complete: ${cronStatus.summaries.processed} posts summarized`,
    );

    // ============================================
    // Send to Slack if enabled
    // ============================================
    if (newPostsForSlack.length > 0) {
      const enableCronSlackDigest = db.getConfig('enable_cron_slack_digest');

      if (enableCronSlackDigest === '1') {
        try {
          const webhookUrl = db.getConfig('slack_webhook_url');
          const botName = db.getConfig('slack_bot_name');
          const botIcon = db.getConfig('slack_bot_icon');

          const sent = await sendToSlack(newPostsForSlack, {
            webhookUrl,
            botName,
            botIcon,
          });

          if (sent) {
            // Mark posts as notified
            newPostsForSlack.forEach((post) => {
              db.updatePost(post.id, { notified: 1 });
            });
          }
        } catch (error) {
          logger.error('Failed to send Slack notification', {
            error: error.message,
          });
        }
      } else {
        logger.info('Cron Slack digest disabled, skipping notification');
      }
    }

    logger.info(
      `Cron check complete: ${newPostsForSlack.length} new posts found`,
    );
  } catch (error) {
    logger.error('Cron check failed', { error: error.message });
    cronStatus.error = error.message;
  } finally {
    cronStatus.running = false;
    cronStatus.phase = 'complete';
    cronStatus.completedAt = new Date().toISOString();
  }
}

/**
 * Update cron schedule
 */
export function updateSchedule(schedule) {
  try {
    // Validate cron expression
    if (!cron.validate(schedule)) {
      throw new Error(`Invalid cron expression: ${schedule}`);
    }

    // Stop existing cron task
    if (cronTask) {
      cronTask.stop();
      logger.info('Stopped existing cron task');
    }

    // Create new cron task
    cronTask = cron.schedule(schedule, () => {
      runCheck().catch((err) => {
        logger.error('Scheduled cron check failed', { error: err.message });
      });
    });

    logger.info(`Cron schedule updated: ${schedule}`);
  } catch (error) {
    logger.error('Failed to update cron schedule', { error: error.message });
    throw error;
  }
}

/**
 * Initialize cron with schedule from config
 */
export function initCron() {
  try {
    const schedule = db.getConfig('schedule');
    if (schedule) {
      updateSchedule(schedule);
      logger.info('Cron initialized with schedule from config');
    } else {
      logger.warn('No schedule found in config, cron not started');
    }
  } catch (error) {
    logger.error('Failed to initialize cron', { error: error.message });
  }
}

/**
 * Daily cleanup job
 */
function startCleanupJob() {
  // Run at midnight every day
  cron.schedule('0 0 * * *', () => {
    try {
      const result = cleanupOldContent();
      logger.info('Database cleanup completed', result);
    } catch (error) {
      logger.error('Database cleanup failed', { error: error.message });
    }
  });

  logger.info('Cleanup job scheduled for midnight daily');
}

// Initialize cleanup job (skip during tests)
if (process.env.NODE_ENV !== 'test') {
  startCleanupJob();
}

export default { runCheck, updateSchedule, initCron, getStatus };
