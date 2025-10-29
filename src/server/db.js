import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let db = null;

/**
 * Initialize database connection and create tables
 */
export function initDb(dbPath = null) {
  const finalPath = dbPath || path.join(__dirname, '../../data.db');

  db = new Database(finalPath);
  db.pragma('journal_mode = WAL');

  createTables();
  seedDefaultConfig();

  return db;
}

/**
 * Get database instance
 */
export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  return db;
}

/**
 * Create database tables
 */
function createTables() {
  // Sites table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      type TEXT DEFAULT 'rss',
      extraction_rules TEXT,
      extraction_instructions TEXT,
      is_active INTEGER DEFAULT 1,
      last_checked TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Posts table
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      site_id INTEGER NOT NULL,
      date TEXT,
      url TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT,
      summary TEXT,
      notified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(url, title, date),
      FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
    )
  `);

  // Config table
  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `);

  // Logs table
  db.exec(`
    CREATE TABLE IF NOT EXISTS logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      level TEXT NOT NULL,
      message TEXT NOT NULL,
      details TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

/**
 * Seed default configuration
 */
function seedDefaultConfig() {
  const defaults = {
    schedule: '0 9 * * *', // 9 AM daily
    openai_api_key: '',
    openai_base_url: 'https://api.openai.com/v1',
    openai_model: 'gpt-3.5-turbo',
    slack_webhook_url: '',
    prompt_summarization: `You are a content summarizer. Summarize the following article content in 2-3 concise sentences. Focus on the main points and key takeaways.`,
    prompt_html_extract_base: `You are an HTML parser. Extract all posts/articles/links from the provided HTML.
Return ONLY a JSON array with this exact structure, no additional text:

[
  {
    "title": "Post title",
    "url": "https://full-url.com/post",
    "content": "Post content or description"
  }
]

Rules:
- Convert relative URLs to absolute URLs using the base domain
- Extract all distinct posts, articles, or links
- If content is not available, use an empty string
- Ensure all URLs are complete and valid`,
    cleanup_content_days: '7',
    cleanup_delete_days: '365',
  };

  const stmt = db.prepare('INSERT OR IGNORE INTO config (key, value) VALUES (?, ?)');

  for (const [key, value] of Object.entries(defaults)) {
    stmt.run(key, value);
  }
}

/**
 * Get all sites
 */
export function getAllSites() {
  const stmt = db.prepare('SELECT * FROM sites ORDER BY created_at DESC');
  return stmt.all();
}

/**
 * Get active sites only
 */
export function getActiveSites() {
  const stmt = db.prepare('SELECT * FROM sites WHERE is_active = 1 ORDER BY created_at DESC');
  return stmt.all();
}

/**
 * Get single site by ID
 */
export function getSite(id) {
  const stmt = db.prepare('SELECT * FROM sites WHERE id = ?');
  return stmt.get(id);
}

/**
 * Create new site
 */
export function createSite(data) {
  const stmt = db.prepare(`
    INSERT INTO sites (url, title, type, extraction_rules, extraction_instructions, is_active)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    data.url,
    data.title,
    data.type || 'rss',
    data.extraction_rules || null,
    data.extraction_instructions || null,
    data.is_active !== undefined ? data.is_active : 1,
  );

  return getSite(info.lastInsertRowid);
}

/**
 * Update site
 */
