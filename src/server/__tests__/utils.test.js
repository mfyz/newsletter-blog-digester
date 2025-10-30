import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import sinon from 'sinon';
import { toAbsoluteUrl, timeAgo, logger } from '../utils.js';
import * as db from '../db.js';

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

UtilsTests.run();
