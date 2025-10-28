# Newsletter Blog Digester - Implementation Plan

## Project Overview
A single-file Fastify application that periodically checks websites/blogs, summarizes new posts using OpenAI, and sends digests to Slack. Runs in Docker with live reloading and a web UI for management.

## Technology Stack
- **Runtime**: Node.js with nodemon for live reloading
- **Web Framework**: Fastify
- **Database**: SQLite (better-sqlite3)
- **Scheduling**: node-cron (supports dynamic schedule updates)
- **AI**: OpenAI API for summarization
- **Frontend**: Preact (CDN via esm.sh) + HTM (JSX-like syntax) + Tailwind CSS (CDN) - No build system!
- **Container**: Docker Compose (bind mounts for live development)

## Project Structure
```
/src
  /server
    server.js          - Fastify server + route registration
    cron.js           - Cron job setup and scheduling
    utils.js          - Common utilities (logger, db helpers, etc.)
    db.js             - Database initialization and queries
    extractors.js     - RSS/HTML/LLM extraction functions
    /api
      sites.js        - Sites API handlers (7 endpoints)
      posts.js        - Posts API handlers (2 endpoints)
      config.js       - Config API handlers (2 endpoints)
      logs.js         - Logs API handlers (1 endpoint)
      cron.js         - Cron API handlers (1 endpoint)
  /public
    index.html        - Main HTML shell (loads router)
    /pages
      App.js          - Main Preact app + router
      Sites.js        - Sites management page
      Posts.js        - Posts list page (expandable)
      Config.js       - Configuration page
      Logs.js         - Logs viewer page
      SelectorBuilder.js  - HTML selector builder page
      PromptEditor.js     - LLM prompt editor page
    /components
      Button.js       - Reusable button component
      Input.js        - Reusable input component
      Select.js       - Reusable select component
      PostCard.js     - Individual post card component
      SiteRow.js      - Site table row component
      Modal.js        - Modal wrapper component
  package.json
  docker-compose.yml
/data.db (bind mounted)
```

**Why this structure:**
- **Backend split**: Server logic separated for maintainability
- **API handlers by domain**: Each data model has its own API file (sites, posts, config, logs, cron)
- **Frontend pages**: Each page is a full view (Sites, Posts, Config, etc.)
- **Frontend components**: Small, reusable UI elements (Button, Input, etc.)
- **HTM + Preact**: JSX-like syntax with tagged template literals (no transpiling!)
- **Modern ES modules**: Import via CDN (no build step!)
- **All files bind-mounted**: Live reloading for both backend and frontend

## Database Schema

### Table: sites
```sql
CREATE TABLE sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  type TEXT DEFAULT 'rss', -- 'rss', 'html_rules', or 'html_llm'
  extraction_rules TEXT,   -- JSON array of extraction rule objects (for 'html_rules' type)
  extraction_instructions TEXT,  -- Additional instructions appended to base prompt (for 'html_llm' type)
  is_active INTEGER DEFAULT 1,
  last_checked TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```
**Site types:**
- `rss`: Standard RSS/Atom feed (parsed with rss-parser)
- `html_rules`: Web page parsed with cheerio using CSS selector rules
- `html_llm`: Web page parsed using LLM (for complex/unpredictable HTML)

**LLM Extraction for html_llm:**
- Always uses `prompt_html_extract_base` from config as the foundation
- `extraction_instructions` (if provided) is appended as additional context
- This ensures consistent output format while allowing site-specific customization

**Extraction Rules (for `type: 'html_rules'` only):**
Stored as JSON array in `extraction_rules` column. Each rule defines how to extract posts from a different section/structure:

```json
[
  {
    "name": "Blog Posts",
    "container": "article.post",
    "title": "h2",
    "url": "a.read-more",
    "content": ".content"
  },
  {
    "name": "Useful Links",
    "container": ".useful-links li",
    "title": "a",
    "url": "a",
    "content": ""
  }
]
```

**How rule-based extraction works:**
- Each rule is applied independently to the HTML using cheerio
- All extracted posts from all rules are combined
- Fast, deterministic, and free
- Best for consistent, predictable HTML structures

**LLM Extraction Instructions (for `type: 'html_llm'` only):**
Stored as TEXT in `extraction_instructions` column. Optional additional instructions for site-specific extraction needs.

**Base LLM extraction prompt (prompt_html_extract_base config):**
```
You are an HTML parser. Extract all posts/articles/links from the provided HTML.
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
- Ensure all URLs are complete and valid
```

**Site-specific extraction_instructions (optional examples):**
- "Focus only on posts in the 'Featured Articles' section"
- "Ignore sponsored content and advertisements"
- "Extract both the article title and subtitle, combine them"
- "The newsletter has multiple sections: News, Tools, and Resources - extract all"

**How LLM-based extraction works:**
1. Always start with base prompt from `prompt_html_extract_base` (ensures consistent JSON format)
2. If site has `extraction_instructions`, append it as additional context
3. Send combined prompt + HTML to OpenAI
4. LLM intelligently extracts posts regardless of HTML structure
5. More expensive (API costs) and slower, but handles complex/varying layouts
6. Best for unpredictable HTML or when CSS selectors are too difficult

**Comparison: When to use each extraction method**

| Feature | RSS | HTML Rules | HTML LLM |
|---------|-----|------------|----------|
| **Speed** | Fast | Fast | Slow (API calls) |
| **Cost** | Free | Free | ~$0.01-0.05 per extraction |
| **Reliability** | High | High | Medium (depends on prompt) |
| **Setup Complexity** | Easy (just URL) | Medium (need selectors) | Easy (just prompt) |
| **HTML Changes** | N/A | Breaks if structure changes | Adapts to changes |
| **Best For** | Standard blogs | Consistent HTML structure | Complex/changing layouts |
| **Example Use Case** | WordPress blogs | Newsletter archives with clear patterns | Weekly emails with varying formats |

### Table: posts
```sql
CREATE TABLE posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  site_id INTEGER NOT NULL,
  date TEXT,
  url TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT,
  summary TEXT,
  notified INTEGER DEFAULT 0, -- Track if sent to Slack (0 = not sent, 1 = sent)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(url, title, date), -- Prevent duplicates based on URL+title+date
  FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE
);
```

**Duplicate Prevention:**
- Uses composite unique constraint on `(url, title, date)`
- Same URL with different title = different post
- Same title on different dates = different post
- Handles cases where newsletters report same news with different titles

