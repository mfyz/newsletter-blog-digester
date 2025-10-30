# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Newsletter Blog Digester is a Fastify application that periodically checks websites/blogs (RSS feeds and HTML pages), summarizes new posts using OpenAI, and sends digests to Slack. It features a web UI built with Preact + HTM (no build system required) and uses SQLite for data storage.

## Common Commands

### Development

```bash
# Install dependencies
npm install

# Start server (production mode)
npm start

# Start with auto-reload (development)
npm run dev

# Server runs on http://localhost:5566
```

### Testing

```bash
# Run all tests (single run)
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Alternative: run tests directly with uvu
npm run test:uvu
```

### Code Formatting

```bash
# Format all code with dprint
npm run format

# Check formatting without making changes
npm run format:check

# Pre-commit checks (format + test)
npm run pre-commit
```

### Docker

```bash
# Start with Docker Compose
docker compose up

# Stop containers
docker compose down

# View logs
docker compose logs -f
```

## Architecture

### Backend Structure

The backend is organized into separate modules for maintainability:

```
src/server/
├── server.js          - Main Fastify server + route registration
├── cron.js           - Cron job scheduler with dynamic scheduling (node-cron)
├── db.js             - Database initialization and query functions (better-sqlite3)
├── extractors.js     - RSS/HTML/LLM extraction logic
├── utils.js          - Logger and helper utilities
└── api/
    ├── sites.js      - Sites CRUD + extraction testing (10 endpoints)
    ├── posts.js      - Posts read operations + delete/truncate (5 endpoints)
    ├── config.js     - Config get/update (2 endpoints)
    ├── logs.js       - Logs read operations (1 endpoint)
    └── cron.js       - Manual cron trigger (1 endpoint)
```

### Frontend Structure (No Build System)

The frontend uses **Preact + HTM** with ES modules loaded directly from CDN (esm.sh). No transpilation or bundling required:

```
src/public/
├── index.html        - Main HTML shell
├── pages/
│   ├── App.js           - Main router + tab management
│   ├── Sites.js         - Sites management (add/edit/delete sites)
│   ├── Posts.js         - Posts list (expandable cards, filters)
│   ├── Config.js        - Configuration editor
│   ├── Logs.js          - Logs viewer
│   ├── SelectorBuilder.js - HTML CSS selector builder for html_rules sites
│   └── PromptEditor.js    - LLM prompt editor for html_llm sites
├── components/
│   ├── Button.js, Input.js, Select.js - Reusable form components
│   ├── PostCard.js      - Individual post card with expand/collapse
│   └── SiteRow.js       - Site table row
└── utils/
    ├── modal.js         - Modal utilities (Micromodal)
    └── toast.js         - Toast notifications (Notyf)
```

**Key Frontend Concepts:**

- Uses HTM for JSX-like syntax via tagged template literals: `html\`<div>...</div>\``
- All imports from CDN: `import { h } from 'https://esm.sh/preact@10.19.3'`
- Edit any `.js` file in `src/public/`, refresh browser to see changes (no build step)
- Tailwind CSS loaded via CDN in index.html

### Database Schema

SQLite database (`data.db`) with these tables:

**sites** - RSS feeds and websites to monitor

- `type` field supports: `'rss'`, `'html_rules'`, `'html_llm'`
- `extraction_rules` - JSON array of CSS selector rules (for html_rules)
- `extraction_instructions` - Additional LLM prompt context (for html_llm)

**posts** - Extracted posts from sites

- Composite unique constraint on `(url, title, date)` prevents duplicates
- `notified` column tracks Slack notification status

**config** - Application configuration (key-value pairs)

- Includes: `schedule`, `openai_api_key`, `slack_webhook_url`, `prompt_summarization`, `prompt_html_extract_base`, `cleanup_content_days`, `cleanup_delete_days`

**logs** - Application logs with levels (info, error, warn)

### Content Extraction Methods

Three extraction types supported:

1. **RSS** (`type: 'rss'`) - Standard RSS/Atom feeds using rss-parser
2. **HTML Rules** (`type: 'html_rules'`) - CSS selector-based extraction using cheerio
   - Supports multiple extraction rules per site (different sections with different HTML structures)
   - Example: Newsletter with "Featured Articles" and "Quick Links" sections
3. **HTML LLM** (`type: 'html_llm'`) - OpenAI-based extraction for complex/unpredictable HTML
   - Always uses base prompt from config (`prompt_html_extract_base`)
   - Optional site-specific instructions appended to base prompt

