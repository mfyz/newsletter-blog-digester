import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import sinon from 'sinon';
import * as extractors from '../extractors.js';
import * as db from '../db.js';
import axios from 'axios';
import Parser from 'rss-parser';
import { OpenAIClient } from '../openai-client.js';

const ExtractorTests = suite('Extractor Tests');

let axiosStub;
let parserStub;
let openAIStub;

ExtractorTests.before(() => {
  // Initialize test database
  try {
    db.initDb(':memory:');
  } catch (e) {
    // Already initialized
  }
});

ExtractorTests.before.each(() => {
  // Reset all stubs
  if (axiosStub) axiosStub.restore();
  if (parserStub) parserStub.restore();
  if (openAIStub) openAIStub.restore();
});

ExtractorTests.after.each(() => {
  // Clean up stubs
  sinon.restore();
});

// ========== fetchRSSFeed() Tests ==========
ExtractorTests('fetchRSSFeed() - should parse valid RSS feed', async () => {
  const mockFeed = {
    items: [
      {
        title: 'Test Post 1',
        link: 'https://example.com/post1',
        content: 'Test content 1',
        pubDate: new Date().toISOString(),
      },
      {
        title: 'Test Post 2',
        link: 'https://example.com/post2',
        contentSnippet: 'Test snippet 2',
        isoDate: new Date().toISOString(),
      },
    ],
  };

  const parser = new Parser();
  parserStub = sinon.stub(parser, 'parseURL').resolves(mockFeed);
  sinon.replace(Parser.prototype, 'parseURL', parserStub);

  const posts = await extractors.fetchRSSFeed('https://example.com/feed');

  assert.ok(Array.isArray(posts));
  assert.is(posts.length, 2);
  assert.is(posts[0].title, 'Test Post 1');
  assert.is(posts[0].url, 'https://example.com/post1');
  assert.ok(posts[0].date);
});

ExtractorTests('fetchRSSFeed() - should handle Atom feed', async () => {
  const mockFeed = {
    items: [
      {
        title: 'Atom Post',
        link: 'https://example.com/atom',
        description: 'Atom description',
        published: new Date().toISOString(),
      },
    ],
  };

  const parser = new Parser();
  parserStub = sinon.stub(parser, 'parseURL').resolves(mockFeed);
  sinon.replace(Parser.prototype, 'parseURL', parserStub);

  const posts = await extractors.fetchRSSFeed('https://example.com/atom');

  assert.ok(posts.length >= 1);
  assert.is(posts[0].title, 'Atom Post');
  assert.ok(posts[0].content);
});

ExtractorTests('fetchRSSFeed() - should handle missing fields with defaults', async () => {
  const mockFeed = {
    items: [
      {
        title: 'Minimal Post',
        guid: 'https://example.com/minimal',
        // No content fields
        // No date fields
      },
    ],
  };

  const parser = new Parser();
  parserStub = sinon.stub(parser, 'parseURL').resolves(mockFeed);
  sinon.replace(Parser.prototype, 'parseURL', parserStub);

  const posts = await extractors.fetchRSSFeed('https://example.com/feed');

  assert.ok(posts.length >= 1);
  assert.is(posts[0].title, 'Minimal Post');
  assert.is(posts[0].url, 'https://example.com/minimal');
  assert.is(posts[0].content, '');
  assert.ok(posts[0].date); // Should have default date
});

ExtractorTests('fetchRSSFeed() - should filter posts older than 7 days', async () => {
  const now = new Date();
  const oldDate = new Date();
  oldDate.setDate(oldDate.getDate() - 10); // 10 days ago

  const mockFeed = {
    items: [
      {
        title: 'Recent Post',
        link: 'https://example.com/recent',
        content: 'Recent',
        pubDate: now.toISOString(),
      },
      {
        title: 'Old Post',
        link: 'https://example.com/old',
        content: 'Old',
        pubDate: oldDate.toISOString(),
      },
    ],
  };

  const parser = new Parser();
  parserStub = sinon.stub(parser, 'parseURL').resolves(mockFeed);
  sinon.replace(Parser.prototype, 'parseURL', parserStub);

  const posts = await extractors.fetchRSSFeed('https://example.com/feed');

  assert.is(posts.length, 1);
  assert.is(posts[0].title, 'Recent Post');
});