**Slack Notification Tracking:**
- `notified` column tracks whether post has been sent to Slack
- Set to `1` after successful Slack notification
- Prevents duplicate notifications for the same post
- Query for unsent posts: `SELECT * FROM posts WHERE notified = 0`

**Note on Future Consolidation:**
In a future iteration, add an LLM-based consolidation feature to detect semantically similar posts across different newsletters (e.g., two newsletters covering the same news event with different titles). This would:
- Group similar posts using embeddings or LLM comparison
- Create a `post_groups` table to link related posts
- Allow viewing consolidated news across sources
- Not included in initial implementation

### Table: config
```sql
CREATE TABLE config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
```
**Default config keys:**
- `schedule` - cron expression (e.g., "0 9 * * *" for 9 AM daily)
- `openai_api_key` - API key for OpenAI
- `slack_webhook_url` - Webhook URL for Slack notifications
- `prompt_summarization` - LLM prompt for summarizing post content
- `prompt_html_extract_base` - Base LLM prompt for HTML extraction (always used, site instructions appended)

### Table: logs
```sql
CREATE TABLE logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  level TEXT NOT NULL, -- info, error, warn
  message TEXT NOT NULL,
  details TEXT, -- JSON string for additional data
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

## Architecture

### Backend File Organization
```
server.js           - Main server + route registration
db.js              - Database initialization & query functions
utils.js           - Logger & helper utilities
extractors.js      - RSS/HTML/LLM extraction functions
cron.js            - Cron job manager with dynamic scheduling
/api
  sites.js         - Sites CRUD + extraction testing (7 endpoints)
  posts.js         - Posts read operations (2 endpoints)
  config.js        - Config get/update (2 endpoints)
  logs.js          - Logs read operations (1 endpoint)
  cron.js          - Manual cron trigger (1 endpoint)
```

### Dynamic Cron Implementation
node-cron supports dynamic scheduling through:
1. Store cron expression in config table
2. On app start, read schedule from DB and create cron job
3. When schedule is updated via API:
   - Stop existing cron job (task.stop())
   - Update config in DB
   - Create new cron job with new schedule (task.start())
4. Keep reference to cron task globally for updates

### Manual Check Trigger
The UI includes a "Check Now" button in the header that allows manual triggering:

**Frontend:**
```javascript
// In App.js
const runCheckNow = async () => {
  const response = await fetch('/api/cron/run', { method: 'POST' });
  const result = await response.json();
  alert(result.message); // Or use a toast notification
};

