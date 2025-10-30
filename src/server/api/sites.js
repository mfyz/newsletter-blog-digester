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

/**
 * POST /api/sites/:id/toggle - Toggle site active status
 */
export async function toggleActive(req, reply) {
  try {
    const { id } = req.params;
    const site = db.getSite(id);

    if (!site) {
      return reply.code(404).send({ error: 'Site not found' });
    }

    const newActiveStatus = site.is_active ? 0 : 1;
    db.updateSite(id, { is_active: newActiveStatus });

    return { success: true, is_active: newActiveStatus };
  } catch (error) {
    logger.error('Failed to toggle site', { error: error.message });
    return reply.code(500).send({ error: 'Failed to toggle site' });
  }
}

/**
 * POST /api/sites/fetch-html - Fetch and return HTML from URL
 */
export async function fetchHTML(req, reply) {
  try {
    const { url } = req.body;

    if (!url) {
      return reply.code(400).send({ error: 'URL is required' });
    }

    // Import axios dynamically
    const axios = (await import('axios')).default;

    const response = await axios.get(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; NewsletterDigester/1.0; +https://github.com/yourrepo)',
      },
      timeout: 30000,
    });

    return {
      success: true,
      html: response.data,
      url,
    };
  } catch (error) {
    logger.error('Failed to fetch HTML', { error: error.message });
    return reply.code(500).send({ error: error.message });
  }
}

/**
 * POST /api/sites/generate-selectors - Generate CSS selectors using LLM
 */
export async function generateSelectors(req, reply) {
  try {
    const { url, html, prompt } = req.body;

    if (!html) {
      return reply.code(400).send({ error: 'HTML is required' });
    }

    // Get OpenAI API key from config
    const apiKey = db.getConfig('openai_api_key');
    if (!apiKey) {
      return reply.code(400).send({ error: 'OpenAI API key not configured. Please configure it in Settings.' });
    }

    // Import OpenAI dynamically
    const OpenAI = (await import('openai')).default;
    const baseURL = db.getConfig('openai_base_url') || 'https://api.openai.com/v1';
    const openai = new OpenAI({ apiKey, baseURL });

    // Import extractors for HTML cleaning
    const { cleanHTML } = await import('../extractors.js');

    // Clean HTML to remove script and style tags
    let cleanedHTML = html;
    // Remove script tags and their contents
    cleanedHTML = cleanedHTML.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    // Remove style tags and their contents
    cleanedHTML = cleanedHTML.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Default prompt for generating selectors
    const defaultPrompt = `You are a web scraping expert. Given the HTML of a blog/news page, generate CSS selectors to extract post information.

Return a JSON object with the following structure:
{
  "postContainer": "CSS selector that matches each post/article container",
  "title": "CSS selector for post title (relative to container)",
  "link": "CSS selector for post link (relative to container)",
  "date": "CSS selector for post date (relative to container, optional)",
  "content": "CSS selector for post content/excerpt (relative to container, optional)"
}

Make sure the selectors are as specific as possible but not overly fragile. Prefer class names and semantic tags.
Only return the JSON object, no additional text.`;

    const finalPrompt = prompt || defaultPrompt;

    // Call OpenAI
    const response = await openai.chat.completions.create({
      model: db.getConfig('openai_model') || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: finalPrompt },
        {
          role: 'user',
          content: `Base URL: ${url || 'N/A'}\n\nHTML (truncated to first 15000 chars):\n${cleanedHTML.substring(0, 15000)}`,
        },
      ],
      temperature: 0.3,
    });

    const content = response.choices[0].message.content;

    // Try to parse as JSON
    let selectors;
    try {
      // Extract JSON from markdown code blocks if present
      let jsonContent = content;
      const jsonMatch = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
      if (jsonMatch) {
        jsonContent = jsonMatch[1];
      }

      selectors = JSON.parse(jsonContent);
    } catch (e) {
      logger.error('Failed to parse LLM response for selector generation', {
        error: e.message,
        content,
      });
      return reply.code(500).send({
        error: 'Failed to parse LLM response as JSON',
        raw_response: content
      });
    }

    return {
      success: true,
      selectors,
      raw_response: content,
    };
  } catch (error) {
    logger.error('Failed to generate selectors', { error: error.message });
    return reply.code(500).send({ error: error.message });
  }
}
