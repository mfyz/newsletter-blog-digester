import axios from 'axios';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import OpenAI from 'openai';
import * as db from './db.js';
import { logger, toAbsoluteUrl } from './utils.js';

const rssParser = new Parser();

/**
 * Clean HTML by removing script and style tags with their contents
 */
function cleanHTML(html) {
  // Remove script tags and their contents
  html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Remove style tags and their contents
  html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  return html;
}

/**
 * Main function to fetch content from a site based on its type
 */
export async function fetchSiteContent(site) {
  try {
    if (site.type === 'rss') {
      return await fetchRSSFeed(site.url);
    } else if (site.type === 'html_rules') {
      return await fetchHTMLWithRules(site);
    } else if (site.type === 'html_llm') {
      return await fetchHTMLWithLLM(site);
    } else {
      logger.warn(`Unknown site type: ${site.type}`, { site_id: site.id });
      return [];
    }
  } catch (error) {
    logger.error(`Failed to fetch content for site ${site.title}`, {
      error: error.message,
      site_id: site.id,
    });
    return [];
  }
}

/**
 * Parse RSS date to ISO string
 */
function parseRSSDate(item) {
  // Try various date fields in order of preference
  const dateString = item.pubDate || item.isoDate || item.date || item.published || item.updated;

  if (!dateString) {
    return new Date().toISOString();
  }

  try {
    const parsedDate = new Date(dateString);
    // Check if date is valid
    if (isNaN(parsedDate.getTime())) {
      logger.warn(`Invalid date format: ${dateString}`, { date: dateString });
      return new Date().toISOString();
    }
    return parsedDate.toISOString();
  } catch (error) {
    logger.warn(`Failed to parse date: ${dateString}`, { error: error.message });
    return new Date().toISOString();
  }
}

/**
 * Fetch and parse RSS/Atom feed
 */
export async function fetchRSSFeed(url) {
  try {
    const feed = await rssParser.parseURL(url);

    // Parse all items with proper date handling
    const allPosts = feed.items.map((item) => ({
      title: item.title || 'Untitled',
      url: item.link || item.guid || '',
      content: item.content || item.contentSnippet || item.description || '',
      date: parseRSSDate(item),
    }));

    // Filter posts from last 7 days only
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentPosts = allPosts.filter((post) => {
      const postDate = new Date(post.date);
      return postDate >= sevenDaysAgo;
    });

    // Sort by date (newest first)
    recentPosts.sort((a, b) => new Date(b.date) - new Date(a.date));

    logger.info(`RSS feed ${url}: ${allPosts.length} total posts, ${recentPosts.length} from last 7 days`);

    return recentPosts;
  } catch (error) {
    logger.error(`Failed to parse RSS feed: ${url}`, { error: error.message });
    throw error;
  }
}

/**
 * Fetch HTML and extract using CSS selector rules
 */