// Button in header
h(Button, {
  onClick: runCheckNow,
  variant: 'primary',
  class: 'ml-auto'
}, '⚡ Check Now (Run Cron)')
```

**Backend API endpoint:**
```javascript
// In server.js
fastify.post('/api/cron/run', async (req, reply) => {
  const cron = require('./cron');

  // Run in background to avoid timeout
  cron.runCheck().catch(err => {
    logger.error('Manual check failed', { error: err.message });
  });

  return { success: true, message: 'Check started in background' };
});
```

This allows immediate testing without waiting for the scheduled time.

### Web UI Design (Single Page App with Client-Side Routing)
```
┌──────────────────────────────────────────────────┐
│  Newsletter Blog Digester    [⚡ Check Now]     │
├──────────────────────────────────────────────────┤
│  Tabs: Sites | Posts | Config | Logs             │
├──────────────────────────────────────────────────┤
│                                                  │
│  [Tab Content Area]                              │
│                                                  │
│  Sites Tab:                                      │
│  - Table: title, URL, type, active, last_checked│
│  - Add site with type selector (dropdown)        │
│  - Edit/Delete actions                           │
│  - "Build Selectors" for HTML Rules              │
│  - "Configure Prompt" for HTML LLM               │
│                                                  │
│  Posts Tab (New Design):                         │
│  ┌────────────────────────────────────────────┐ │
│  │ Filters: [Site ▼] [Date Range]  [Search]  │ │
│  ├────────────────────────────────────────────┤ │
│  │ ▼ Post Title 1 (Site Name) - 2 hours ago  │ │
│  │   [Collapsed - click to expand]            │ │
│  ├────────────────────────────────────────────┤ │
│  │ ▼ Post Title 2 (Site Name) - 5 hours ago  │ │
│  │   Summary: Lorem ipsum dolor sit amet...   │ │
│  │   [View Original] [Hide]                   │ │
│  ├────────────────────────────────────────────┤ │
│  │ ▼ Post Title 3 (Site Name) - 1 day ago    │ │
│  │   [Collapsed]                              │ │
│  └────────────────────────────────────────────┘ │
│  No pagination - infinite scroll or show all    │
│                                                  │
│  Config Tab:                                     │
│  - Form for config (schedule, API keys, prompts)│
│  - [Save] button (triggers cron reschedule)     │
│                                                  │
│  Logs Tab:                                       │
│  - Simple list/table (newest first)             │
│  - Filter by level (All/Info/Warn/Error)        │
│  - No pagination, show recent ~200 entries      │
│                                                  │
└──────────────────────────────────────────────────┘
```

**Posts View Details:**
- **Reverse chronological order** (newest first)
- **Inline expansion**: Click row to expand/collapse
- **Shows summary** when expanded (or content if no summary)
- **Filters**: Dropdown for site, date range picker, text search
- **No pagination**: Load all/recent posts (or infinite scroll if needed)
- **Clean, minimal**: Each post is a collapsible card

### HTML Selector Builder UI (for html_rules sites)

When adding/editing an html_rules site, provide an interactive selector builder:

```
┌──────────────────────────────────────────────────────────────┐
│  HTML Selector Builder                                       │
├──────────────────────────────────────────────────────────────┤
│  URL: [https://example.com/newsletter]  [Fetch HTML]        │
├──────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐ ┌──────────────────────────────┐  │
│  │ HTML Preview         │ │ Extraction Rules             │  │
│  │ (Collapsible)        │ │                              │  │
│  │                      │ │ ┌─ Rule 1: Featured Posts ─┐ │  │
│  │ <div class="posts">  │ │ │ Container: [article.post] │ │  │
│  │   <article           │ │ │ Title:     [h2 a]         │ │  │
│  │     class="post">    │ │ │ URL:       [h2 a]         │ │  │
│  │     <h2>Title</h2>   │ │ │ Content:   [.summary]     │ │  │
│  │   </article>         │ │ │ [Test] [Delete]           │ │  │
│  │ </div>               │ │ └───────────────────────────┘ │  │
│  │                      │ │                              │  │
│  │ <ul class="links">   │ │ ┌─ Rule 2: Quick Links ────┐ │  │
│  │   <li><a>Link</a>    │ │ │ Container: [.links li]    │ │  │
│  │ </ul>                │ │ │ Title:     [a]            │ │  │
│  │                      │ │ │ URL:       [a]            │ │  │
│  │ [Toggle Full HTML]   │ │ │ Content:   []             │ │  │
│  └──────────────────────┘ │ │ [Test] [Delete]           │ │  │
│                            │ └───────────────────────────┘ │  │
│                            │                              │  │
│                            │ [+ Add New Rule]             │  │
│                            └──────────────────────────────┘  │
├──────────────────────────────────────────────────────────────┤
│  Extracted Posts Preview (Live updates):                    │
│                                                              │
│  ✓ Found 15 posts from 2 rules                              │
│                                                              │
│  From "Featured Posts" (3 results):                          │
│  1. [Article Title 1] → https://example.com/post1           │
│     Content: Lorem ipsum dolor sit amet...                  │
│                                                              │
│  From "Quick Links" (12 results):                            │
│  4. [Cool Tool] → https://example.com/tool                  │
│  5. [Interesting Read] → https://other.com/article          │
│  ...                                                         │
│                                                              │
│  [Show All 15] [Save All Rules]                             │
└──────────────────────────────────────────────────────────────┘
```

**Selector Builder Features:**
1. **Fetch HTML**: GET the URL and display formatted HTML (collapsible for space)
2. **Multiple Rules**: Add/edit/delete multiple extraction rules
3. **Per-Rule Testing**: Test each rule individually to see what it extracts
4. **Live Validation**: As user types selectors, immediately test them
5. **Preview Extraction**: Show list of posts grouped by rule
6. **Rule Naming**: Each rule has a name for tracking (e.g., "Featured Posts", "Quick Links")
7. **Error Feedback**: Show if selectors return 0 results or invalid data per rule

**API Endpoints for Selector Builder:**
```javascript
// POST /api/sites/test-extraction
// Body: { url, extraction_rules: [{name, container, title, url, content}, ...] }
// Returns: {
//   total: 15,
//   by_rule: [
//     { rule_name: "Featured Posts", count: 3, posts: [...] },
//     { rule_name: "Quick Links", count: 12, posts: [...] }
//   ]
// }
```

This endpoint performs the same extraction logic but returns results without saving to the database.

### LLM Extraction Instructions Editor UI (for html_llm sites)

When adding/editing an html_llm site, provide an instructions testing interface:

```
┌──────────────────────────────────────────────────────────────┐
│  LLM Extraction Instructions Editor                          │
├──────────────────────────────────────────────────────────────┤
│  URL: [https://example.com/newsletter]  [Fetch HTML]        │
├──────────────────────────────────────────────────────────────┤
│  ┌──────────────────────────────────────────────────────────┐│
│  │ Base Prompt (from config, read-only):                    ││
│  │ [Collapsible view showing prompt_html_extract_base]      ││
│  └──────────────────────────────────────────────────────────┘│
│                                                              │
│  ┌──────────────────────────────────────────────────────────┐│
│  │ Additional Instructions (optional):                       ││
│  │                                                           ││
│  │ [Textarea for site-specific instructions]                ││
│  │                                                           ││
│  │ Example: "Focus only on posts in the 'Featured          ││
│  │ Articles' section. Ignore sponsored content."            ││
│  │                                                           ││
│  │ [Test Extraction]                                        ││
│  └──────────────────────────────────────────────────────────┘│
├──────────────────────────────────────────────────────────────┤
│  HTML Preview:                                               │
│  [Collapsible section with fetched HTML]                    │
├──────────────────────────────────────────────────────────────┤
│  Extracted Posts Preview:                                    │
│                                                              │
│  ⏳ Testing extraction with LLM... (may take 5-10 seconds)  │
│                                                              │
│  ✓ Successfully extracted 8 posts                           │
│  💰 Estimated cost: $0.02                                   │
│                                                              │
│  1. [Post Title 1] → https://example.com/post1              │
│     Content: Lorem ipsum dolor sit amet...                  │
│                                                              │
│  2. [Post Title 2] → https://example.com/post2              │
│     Content: Consectetur adipiscing elit...                 │
│                                                              │
│  [Show All 8] [Save Instructions]                           │
└──────────────────────────────────────────────────────────────┘
```

**LLM Instructions Editor Features:**
1. **Base Prompt Display**: Show the global base prompt (read-only, collapsible)
2. **Additional Instructions**: Optional site-specific instructions appended to base
3. **Test Before Save**: Test combined prompt + instructions against live HTML
4. **Cost Estimation**: Show approximate API cost for extraction
5. **Preview Results**: See exactly what posts will be extracted
6. **HTML Preview**: Collapsible HTML view for reference
7. **Clear Instructions**: Button to remove site-specific instructions

**API Endpoints for LLM Extraction Testing:**
```javascript
// POST /api/sites/test-llm-extraction
// Body: { url, extraction_instructions }
// Returns: {
//   success: true,
//   posts: [...],
//   count: 8,
//   estimated_cost: 0.02,
//   tokens_used: 4500
// }
```

## Frontend: Preact + HTM with ES Modules (No Build System!)

**Key Concept:** Modern browsers support ES modules natively. We use:
- **Preact**: Tiny React alternative (3KB)
- **HTM**: JSX-like syntax using tagged template literals (1KB)
- **ES Modules**: Import directly from CDN, no build step!

### index.html (Main Entry Point)
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Newsletter Blog Digester</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  <div id="app"></div>

  <script type="module">
    // Import Preact from CDN
    import { h, render } from 'https://esm.sh/preact@10.19.3';

    // Import our app (local ES module)
    import App from './pages/App.js';

    // Render app
    render(h(App), document.getElementById('app'));
  </script>
</body>
</html>
```

### /public/pages/App.js (Main Router)
```javascript
import { h } from 'https://esm.sh/preact@10.19.3';
import { useState } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import Sites from './Sites.js';
import Posts from './Posts.js';
import Config from './Config.js';
import Logs from './Logs.js';
import Button from '../components/Button.js';

// Initialize HTM with Preact
const html = htm.bind(h);

export default function App() {
  const [currentTab, setCurrentTab] = useState('posts');
  const [cronRunning, setCronRunning] = useState(false);

  const runCronNow = async () => {
    setCronRunning(true);
    try {
      const response = await fetch('/api/cron/run', { method: 'POST' });
      const result = await response.json();
      alert(result.message);
    } catch (error) {
      alert('Failed to run cron: ' + error.message);
    } finally {
      setCronRunning(false);
    }
  };

  return html`
    <div class="min-h-screen bg-gray-50">
      <header class="bg-white shadow">
        <div class="max-w-7xl mx-auto px-4 py-6">
          <div class="flex items-center justify-between">
            <h1 class="text-3xl font-bold text-gray-900">
              Newsletter Blog Digester
            </h1>
            <${Button}
              onClick=${runCronNow}
              disabled=${cronRunning}
              variant="primary"
            >
              ${cronRunning ? '⏳ Checking...' : '⚡ Check Now'}
            </${Button}>
          </div>

          <nav class="mt-4 flex space-x-4">
            ${['sites', 'posts', 'config', 'logs'].map(tab => html`
              <${Button}
                key=${tab}
                onClick=${() => setCurrentTab(tab)}
                variant=${currentTab === tab ? 'primary' : 'secondary'}
              >
                ${tab.charAt(0).toUpperCase() + tab.slice(1)}
              </${Button}>
            `)}
          </nav>
        </div>
      </header>

      <main class="max-w-7xl mx-auto px-4 py-8">
        ${currentTab === 'sites' && html`<${Sites} />`}
        ${currentTab === 'posts' && html`<${Posts} />`}
        ${currentTab === 'config' && html`<${Config} />`}
        ${currentTab === 'logs' && html`<${Logs} />`}
      </main>
    </div>
  `;
}
```

### /public/pages/Posts.js (Example Page)
```javascript
import { h } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';
import PostCard from '../components/PostCard.js';

const html = htm.bind(h);

export default function Posts() {
  const [posts, setPosts] = useState([]);
  const [sites, setSites] = useState([]);
  const [filter, setFilter] = useState({ site: 'all', search: '' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch posts and sites
    Promise.all([
      fetch('/api/posts').then(r => r.json()),
      fetch('/api/sites').then(r => r.json())
    ]).then(([postsData, sitesData]) => {
      setPosts(postsData);
      setSites(sitesData);
      setLoading(false);
    });
  }, []);

  const filteredPosts = posts.filter(post => {
    if (filter.site !== 'all' && post.site_id !== parseInt(filter.site)) return false;
    if (filter.search && !post.title.toLowerCase().includes(filter.search.toLowerCase())) return false;
    return true;
  });

  const timeAgo = (date) => {
    const seconds = Math.floor((new Date() - new Date(date)) / 1000);
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
    return `${Math.floor(seconds / 86400)} days ago`;
  };

  if (loading) {
    return html`
      <div class="flex items-center justify-center py-12">
        <div class="text-gray-500">Loading posts...</div>
      </div>
    `;
  }

  return html`
    <div class="space-y-4">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-900">Posts</h2>
        <div class="text-sm text-gray-500">
          ${filteredPosts.length} posts found
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-lg shadow p-4 mb-6">
        <div class="flex gap-4">
          <div class="flex-none">
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Filter by Site
            </label>
            <select
              class="border border-gray-300 rounded-md px-3 py-2"
              value=${filter.site}
              onChange=${e => setFilter({ ...filter, site: e.target.value })}
            >
              <option value="all">All Sites</option>
              ${sites.map(site => html`
                <option key=${site.id} value=${site.id}>
                  ${site.title}
                </option>
              `)}
            </select>
          </div>

          <div class="flex-1">
            <label class="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              placeholder="Search by title..."
              class="w-full border border-gray-300 rounded-md px-3 py-2"
              value=${filter.search}
              onInput=${e => setFilter({ ...filter, search: e.target.value })}
            />
          </div>

          ${(filter.site !== 'all' || filter.search) && html`
            <div class="flex-none flex items-end">
              <button
                class="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
                onClick=${() => setFilter({ site: 'all', search: '' })}
              >
                Clear Filters
              </button>
            </div>
          `}
        </div>
      </div>

      <!-- Posts list -->
      ${filteredPosts.length === 0 ? html`
        <div class="text-center py-12 text-gray-500">
          No posts found. Try adjusting your filters.
        </div>
      ` : html`
        <div class="space-y-3">
          ${filteredPosts.map(post => html`
            <${PostCard}
              key=${post.id}
              post=${post}
              timeAgo=${timeAgo}
            />
          `)}
        </div>
      `}
    </div>
  `;
}
```

### /public/components/PostCard.js (Example Reusable Component)
```javascript
import { h } from 'https://esm.sh/preact@10.19.3';
import { useState } from 'https://esm.sh/preact@10.19.3/hooks';
import htm from 'https://esm.sh/htm@3.1.1';

const html = htm.bind(h);

export default function PostCard({ post, timeAgo }) {
  const [expanded, setExpanded] = useState(false);

  return html`
    <div class="bg-white border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow overflow-hidden">
      <!-- Post header (clickable) -->
      <div
        class="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick=${() => setExpanded(!expanded)}
      >
        <div class="flex items-start justify-between">
          <div class="flex-1">
            <h3 class="font-semibold text-gray-900 mb-1">
              ${post.title}
            </h3>
            <div class="flex items-center gap-2 text-sm text-gray-500">
              <span class="font-medium">${post.site_title}</span>
              <span>•</span>
              <span>${timeAgo(post.created_at)}</span>
            </div>
          </div>

          <!-- Expand/collapse icon -->
          <div class="ml-4 flex-none">
            <svg
              class=${`w-5 h-5 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
      </div>

      <!-- Expanded content -->
      ${expanded && html`
        <div class="px-4 pb-4 border-t border-gray-100">
          <div class="mt-3 prose prose-sm max-w-none">
            <p class="text-gray-700 whitespace-pre-wrap">
              ${post.summary || post.content || 'No content available.'}
            </p>
          </div>

          <div class="mt-4 flex items-center gap-3">
            <a
              href=${post.url}
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium text-sm"
              onClick=${(e) => e.stopPropagation()}
            >
              View Original
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      `}
    </div>
  `;
}
```

### /public/components/Button.js (Example Micro Component)
```javascript
import { h } from 'https://esm.sh/preact@10.19.3';
import htm from 'https://esm.sh/htm@3.1.1';

const html = htm.bind(h);

export default function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled = false,
  className = '',
  ...props
}) {
  const baseClass = 'px-4 py-2 rounded-md font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2';

  const variantClasses = {
    primary: 'bg-blue-500 text-white hover:bg-blue-600 focus:ring-blue-500 disabled:bg-blue-300',
    secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300 focus:ring-gray-400 disabled:bg-gray-100',
    danger: 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500 disabled:bg-red-300',
    outline: 'border-2 border-blue-500 text-blue-500 hover:bg-blue-50 focus:ring-blue-500 disabled:border-gray-300 disabled:text-gray-300'
  };

  const classes = `${baseClass} ${variantClasses[variant]} ${className}`;

  return html`
    <button
      type=${type}
      class=${classes}
      onClick=${onClick}
      disabled=${disabled}
      ...${props}
    >
      ${children}
    </button>
  `;
}
```

**HTM Syntax Quick Reference:**
```javascript
// Basic template
html`<div class="foo">Hello</div>`

