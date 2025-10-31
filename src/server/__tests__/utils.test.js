import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import sinon from 'sinon';
import { toAbsoluteUrl, timeAgo, logger, sendPostToSlack } from '../utils.js';
import * as db from '../db.js';
import axios from 'axios';

const UtilsTests = suite('Utils Tests');

let consoleLogStub;
let consoleErrorStub;
let consoleWarnStub;

UtilsTests.before.each(() => {
  // Stub console methods to avoid cluttering test output
  consoleLogStub = sinon.stub(console, 'log');
  consoleErrorStub = sinon.stub(console, 'error');
  consoleWarnStub = sinon.stub(console, 'warn');

  // Initialize test database
  try {
    db.initDb(':memory:');
  } catch (e) {
    // Already initialized
  }
});

UtilsTests.after.each(() => {
  // Restore console stubs
  sinon.restore();
});

UtilsTests('toAbsoluteUrl should convert relative URLs', () => {
  const result = toAbsoluteUrl('/blog/post-1', 'https://example.com');
  assert.is(result, 'https://example.com/blog/post-1');
});

UtilsTests('toAbsoluteUrl should keep absolute URLs unchanged', () => {
  const result = toAbsoluteUrl('https://other.com/post', 'https://example.com');
  assert.is(result, 'https://other.com/post');
});

UtilsTests('toAbsoluteUrl should handle empty URLs', () => {
  const result = toAbsoluteUrl('', 'https://example.com');
  assert.is(result, '');
});

UtilsTests('timeAgo should calculate time correctly', () => {
  const now = new Date();

  // 30 seconds ago
  const thirtySecondsAgo = new Date(now - 30 * 1000);
  assert.ok(timeAgo(thirtySecondsAgo).includes('seconds ago'));

  // 5 minutes ago
  const fiveMinutesAgo = new Date(now - 5 * 60 * 1000);
  assert.ok(timeAgo(fiveMinutesAgo).includes('minutes ago'));

  // 2 hours ago
  const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000);
  assert.ok(timeAgo(twoHoursAgo).includes('hours ago'));

  // 3 days ago
  const threeDaysAgo = new Date(now - 3 * 24 * 60 * 60 * 1000);
  assert.ok(timeAgo(threeDaysAgo).includes('days ago'));
});

// ========== Logger Tests ==========
UtilsTests('logger.info() - should log to console and database', () => {
  logger.info('Test info message', { key: 'value' });

  // Verify console output
  assert.ok(consoleLogStub.calledOnce);
  assert.ok(consoleLogStub.firstCall.args[0].includes('[INFO]'));
  assert.ok(consoleLogStub.firstCall.args[0].includes('Test info message'));

  // Verify database insert
  const logs = db.getLogs({ level: 'info' });
  const testLog = logs.find((log) => log.message === 'Test info message');
  assert.ok(testLog);
  assert.is(testLog.level, 'info');
  assert.is(testLog.details, '{"key":"value"}');
});

UtilsTests('logger.error() - should log to console and database', () => {
  logger.error('Test error message', { error: 'something broke' });

  // Verify console output
  assert.ok(consoleErrorStub.calledOnce);
  assert.ok(consoleErrorStub.firstCall.args[0].includes('[ERROR]'));
  assert.ok(consoleErrorStub.firstCall.args[0].includes('Test error message'));

  // Verify database insert
  const logs = db.getLogs({ level: 'error' });
  const testLog = logs.find((log) => log.message === 'Test error message');
  assert.ok(testLog);
  assert.is(testLog.level, 'error');
  assert.is(testLog.details, '{"error":"something broke"}');
});

UtilsTests('logger.warn() - should log to console and database', () => {
  logger.warn('Test warning message', { warning: 'potential issue' });

  // Verify console output
  assert.ok(consoleWarnStub.calledOnce);
  assert.ok(consoleWarnStub.firstCall.args[0].includes('[WARN]'));
  assert.ok(consoleWarnStub.firstCall.args[0].includes('Test warning message'));

  // Verify database insert
  const logs = db.getLogs({ level: 'warn' });
  const testLog = logs.find((log) => log.message === 'Test warning message');
  assert.ok(testLog);
  assert.is(testLog.level, 'warn');
  assert.is(testLog.details, '{"warning":"potential issue"}');
});

