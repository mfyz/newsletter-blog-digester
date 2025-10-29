import * as db from '../db.js';
import { logger } from '../utils.js';

/**
 * GET /api/sites - Get all sites
 */
export async function getAll(req, reply) {
  try {
    const sites = db.getAllSites();
    return sites;
  } catch (error) {
    logger.error('Failed to get sites', { error: error.message });
    return reply.code(500).send({ error: 'Failed to fetch sites' });
  }
}

/**
 * POST /api/sites - Create new site
 */
export async function create(req, reply) {
  try {
    const { url, title, type, extraction_rules, extraction_instructions, is_active } = req.body;

    if (!url || !title) {
      return reply.code(400).send({ error: 'URL and title are required' });
    }

    const site = db.createSite({
      url,
      title,
      type: type || 'rss',
      extraction_rules: extraction_rules ? JSON.stringify(extraction_rules) : null,
      extraction_instructions,
      is_active: is_active !== undefined ? is_active : 1,
    });

    logger.info('Site created', { id: site.id, title: site.title });
    return site;
  } catch (error) {
    logger.error('Failed to create site', { error: error.message });
    return reply.code(500).send({ error: 'Failed to create site' });
  }
}

/**
 * GET /api/sites/:id - Get single site
 */
export async function getOne(req, reply) {
  try {
    const site = db.getSite(req.params.id);
    if (!site) {
      return reply.code(404).send({ error: 'Site not found' });
    }
    return site;
  } catch (error) {
    logger.error('Failed to get site', { error: error.message });
    return reply.code(500).send({ error: 'Failed to fetch site' });
  }
}

/**
 * PUT /api/sites/:id - Update site
 */
export async function update(req, reply) {
  try {
    const { url, title, type, extraction_rules, extraction_instructions, is_active } = req.body;

    const updateData = {};
    if (url !== undefined) updateData.url = url;
    if (title !== undefined) updateData.title = title;
    if (type !== undefined) updateData.type = type;
    if (extraction_rules !== undefined)
      updateData.extraction_rules = JSON.stringify(extraction_rules);
    if (extraction_instructions !== undefined)
      updateData.extraction_instructions = extraction_instructions;
    if (is_active !== undefined) updateData.is_active = is_active;

    const site = db.updateSite(req.params.id, updateData);
    logger.info('Site updated', { id: site.id, title: site.title });
    return site;
  } catch (error) {
    logger.error('Failed to update site', { error: error.message });
    return reply.code(500).send({ error: 'Failed to update site' });
  }
}

/**
 * DELETE /api/sites/:id - Delete site
 */
export async function remove(req, reply) {
  try {
    db.deleteSite(req.params.id);
    logger.info('Site deleted', { id: req.params.id });
    return { success: true };
  } catch (error) {
    logger.error('Failed to delete site', { error: error.message });
    return reply.code(500).send({ error: 'Failed to delete site' });
  }
}

/**
 * POST /api/sites/test-extraction - Test CSS selector rules
 */
export async function testExtraction(req, reply) {
  try {
    const { url, extraction_rules } = req.body;

    if (!url || !extraction_rules) {
      return reply.code(400).send({ error: 'URL and extraction_rules are required' });
    }

    // Import extractors dynamically to avoid circular dependencies
    const { fetchHTMLWithRules } = await import('../extractors.js');

    // Create temporary site object
    const tempSite = {
      url,
      extraction_rules: JSON.stringify(extraction_rules),
      type: 'html_rules',
    };

    const posts = await fetchHTMLWithRules(tempSite);

    // Group posts by rule
    const byRule = {};
    posts.forEach((post) => {
      const ruleName = post.source_rule || 'default';
      if (!byRule[ruleName]) {
        byRule[ruleName] = { rule_name: ruleName, count: 0, posts: [] };
      }
      byRule[ruleName].count++;
      byRule[ruleName].posts.push(post);
    });

    return {
      total: posts.length,
      posts: posts.slice(0, 10), // Return first 10 for preview
      by_rule: Object.values(byRule),
    };
  } catch (error) {
    logger.error('Failed to test extraction', { error: error.message });
    return reply.code(500).send({ error: error.message });
  }
}

/**
 * POST /api/sites/test-llm-extraction - Test LLM extraction
 */
export async function testLLMExtraction(req, reply) {
  try {
    const { url, extraction_instructions } = req.body;

    if (!url) {
      return reply.code(400).send({ error: 'URL is required' });
    }

    // Import extractors dynamically
    const { fetchHTMLWithLLM } = await import('../extractors.js');

    // Create temporary site object
    const tempSite = {
      url,
      extraction_instructions,
      type: 'html_llm',
    };

    const posts = await fetchHTMLWithLLM(tempSite);

    return {
      success: true,
      count: posts.length,
      posts: posts.slice(0, 10), // Return first 10 for preview
      estimated_cost: 0.02, // Placeholder - will be calculated in extractor
      tokens_used: 4500, // Placeholder
    };
  } catch (error) {
    logger.error('Failed to test LLM extraction', { error: error.message });
    return reply.code(500).send({ error: error.message });
  }
}