ExtractorTests('fetchRSSFeed() - should handle network errors', async () => {
  const parser = new Parser();
  parserStub = sinon.stub(parser, 'parseURL').rejects(new Error('Network timeout'));
  sinon.replace(Parser.prototype, 'parseURL', parserStub);

  try {
    await extractors.fetchRSSFeed('https://example.com/feed');
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.match(error.message, /Network timeout/);
  }
});

ExtractorTests('fetchRSSFeed() - should return empty array for empty feed', async () => {
  const mockFeed = {
    items: [],
  };

  const parser = new Parser();
  parserStub = sinon.stub(parser, 'parseURL').resolves(mockFeed);
  sinon.replace(Parser.prototype, 'parseURL', parserStub);

  const posts = await extractors.fetchRSSFeed('https://example.com/feed');

  assert.is(posts.length, 0);
  assert.ok(Array.isArray(posts));
});

// ========== fetchHTMLWithLLM() Tests ==========
ExtractorTests('fetchHTMLWithLLM() - should extract posts successfully', async () => {
  axiosStub = sinon.stub(axios, 'get').resolves({
    data: '<html><body><h1>Test Post</h1><a href="/post">Link</a></body></html>',
  });

  openAIStub = sinon.stub(OpenAIClient.prototype, 'createChatCompletion').resolves(
    JSON.stringify([
      {
        title: 'Extracted Post',
        url: 'https://example.com/post',
        content: 'Post content',
      },
    ]),
  );

  db.setConfig('openai_api_key', 'test-key');
  db.setConfig('openai_base_url', 'https://api.openai.com/v1');
  db.setConfig('openai_model', 'gpt-3.5-turbo');
  db.setConfig('prompt_html_extract_base', 'Extract posts from HTML');

  const site = {
    id: 1,
    title: 'Test Site',
    url: 'https://example.com',
    type: 'html_llm',
  };

  const posts = await extractors.fetchHTMLWithLLM(site);

  assert.ok(Array.isArray(posts));
  assert.is(posts.length, 1);
  assert.is(posts[0].title, 'Extracted Post');
  assert.is(posts[0].url, 'https://example.com/post');
});

ExtractorTests('fetchHTMLWithLLM() - should throw error when API key missing', async () => {
  db.setConfig('openai_api_key', '');

  const site = {
    id: 1,
    title: 'Test Site',
    url: 'https://example.com',
    type: 'html_llm',
  };

  try {
    await extractors.fetchHTMLWithLLM(site);
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.match(error.message, /API key not configured/);
  }
});

ExtractorTests('fetchHTMLWithLLM() - should handle LLM response wrapped in object', async () => {
  axiosStub = sinon.stub(axios, 'get').resolves({
    data: '<html><body><h1>Test</h1></body></html>',
  });

  openAIStub = sinon.stub(OpenAIClient.prototype, 'createChatCompletion').resolves(
    JSON.stringify({
      posts: [
        {
          title: 'Wrapped Post',
          url: 'https://example.com/wrapped',
          content: 'Content',
        },
      ],
    }),
  );

  db.setConfig('openai_api_key', 'test-key');
  db.setConfig('prompt_html_extract_base', 'Extract posts');

  const site = {
    id: 1,
    title: 'Test Site',
    url: 'https://example.com',
    type: 'html_llm',
  };

  const posts = await extractors.fetchHTMLWithLLM(site);

  assert.ok(posts.length >= 1);
  assert.is(posts[0].title, 'Wrapped Post');
});