// Interpolation
html`<h1>${title}</h1>`

// Props
html`<button onClick=${handleClick} disabled=${isDisabled}>Click</button>`

// Components (note the ${} wrapper)
html`<${Button} variant="primary">Text</${Button}>`

// Conditionals
html`${condition && html`<div>Shown when true</div>`}`

// Lists/Mapping
html`${items.map(item => html`<li key=${item.id}>${item.name}</li>`)}`

// Events
html`<input onInput=${e => setValue(e.target.value)} />`

// Self-closing tags
html`<img src=${url} alt=${alt} />`
```

**Why This Works:**
- ✅ **No build system**: ES modules work natively in modern browsers
- ✅ **JSX-like syntax**: HTM provides familiar React-like template syntax
- ✅ **Tiny bundle**: Preact (3KB) + HTM (1KB) = 4KB total
- ✅ **Page/Component separation**: Pages are full views, components are reusable elements
- ✅ **Live reload**: Edit files, refresh browser (or add hot reload)
- ✅ **CDN imports**: Preact & HTM loaded from esm.sh (fast, cached)
- ✅ **Local imports**: Pages/components import from relative paths
- ✅ **Browser support**: Works in Chrome, Firefox, Safari, Edge (no IE11)

**Fastify Static File Serving:**
```javascript
// In server.js
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, '../public'),
  prefix: '/'
});
```

## Backend Structure

### server.js (Main Server + Route Registration)
```javascript
const fastify = require('fastify')();
const path = require('path');
const { logger } = require('./utils');

