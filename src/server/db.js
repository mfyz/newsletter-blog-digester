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

  // Use DELETE journal mode (traditional SQLite mode)
  // Simpler than WAL, single .db file, external changes visible immediately
  // Perfect for low-concurrency apps where simplicity > performance
  db.pragma('journal_mode = DELETE');

  // Set synchronous to FULL for maximum durability
  // All writes are synced to disk before continuing
  db.pragma('synchronous = FULL');

  // Set busy timeout to 5 seconds to handle concurrent access
  db.pragma('busy_timeout = 5000');

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  // Enable automatic index creation for better query performance
  db.pragma('automatic_index = ON');

  createTables();
  runMigrations();
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
      content_full TEXT,
      summary TEXT,
      notified INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(url, title),
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
 * Run database migrations
 */
function runMigrations() {
  // Add is_active column to sites table if it doesn't exist
  try {
    const columns = db.prepare('PRAGMA table_info(sites)').all();
    const hasIsActive = columns.some(col => col.name === 'is_active');

    if (!hasIsActive) {
      db.exec('ALTER TABLE sites ADD COLUMN is_active INTEGER DEFAULT 1');
    }
  } catch (error) {
    // Column might already exist or table doesn't exist yet
  }

  // Add content_full column to posts table if it doesn't exist
  try {
    const columns = db.prepare('PRAGMA table_info(posts)').all();
    const hasContentFull = columns.some(col => col.name === 'content_full');

    if (!hasContentFull) {
      db.exec('ALTER TABLE posts ADD COLUMN content_full TEXT');
    }
  } catch (error) {
    // Column might already exist or table doesn't exist yet
  }

  // This migration has been disabled as it was running on every restart and losing data
  // The unique constraint change has already been applied to existing databases
  // Keeping this here as a comment for historical reference
  /*
  // Update posts table unique constraint to remove date
  // SQLite doesn't support DROP CONSTRAINT, so we need to recreate the table
  try {
    const tableInfo = db.prepare('PRAGMA table_info(posts)').all();
    const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='posts'").all();

    // Check if we need to migrate (check if old constraint exists)
    const existingData = db.prepare('SELECT * FROM posts LIMIT 1').all();

    // Only migrate if table exists and has the old structure
    if (tableInfo.length > 0) {
      // Create new table with updated constraint
      db.exec(`
        CREATE TABLE IF NOT EXISTS posts_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          site_id INTEGER NOT NULL,
          date TEXT,
          url TEXT NOT NULL,
          title TEXT NOT NULL,
          content TEXT,
          content_full TEXT,
          summary TEXT,
          notified INTEGER DEFAULT 0,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(url, title),
          FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
        )
      `);

      // Copy data from old table to new table, removing duplicates by url+title
      db.exec(`
        INSERT OR IGNORE INTO posts_new (id, site_id, date, url, title, content, content_full, summary, notified, created_at)
        SELECT id, site_id, date, url, title, content,
               CASE WHEN EXISTS(SELECT 1 FROM pragma_table_info('posts') WHERE name='content_full')
                    THEN content_full ELSE NULL END,
               summary, notified, created_at FROM posts
      `);

      // Drop old table
      db.exec('DROP TABLE posts');

      // Rename new table to posts
      db.exec('ALTER TABLE posts_new RENAME TO posts');
    }
  } catch (error) {
    // Migration might fail if table structure is already correct
    // This is fine, we just skip it
  }
  */

  // Add flagged column to posts table if it doesn't exist
  try {
    const columns = db.prepare('PRAGMA table_info(posts)').all();
    const hasFlagged = columns.some(col => col.name === 'flagged');

    if (!hasFlagged) {
      db.exec('ALTER TABLE posts ADD COLUMN flagged INTEGER DEFAULT 0');
    }
  } catch (error) {
    // Column might already exist or table doesn't exist yet
  }
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
    prompt_selector_generation: `You are a web scraping expert. Analyze the HTML structure of a blog/news/newsletter page and identify the best CSS selectors to extract post information.

Study the HTML carefully and find patterns for:
1. The main container that wraps each post/article
2. The element containing the post title
3. The link element (usually an <a> tag with href)
4. The date/time element (if present)
5. The content/excerpt/description element (if present)

Return ONLY a JSON object with this exact structure, no additional text or explanation:
{
  "postContainer": "CSS selector for each post container",
  "title": "CSS selector for title (relative to container)",
  "link": "CSS selector for link (relative to container)",
  "date": "CSS selector for date (relative to container, empty string if not found)",
  "content": "CSS selector for content/excerpt (relative to container, empty string if not found)"
}

Guidelines:
- Prefer class names and semantic HTML tags
- Make selectors specific enough to be accurate but not overly fragile
- Use child combinators (>) when appropriate to avoid matching nested elements
- For relative selectors, assume you're already inside the post container
- If multiple patterns exist, choose the most common/reliable one
- Return empty string for date/content if they don't exist or are unreliable`,
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

  query += ' ORDER BY p.date DESC, p.created_at DESC';

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
  if (data.content_full !== undefined) {
    fields.push('content_full = ?');
    values.push(data.content_full);
  }
  if (data.flagged !== undefined) {
    fields.push('flagged = ?');
    values.push(data.flagged);
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
 * Truncate posts table (delete all posts)
 */
export function truncatePosts() {
  const stmt = db.prepare('DELETE FROM posts');
  const result = stmt.run();
  return { deletedCount: result.changes };
}

/**
 * Delete a single post by ID
 */
export function deletePost(id) {
  const stmt = db.prepare('DELETE FROM posts WHERE id = ?');
  return stmt.run(id);
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