ExtractorTests('fetchHTMLWithLLM() - should convert relative URLs', async () => {
  axiosStub = sinon.stub(axios, 'get').resolves({
    data: '<html><body><h1>Test</h1></body></html>',
  });

  openAIStub = sinon.stub(OpenAIClient.prototype, 'createChatCompletion').resolves(
    JSON.stringify([
      {
        title: 'Relative URL Post',
        url: '/relative-path',
        content: 'Content',
      },
    ]),
  );

  db.setConfig('openai_api_key', 'test-key');
  db.setConfig('prompt_html_extract_base', 'Extract posts');

  const site = {
    id: 1,
    title: 'Test Site',
    url: 'https://example.com',
    type: 'html_llm',
  };

  const posts = await extractors.fetchHTMLWithLLM(site);

  assert.ok(posts.length >= 1);
  assert.is(posts[0].url, 'https://example.com/relative-path');
});

ExtractorTests('fetchHTMLWithLLM() - should filter invalid posts (missing title/url)', async () => {
  axiosStub = sinon.stub(axios, 'get').resolves({
    data: '<html><body><h1>Test</h1></body></html>',
  });

  openAIStub = sinon.stub(OpenAIClient.prototype, 'createChatCompletion').resolves(
    JSON.stringify([
      {
        title: 'Valid Post',
        url: 'https://example.com/valid',
        content: 'Content',
      },
      {
        title: 'Invalid - No URL',
        content: 'Content',
      },
      {
        url: 'https://example.com/no-title',
        content: 'Content',
      },
    ]),
  );

  db.setConfig('openai_api_key', 'test-key');
  db.setConfig('prompt_html_extract_base', 'Extract posts');

  const site = {
    id: 1,
    title: 'Test Site',
    url: 'https://example.com',
    type: 'html_llm',
  };

  const posts = await extractors.fetchHTMLWithLLM(site);

  assert.is(posts.length, 1);
  assert.is(posts[0].title, 'Valid Post');
});

ExtractorTests('fetchHTMLWithLLM() - should handle network errors', async () => {
  axiosStub = sinon.stub(axios, 'get').rejects(new Error('Network error'));

  db.setConfig('openai_api_key', 'test-key');

  const site = {
    id: 1,
    title: 'Test Site',
    url: 'https://example.com',
    type: 'html_llm',
  };

  try {
    await extractors.fetchHTMLWithLLM(site);
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.match(error.message, /Network error/);
  }
});

ExtractorTests('fetchHTMLWithLLM() - should handle invalid JSON response', async () => {
  axiosStub = sinon.stub(axios, 'get').resolves({
    data: '<html><body><h1>Test</h1></body></html>',
  });

  openAIStub = sinon.stub(OpenAIClient.prototype, 'createChatCompletion').resolves(
    'This is not valid JSON',
  );

  db.setConfig('openai_api_key', 'test-key');
  db.setConfig('prompt_html_extract_base', 'Extract posts');

  const site = {
    id: 1,
    title: 'Test Site',
    url: 'https://example.com',
    type: 'html_llm',
  };

  const posts = await extractors.fetchHTMLWithLLM(site);

  assert.is(posts.length, 0);
  assert.ok(Array.isArray(posts));
});

// ========== summarizePost() Tests ==========
ExtractorTests('summarizePost() - should summarize content successfully', async () => {
  openAIStub = sinon
    .stub(OpenAIClient.prototype, 'createChatCompletion')
    .resolves('This is a concise summary of the post content.');

  db.setConfig('openai_api_key', 'test-key');
  db.setConfig('prompt_summarization', 'Summarize this content');

  const summary = await extractors.summarizePost('Long content to summarize...');

  assert.ok(summary);
  assert.is(summary, 'This is a concise summary of the post content.');
});

ExtractorTests('summarizePost() - should return null when API key missing', async () => {
  db.setConfig('openai_api_key', '');

  const summary = await extractors.summarizePost('Content');

  assert.is(summary, null);
});

ExtractorTests('summarizePost() - should truncate content to 10000 chars', async () => {
  openAIStub = sinon.stub(OpenAIClient.prototype, 'createChatCompletion').resolves('Summary');

  db.setConfig('openai_api_key', 'test-key');
  db.setConfig('prompt_summarization', 'Summarize');

  const longContent = 'a'.repeat(20000);
  await extractors.summarizePost(longContent);

  // Verify the content was truncated
  const callArgs = openAIStub.getCall(0).args[0];
  const userMessage = callArgs.find((m) => m.role === 'user');
  assert.ok(userMessage.content.length <= 10000);
});