export function updateSite(id, data) {
  const fields = [];
  const values = [];

  if (data.url !== undefined) {
    fields.push('url = ?');
    values.push(data.url);
  }
  if (data.title !== undefined) {
    fields.push('title = ?');
    values.push(data.title);
  }
  if (data.type !== undefined) {
    fields.push('type = ?');
    values.push(data.type);
  }
  if (data.extraction_rules !== undefined) {
    fields.push('extraction_rules = ?');
    values.push(data.extraction_rules);
  }
  if (data.extraction_instructions !== undefined) {
    fields.push('extraction_instructions = ?');
    values.push(data.extraction_instructions);
  }
  if (data.is_active !== undefined) {
    fields.push('is_active = ?');
    values.push(data.is_active);
  }
  if (data.last_checked !== undefined) {
    fields.push('last_checked = ?');
    values.push(data.last_checked);
  }

  if (fields.length === 0) {
    return getSite(id);
  }

  values.push(id);

  const stmt = db.prepare(`UPDATE sites SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);

  return getSite(id);
}

/**
 * Delete site
 */
export function deleteSite(id) {
  const stmt = db.prepare('DELETE FROM sites WHERE id = ?');
  return stmt.run(id);
}

/**
 * Get posts with optional filters
 */
export function getPosts(filters = {}) {
  let query = 'SELECT p.*, s.title as site_title FROM posts p LEFT JOIN sites s ON p.site_id = s.id WHERE 1=1';
  const params = [];

  if (filters.site_id) {
    query += ' AND p.site_id = ?';
    params.push(filters.site_id);
  }

  if (filters.search) {
    query += ' AND p.title LIKE ?';
    params.push(`%${filters.search}%`);
  }

  if (filters.notified !== undefined) {
    query += ' AND p.notified = ?';
    params.push(filters.notified);
  }

  query += ' ORDER BY p.created_at DESC';

  if (filters.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const stmt = db.prepare(query);
  return stmt.all(...params);
}

/**
 * Get single post
 */
export function getPost(id) {
  const stmt = db.prepare(
    'SELECT p.*, s.title as site_title FROM posts p LEFT JOIN sites s ON p.site_id = s.id WHERE p.id = ?',
  );
  return stmt.get(id);
}

/**
 * Create post (with duplicate check)
 */
export function createPost(data) {
  try {
    const stmt = db.prepare(`
      INSERT INTO posts (site_id, date, url, title, content, summary, notified)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      data.site_id,
      data.date || new Date().toISOString(),
      data.url,
      data.title,
      data.content || null,
      data.summary || null,
      data.notified || 0,
    );

    return getPost(info.lastInsertRowid);
  } catch (error) {
    // Check if it's a duplicate error
    if (error.message.includes('UNIQUE constraint failed')) {
      return null; // Duplicate post, skip silently
    }
    throw error;
  }
}

/**
 * Update post
 */
export function updatePost(id, data) {
  const fields = [];
  const values = [];

  if (data.summary !== undefined) {
    fields.push('summary = ?');
    values.push(data.summary);
  }
  if (data.notified !== undefined) {
    fields.push('notified = ?');
    values.push(data.notified);
  }
  if (data.content !== undefined) {
    fields.push('content = ?');
    values.push(data.content);
  }

  if (fields.length === 0) {
    return getPost(id);
  }

  values.push(id);

  const stmt = db.prepare(`UPDATE posts SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);

  return getPost(id);
}

/**
 * Get all config
 */
export function getAllConfig() {
  const stmt = db.prepare('SELECT * FROM config');
  const rows = stmt.all();

  // Convert to object format
  const config = {};
  for (const row of rows) {
    config[row.key] = row.value;
  }

  return config;
}

/**
 * Get single config value
 */
export function getConfig(key) {
  const stmt = db.prepare('SELECT value FROM config WHERE key = ?');
  const row = stmt.get(key);
  return row ? row.value : null;
}

/**
 * Set config value
 */
export function setConfig(key, value) {
  const stmt = db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)');
  stmt.run(key, value);
}

/**
 * Get logs with optional filters
 */
export function getLogs(filters = {}) {
  let query = 'SELECT * FROM logs WHERE 1=1';
  const params = [];

  if (filters.level) {
    query += ' AND level = ?';
    params.push(filters.level);
  }

  query += ' ORDER BY created_at DESC';

  if (filters.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  }

  const stmt = db.prepare(query);
  return stmt.all(...params);
}

/**
 * Clean up old content
 */
export function cleanupOldContent() {
  const contentDays = parseInt(getConfig('cleanup_content_days') || '7');
  const deleteDays = parseInt(getConfig('cleanup_delete_days') || '365');

  const contentDate = new Date();
  contentDate.setDate(contentDate.getDate() - contentDays);

  const deleteDate = new Date();
  deleteDate.setFullYear(deleteDate.getFullYear() - deleteDays);

  // Clear content for old posts
  const clearStmt = db.prepare(`
    UPDATE posts
    SET content = NULL
    WHERE created_at < ? AND content IS NOT NULL
  `);
  const cleared = clearStmt.run(contentDate.toISOString());

  // Delete very old posts
  const deleteStmt = db.prepare('DELETE FROM posts WHERE created_at < ?');
  const deleted = deleteStmt.run(deleteDate.toISOString());

  return {
    contentCleared: cleared.changes,
    postsDeleted: deleted.changes,
  };
}

/**
 * Close database connection
 */
export function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}
