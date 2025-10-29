import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';
import { logger } from './utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database
initDb();
logger.info('Database initialized successfully');

// Initialize cron scheduler
import { initCron } from './cron.js';
initCron();

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  },
});

// Register static file serving for public directory
await fastify.register(fastifyStatic, {
  root: path.join(__dirname, '../public'),
  prefix: '/',
});

// Import API handlers
import * as sitesAPI from './api/sites.js';
import * as postsAPI from './api/posts.js';
import * as configAPI from './api/config.js';
import * as logsAPI from './api/logs.js';
import * as cronAPI from './api/cron.js';

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

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
const start = async () => {
  try {
    const port = process.env.PORT || 5566;
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });
    fastify.log.info(`Server running on http://${host}:${port}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

export default fastify;
