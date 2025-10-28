# Newsletter Blog Digester

A lightweight app that periodically checks websites/newsletters, summarizes posts using OpenAI, and sends digests to Slack.

## Features

- 🔄 Multiple extraction methods: RSS, HTML with CSS selectors, HTML with LLM
- 📊 Automatic post deduplication and summarization
- ⚡ Dynamic cron scheduling
- 🎨 Modern UI: Preact + HTM (no build system!)

## Tech Stack

- **Backend**: Fastify, SQLite, node-cron, OpenAI API
- **Frontend**: Preact + HTM (4KB!), Tailwind CSS
- **Container**: Docker Compose

## Quick Start

```bash
# Start with Docker
docker-compose up

# Open browser
http://localhost:3000
```

See `plan.md` for detailed implementation plan.

## Project Status

🚧 **Work in Progress** - Currently in planning/implementation phase.

## License

MIT
