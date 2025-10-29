import * as db from '../db.js';
import { logger } from '../utils.js';

/**
 * GET /api/logs - Get logs with optional filters
 */
export async function getAll(req, reply) {
  try {
    const { level, limit = 200 } = req.query;

    const logs = db.getLogs({
      level,
      limit: parseInt(limit),
    });

    return logs;
  } catch (error) {
    logger.error('Failed to get logs', { error: error.message });
    return reply.code(500).send({ error: 'Failed to fetch logs' });
  }
}
