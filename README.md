# Newsletter Blog Digester

A Fastify application that periodically checks websites/blogs, summarizes new
posts using OpenAI, and sends digests to Slack.

## Phase 1: Core Setup ✅ COMPLETE

### What's Implemented

- ✅ **Package.json** with all dependencies
- ✅ **Testing Framework**: uvu + sinon + c8
- ✅ **Code Formatting**: dprint (Rust-based, blazing fast)
- ✅ **Pre-commit Hooks**: Husky (runs format + tests)
- ✅ **Fastify Server**: Basic server with health check endpoint
- ✅ **SQLite Database**: Schema initialization with all tables
- ✅ **Docker Compose**: Live reload development environment
- ✅ **Basic Tests**: Database and utilities tests

### Project Structure

```
newsletter-blog-digester/
├── src/
│   ├── server/
│   │   ├── server.js          # Main Fastify server
│   │   ├── db.js              # Database initialization & queries
│   │   ├── utils.js           # Logger & utilities
│   │   └── __tests__/         # Test files
│   └── public/
│       └── index.html         # Frontend placeholder
├── docker-compose.yml         # Docker configuration
├── package.json               # Dependencies & scripts
├── dprint.json                # Formatting configuration
└── .husky/                    # Git hooks
```

## Quick Start

### Local Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests in watch mode
npm run test:watch

# Check code formatting
npm run format:check

# Format code
npm run format

# Start server
npm start

# Start with auto-reload
npm run dev
```

Server will be available at: **http://localhost:5566**

### Docker Development

```bash
# Start with Docker Compose
docker compose up

# Stop
docker compose down

# View logs
docker compose logs -f
```

## Available Scripts

| Script                  | Description                        |
| ----------------------- | ---------------------------------- |
| `npm start`             | Start server in production mode    |
| `npm run dev`           | Start with nodemon (auto-reload)   |
| `npm test`              | Run all tests                      |
| `npm run test:watch`    | Run tests in watch mode            |
| `npm run test:coverage` | Run tests with coverage report     |
| `npm run format`        | Format all code                    |
| `npm run format:check`  | Check formatting without changes   |
| `npm run pre-commit`    | Run format + tests (used by Husky) |

## Database Schema

### Tables Created

- **sites**: RSS feeds and websites to monitor
- **posts**: Extracted posts from sites
- **config**: Application configuration
- **logs**: Application logs

## Configuration

Default configuration values are seeded automatically:

- **schedule**: `0 9 * * *` (9 AM daily)
- **openai_api_key**: (empty, to be configured)
- **slack_webhook_url**: (empty, to be configured)
- **prompt_summarization**: Default summarization prompt
- **prompt_html_extract_base**: Default HTML extraction prompt
- **cleanup_content_days**: 7 days
- **cleanup_delete_days**: 365 days

## Testing

Tests use:

- **uvu**: Fast, lightweight test runner
- **sinon**: Mocking library for external APIs
- **c8**: Code coverage tool

Test files: `src/server/__tests__/*.test.js`

## Code Quality

### Formatting

- **dprint** (Rust-based formatter)
- 10-100x faster than Prettier
- Zero npm dependencies
- Configured in `dprint.json`

### Pre-commit Hooks

Automatically runs before each commit:

1. Formats all code with dprint
2. Runs all tests with uvu
3. Blocks commit if either fails

To bypass (use sparingly): `git commit --no-verify`

## Health Check

Endpoint: `GET /health`

Returns:

```json
{
  "status": "ok",
  "timestamp": "2025-10-28T..."
}
```

## Next Steps (Phase 2)

- [ ] API endpoints for sites, posts, config, logs
- [ ] Cron job scheduler
- [ ] RSS/HTML extraction functions
- [ ] OpenAI integration for summarization
- [ ] Slack webhook integration
- [ ] Frontend UI with Preact + HTM

## Tech Stack

- **Runtime**: Node.js 20
- **Framework**: Fastify
- **Database**: SQLite (better-sqlite3)
- **Testing**: uvu + sinon + c8
- **Formatting**: dprint
- **Git Hooks**: Husky
- **Container**: Docker Compose
- **Frontend**: Preact + HTM (coming in Phase 2)

## Project Status

✅ **Phase 1 Complete** - Core setup finished, ready for Phase 2

See `plan.md` for detailed implementation plan.

## License

MIT