UtilsTests('logger.info() - should handle null details', () => {
  logger.info('Message without details', null);

  assert.ok(consoleLogStub.calledOnce);

  // Verify database insert with null details
  const logs = db.getLogs();
  const testLog = logs.find((log) => log.message === 'Message without details');
  assert.ok(testLog);
  assert.is(testLog.details, null);
});

UtilsTests('logger._logToDb() - should stringify details as JSON', () => {
  const complexDetails = {
    nested: { data: 'value' },
    array: [1, 2, 3],
    number: 42,
  };

  logger.info('Complex details test', complexDetails);

  const logs = db.getLogs();
  const testLog = logs.find((log) => log.message === 'Complex details test');
  assert.ok(testLog);
  assert.is(testLog.details, JSON.stringify(complexDetails));
});

// ========== sendPostToSlack() Tests ==========
UtilsTests('sendPostToSlack() - should send post successfully', async () => {
  const axiosStub = sinon.stub(axios, 'post').resolves({ data: 'ok' });

  const post = {
    id: 1,
    title: 'Test Post',
    url: 'https://example.com/post',
    summary: 'This is a test summary',
  };

  const webhookUrl = 'https://hooks.slack.com/test';

  const result = await sendPostToSlack(post, webhookUrl);

  assert.is(result, true);
  assert.ok(axiosStub.calledOnce);
  assert.is(axiosStub.firstCall.args[0], webhookUrl);

  const payload = axiosStub.firstCall.args[1];
  // Check that blocks are used with proper structure
  assert.ok(payload.blocks);
  assert.is(payload.blocks.length, 1); // Single combined block
  assert.is(payload.blocks[0].type, 'section');
  assert.is(payload.blocks[0].text.type, 'mrkdwn');
  assert.ok(payload.blocks[0].text.text.includes(post.title));
  assert.ok(payload.blocks[0].text.text.includes(post.url));
  assert.ok(payload.blocks[0].text.text.includes(post.summary));
  // Check fallback text
  assert.ok(payload.text.includes(post.title));
});

UtilsTests('sendPostToSlack() - should format message correctly without summary', async () => {
  const axiosStub = sinon.stub(axios, 'post').resolves({ data: 'ok' });

  const post = {
    id: 2,
    title: 'Post Without Summary',
    url: 'https://example.com/post2',
  };

  const webhookUrl = 'https://hooks.slack.com/test';

  await sendPostToSlack(post, webhookUrl);

  const payload = axiosStub.firstCall.args[1];
  // Should only have one block (title) when no summary
  assert.ok(payload.blocks);
  assert.is(payload.blocks.length, 1);
  assert.ok(payload.blocks[0].text.text.includes(`*<${post.url}|${post.title}>*`));
});

UtilsTests('sendPostToSlack() - should throw error if webhook URL not provided', async () => {
  const post = {
    id: 1,
    title: 'Test Post',
    url: 'https://example.com/post',
  };

  try {
    await sendPostToSlack(post, '');
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.ok(error.message.includes('Slack webhook URL not provided'));
  }
});

UtilsTests('sendPostToSlack() - should throw error if post is invalid', async () => {
  const webhookUrl = 'https://hooks.slack.com/test';

  try {
    await sendPostToSlack(null, webhookUrl);
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.ok(error.message.includes('Invalid post object'));
  }
});

UtilsTests('sendPostToSlack() - should throw error if post missing title', async () => {
  const webhookUrl = 'https://hooks.slack.com/test';
  const post = {
    id: 1,
    url: 'https://example.com/post',
  };

  try {
    await sendPostToSlack(post, webhookUrl);
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.ok(error.message.includes('title and url are required'));
  }
});

UtilsTests('sendPostToSlack() - should throw error if post missing url', async () => {
  const webhookUrl = 'https://hooks.slack.com/test';
  const post = {
    id: 1,
    title: 'Test Post',
  };

  try {
    await sendPostToSlack(post, webhookUrl);
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.ok(error.message.includes('title and url are required'));
  }
});

