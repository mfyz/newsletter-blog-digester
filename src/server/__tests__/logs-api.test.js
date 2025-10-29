import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import * as logsAPI from '../api/logs.js';
import * as db from '../db.js';
import { logger } from '../utils.js';

const LogsAPITests = suite('Logs API Tests');

let testDb;
let mockReply;

LogsAPITests.before(() => {
  try {
    testDb = db.initDb(':memory:');
  } catch (e) {
    testDb = db.getDb();
  }
});

LogsAPITests.before.each(() => {
  mockReply = {
    _code: null,
    _sent: null,
    code: function(val) { this._code = val; return this; },
    send: function(val) { this._sent = val; return this; },
  };
});

LogsAPITests.after(() => {
  // Don't close the database - it might be shared with other tests
});

LogsAPITests('getAll should return all logs', async () => {
  logger.info('Test log 1');
  logger.error('Test log 2');

  const result = await logsAPI.getAll({ query: {} }, mockReply);

  assert.ok(result.length >= 2);
});

LogsAPITests('getAll should filter by level', async () => {
  logger.info('Info message');
  logger.error('Error message');

  const result = await logsAPI.getAll({ query: { level: 'error' } }, mockReply);

  assert.ok(result.every(log => log.level === 'error'));
});

LogsAPITests.run();
