import { getDb } from './db.js';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import * as cheerio from 'cheerio';
import axios from 'axios';

/**
 * Logger utility that logs to both console and database
 */
export const logger = {
  info(message, details = null) {
    console.log(`[INFO] ${message}`, details || '');
    this._logToDb('info', message, details);
  },

  error(message, details = null) {
    console.error(`[ERROR] ${message}`, details || '');
    this._logToDb('error', message, details);
  },

  warn(message, details = null) {
    console.warn(`[WARN] ${message}`, details || '');
    this._logToDb('warn', message, details);
  },

  _logToDb(level, message, details) {
    try {
      const db = getDb();
      const stmt = db.prepare(`
        INSERT INTO logs (level, message, details)
        VALUES (?, ?, ?)
      `);

      stmt.run(level, message, details ? JSON.stringify(details) : null);
    } catch (error) {
      // Fallback to console if DB logging fails
      console.error('Failed to log to database:', error.message);
    }
  },
};

/**
 * Convert relative URLs to absolute URLs
 */
export function toAbsoluteUrl(url, baseUrl) {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  try {
    const base = new URL(baseUrl);
    return new URL(url, base.origin).href;
  } catch (error) {
    return url;
  }
}

/**
 * Calculate time ago from date
 */
export function timeAgo(date) {
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);

  if (seconds < 60) return `${seconds} seconds ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
  if (seconds < 2592000) return `${Math.floor(seconds / 604800)} weeks ago`;
  if (seconds < 31536000) return `${Math.floor(seconds / 2592000)} months ago`;

  return `${Math.floor(seconds / 31536000)} years ago`;
}

/**
 * Sanitize HTML by removing script, style, and other non-content elements
 */
export function sanitizeHtml(html, selector = null) {
  const $ = cheerio.load(html);

  // Remove non-content elements
  $('script').remove();
  $('style').remove();
  $('path').remove();
  $('footer').remove();
  $('header').remove();
  $('head').remove();

  // If selector provided, extract only that section
  if (selector) {
    const selected = $(selector);
    return selected.length > 0 ? selected.html() : '';
  }

  return $.html();
}

/**
 * Fetch URL and convert HTML to markdown
 * @param {string} url - The URL to fetch
 * @param {string} selector - Optional CSS selector to extract specific content
 * @returns {Promise<{url: string, html: string, markdown: string}>}
 */
export async function fetchUrlAsMarkdown(url, selector = null) {
  try {
    // Fetch the URL
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; NewsletterDigester/1.0)',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const html = await response.text();

    // Sanitize HTML
    const cleanedHtml = sanitizeHtml(html, selector);

    // Convert to markdown
    const markdown = NodeHtmlMarkdown.translate(cleanedHtml);

    return {
      url,
      html: cleanedHtml,
      markdown,
    };
  } catch (error) {
    logger.error('Failed to fetch URL as markdown', { url, error: error.message });
    throw error;
  }
}

/**
 * Convert markdown text to Slack's mrkdwn format
 * @param {string} text - Markdown text
 * @returns {string} - Slack mrkdwn formatted text
 */
function convertToSlackMrkdwn(text) {
  if (!text) return text;

  let converted = text;

  // Convert markdown bullet lists (- or *) to Slack format (•)
  converted = converted.replace(/^[\-\*]\s+/gm, '• ');

  // Convert **bold** to *bold* (Slack uses single asterisks)
  converted = converted.replace(/\*\*([^*]+)\*\*/g, '*$1*');

  // Convert __bold__ to *bold*
  converted = converted.replace(/__([^_]+)__/g, '*$1*');

  // Convert _italic_ to _italic_ (same in Slack)
  // No change needed

  // Ensure proper line breaks for lists
  converted = converted.replace(/•\s+/g, '• ');

  return converted;
}

/**
 * Unified function to send posts to Slack (single post or digest)
 * @param {Object|Array} posts - Single post object or array of posts
 * @param {Object} options - Configuration options
 * @param {string} options.webhookUrl - Slack webhook URL (required)
 * @param {string} options.channel - Optional channel name (without #)
 * @param {string} options.botName - Optional bot username override
 * @param {string} options.botIcon - Optional bot icon emoji (e.g., :robot_face:)
 * @returns {Promise<boolean>} - Returns true if successful
 * @throws {Error} - Throws error if webhook call fails
 */
export async function sendToSlack(posts, options = {}) {
  const { webhookUrl, channel, botName, botIcon } = options;

  if (!webhookUrl) {
    throw new Error('Slack webhook URL not provided');
  }

  // Normalize posts to array
  const postsArray = Array.isArray(posts) ? posts : [posts];

  if (postsArray.length === 0) {
    throw new Error('No posts provided');
  }

  // Validate posts
  for (const post of postsArray) {
    if (!post || !post.title || !post.url) {
      throw new Error('Invalid post object - title and url are required');
    }
  }

  try {
    let payload;

    // Single post: use blocks format
    if (postsArray.length === 1) {
      const post = postsArray[0];
      let messageText = `*<${post.url}|${post.title}>*`;

      if (post.summary) {
        const slackFormattedSummary = convertToSlackMrkdwn(post.summary);
        messageText += `\n\n${slackFormattedSummary}`;
      }

      payload = {
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: messageText,
            },
          },
        ],
        text: `${post.title} - ${post.url}`,
      };
    } else {
      // Multiple posts: use digest format
      const postsBySite = {};
      postsArray.forEach((post) => {
        const siteTitle = post.site_title || 'Unknown Source';
        if (!postsBySite[siteTitle]) {
          postsBySite[siteTitle] = [];
        }
        postsBySite[siteTitle].push(post);
      });

      let message = `*📬 New Posts Digest* (${postsArray.length} new posts)\n\n`;

      for (const [siteTitle, sitePosts] of Object.entries(postsBySite)) {
        message += `*${siteTitle}* (${sitePosts.length})\n`;

        sitePosts.forEach((post) => {
          message += `• <${post.url}|${post.title}>\n`;
          if (post.summary) {
            message += `  _${post.summary}_\n`;
          }
        });

        message += '\n';
      }

      payload = {
        text: message,
        mrkdwn: true,
      };
    }

    // Add channel if specified
    if (channel) {
      payload.channel = channel.startsWith('#') ? channel : `#${channel}`;
    }

    // Add bot name if provided
    if (botName && botName.trim()) {
      payload.username = botName.trim();
    }

    // Add bot icon if provided (emoji format like :robot_face:)
    if (botIcon && botIcon.trim()) {
      payload.icon_emoji = botIcon.trim();
    }

    logger.info('Sending to Slack', {
      postCount: postsArray.length,
      channel: channel || 'default',
      hasUsername: !!payload.username,
      hasIconEmoji: !!payload.icon_emoji,
      username: payload.username,
      icon_emoji: payload.icon_emoji,
    });

    // Send to Slack
    await axios.post(webhookUrl, payload);

    logger.info(`Successfully sent ${postsArray.length} post(s) to Slack`);
    return true;
  } catch (error) {
    logger.error('Failed to send to Slack', {
      error: error.message,
      status: error.response?.status,
      channel: channel || 'default',
      postCount: postsArray.length,
    });
    throw error;
  }
}

/**
 * Legacy wrapper for backwards compatibility
 * @deprecated Use sendToSlack instead
 */
export async function sendPostToSlack(post, webhookUrl, channel = null) {
  return sendToSlack(post, { webhookUrl, channel });
}