ExtractorTests('summarizePost() - should return null on API error', async () => {
  openAIStub = sinon
    .stub(OpenAIClient.prototype, 'createChatCompletion')
    .rejects(new Error('API error'));

  db.setConfig('openai_api_key', 'test-key');
  db.setConfig('prompt_summarization', 'Summarize');

  const summary = await extractors.summarizePost('Content');

  assert.is(summary, null);
});

ExtractorTests('summarizePost() - should handle empty content', async () => {
  openAIStub = sinon
    .stub(OpenAIClient.prototype, 'createChatCompletion')
    .resolves('Empty summary');

  db.setConfig('openai_api_key', 'test-key');
  db.setConfig('prompt_summarization', 'Summarize');

  const summary = await extractors.summarizePost('');

  assert.ok(summary);
});

// ========== sendToSlack() Tests ==========
// NOTE: sendToSlack tests have been moved to utils.test.js since the function
// is now exported from utils.js instead of extractors.js

// ========== fetchSiteContent() Tests ==========
ExtractorTests('fetchSiteContent() - should route to fetchRSSFeed for type=rss', async () => {
  const mockFeed = {
    items: [
      {
        title: 'RSS Post',
        link: 'https://example.com/rss',
        content: 'RSS content',
        pubDate: new Date().toISOString(),
      },
    ],
  };

  const parser = new Parser();
  parserStub = sinon.stub(parser, 'parseURL').resolves(mockFeed);
  sinon.replace(Parser.prototype, 'parseURL', parserStub);

  const site = {
    id: 1,
    title: 'RSS Site',
    url: 'https://example.com/feed',
    type: 'rss',
  };

  const posts = await extractors.fetchSiteContent(site);

  assert.ok(Array.isArray(posts));
  assert.ok(posts.length >= 1);
  assert.is(posts[0].title, 'RSS Post');
});

ExtractorTests('fetchSiteContent() - should route to fetchHTMLWithLLM for type=html_llm', async () => {
  axiosStub = sinon.stub(axios, 'get').resolves({
    data: '<html><body><h1>Test</h1></body></html>',
  });

  openAIStub = sinon.stub(OpenAIClient.prototype, 'createChatCompletion').resolves(
    JSON.stringify([
      {
        title: 'LLM Post',
        url: 'https://example.com/llm',
        content: 'LLM content',
      },
    ]),
  );

  db.setConfig('openai_api_key', 'test-key');
  db.setConfig('prompt_html_extract_base', 'Extract');

  const site = {
    id: 1,
    title: 'LLM Site',
    url: 'https://example.com',
    type: 'html_llm',
  };

  const posts = await extractors.fetchSiteContent(site);

  assert.ok(Array.isArray(posts));
  assert.ok(posts.length >= 1);
});

ExtractorTests('fetchSiteContent() - should return empty array for unknown type', async () => {
  const site = {
    id: 1,
    title: 'Unknown Site',
    url: 'https://example.com',
    type: 'unknown_type',
  };

  const posts = await extractors.fetchSiteContent(site);

  assert.is(posts.length, 0);
  assert.ok(Array.isArray(posts));
});

ExtractorTests('fetchSiteContent() - should return empty array on error', async () => {
  const parser = new Parser();
  parserStub = sinon.stub(parser, 'parseURL').rejects(new Error('Network error'));
  sinon.replace(Parser.prototype, 'parseURL', parserStub);

  const site = {
    id: 1,
    title: 'Error Site',
    url: 'https://example.com/feed',
    type: 'rss',
  };

  const posts = await extractors.fetchSiteContent(site);

  assert.is(posts.length, 0);
  assert.ok(Array.isArray(posts));
});

// ========== Edge Case Tests ==========

