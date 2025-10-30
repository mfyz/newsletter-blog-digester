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
ExtractorTests('sendToSlack() - should send posts grouped by site', async () => {
  axiosStub = sinon.stub(axios, 'post').resolves({ status: 200 });

  db.setConfig('slack_webhook_url', 'https://hooks.slack.com/test');

  const posts = [
    {
      title: 'Post 1',
      url: 'https://example.com/1',
      site_title: 'Site A',
      summary: 'Summary 1',
    },
    {
      title: 'Post 2',
      url: 'https://example.com/2',
      site_title: 'Site A',
      summary: 'Summary 2',
    },
    {
      title: 'Post 3',
      url: 'https://example.com/3',
      site_title: 'Site B',
    },
  ];

  const result = await extractors.sendToSlack(posts);

  assert.is(result, true);
  assert.ok(axiosStub.calledOnce);

  const callArgs = axiosStub.getCall(0).args;
  assert.is(callArgs[0], 'https://hooks.slack.com/test');
  assert.ok(callArgs[1].text.includes('3 new posts'));
  assert.ok(callArgs[1].text.includes('Site A'));
  assert.ok(callArgs[1].text.includes('Site B'));
});

ExtractorTests('sendToSlack() - should skip when webhook URL missing', async () => {
  db.setConfig('slack_webhook_url', '');

  const posts = [{ title: 'Test', url: 'https://example.com', site_title: 'Site' }];

  const result = await extractors.sendToSlack(posts);

  assert.is(result, false);
});

ExtractorTests('sendToSlack() - should format message correctly', async () => {
  axiosStub = sinon.stub(axios, 'post').resolves({ status: 200 });

  db.setConfig('slack_webhook_url', 'https://hooks.slack.com/test');

  const posts = [
    {
      title: 'Test Post',
      url: 'https://example.com/test',
      site_title: 'Test Site',
      summary: 'Test summary',
    },
  ];

  await extractors.sendToSlack(posts);

  const callArgs = axiosStub.getCall(0).args[1];
  assert.ok(callArgs.text.includes('Test Post'));
  assert.ok(callArgs.text.includes('https://example.com/test'));
  assert.ok(callArgs.text.includes('Test summary'));
  assert.is(callArgs.mrkdwn, true);
});

ExtractorTests('sendToSlack() - should handle network errors', async () => {
  axiosStub = sinon.stub(axios, 'post').rejects(new Error('Network error'));

  db.setConfig('slack_webhook_url', 'https://hooks.slack.com/test');

  const posts = [{ title: 'Test', url: 'https://example.com', site_title: 'Site' }];

  const result = await extractors.sendToSlack(posts);

  assert.is(result, false);
});

ExtractorTests('sendToSlack() - should handle invalid webhook URL', async () => {
  axiosStub = sinon.stub(axios, 'post').rejects(new Error('Invalid URL'));

  db.setConfig('slack_webhook_url', 'invalid-url');

  const posts = [{ title: 'Test', url: 'https://example.com', site_title: 'Site' }];

  const result = await extractors.sendToSlack(posts);

  assert.is(result, false);
});

ExtractorTests('sendToSlack() - should handle empty posts array', async () => {
  axiosStub = sinon.stub(axios, 'post').resolves({ status: 200 });

  db.setConfig('slack_webhook_url', 'https://hooks.slack.com/test');

  const result = await extractors.sendToSlack([]);

  assert.is(result, true);
  const callArgs = axiosStub.getCall(0).args[1];
  assert.ok(callArgs.text.includes('0 new posts'));
});

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

ExtractorTests.run();