// Import API handlers
const sitesAPI = require('./api/sites');
const postsAPI = require('./api/posts');
const configAPI = require('./api/config');
const logsAPI = require('./api/logs');
const cronAPI = require('./api/cron');

// Static files
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, '../public'),
  prefix: '/'
});

// Register API routes
// Sites routes (7 endpoints)
fastify.get('/api/sites', sitesAPI.getAll);
fastify.post('/api/sites', sitesAPI.create);
fastify.get('/api/sites/:id', sitesAPI.getOne);
fastify.put('/api/sites/:id', sitesAPI.update);
fastify.delete('/api/sites/:id', sitesAPI.remove);
fastify.post('/api/sites/test-extraction', sitesAPI.testExtraction);
fastify.post('/api/sites/test-llm-extraction', sitesAPI.testLLMExtraction);

// Posts routes (2 endpoints)
fastify.get('/api/posts', postsAPI.getAll);
fastify.get('/api/posts/:id', postsAPI.getOne);

// Config routes (2 endpoints)
fastify.get('/api/config', configAPI.getAll);
fastify.put('/api/config', configAPI.update);

// Logs routes (1 endpoint)
fastify.get('/api/logs', logsAPI.getAll);

// Cron routes (1 endpoint)
fastify.post('/api/cron/run', cronAPI.runNow);

// Start server
fastify.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
  if (err) throw err;
  logger.info('Server running on http://localhost:3000');
});

module.exports = fastify;
```

### /server/api/sites.js (Sites API Handlers)
```javascript
const db = require('../db');
const { logger } = require('../utils');
const { fetchHTMLWithRules, fetchHTMLWithLLM } = require('../extractors');

// GET /api/sites - Get all sites
async function getAll(req, reply) {
  try {
    const sites = await db.getAllSites();
    return sites;
  } catch (error) {
    logger.error('Failed to get sites', { error: error.message });
    reply.code(500).send({ error: 'Failed to fetch sites' });
  }
}

// POST /api/sites - Create new site
async function create(req, reply) {
  try {
    const site = await db.createSite(req.body);
    logger.info('Site created', { id: site.id, title: site.title });
    return site;
  } catch (error) {
    logger.error('Failed to create site', { error: error.message });
    reply.code(500).send({ error: 'Failed to create site' });
  }
}

// GET /api/sites/:id - Get single site
async function getOne(req, reply) {
  try {
    const site = await db.getSite(req.params.id);
    if (!site) {
      return reply.code(404).send({ error: 'Site not found' });
    }
    return site;
  } catch (error) {
    logger.error('Failed to get site', { error: error.message });
    reply.code(500).send({ error: 'Failed to fetch site' });
  }
}

// PUT /api/sites/:id - Update site
async function update(req, reply) {
  try {
    const site = await db.updateSite(req.params.id, req.body);
    logger.info('Site updated', { id: site.id, title: site.title });
    return site;
  } catch (error) {
    logger.error('Failed to update site', { error: error.message });
    reply.code(500).send({ error: 'Failed to update site' });
  }
}

// DELETE /api/sites/:id - Delete site
async function remove(req, reply) {
  try {
    await db.deleteSite(req.params.id);
    logger.info('Site deleted', { id: req.params.id });
    return { success: true };
  } catch (error) {
    logger.error('Failed to delete site', { error: error.message });
    reply.code(500).send({ error: 'Failed to delete site' });
  }
}

// POST /api/sites/test-extraction - Test CSS selector rules
async function testExtraction(req, reply) {
  try {
    const { url, extraction_rules } = req.body;

    // Create temporary site object
    const tempSite = {
      url,
      extraction_rules,
      type: 'html_rules'
    };

    const posts = await fetchHTMLWithRules(tempSite);

    return {
      total: posts.length,
      posts: posts.slice(0, 10), // Return first 10 for preview
      by_rule: groupPostsByRule(posts)
    };
  } catch (error) {
    logger.error('Failed to test extraction', { error: error.message });
    reply.code(500).send({ error: error.message });
  }
}