UtilsTests('sendPostToSlack() - should throw error on network failure', async () => {
  const axiosStub = sinon.stub(axios, 'post').rejects(new Error('Network error'));

  const post = {
    id: 1,
    title: 'Test Post',
    url: 'https://example.com/post',
    summary: 'Test summary',
  };

  const webhookUrl = 'https://hooks.slack.com/test';

  try {
    await sendPostToSlack(post, webhookUrl);
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.ok(error.message.includes('Network error'));
  }
});

UtilsTests('sendPostToSlack() - should throw error on Slack API failure', async () => {
  const slackError = new Error('Invalid webhook');
  slackError.response = { status: 404 };
  const axiosStub = sinon.stub(axios, 'post').rejects(slackError);

  const post = {
    id: 1,
    title: 'Test Post',
    url: 'https://example.com/post',
  };

  const webhookUrl = 'https://hooks.slack.com/invalid';

  try {
    await sendPostToSlack(post, webhookUrl);
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.ok(error.message.includes('Invalid webhook'));
  }
});

UtilsTests('sendPostToSlack() - should convert markdown to Slack mrkdwn format', async () => {
  const axiosStub = sinon.stub(axios, 'post').resolves({ data: 'ok' });

  const post = {
    id: 1,
    title: 'Test Post',
    url: 'https://example.com/post',
    summary: '**Bold text** and __another bold__\n- Item 1\n- Item 2\n* Item 3',
  };

  const webhookUrl = 'https://hooks.slack.com/test';

  await sendPostToSlack(post, webhookUrl);

  const payload = axiosStub.firstCall.args[1];
  const messageText = payload.blocks[0].text.text;

  // Check markdown conversions
  assert.ok(messageText.includes('*Bold text*')); // **bold** -> *bold*
  assert.ok(messageText.includes('*another bold*')); // __bold__ -> *bold*
  assert.ok(messageText.includes('• Item 1')); // - Item -> • Item
  assert.ok(messageText.includes('• Item 2'));
  assert.ok(messageText.includes('• Item 3')); // * Item -> • Item
  // Should NOT contain original markdown syntax
  assert.not.ok(messageText.includes('**'));
  assert.not.ok(messageText.includes('__'));
  assert.not.ok(messageText.match(/^- /m));
});

UtilsTests('sendPostToSlack() - should send to specific channel when provided', async () => {
  const axiosStub = sinon.stub(axios, 'post').resolves({ data: 'ok' });

  const post = {
    id: 1,
    title: 'Test Post',
    url: 'https://example.com/post',
    summary: 'Test summary',
  };

  const webhookUrl = 'https://hooks.slack.com/test';
  const channel = 'tech-news';

  await sendPostToSlack(post, webhookUrl, channel);

  const payload = axiosStub.firstCall.args[1];
  // Check channel is included in payload
  assert.ok(payload.channel);
  assert.is(payload.channel, '#tech-news');
});

UtilsTests('sendPostToSlack() - should add # prefix to channel if not present', async () => {
  const axiosStub = sinon.stub(axios, 'post').resolves({ data: 'ok' });

  const post = {
    id: 1,
    title: 'Test Post',
    url: 'https://example.com/post',
  };

  const webhookUrl = 'https://hooks.slack.com/test';

  await sendPostToSlack(post, webhookUrl, 'general');

  const payload = axiosStub.firstCall.args[1];
  assert.is(payload.channel, '#general');
});

UtilsTests('sendPostToSlack() - should not add channel to payload if not provided', async () => {
  const axiosStub = sinon.stub(axios, 'post').resolves({ data: 'ok' });

  const post = {
    id: 1,
    title: 'Test Post',
    url: 'https://example.com/post',
  };

  const webhookUrl = 'https://hooks.slack.com/test';

  await sendPostToSlack(post, webhookUrl);

  const payload = axiosStub.firstCall.args[1];
  assert.not.ok(payload.channel);
});

UtilsTests.run();
