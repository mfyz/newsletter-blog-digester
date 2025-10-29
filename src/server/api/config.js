import * as db from '../db.js';
import { logger } from '../utils.js';

/**
 * GET /api/config - Get all config
 */
export async function getAll(req, reply) {
  try {
    const config = db.getAllConfig();
    return config;
  } catch (error) {
    logger.error('Failed to get config', { error: error.message });
    return reply.code(500).send({ error: 'Failed to fetch config' });
  }
}

/**
 * PUT /api/config - Update config
 */
export async function update(req, reply) {
  try {
    const updates = req.body; // { key: value, key2: value2, ... }

    // Update each config value
    for (const [key, value] of Object.entries(updates)) {
      db.setConfig(key, value);
    }

    // If schedule was updated, reschedule cron
    if (updates.schedule) {
      // Import cron manager dynamically to avoid circular dependencies
      const cronManager = await import('../cron.js');
      cronManager.updateSchedule(updates.schedule);
      logger.info('Cron schedule updated', { schedule: updates.schedule });
    }

    return { success: true, message: 'Config updated' };
  } catch (error) {
    logger.error('Failed to update config', { error: error.message });
    return reply.code(500).send({ error: 'Failed to update config' });
  }
}