// POST /api/sites/test-llm-extraction - Test LLM extraction
async function testLLMExtraction(req, reply) {
  try {
    const { url, extraction_instructions } = req.body;

    // Create temporary site object
    const tempSite = {
      url,
      extraction_instructions,
      type: 'html_llm'
    };

    const posts = await fetchHTMLWithLLM(tempSite);

    return {
      success: true,
      count: posts.length,
      posts: posts.slice(0, 10), // Return first 10 for preview
      estimated_cost: 0.02, // Placeholder - calculate based on tokens
      tokens_used: 4500 // Placeholder
    };
  } catch (error) {
    logger.error('Failed to test LLM extraction', { error: error.message });
    reply.code(500).send({ error: error.message });
  }
}

// Helper function
function groupPostsByRule(posts) {
  const grouped = {};
  posts.forEach(post => {
    const rule = post.source_rule || 'default';
    if (!grouped[rule]) {
      grouped[rule] = { rule_name: rule, count: 0, posts: [] };
    }
    grouped[rule].count++;
    grouped[rule].posts.push(post);
  });
  return Object.values(grouped);
}

module.exports = {
  getAll,
  create,
  getOne,
  update,
  remove,
  testExtraction,
  testLLMExtraction
};
```

### /server/api/posts.js (Posts API Handlers)
```javascript
const db = require('../db');
const { logger } = require('../utils');

// GET /api/posts - Get all posts with optional filters
async function getAll(req, reply) {
  try {
    const { site_id, search, limit = 100 } = req.query;

    const posts = await db.getPosts({
      site_id,
      search,
      limit: parseInt(limit)
    });

    return posts;
  } catch (error) {
    logger.error('Failed to get posts', { error: error.message });
    reply.code(500).send({ error: 'Failed to fetch posts' });
  }
}

// GET /api/posts/:id - Get single post
async function getOne(req, reply) {
  try {
    const post = await db.getPost(req.params.id);
    if (!post) {
      return reply.code(404).send({ error: 'Post not found' });
    }
    return post;
  } catch (error) {
    logger.error('Failed to get post', { error: error.message });
    reply.code(500).send({ error: 'Failed to fetch post' });
  }
}

module.exports = {
  getAll,
  getOne
};
```

### /server/api/config.js (Config API Handlers)
```javascript
const db = require('../db');
const { logger } = require('../utils');
const cronManager = require('../cron');

// GET /api/config - Get all config
async function getAll(req, reply) {
  try {
    const config = await db.getAllConfig();
    return config;
  } catch (error) {
    logger.error('Failed to get config', { error: error.message });
    reply.code(500).send({ error: 'Failed to fetch config' });
  }
}

// PUT /api/config - Update config
async function update(req, reply) {
  try {
    const updates = req.body; // { key: value, key2: value2, ... }

    // Update each config value
    for (const [key, value] of Object.entries(updates)) {
      await db.setConfig(key, value);
    }

    // If schedule was updated, reschedule cron
    if (updates.schedule) {
      cronManager.updateCronSchedule(updates.schedule);
      logger.info('Cron schedule updated', { schedule: updates.schedule });
    }

    return { success: true, message: 'Config updated' };
  } catch (error) {
    logger.error('Failed to update config', { error: error.message });
    reply.code(500).send({ error: 'Failed to update config' });
  }
}

module.exports = {
  getAll,
  update
};
```

### /server/api/logs.js (Logs API Handlers)
```javascript
const db = require('../db');
const { logger } = require('../utils');

// GET /api/logs - Get logs with optional filters
async function getAll(req, reply) {
  try {
    const { level, limit = 200 } = req.query;

    const logs = await db.getLogs({
      level,
      limit: parseInt(limit)
    });

    return logs;
  } catch (error) {
    logger.error('Failed to get logs', { error: error.message });
    reply.code(500).send({ error: 'Failed to fetch logs' });
  }
}

module.exports = {
  getAll
};
```

### /server/api/cron.js (Cron API Handlers)
```javascript
const { logger } = require('../utils');
const cronManager = require('../cron');

// POST /api/cron/run - Manually trigger cron
async function runNow(req, reply) {
  try {
    // Run in background to avoid timeout
    cronManager.runCheck().catch(err => {
      logger.error('Manual cron run failed', { error: err.message });
    });

    return { success: true, message: 'Cron job started in background' };
  } catch (error) {
    logger.error('Failed to start cron', { error: error.message });
    reply.code(500).send({ error: 'Failed to start cron job' });
  }
}

module.exports = {
  runNow
};
```

### cron.js (Cron Job Logic)
```javascript
const cron = require('node-cron');
const db = require('./db');
const { fetchSiteContent, summarizePost } = require('./extractors');
const { logger } = require('./utils');

let cronTask = null;

async function runCheck() {
  logger.info('Starting cron job...');
  const sites = await db.getActiveSites();

  for (const site of sites) {
    try {
      const posts = await fetchSiteContent(site);
      // Process posts, summarize, save, etc.
    } catch (error) {
      logger.error(`Failed to process site ${site.title}`, { error: error.message });
    }
  }
}

function updateCronSchedule(schedule) {
  if (cronTask) cronTask.stop();
  cronTask = cron.schedule(schedule, runCheck);
  logger.info(`Cron schedule updated: ${schedule}`);
}

module.exports = { runCheck, updateCronSchedule };
```

### extractors.js (RSS/HTML/LLM Logic)
Contains `fetchSiteContent()`, `fetchRSSFeed()`, `fetchHTMLWithRules()`, `fetchHTMLWithLLM()`, `summarizePost()`.

### db.js (Database Queries)
All database operations organized by entity (sites, posts, config, logs).

### utils.js (Common Utilities)
Logger, date helpers, etc.

**Is this too big?** No! This is a perfect size for maintainability:
- ~200-300 lines per file
- Clear separation of concerns
- Easy to navigate and modify

## Docker Setup (Compose without Dockerfile)

### docker-compose.yml
```yaml
services:
  app:
    image: node:20-alpine
    working_dir: /app
    command: sh -c "npm install && npx nodemon src/server/server.js"
    ports:
      - "3000:3000"
    volumes:
      - ./src:/app/src
      - ./data.db:/app/data.db
      - ./package.json:/app/package.json
      - node_modules:/app/node_modules
    environment:
      - NODE_ENV=development

