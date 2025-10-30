import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import sinon from 'sinon';
import * as configAPI from '../api/config.js';
import * as db from '../db.js';

const ConfigAPITests = suite('Config API Tests');

let testDb;
let mockReply;

ConfigAPITests.before(() => {
  try {
    testDb = db.initDb(':memory:');
  } catch (e) {
    testDb = db.getDb();
  }
});

ConfigAPITests.before.each(() => {
  mockReply = {
    _code: null,
    _sent: null,
    code: function(val) { this._code = val; return this; },
    send: function(val) { this._sent = val; return this; },
  };
});

ConfigAPITests.after.each(() => {
  sinon.restore();
});

ConfigAPITests.after(() => {
  // Don't close the database - it might be shared with other tests
});

// ========== getAll() Tests ==========
ConfigAPITests('getAll should return config as object', async () => {
  const result = await configAPI.getAll({}, mockReply);

  assert.ok(result.schedule);
  assert.equal(typeof result, 'object');
});

ConfigAPITests('getAll should return all config keys', async () => {
  const result = await configAPI.getAll({}, mockReply);

  // Check for expected default config keys
  assert.ok('schedule' in result);
  assert.ok('openai_api_key' in result);
  assert.ok('slack_webhook_url' in result);
  assert.ok('prompt_summarization' in result);
});

// ========== update() Tests ==========
ConfigAPITests('update should update config values', async () => {
  const reqBody = { test_key: 'test_value' };

  const result = await configAPI.update({ body: reqBody }, mockReply);

  assert.equal(result.success, true);
  assert.equal(db.getConfig('test_key'), 'test_value');
});

ConfigAPITests('update should update multiple config values', async () => {
  const reqBody = {
    key1: 'value1',
    key2: 'value2',
    key3: 'value3',
  };

  const result = await configAPI.update({ body: reqBody }, mockReply);

  assert.equal(result.success, true);
  assert.equal(db.getConfig('key1'), 'value1');
  assert.equal(db.getConfig('key2'), 'value2');
  assert.equal(db.getConfig('key3'), 'value3');
});

ConfigAPITests('update should handle schedule updates and trigger cron reschedule', async () => {
  const reqBody = { schedule: '0 10 * * *' };

  // Note: We can't easily stub the dynamic import, so we just verify
  // the update succeeds. The cron rescheduling is tested in cron.test.js
  const result = await configAPI.update({ body: reqBody }, mockReply);

  assert.equal(result.success, true);
  assert.equal(db.getConfig('schedule'), '0 10 * * *');
});

ConfigAPITests('update should handle empty body', async () => {
  const reqBody = {};

  const result = await configAPI.update({ body: reqBody }, mockReply);

  assert.equal(result.success, true);
});

// ========== testAI() Tests ==========
ConfigAPITests('testAI should return 400 when API key missing', async () => {
  const reqBody = { openai_base_url: 'https://api.openai.com/v1' };

  await configAPI.testAI({ body: reqBody }, mockReply);

  assert.equal(mockReply._code, 400);
  assert.equal(mockReply._sent.error, 'API key and base URL are required');
});

ConfigAPITests('testAI should return 400 when base URL missing', async () => {
  const reqBody = { openai_api_key: 'test-key' };

  await configAPI.testAI({ body: reqBody }, mockReply);

  assert.equal(mockReply._code, 400);
  assert.equal(mockReply._sent.error, 'API key and base URL are required');
});

ConfigAPITests('testAI should return 400 when both key and URL missing', async () => {
  const reqBody = {};

  await configAPI.testAI({ body: reqBody }, mockReply);

  assert.equal(mockReply._code, 400);
  assert.equal(mockReply._sent.error, 'API key and base URL are required');
});

// Note: Testing successful OpenAI API connection would require either:
// 1. A real API key (not practical for automated tests)
// 2. Complex mocking of the OpenAI module (difficult with ES modules)
// 3. An integration test with a mock OpenAI server
// We've covered validation and error handling, which is the most critical part.

ConfigAPITests.run();