// RSS Feed Edge Cases
ExtractorTests('fetchRSSFeed() - EDGE: should handle malformed XML/invalid RSS', async () => {
  const parser = new Parser();
  parserStub = sinon
    .stub(parser, 'parseURL')
    .rejects(new Error('Invalid XML: Unexpected token'));
  sinon.replace(Parser.prototype, 'parseURL', parserStub);

  try {
    await extractors.fetchRSSFeed('https://example.com/invalid-feed');
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.match(error.message, /Invalid XML/);
  }
});

ExtractorTests('fetchRSSFeed() - EDGE: should handle HTTP 404 error', async () => {
  const parser = new Parser();
  const notFoundError = new Error('Request failed with status code 404');
  notFoundError.response = { status: 404 };
  parserStub = sinon.stub(parser, 'parseURL').rejects(notFoundError);
  sinon.replace(Parser.prototype, 'parseURL', parserStub);

  try {
    await extractors.fetchRSSFeed('https://example.com/not-found');
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.match(error.message, /404/);
  }
});

ExtractorTests('fetchRSSFeed() - EDGE: should handle HTTP 500 server error', async () => {
  const parser = new Parser();
  const serverError = new Error('Request failed with status code 500');
  serverError.response = { status: 500 };
  parserStub = sinon.stub(parser, 'parseURL').rejects(serverError);
  sinon.replace(Parser.prototype, 'parseURL', parserStub);

  try {
    await extractors.fetchRSSFeed('https://example.com/error');
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.match(error.message, /500/);
  }
});

ExtractorTests('fetchRSSFeed() - EDGE: should handle connection timeout', async () => {
  const parser = new Parser();
  const timeoutError = new Error('timeout of 10000ms exceeded');
  timeoutError.code = 'ECONNABORTED';
  parserStub = sinon.stub(parser, 'parseURL').rejects(timeoutError);
  sinon.replace(Parser.prototype, 'parseURL', parserStub);

  try {
    await extractors.fetchRSSFeed('https://slow-site.com/feed');
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.match(error.message, /timeout/);
  }
});

ExtractorTests('fetchRSSFeed() - EDGE: should handle SSL certificate error', async () => {
  const parser = new Parser();
  const sslError = new Error('unable to verify the first certificate');
  sslError.code = 'UNABLE_TO_VERIFY_LEAF_SIGNATURE';
  parserStub = sinon.stub(parser, 'parseURL').rejects(sslError);
  sinon.replace(Parser.prototype, 'parseURL', parserStub);

  try {
    await extractors.fetchRSSFeed('https://insecure-site.com/feed');
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.match(error.message, /certificate/);
  }
});

ExtractorTests('fetchRSSFeed() - EDGE: should handle DNS resolution error', async () => {
  const parser = new Parser();
  const dnsError = new Error('getaddrinfo ENOTFOUND nonexistent-domain.com');
  dnsError.code = 'ENOTFOUND';
  parserStub = sinon.stub(parser, 'parseURL').rejects(dnsError);
  sinon.replace(Parser.prototype, 'parseURL', parserStub);

  try {
    await extractors.fetchRSSFeed('https://nonexistent-domain.com/feed');
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.match(error.message, /ENOTFOUND/);
  }
});

// HTML/LLM Extraction Edge Cases
ExtractorTests('fetchHTMLWithLLM() - EDGE: should handle HTTP 404 error', async () => {
  const notFoundError = new Error('Request failed with status code 404');
  notFoundError.response = { status: 404 };
  axiosStub = sinon.stub(axios, 'get').rejects(notFoundError);

  db.setConfig('openai_api_key', 'test-key');

  const site = {
    id: 1,
    title: 'Test Site',
    url: 'https://example.com/not-found',
    type: 'html_llm',
  };

  try {
    await extractors.fetchHTMLWithLLM(site);
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.match(error.message, /404/);
  }
});

ExtractorTests('fetchHTMLWithLLM() - EDGE: should handle HTTP 503 service unavailable', async () => {
  const serviceError = new Error('Request failed with status code 503');
  serviceError.response = { status: 503 };
  axiosStub = sinon.stub(axios, 'get').rejects(serviceError);

  db.setConfig('openai_api_key', 'test-key');

  const site = {
    id: 1,
    title: 'Test Site',
    url: 'https://example.com',
    type: 'html_llm',
  };

  try {
    await extractors.fetchHTMLWithLLM(site);
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.match(error.message, /503/);
  }
});

