# Newsletter & Blog Digester

A small application that periodically checks websites/blogs, summarizes new
posts using OpenAI, and sends digests to Slack.

## Features & Benefits

- **Multiple Extraction Methods**: RSS feeds, CSS selector rules, or AI-powered extraction for complex HTML layouts
- **Flexible AI Options**: Use OpenAI API or run Ollama locally for completely offline operation
- **Smart Content Processing**: Automatic deduplication, summarization, and notification management
- **Slack Integration**: Multi-channel notifications with customizable bot name and emoji
- **Single Docker Container**: Everything runs in one lightweight container with auto-reload during development
- **Zero Build Step Frontend**: Preact + HTM loaded from CDN - edit and refresh, no compilation needed
- **Fully Offline Capable**: Works without internet when using local Ollama for AI processing
- **Lightweight Stack**: Node.js + Fastify + SQLite - minimal dependencies, fast startup, low resource usage
- **Scheduled Monitoring**: Configurable cron schedules with manual "Check Now" option
- **Web UI**: Clean interface for managing sites, viewing posts, configuring settings, and monitoring logs

## Screenshots

Here is what it looks like:

<table>
  <tr>
    <td width="33%" align="center">
      <a href="screenshots/1-posts.jpg">
        <img src="screenshots/1-posts.jpg" width="100%" alt="Posts View">
      </a>
      <br>
      <strong>Posts View</strong><br>
      Browse and manage all extracted posts with expandable cards showing summaries and content
    </td>
    <td width="33%" align="center">
      <a href="screenshots/2-post-detail-and-actions.jpg">
        <img src="screenshots/2-post-detail-and-actions.jpg" width="100%" alt="Post Details">
      </a>
      <br>
      <strong>Post Details & Actions</strong><br>
      View full post details, mark as read/unread, flag posts, and delete individual items
    </td>
    <td width="33%" align="center">
      <a href="screenshots/3-sites.jpg">
        <img src="screenshots/3-sites.jpg" width="100%" alt="Sites Management">
      </a>
      <br>
      <strong>Sites Management</strong><br>
      Manage RSS feeds and websites with support for multiple extraction methods
    </td>
  </tr>
  <tr>
    <td width="33%" align="center">
      <a href="screenshots/4-site-configuration.jpg">
        <img src="screenshots/4-site-configuration.jpg" width="100%" alt="Site Configuration">
      </a>
      <br>
      <strong>Site Configuration</strong><br>
      Configure extraction rules with CSS selectors or LLM-based extraction for complex sites
    </td>
    <td width="33%" align="center">
      <a href="screenshots/5-settings.jpg">
        <img src="screenshots/5-settings.jpg" width="100%" alt="Settings">
      </a>
      <br>
      <strong>Settings</strong><br>
      Configure OpenAI API, Slack notifications, cron schedule, and customization options
    </td>
    <td width="33%" align="center">
      <a href="screenshots/6-logs.jpg">
        <img src="screenshots/6-logs.jpg" width="100%" alt="Application Logs">
      </a>
      <br>
      <strong>Application Logs</strong><br>
      Monitor system activity with filterable logs showing extraction jobs and errors
    </td>
  </tr>
</table>

## Tech Stack

- **Runtime**: Node.js 20
- **Framework**: Fastify
- **Database**: SQLite (better-sqlite3)
- **Frontend**: Preact + HTM + snarkdown
- **Testing**: uvu + sinon + c8
- **Formatting**: dprint (Rust-based formatter) / 10-100x faster than Prettier /  Zero npm dependencies
- **Git Hooks**: Husky
- **Container**: Docker Compose

## Quick Start

### Local Development

```bash
# Start
docker compose up -d
```

Server will be available at: **http://localhost:5566**

## Testing

Tests use:

- **uvu**: Fast, lightweight test runner
- **sinon**: Mocking library for external APIs
- **c8**: Code coverage tool

Test files: `src/server/__tests__/*.test.js`

## License

MIT
