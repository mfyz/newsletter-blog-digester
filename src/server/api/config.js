import * as db from '../db.js';
import { logger } from '../utils.js';
import OpenAI from 'openai';

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

/**
 * POST /api/config/test-ai - Test AI connection
 */
export async function testAI(req, reply) {
  try {
    const { openai_api_key, openai_base_url, openai_model } = req.body;

    // Validate required fields
    if (!openai_api_key || !openai_base_url) {
      return reply.code(400).send({ error: 'API key and base URL are required' });
    }

    // Create OpenAI client with provided credentials
    const openai = new OpenAI({
      apiKey: openai_api_key,
      baseURL: openai_base_url || 'https://api.openai.com/v1',
    });

    // Send a simple test message
    const response = await openai.chat.completions.create({
      model: openai_model || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Say "Connection successful!" if you can read this.' },
      ],
      temperature: 0.3,
      max_tokens: 50,
    });

    const aiResponse = response.choices[0].message.content.trim();

    logger.info('AI connection test successful', { model: openai_model });
    return { success: true, response: aiResponse };
  } catch (error) {
    logger.error('AI connection test failed', { error: error.message });
    return reply.code(500).send({ error: error.message || 'Connection test failed' });
  }
}
