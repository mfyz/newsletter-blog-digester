import { suite } from 'uvu';
import * as assert from 'uvu/assert';
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

ConfigAPITests.after(() => {
  // Don't close the database - it might be shared with other tests
});

ConfigAPITests('getAll should return config as object', async () => {
  const result = await configAPI.getAll({}, mockReply);

  assert.ok(result.schedule);
  assert.equal(typeof result, 'object');
});

ConfigAPITests('update should update config values', async () => {
  const reqBody = { test_key: 'test_value' };

  const result = await configAPI.update({ body: reqBody }, mockReply);

  assert.equal(result.success, true);
  assert.equal(db.getConfig('test_key'), 'test_value');
});

ConfigAPITests.run();
