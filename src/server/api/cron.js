import { logger } from '../utils.js';

/**
 * POST /api/cron/run - Manually trigger cron job
 */
export async function runNow(req, reply) {
  try {
    // Import cron manager dynamically
    const cronManager = await import('../cron.js');

    // Run in background to avoid timeout
    cronManager.runCheck().catch((err) => {
      logger.error('Manual check failed', { error: err.message });
    });

    return { success: true, message: 'Check started in background' };
  } catch (error) {
    logger.error('Failed to start cron', { error: error.message });
    return reply.code(500).send({ error: 'Failed to start cron job' });
  }
}