ExtractorTests('fetchHTMLWithLLM() - EDGE: should handle redirect (axios follows automatically)', async () => {
  // Note: axios follows redirects by default, so we test that the final content is fetched
  axiosStub = sinon.stub(axios, 'get').resolves({
    data: '<html><body><h1>Redirected Content</h1></body></html>',
    request: { res: { responseUrl: 'https://example.com/new-location' } },
  });

  openAIStub = sinon.stub(OpenAIClient.prototype, 'createChatCompletion').resolves(
    JSON.stringify([
      {
        title: 'Post from Redirected Page',
        url: 'https://example.com/post',
        content: 'Content',
      },
    ]),
  );

  db.setConfig('openai_api_key', 'test-key');
  db.setConfig('prompt_html_extract_base', 'Extract');

  const site = {
    id: 1,
    title: 'Test Site',
    url: 'https://example.com/old-location',
    type: 'html_llm',
  };

  const posts = await extractors.fetchHTMLWithLLM(site);

  assert.ok(posts.length >= 1);
  assert.is(posts[0].title, 'Post from Redirected Page');
});

ExtractorTests('fetchHTMLWithLLM() - EDGE: should handle empty HTML response', async () => {
  axiosStub = sinon.stub(axios, 'get').resolves({
    data: '',
  });

  openAIStub = sinon.stub(OpenAIClient.prototype, 'createChatCompletion').resolves(
    JSON.stringify([]),
  );

  db.setConfig('openai_api_key', 'test-key');
  db.setConfig('prompt_html_extract_base', 'Extract');

  const site = {
    id: 1,
    title: 'Test Site',
    url: 'https://example.com',
    type: 'html_llm',
  };

  const posts = await extractors.fetchHTMLWithLLM(site);

  assert.is(posts.length, 0);
  assert.ok(Array.isArray(posts));
});

ExtractorTests('fetchHTMLWithLLM() - EDGE: should handle null HTML response', async () => {
  axiosStub = sinon.stub(axios, 'get').resolves({
    data: null,
  });

  db.setConfig('openai_api_key', 'test-key');
  db.setConfig('prompt_html_extract_base', 'Extract');

  const site = {
    id: 1,
    title: 'Test Site',
    url: 'https://example.com',
    type: 'html_llm',
  };

  // BUG: cleanHTML() doesn't handle null input, should throw error
  try {
    await extractors.fetchHTMLWithLLM(site);
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.ok(error.message.includes('Cannot read properties of null'));
  }
});

ExtractorTests('fetchHTMLWithLLM() - EDGE: should handle connection timeout', async () => {
  const timeoutError = new Error('timeout of 10000ms exceeded');
  timeoutError.code = 'ECONNABORTED';
  axiosStub = sinon.stub(axios, 'get').rejects(timeoutError);

  db.setConfig('openai_api_key', 'test-key');

  const site = {
    id: 1,
    title: 'Test Site',
    url: 'https://slow-site.com',
    type: 'html_llm',
  };

  try {
    await extractors.fetchHTMLWithLLM(site);
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.match(error.message, /timeout/);
  }
});

// OpenAI API Edge Cases
ExtractorTests('summarizePost() - EDGE: should handle OpenAI rate limit error', async () => {
  const rateLimitError = new Error('Rate limit exceeded');
  rateLimitError.response = {
    status: 429,
    data: { error: { message: 'Rate limit exceeded', type: 'rate_limit_error' } },
  };
  openAIStub = sinon.stub(OpenAIClient.prototype, 'createChatCompletion').rejects(rateLimitError);

  db.setConfig('openai_api_key', 'test-key');
  db.setConfig('prompt_summarization', 'Summarize');

  const summary = await extractors.summarizePost('Content to summarize');

  assert.is(summary, null);
});

