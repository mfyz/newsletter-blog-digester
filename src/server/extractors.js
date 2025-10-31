import axios from 'axios';
import Parser from 'rss-parser';
import * as cheerio from 'cheerio';
import * as db from './db.js';
import { logger, toAbsoluteUrl, sendToSlack } from './utils.js';
import { OpenAIClient } from './openai-client.js';

const rssParser = new Parser();

/**
 * Transform/clean post data before processing
 * - Remove reading time from titles (e.g., "(7 minute read)")
 * - Clean URLs by removing tracking parameters
 */
export function transformPost(post) {
  // Clean title: remove reading time patterns like "(7 minute read)", "(3 min read)", etc.
  let cleanTitle = post.title;
  if (cleanTitle) {
    // Match patterns like "(X minute read)", "(X min read)", "(X-minute read)"
    cleanTitle = cleanTitle.replace(/\s*\(\d+[\s-]?min(ute)?s?\s+read\)/gi, '').trim();
  }

  // Clean URL: remove tracking and unwanted query parameters
  let cleanUrl = post.url;
  if (cleanUrl) {
    try {
      const urlObj = new URL(cleanUrl);
      const paramsToRemove = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'reflink', 'mod'];

      // Remove unwanted params
      paramsToRemove.forEach(param => {
        urlObj.searchParams.delete(param);
      });

      cleanUrl = urlObj.toString();
    } catch (e) {
      // If URL parsing fails, keep original
      logger.warn('Failed to parse URL for cleaning', { url: post.url, error: e.message });
    }
  }

  return {
    ...post,
    title: cleanTitle,
    url: cleanUrl
  };
}

/**
 * Clean HTML by removing script and style tags with their contents
 */
export function cleanHTML(html) {
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

    // Transform posts (clean titles and URLs)
    return recentPosts.map(transformPost);
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
      const parsed = JSON.parse(site.extraction_rules || '{}');

      // Handle both old array format and new object format
      if (Array.isArray(parsed)) {
        // Old format: array of rule objects
        rules = parsed;
      } else if (parsed.postContainer) {
        // New format: single object with postContainer, title, link, etc.
        rules = [{
          name: 'default',
          container: parsed.postContainer,
          title: parsed.title,
          url: parsed.link || parsed.url,
          date: parsed.date,
          content: parsed.content
        }];
      } else {
        rules = [];
      }
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
          title = titleEl.first().text().trim();
        }

        // Extract URL (get href attribute)
        let url = '';
        if (rule.url) {
          const urlEl = rule.url === '.' ? $container : $container.find(rule.url);
          url = urlEl.first().attr('href') || '';

          // Handle relative URLs
          if (url && !url.startsWith('http')) {
            url = toAbsoluteUrl(url, site.url);
          }
        }

        // Extract content
        let content = '';
        if (rule.content) {
          const contentEl = rule.content === '.' ? $container : $container.find(rule.content);
          content = contentEl.first().text().trim();
        }

        // Extract date if provided
        let date = new Date().toISOString();
        if (rule.date) {
          const dateEl = rule.date === '.' ? $container : $container.find(rule.date);
          const dateText = dateEl.first().text().trim();
          if (dateText) {
            try {
              const parsedDate = new Date(dateText);
              if (!isNaN(parsedDate.getTime())) {
                date = parsedDate.toISOString();
              }
            } catch (e) {
              // Keep default date if parsing fails
            }
          }
        }

        // Only add if we have at least title and URL
        if (title && url) {
          posts.push({
            title,
            url,
            content: content || '',
            date,
            source_rule: rule.name || 'default', // Track which rule extracted this
          });
        }
      });
    });

    // Transform posts (clean titles and URLs)
    return posts.map(transformPost);
  } catch (error) {
    logger.error(`Failed to fetch HTML with rules: ${site.url}`, {
      error: error.message,
    });
    throw error;
  }
}

/**
 * Strip markdown code blocks from LLM response
 */
