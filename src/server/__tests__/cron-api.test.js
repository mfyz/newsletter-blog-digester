import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import sinon from 'sinon';
import * as cronAPI from '../api/cron.js';
import * as db from '../db.js';

const CronAPITests = suite('Cron API Tests');

let testDb;
let mockReply;

CronAPITests.before(() => {
  try {
    testDb = db.initDb(':memory:');
  } catch (e) {
    testDb = db.getDb();
  }
});

CronAPITests.before.each(() => {
  mockReply = {
    _code: null,
    _sent: null,
    code: function(val) { this._code = val; return this; },
    send: function(val) { this._sent = val; return this; },
  };
});

CronAPITests.after.each(() => {
  sinon.restore();
});

CronAPITests.after(() => {
  // Don't close the database - it might be shared with other tests
});

// ========== runNow() Tests ==========
CronAPITests('runNow should trigger background check and return success', async () => {
  const result = await cronAPI.runNow({}, mockReply);

  assert.equal(result.success, true);
  assert.equal(result.message, 'Check started in background');
  assert.is(mockReply._code, null); // Should not set error code
});

CronAPITests('runNow should not wait for check to complete', async () => {
  const startTime = Date.now();
  const result = await cronAPI.runNow({}, mockReply);
  const duration = Date.now() - startTime;

  // Should return immediately (within 100ms), not wait for check
  assert.ok(duration < 100, 'Should return immediately without waiting');
  assert.equal(result.success, true);
});

CronAPITests('runNow should start check even with no active sites', async () => {
  // Clean all sites
  const sites = db.getAllSites();
  sites.forEach((site) => db.deleteSite(site.id));

  const result = await cronAPI.runNow({}, mockReply);

  assert.equal(result.success, true);
  assert.equal(result.message, 'Check started in background');
});

CronAPITests('runNow should handle multiple concurrent calls', async () => {
  // Run multiple calls in parallel
  const results = await Promise.all([
    cronAPI.runNow({}, mockReply),
    cronAPI.runNow({}, mockReply),
    cronAPI.runNow({}, mockReply),
  ]);

  // All should succeed
  results.forEach((result) => {
    assert.equal(result.success, true);
  });
});

CronAPITests.run();