ExtractorTests('summarizePost() - EDGE: should handle OpenAI invalid API key', async () => {
  const authError = new Error('Incorrect API key provided');
  authError.response = {
    status: 401,
    data: { error: { message: 'Incorrect API key provided', type: 'invalid_request_error' } },
  };
  openAIStub = sinon.stub(OpenAIClient.prototype, 'createChatCompletion').rejects(authError);

  db.setConfig('openai_api_key', 'invalid-key');
  db.setConfig('prompt_summarization', 'Summarize');

  const summary = await extractors.summarizePost('Content');

  assert.is(summary, null);
});

ExtractorTests('summarizePost() - EDGE: should handle OpenAI timeout', async () => {
  const timeoutError = new Error('Request timeout');
  timeoutError.code = 'ETIMEDOUT';
  openAIStub = sinon.stub(OpenAIClient.prototype, 'createChatCompletion').rejects(timeoutError);

  db.setConfig('openai_api_key', 'test-key');
  db.setConfig('prompt_summarization', 'Summarize');

  const summary = await extractors.summarizePost('Content');

  assert.is(summary, null);
});

ExtractorTests('fetchHTMLWithLLM() - EDGE: should handle LLM partial/incomplete JSON', async () => {
  axiosStub = sinon.stub(axios, 'get').resolves({
    data: '<html><body><h1>Test</h1></body></html>',
  });

  // Simulate incomplete JSON response
  openAIStub = sinon.stub(OpenAIClient.prototype, 'createChatCompletion').resolves(
    JSON.stringify([
      {
        title: 'Complete Post',
        url: 'https://example.com/complete',
        content: 'Full content',
      },
      {
        title: 'Partial Post',
        url: 'https://example.com/partial',
        // Missing content field
      },
      {
        // Missing title
        url: 'https://example.com/no-title',
        content: 'Content without title',
      },
    ]),
  );

  db.setConfig('openai_api_key', 'test-key');
  db.setConfig('prompt_html_extract_base', 'Extract');

  const site = {
    id: 1,
    title: 'Test Site',
    url: 'https://example.com',
    type: 'html_llm',
  };

  const posts = await extractors.fetchHTMLWithLLM(site);

  // Should only include the complete post with title and url
  assert.is(posts.length, 2); // Complete Post and Partial Post (has title and url)
  assert.is(posts[0].title, 'Complete Post');
  assert.is(posts[1].title, 'Partial Post');
});

ExtractorTests('fetchHTMLWithLLM() - EDGE: should handle LLM returning markdown-wrapped JSON', async () => {
  axiosStub = sinon.stub(axios, 'get').resolves({
    data: '<html><body><h1>Test</h1></body></html>',
  });

  // LLM sometimes wraps JSON in markdown code blocks
  openAIStub = sinon.stub(OpenAIClient.prototype, 'createChatCompletion').resolves(
    '```json\n' +
      JSON.stringify([
        {
          title: 'Markdown Wrapped Post',
          url: 'https://example.com/wrapped',
          content: 'Content',
        },
      ]) +
      '\n```',
  );

  db.setConfig('openai_api_key', 'test-key');
  db.setConfig('prompt_html_extract_base', 'Extract');

  const site = {
    id: 1,
    title: 'Test Site',
    url: 'https://example.com',
    type: 'html_llm',
  };

  const posts = await extractors.fetchHTMLWithLLM(site);

  // The extractor now properly strips markdown code blocks before parsing
  assert.is(posts.length, 1);
  assert.is(posts[0].title, 'Markdown Wrapped Post');
  assert.is(posts[0].url, 'https://example.com/wrapped');
});

// Slack Edge Cases tests have been moved to utils.test.js

// ========== transformPost() Tests ==========
ExtractorTests('transformPost() - should remove reading time from title', () => {
  const post = {
    title: 'An Alzheimer\'s pill appears to protect (7 minute read)',
    url: 'https://example.com/test',
    content: 'Content',
  };

  const transformed = extractors.transformPost(post);

  assert.is(transformed.title, 'An Alzheimer\'s pill appears to protect');
  assert.is(transformed.url, post.url);
});