### Dynamic Cron Scheduling

The cron job uses `node-cron` with dynamic schedule updates:

- Schedule stored in config table as cron expression (e.g., "0 9 * * *")
- On config update, cron task is stopped and restarted with new schedule
- Manual "Check Now" button triggers immediate check without waiting for schedule

### Testing Strategy

**Framework:** uvu (ultra-fast test runner) + sinon (mocking) + c8 (coverage)

**Test Files:**

```
src/server/__tests__/
├── sites-api.test.js
├── posts-api.test.js
├── config-api.test.js
├── logs-api.test.js
├── db.test.js
└── utils.test.js
```

**Running single test file:**

```bash
NODE_OPTIONS=--experimental-vm-modules npx uvu src/server/__tests__/sites-api.test.js
```

**Frontend:** No component tests. Manual testing during development is sufficient (simple presentational components, no complex state logic).

### Code Formatting

Uses **dprint** (Rust-based formatter, 10-100x faster than Prettier):

- Configuration in `dprint.json`
- Enforces: single quotes, semicolons, 100-char line width, 2-space indentation
- Pre-commit hook (Husky) automatically formats code and runs tests

### Key Implementation Details

**Composite Unique Constraint:**
Posts table uses `UNIQUE(url, title, date)` to handle cases where:

- Same URL with different titles = different posts
- Same title on different dates = different posts
- Prevents duplicate notifications for identical posts

**Database Cleanup:**
Automatic cleanup runs daily at midnight:

- Clears `content` column for posts older than `cleanup_content_days` (default: 7 days)
- Deletes entire posts older than `cleanup_delete_days` (default: 365 days)
- Keeps summaries for historical reference while managing database size

**Multi-Rule Extraction (html_rules):**
Each site can have multiple extraction rules in JSON format:

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
    "name": "Quick Links",
    "container": ".useful-links li",
    "title": "a",
    "url": "a",
    "content": ""
  }
]
```

All rules are applied independently and results combined - perfect for newsletters with multiple sections.

**LLM Extraction (html_llm):**

- Base prompt always from `prompt_html_extract_base` config (ensures consistent JSON output)
- Site-specific `extraction_instructions` appended as additional context
- Handles complex/changing HTML layouts but costs API credits

**API Endpoints:**

- Sites: GET/POST/PUT/DELETE `/api/sites`, POST `/api/sites/:id/check-now`, POST `/api/sites/test-extraction`, POST `/api/sites/test-llm-extraction`
- Posts: GET `/api/posts`, GET `/api/posts/:id`, DELETE `/api/posts/:id`, POST `/api/posts/truncate/:site_id`
- Config: GET/PUT `/api/config`
- Logs: GET `/api/logs`
- Cron: POST `/api/cron/run`

## Important Notes

### Dependencies and Libraries

- This project intentionally avoids having a build step for its front-end.
- Most dependencies are loaded from CDN.
- All dependencies are picked to be lightweight, dependency-free, preferably vanilla-JS and in a few kb in size.

### ES Modules

This project uses ES modules (`"type": "module"` in package.json):

- Use `import/export` syntax, not `require/module.exports`
- File paths need `.js` extension in imports
- Tests require `NODE_OPTIONS=--experimental-vm-modules` flag

### Frontend Development

When editing frontend code:

- Edit files in `src/public/pages/` or `src/public/components/`
- Refresh browser to see changes (no build step)
- Use HTM syntax: `html\`<${Component} prop=${value}>Content</${Component}>\``
- Import from CDN: `import { h } from 'https://esm.sh/preact@10.19.3'`

### Database Location

- Development: `data.db` in project root (bind-mounted in Docker)
- Database is created automatically on first run
- To reset database, delete `data.db` and restart server

### Environment Variables

- `LOG_LEVEL` - Logging level (default: 'info')
- `NODE_ENV` - Set to 'test' during testing
- Config values (API keys, webhooks) stored in database, not env vars

## Development Workflow

1. **Backend changes:** Edit files in `src/server/`, nodemon auto-restarts server
2. **Frontend changes:** Edit files in `src/public/`, refresh browser
3. **Before commit:** Pre-commit hook runs formatting + tests automatically
4. **Adding tests:** Create `*.test.js` files in `src/server/__tests__/`
5. **Testing extraction:** Use "Test Extraction" button in UI (Sites tab) to validate CSS selectors or LLM prompts

## Project Status

See `plan.md` for detailed initial implementation roadmap and architecture decisions.
