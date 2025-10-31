import { getDb } from './db.js';
import { NodeHtmlMarkdown } from 'node-html-markdown';
import * as cheerio from 'cheerio';

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