volumes:
  node_modules:
```

**Key Points:**
- Uses official Node.js Alpine image
- Bind mounts entire `src/` folder for live editing (both server and public files)
- Bind mounts data.db for persistence
- Named volume for node_modules (faster, persists installs)
- nodemon watches `src/server/server.js` and restarts on changes
- Port 3000 exposed
- Frontend files (public/) are served statically, no restart needed on edit

## Implementation Workflow

### Phase 1: Core Setup
1. Create package.json with dependencies
2. Create index.js with basic Fastify server
3. Setup SQLite database initialization
4. Create docker-compose.yml

### Phase 2: Database & Logger
1. Implement database schema creation
2. Build logger utility
3. Test basic CRUD operations

### Phase 3: API Endpoints
1. Sites CRUD endpoints
2. Config get/set endpoints
3. Posts read endpoints
4. Logs read endpoint

### Phase 4: Web UI
1. Create single-page HTML interface
2. Implement tabs with Tailwind CSS
3. Connect to API endpoints
4. Add form validation

### Phase 5: Core Features
1. RSS/feed parser integration
2. OpenAI summarization
3. Slack webhook integration
4. Cron job with dynamic scheduling

### Phase 6: Integration & Testing
1. Test full flow: add site → cron runs → fetch posts → summarize → send to Slack
2. Test dynamic schedule updates
3. Test nodemon hot reload
4. Error handling and logging

## Dependencies (package.json)
```json
{
  "dependencies": {
    "fastify": "^4.x",
    "@fastify/static": "^6.x",
    "better-sqlite3": "^9.x",
    "node-cron": "^3.x",
    "rss-parser": "^3.x",
    "openai": "^4.x",
    "axios": "^1.x",
    "cheerio": "^1.x"
  },
  "devDependencies": {
    "nodemon": "^3.x"
  }
}
```
**Note:** cheerio is optional but recommended for better HTML parsing when dealing with `html` type sites.

## Key Implementation Notes

### Dynamic Cron Scheduling
```javascript
let cronTask = null;

function updateCronSchedule(schedule) {
  if (cronTask) {
    cronTask.stop();
  }
  cronTask = cron.schedule(schedule, () => {
    // Run check logic
  });
}
```

### Content Fetching Strategy

The app supports two types of content sources:

**1. RSS/Atom Feeds (`type: 'rss'`)**
- Use `rss-parser` to fetch and parse feeds
- Extract: title, link, pubDate, content
- Check if URL exists in posts table (avoid duplicates)
- Store only new posts

**2. HTML Pages (`type: 'html'`)**
- Fetch the HTML page using axios
- Parse with cheerio using CSS selectors defined in the site record
- Extract title, URL, and content from each post container
- Much faster and cheaper than LLM extraction

**Implementation:**
```javascript
const cheerio = require('cheerio');

async function fetchSiteContent(site) {
  if (site.type === 'rss') {
    return await fetchRSSFeed(site.url);
  } else if (site.type === 'html_rules') {
    return await fetchHTMLWithRules(site);
  } else if (site.type === 'html_llm') {
    return await fetchHTMLWithLLM(site);
  }
}

async function fetchRSSFeed(url) {
  const parser = new RSSParser();
  const feed = await parser.parseURL(url);

  return feed.items.map(item => ({
    title: item.title,
    url: item.link,
    content: item.content || item.contentSnippet || item.description,
    date: item.pubDate
  }));
}

async function fetchHTMLWithRules(site) {
  const response = await axios.get(site.url);
  const $ = cheerio.load(response.data);

  const posts = [];

  // Parse extraction rules from JSON
  const rules = JSON.parse(site.extraction_rules || '[]');

  // If no rules defined, return empty
  if (rules.length === 0) {
    logger.warn(`No extraction rules defined for site: ${site.title}`);
    return posts;
  }

  // Apply each extraction rule
  rules.forEach(rule => {
    $(rule.container).each((i, container) => {
      const $container = $(container);

      // Extract title
      let title = '';
      if (rule.title) {
        const titleEl = $container.find(rule.title);
        title = titleEl.length > 0 ? titleEl.text().trim() : '';
      }

      // Extract URL (get href attribute)
      let url = '';
      if (rule.url) {
        const urlEl = $container.find(rule.url);
        url = urlEl.length > 0 ? urlEl.attr('href') : '';

        // Handle relative URLs
        if (url && !url.startsWith('http')) {
          const baseUrl = new URL(site.url);
          url = new URL(url, baseUrl.origin).href;
        }
      }

      // Extract content
      let content = '';
      if (rule.content) {
        const contentEl = $container.find(rule.content);
        content = contentEl.length > 0 ? contentEl.text().trim() : '';
      }

      // Only add if we have at least title and URL
      if (title && url) {
        posts.push({
          title,
          url,
          content: content || '',
          date: new Date().toISOString(), // Use current date as fallback
          source_rule: rule.name // Track which rule extracted this
        });
      }
    });
  });

  return posts;
}

