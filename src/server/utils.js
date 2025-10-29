import { getDb } from './db.js';

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
