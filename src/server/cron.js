import cron from 'node-cron';
import * as db from './db.js';
import { logger } from './utils.js';
import {
  fetchSiteContent,
  summarizePost,
  sendToSlack,
  cleanupOldContent,
} from './extractors.js';

let cronTask = null;
let isRunning = false;

/**
 * Main cron job function - checks all active sites and processes new posts
 */
export async function runCheck() {
  if (isRunning) {
    logger.warn('Cron check already running, skipping');
    return;
  }

  isRunning = true;
  logger.info('Starting cron check');

  try {
    const sites = db.getActiveSites();
    logger.info(`Checking ${sites.length} active sites`);

    let totalNewPosts = 0;
    const newPostsForSlack = [];

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

        // Process each post
        for (const post of posts) {
          // Try to create post (will return null if duplicate)
          const savedPost = db.createPost({
            site_id: site.id,
            date: post.date,
            url: post.url,
            title: post.title,
            content: post.content,
            summary: null, // Will be filled in next step
            notified: 0,
          });

          // If post was saved (not duplicate)
          if (savedPost) {
            totalNewPosts++;

            // Summarize content if we have content
            if (post.content && post.content.length > 100) {
              try {
                const summary = await summarizePost(post.content);
                if (summary) {
                  db.updatePost(savedPost.id, { summary });
                  savedPost.summary = summary;
                }
              } catch (error) {
                logger.error(`Failed to summarize post ${savedPost.id}`, {
                  error: error.message,
                });
              }
            }

            // Add site title for Slack message
            savedPost.site_title = site.title;
            newPostsForSlack.push(savedPost);

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
    }

    logger.info(`Cron check complete: ${totalNewPosts} new posts found`);

    // Send to Slack if we have new posts and cron digest is enabled
    if (newPostsForSlack.length > 0) {
      const enableCronSlackDigest = db.getConfig('enable_cron_slack_digest');

      if (enableCronSlackDigest === '1') {
        try {
          const sent = await sendToSlack(newPostsForSlack);
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
  } catch (error) {
    logger.error('Cron check failed', { error: error.message });
  } finally {
    isRunning = false;
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

export default { runCheck, updateSchedule, initCron };