export async function fetchHTMLWithRules(site) {
  try {
    const response = await axios.get(site.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; NewsletterDigester/1.0; +https://github.com/yourrepo)',
      },
      timeout: 30000,
    });

    const $ = cheerio.load(response.data);
    const posts = [];

    // Parse extraction rules from JSON
    let rules;
    try {
      rules = JSON.parse(site.extraction_rules || '[]');
    } catch (e) {
      logger.error(`Failed to parse extraction rules for site ${site.id}`, {
        error: e.message,
      });
      return [];
    }

    // If no rules defined, return empty
    if (!Array.isArray(rules) || rules.length === 0) {
      logger.warn(`No extraction rules defined for site: ${site.title}`);
      return [];
    }

    // Apply each extraction rule
    rules.forEach((rule) => {
      if (!rule.container) {
        logger.warn(`Rule "${rule.name}" missing container selector`, {
          site_id: site.id,
        });
        return;
      }

      $(rule.container).each((i, container) => {
        const $container = $(container);

        // Extract title
        let title = '';
        if (rule.title) {
          const titleEl = rule.title === '.' ? $container : $container.find(rule.title);
          title = titleEl.text().trim();
        }

        // Extract URL (get href attribute)
        let url = '';
        if (rule.url) {
          const urlEl = rule.url === '.' ? $container : $container.find(rule.url);
          url = urlEl.attr('href') || '';

          // Handle relative URLs
          if (url && !url.startsWith('http')) {
            url = toAbsoluteUrl(url, site.url);
          }
        }

        // Extract content
        let content = '';
        if (rule.content) {
          const contentEl = rule.content === '.' ? $container : $container.find(rule.content);
          content = contentEl.text().trim();
        }

        // Only add if we have at least title and URL
        if (title && url) {
          posts.push({
            title,
            url,
            content: content || '',
            date: new Date().toISOString(), // Use current date as fallback
            source_rule: rule.name || 'default', // Track which rule extracted this
          });
        }
      });
    });

    return posts;
  } catch (error) {
    logger.error(`Failed to fetch HTML with rules: ${site.url}`, {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Fetch HTML and extract using LLM
 */
export async function fetchHTMLWithLLM(site) {
  try {
    // Get OpenAI API key from config
    const apiKey = db.getConfig('openai_api_key');
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const baseURL = db.getConfig('openai_base_url') || 'https://api.openai.com/v1';
    const openai = new OpenAI({ apiKey, baseURL });

    // Fetch HTML
    const response = await axios.get(site.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; NewsletterDigester/1.0; +https://github.com/yourrepo)',
      },
      timeout: 30000,
    });

    const html = response.data;

    // Clean HTML to remove script and style tags
    const cleanedHTML = cleanHTML(html);

    // Always use base prompt
    const basePrompt = db.getConfig('prompt_html_extract_base');

    // Append site-specific instructions if provided
    let fullPrompt = basePrompt;
    if (site.extraction_instructions) {
      fullPrompt += `\n\nAdditional instructions for this site:\n${site.extraction_instructions}`;
    }

    // Call OpenAI
    const extraction = await openai.chat.completions.create({
      model: db.getConfig('openai_model') || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: fullPrompt },
        {
          role: 'user',
          content: `Base URL: ${site.url}\n\nHTML (truncated to first 10000 chars):\n${cleanedHTML.substring(0, 10000)}`,
        },
      ],
      temperature: 0.3,
    });

    const content = extraction.choices[0].message.content;

    // Try to parse as JSON array directly or extract from object
    let result;
    try {
      result = JSON.parse(content);

      // If result is wrapped in an object like {posts: [...]}, unwrap it
      if (result.posts && Array.isArray(result.posts)) {
        result = result.posts;
      } else if (!Array.isArray(result)) {
        // If it's an object but not wrapped, try to find the array
        const firstKey = Object.keys(result)[0];
        if (Array.isArray(result[firstKey])) {
          result = result[firstKey];
        } else {
          // Fallback: wrap single object in array
          result = [result];
        }
      }
    } catch (e) {
      logger.error(`Failed to parse LLM response for site ${site.title}`, {
        error: e.message,
      });
      return [];
    }

    // Validate and normalize posts
    const posts = result
      .filter((post) => post.title && post.url)
      .map((post) => ({
        title: post.title,
        url: toAbsoluteUrl(post.url, site.url),
        content: post.content || '',
        date: post.date || new Date().toISOString(),
      }));

    logger.info(`LLM extracted ${posts.length} posts from ${site.title}`);
    return posts;
  } catch (error) {
    logger.error(`LLM extraction failed for site ${site.title}`, {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Summarize post content using OpenAI
 */
export async function summarizePost(content) {
  try {
    // Get OpenAI API key from config
    const apiKey = db.getConfig('openai_api_key');
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }

    const baseURL = db.getConfig('openai_base_url') || 'https://api.openai.com/v1';
    const openai = new OpenAI({ apiKey, baseURL });

    // Get summarization prompt from config
    const prompt = db.getConfig('prompt_summarization');

    const response = await openai.chat.completions.create({
      model: db.getConfig('openai_model') || 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: prompt },
        { role: 'user', content: content.substring(0, 10000) }, // Limit content size
      ],
      temperature: 0.3,
      max_tokens: 200,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    logger.error('Failed to summarize post', { error: error.message });
    return null; // Return null on error so we can still save the post
  }
}

/**
 * Send posts digest to Slack
 */
export async function sendToSlack(posts) {
  try {
    const webhookUrl = db.getConfig('slack_webhook_url');
    if (!webhookUrl) {
      logger.warn('Slack webhook URL not configured, skipping notification');
      return false;
    }

    // Group posts by site
    const postsBySite = {};
    posts.forEach((post) => {
      if (!postsBySite[post.site_title]) {
        postsBySite[post.site_title] = [];
      }
      postsBySite[post.site_title].push(post);
    });

    // Build message
    let message = `*📬 New Posts Digest* (${posts.length} new posts)\n\n`;

    for (const [siteTitle, sitePosts] of Object.entries(postsBySite)) {
      message += `*${siteTitle}* (${sitePosts.length})\n`;

      sitePosts.forEach((post) => {
        message += `• <${post.url}|${post.title}>\n`;
        if (post.summary) {
          message += `  _${post.summary}_\n`;
        }
      });

      message += '\n';
    }

    // Send to Slack
    await axios.post(webhookUrl, {
      text: message,
      mrkdwn: true,
    });

    logger.info(`Sent ${posts.length} posts to Slack`);
    return true;
  } catch (error) {
    logger.error('Failed to send to Slack', { error: error.message });
    return false;
  }
}

/**
 * Clean up old content (wrapper for db function)
 */
export function cleanupOldContent() {
  return db.cleanupOldContent();
}