ExtractorTests('transformPost() - should handle various reading time formats', () => {
  const tests = [
    { input: 'Title (5 minute read)', expected: 'Title' },
    { input: 'Title (10 min read)', expected: 'Title' },
    { input: 'Title (3-minute read)', expected: 'Title' },
    { input: 'Title (15 minutes read)', expected: 'Title' },
    { input: 'Title (1 min read)', expected: 'Title' },
  ];

  tests.forEach(({ input, expected }) => {
    const result = extractors.transformPost({ title: input, url: 'https://example.com' });
    assert.is(result.title, expected, `Failed for input: ${input}`);
  });
});

ExtractorTests('transformPost() - should remove UTM parameters from URL', () => {
  const post = {
    title: 'Test Post',
    url: 'https://example.com/article?utm_source=newsletter&utm_medium=email&utm_campaign=weekly',
    content: 'Content',
  };

  const transformed = extractors.transformPost(post);

  assert.is(transformed.url, 'https://example.com/article');
  assert.not.match(transformed.url, /utm_/);
});

ExtractorTests('transformPost() - should remove ref, reflink, mod parameters', () => {
  const post = {
    title: 'Test Post',
    url: 'https://example.com/article?ref=homepage&reflink=share&mod=article_inline',
    content: 'Content',
  };

  const transformed = extractors.transformPost(post);

  assert.is(transformed.url, 'https://example.com/article');
  assert.not.match(transformed.url, /ref=/);
  assert.not.match(transformed.url, /reflink=/);
  assert.not.match(transformed.url, /mod=/);
});

ExtractorTests('transformPost() - should keep other query parameters', () => {
  const post = {
    title: 'Test Post',
    url: 'https://example.com/article?id=123&utm_source=newsletter&category=tech',
    content: 'Content',
  };

  const transformed = extractors.transformPost(post);

  assert.match(transformed.url, /id=123/);
  assert.match(transformed.url, /category=tech/);
  assert.not.match(transformed.url, /utm_source/);
});

ExtractorTests('transformPost() - should handle URL without query params', () => {
  const post = {
    title: 'Test Post (5 minute read)',
    url: 'https://example.com/article',
    content: 'Content',
  };

  const transformed = extractors.transformPost(post);

  assert.is(transformed.url, 'https://example.com/article');
  assert.is(transformed.title, 'Test Post');
});

ExtractorTests('transformPost() - should handle both title and URL cleaning together', () => {
  const post = {
    title: 'Nvidia Becomes First $5 Trillion Company (5 minute read)',
    url: 'https://example.com/article?utm_source=twitter&ref=social&id=abc123',
    content: 'Content about Nvidia',
  };

  const transformed = extractors.transformPost(post);

  assert.is(transformed.title, 'Nvidia Becomes First $5 Trillion Company');
  assert.is(transformed.url, 'https://example.com/article?id=abc123');
});

ExtractorTests('transformPost() - should handle invalid URL gracefully', () => {
  const post = {
    title: 'Test Post (3 min read)',
    url: 'not-a-valid-url',
    content: 'Content',
  };

  const transformed = extractors.transformPost(post);

  assert.is(transformed.title, 'Test Post');
  assert.is(transformed.url, 'not-a-valid-url'); // Keeps original if invalid
});

ExtractorTests('transformPost() - should preserve all other post fields', () => {
  const post = {
    title: 'Test Post (7 minute read)',
    url: 'https://example.com/test?utm_source=feed',
    content: 'Post content here',
    date: '2025-01-01T00:00:00Z',
    summary: 'Post summary',
    customField: 'custom value',
  };

  const transformed = extractors.transformPost(post);

  assert.is(transformed.content, post.content);
  assert.is(transformed.date, post.date);
  assert.is(transformed.summary, post.summary);
  assert.is(transformed.customField, post.customField);
});

ExtractorTests('transformPost() - should handle empty/null title', () => {
  const post1 = {
    title: '',
    url: 'https://example.com/test',
  };

  const post2 = {
    title: null,
    url: 'https://example.com/test',
  };

  const result1 = extractors.transformPost(post1);
  const result2 = extractors.transformPost(post2);

  assert.is(result1.title, '');
  assert.is(result2.title, null);
});

ExtractorTests.run();