function stripCodeBlocks(content) {
  // Remove ```json and ``` markers
  let cleaned = content.trim();

  // Check if content starts with markdown code block
  if (cleaned.startsWith('```')) {
    // Remove opening ```json or ```
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '');
    // Remove closing ```
    cleaned = cleaned.replace(/\n?```\s*$/, '');
  }

  return cleaned.trim();
}

/**
 * Fetch HTML and extract using LLM
 */
export async function fetchHTMLWithLLM(site) {
  try {
    logger.info(`Starting LLM extraction for site: ${site.title}`, {
      site_id: site.id,
      url: site.url,
    });

    // Create OpenAI client
    const openaiClient = new OpenAIClient();

    // Fetch HTML
    logger.info(`Fetching HTML from: ${site.url}`, { site_id: site.id });
    const response = await axios.get(site.url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; NewsletterDigester/1.0; +https://github.com/yourrepo)',
      },
      timeout: 30000,
    });

    const html = response.data;
    logger.info(`Fetched HTML (${html.length} chars)`, { site_id: site.id });

    // Clean HTML to remove script and style tags
    const cleanedHTML = cleanHTML(html);
    logger.info(`Cleaned HTML (${cleanedHTML.length} chars)`, {
      site_id: site.id,
    });

    // Always use base prompt
    const basePrompt = db.getConfig('prompt_html_extract_base');

    // Append site-specific instructions if provided
    let fullPrompt = basePrompt;
    if (site.extraction_instructions) {
      fullPrompt += `\n\nAdditional instructions for this site:\n${site.extraction_instructions}`;
      logger.info('Using site-specific extraction instructions', {
        site_id: site.id,
      });
    }

    // Call OpenAI
    logger.info('Calling OpenAI API for extraction', { site_id: site.id });
    const rawContent = await openaiClient.createChatCompletion([
      { role: 'system', content: fullPrompt },
      {
        role: 'user',
        content: `Base URL: ${site.url}\n\nHTML (truncated to first 10000 chars):\n${cleanedHTML.substring(0, 10000)}`,
      },
    ]);

    logger.info(`Received LLM response (${rawContent.length} chars)`, {
      site_id: site.id,
      preview: rawContent.substring(0, 200),
    });

    // Strip markdown code blocks if present
    const content = stripCodeBlocks(rawContent);

    if (content !== rawContent) {
      logger.info('Stripped markdown code blocks from LLM response', {
        site_id: site.id,
      });
    }

    // Try to parse as JSON array directly or extract from object
    let result;
    try {
      result = JSON.parse(content);

      // If result is wrapped in an object like {posts: [...]}, unwrap it
      if (result.posts && Array.isArray(result.posts)) {
        logger.info('Unwrapped posts from object wrapper', { site_id: site.id });
        result = result.posts;
      } else if (!Array.isArray(result)) {
        // If it's an object but not wrapped, try to find the array
        const firstKey = Object.keys(result)[0];
        if (Array.isArray(result[firstKey])) {
          logger.info(`Unwrapped posts from key: ${firstKey}`, {
            site_id: site.id,
          });
          result = result[firstKey];
        } else {
          // Fallback: wrap single object in array
          logger.info('Wrapped single object in array', { site_id: site.id });
          result = [result];
        }
      }
    } catch (e) {
      logger.error(`Failed to parse LLM response for site ${site.title}`, {
        error: e.message,
        site_id: site.id,
        raw_content_preview: rawContent.substring(0, 500),
        cleaned_content_preview: content.substring(0, 500),
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

    logger.info(`LLM extracted ${posts.length} posts from ${site.title}`, {
      site_id: site.id,
      filtered_count: result.length - posts.length,
    });

    // Log sample of extracted posts for debugging
    if (posts.length > 0) {
      logger.info('Sample of extracted posts', {
        site_id: site.id,
        sample: posts.slice(0, 2).map((p) => ({ title: p.title, url: p.url })),
      });
    }

    // Transform posts (clean titles and URLs)
    return posts.map(transformPost);
  } catch (error) {
    logger.error(`LLM extraction failed for site ${site.title}`, {
      error: error.message,
      site_id: site.id,
      stack: error.stack,
    });
    throw error;
  }
}

/**
 * Post-process AI-generated summary to clean up formatting
 */
function cleanupSummary(summary) {
  if (!summary) return summary;

  let cleaned = summary;

  // Remove excessive line breaks (3+ consecutive newlines -> 2 newlines)
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

  // Remove extra line breaks between bullet points
  // Match patterns like "- item\n\n- item" and replace with "- item\n- item"
  cleaned = cleaned.replace(/([*\-•].*)\n{2,}(?=[*\-•])/g, '$1\n');

  // Remove extra line breaks between numbered list items
  // Match patterns like "1. item\n\n2. item" and replace with "1. item\n2. item"
  cleaned = cleaned.replace(/(\d+\..*)\n{2,}(?=\d+\.)/g, '$1\n');

  // Trim whitespace from each line while preserving line breaks
  cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');

  // Remove any trailing/leading whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Summarize post content using OpenAI
 */
export async function summarizePost(content) {
  try {
    // Create OpenAI client
    const openaiClient = new OpenAIClient();

    // Get summarization prompt from config
    const prompt = db.getConfig('prompt_summarization');

    const summary = await openaiClient.createChatCompletion(
      [
        { role: 'system', content: prompt },
        { role: 'user', content: content.substring(0, 10000) }, // Limit content size
      ],
      { max_tokens: 200 },
    );

    // Clean up the AI-generated summary
    return cleanupSummary(summary.trim());
  } catch (error) {
    logger.error('Failed to summarize post', { error: error.message });
    return null; // Return null on error so we can still save the post
  }
}

/**
 * Clean up old content (wrapper for db function)
 */
export function cleanupOldContent() {
  return db.cleanupOldContent();
}
