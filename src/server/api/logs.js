import * as db from '../db.js';
import { logger } from '../utils.js';

/**
 * GET /api/logs - Get logs with optional filters
 */
export async function getAll(req, reply) {
  try {
    const { level, limit = 200 } = req.query;

    console.log('[DEBUG] Fetching logs with filters:', { level, limit: parseInt(limit) });

    const logs = db.getLogs({
      level,
      limit: parseInt(limit),
    });

    console.log('[DEBUG] Successfully fetched', logs.length, 'logs');

    return logs;
  } catch (error) {
    // Don't use logger here to avoid recursion when logging fails
    console.error('[ERROR] Failed to get logs:', error.message);
    console.error('[ERROR] Stack trace:', error.stack);
    return reply.code(500).send({ error: 'Failed to fetch logs', details: error.message });
  }
}