async function fetchHTMLWithLLM(site) {
  const response = await axios.get(site.url);
  const html = response.data;

  // Always use base prompt
  const basePrompt = getConfig('prompt_html_extract_base');

  // Append site-specific instructions if provided
  let fullPrompt = basePrompt;
  if (site.extraction_instructions) {
    fullPrompt += `\n\nAdditional instructions for this site:\n${site.extraction_instructions}`;
  }

  try {
    const extraction = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: fullPrompt },
        {
          role: "user",
          content: `Base URL: ${site.url}\n\nHTML:\n${html}`
        }
      ],
      response_format: { type: "json_object" } // Ensure JSON response
    });

    const content = extraction.choices[0].message.content;

    // Try to parse as JSON array directly or extract from object
    let result;
    try {
      result = JSON.parse(content);
      // If result is wrapped in an object like {posts: [...]}, unwrap it
      if (result.posts && Array.isArray(result.posts)) {
        result = result.posts;
      } else if (!Array.isArray(result)) {
        // If it's an object but not wrapped, try to find the array
        const firstKey = Object.keys(result)[0];
        if (Array.isArray(result[firstKey])) {
          result = result[firstKey];
        }
      }
    } catch (e) {
      logger.error(`Failed to parse LLM response for site ${site.title}`, { error: e.message });
      return [];
    }

    // Validate and normalize posts
    const posts = result
      .filter(post => post.title && post.url)
      .map(post => ({
        title: post.title,
        url: post.url,
        content: post.content || '',
        date: post.date || new Date().toISOString()
      }));

    logger.info(`LLM extracted ${posts.length} posts from ${site.title}`);
    return posts;

  } catch (error) {
    logger.error(`LLM extraction failed for site ${site.title}`, { error: error.message });
    return [];
  }
}
```

**Cheerio Extraction Rule Examples:**

**Example 1: Newsletter with multiple sections**

HTML structure:
```html
<div class="newsletter">
  <!-- Section 1: Featured articles -->
  <div class="featured-articles">
    <article class="post">
      <h2><a href="/posts/123">Article Title</a></h2>
      <div class="summary">Article summary here...</div>
    </article>
  </div>

  <!-- Section 2: Quick links (different structure!) -->
  <div class="useful-links">
    <h3>This Week's Links</h3>
    <ul>
      <li><a href="https://example.com/1">Cool Tool</a></li>
      <li><a href="https://example.com/2">Interesting Read</a></li>
    </ul>
  </div>

  <!-- Section 3: Sponsored content -->
  <div class="sponsors">
    <div class="sponsor-item">
      <h4 class="sponsor-title">Sponsor Name</h4>
      <a class="sponsor-link" href="https://sponsor.com">Learn More</a>
      <p class="sponsor-desc">Description here...</p>
    </div>
  </div>
</div>
```

Extraction rules JSON:
```json
[
  {
    "name": "Featured Articles",
    "container": ".featured-articles article.post",
    "title": "h2 a",
    "url": "h2 a",
    "content": ".summary"
  },
  {
    "name": "Useful Links",
    "container": ".useful-links li",
    "title": "a",
    "url": "a",
    "content": ""
  },
  {
    "name": "Sponsors",
    "container": ".sponsor-item",
    "title": ".sponsor-title",
    "url": ".sponsor-link",
    "content": ".sponsor-desc"
  }
]
```

This would extract posts from all three sections despite their completely different HTML structures!

### OpenAI Summarization
```javascript
async function summarizePost(content, prompt) {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: content }
    ]
  });
  return response.choices[0].message.content;
}
```

### Slack Integration
- POST to webhook URL with formatted digest
- Group posts by site
- Include summaries and links

### Database Maintenance & Cleanup

To prevent database bloat from large content fields, implement automatic cleanup:

**Daily Cleanup Job (runs at midnight):**
```javascript
function cleanupDatabase() {
  try {
    // Clear content column for posts older than 1 week (keeps summary)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const cleared = db.prepare(`
      UPDATE posts
      SET content = NULL
      WHERE created_at < ? AND content IS NOT NULL
    `).run(oneWeekAgo.toISOString());

    // Delete posts older than 1 year completely
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    const deleted = db.prepare(`
      DELETE FROM posts
      WHERE created_at < ?
    `).run(oneYearAgo.toISOString());

    logger.info('Database cleanup completed', {
      contentCleared: cleared.changes,
      postsDeleted: deleted.changes
    });
  } catch (error) {
    logger.error('Database cleanup failed', { error: error.message });
  }
}

// Schedule cleanup daily at midnight
cron.schedule('0 0 * * *', cleanupDatabase);
```

**Rationale:**
- **Week-old content clearing**: After 1 week, the full content is no longer needed since we have the summary. This prevents the `content` column (which can be very large for blog posts) from bloating the database.
- **Year-old post deletion**: Posts older than 1 year are completely removed. The summary and historical data is likely no longer relevant.
- **Benefits**:
  - Keeps database size manageable
  - Maintains fast query performance
  - Preserves recent data for reference
  - Summaries remain available for historical context

**Optional Config Enhancement:**
Consider adding these to the config table for user control:
- `cleanup_content_days` (default: 7)
- `cleanup_delete_days` (default: 365)

This allows users to customize retention periods via the UI.

## Development Workflow
1. Edit index.js locally
2. nodemon detects changes and restarts
3. data.db persists between restarts
4. Access UI at http://localhost:3000

## Summary of Key Features

### Architecture Decisions
✅ **Split Backend Structure**: `server.js`, `cron.js`, `db.js`, `extractors.js`, `utils.js`
✅ **Organized Frontend**: `/pages` for full views, `/components` for reusable elements
✅ **No Build System**: ES modules + CDN imports (Preact via esm.sh)
✅ **Bind-Mounted src/**: Live reload for both backend and frontend

### Extraction Methods (3 Types)
1. **RSS**: Fast, free, standard feeds
2. **HTML Rules**: CSS selector-based (cheerio), fast and free
3. **HTML LLM**: OpenAI-based, handles complex/changing layouts

### Key Features
- **Duplicate Prevention**: Composite unique constraint on `(url, title, date)`
- **Database Cleanup**: Auto-clear content after 1 week, delete posts after 1 year
- **Dynamic Scheduling**: Update cron schedule via UI, takes effect immediately
- **Manual Trigger**: "Run Cron Now" button in header
- **Posts View**: Reverse chronological, inline-expand, filters (no pagination)
- **Multi-Rule Extraction**: Support multiple CSS selector rules per site
- **Custom LLM Prompts**: Per-site extraction prompts with testing UI

### Frontend Highlights
- Preact + HTM (JSX-like syntax, no build step)
- Tailwind CSS via CDN
- Simple tab-based routing (no router library needed)
- Expandable post cards with summary/content fallback
- Real-time selector testing for HTML extraction
- Total bundle size: ~4KB (Preact 3KB + HTM 1KB)

### API Endpoints
- `/api/sites` - CRUD for sites
- `/api/posts` - Get posts with filters
- `/api/config` - Get/update config (triggers cron reschedule)
- `/api/logs` - Get logs
- `/api/cron/run` - Manual cron trigger
- `/api/sites/test-extraction` - Test CSS selectors or LLM prompts

## Future Enhancements
- [ ] **Post Consolidation**: LLM-based semantic grouping of similar posts across newsletters (embeddings + clustering)
- [ ] Support multiple feed formats (Atom, JSON Feed)
- [ ] Email digest option
- [ ] Post filtering by keywords/tags
- [ ] Export posts as markdown/PDF
- [ ] Retry failed summarizations
- [ ] Health check endpoint
- [ ] Dark mode toggle
- [ ] Slack digest with rich formatting/cards
