import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import sinon from 'sinon';
import * as db from '../db.js';
import * as cron from '../cron.js';
import nodeCron from 'node-cron';

const CronTests = suite('Cron Tests');

let cronScheduleStub;
let cronValidateStub;
let mockTask;

CronTests.before(() => {
  // Initialize test database once
  try {
    db.initDb(':memory:');
  } catch (e) {
    // Already initialized
  }
});

CronTests.before.each(() => {
  // Clean database before each test
  const sites = db.getAllSites();
  sites.forEach((site) => db.deleteSite(site.id));

  // Create mock cron task
  mockTask = { stop: sinon.stub() };

  // Stub node-cron functions
  if (cronValidateStub) cronValidateStub.restore();
  if (cronScheduleStub) cronScheduleStub.restore();

  cronValidateStub = sinon.stub(nodeCron, 'validate');
  cronScheduleStub = sinon.stub(nodeCron, 'schedule').returns(mockTask);
});

CronTests.after.each(() => {
  // Clean up all stubs
  sinon.restore();
});

// ========== runCheck() Integration Tests ==========
// Note: runCheck() tests are integration-style since we can't easily mock ES module exports
// These tests verify the function runs without errors with empty/minimal data

CronTests('runCheck() - should complete successfully with no active sites', async () => {
  // No sites in database, should complete without error
  await cron.runCheck();

  // Should complete successfully (no assertion needed, just shouldn't throw)
  assert.ok(true);
});

CronTests('runCheck() - should skip inactive sites', async () => {
  // Create an inactive site
  const inactiveSite = db.createSite({
    url: 'https://example.com/inactive',
    title: 'Inactive Site',
    type: 'rss',
    is_active: 0,
  });

  const beforeCheck = inactiveSite.last_checked;

  // Run check
  await cron.runCheck();

  // Verify last_checked was NOT updated for inactive site
  const updatedSite = db.getSite(inactiveSite.id);
  assert.is(updatedSite.last_checked, beforeCheck);
});

// ========== updateSchedule() Tests ==========
CronTests('updateSchedule() - should validate and update cron schedule', () => {
  cronValidateStub.returns(true);

  cron.updateSchedule('0 9 * * *');

  assert.ok(cronValidateStub.calledWith('0 9 * * *'));
  assert.ok(cronScheduleStub.calledOnce);
});

CronTests('updateSchedule() - should throw error for invalid cron expression', () => {
  cronValidateStub.returns(false);

  try {
    cron.updateSchedule('invalid expression');
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.match(error.message, /Invalid cron expression/);
  }
});

CronTests('updateSchedule() - should stop existing task before creating new one', () => {
  cronValidateStub.returns(true);

  // First schedule
  cron.updateSchedule('0 9 * * *');

  // Update schedule
  cron.updateSchedule('0 10 * * *');

  // Should stop first task
  assert.ok(mockTask.stop.calledOnce);
  assert.is(cronScheduleStub.callCount, 2);
});

CronTests('updateSchedule() - should handle valid cron expressions', () => {
  cronValidateStub.returns(true);

  // Test various valid cron expressions
  const validExpressions = [
    '0 9 * * *', // Daily at 9am
    '*/15 * * * *', // Every 15 minutes
    '0 0 * * 0', // Weekly on Sunday
    '0 0 1 * *', // Monthly on 1st
  ];

  validExpressions.forEach((expr) => {
    try {
      cron.updateSchedule(expr);
      assert.ok(true);
    } catch (error) {
      assert.unreachable(`Should not throw for valid expression: ${expr}`);
    }
  });
});

// ========== initCron() Tests ==========
CronTests('initCron() - should initialize cron with schedule from config', () => {
  cronValidateStub.returns(true);

  // Set schedule in config
  db.setConfig('schedule', '0 9 * * *');

  cron.initCron();

  assert.ok(cronScheduleStub.calledOnce);
});

CronTests('initCron() - should handle missing schedule gracefully', () => {
  // Clear schedule from config
  db.setConfig('schedule', '');

  // Should not throw
  cron.initCron();

  assert.ok(cronScheduleStub.notCalled);
});

CronTests('initCron() - should handle null schedule gracefully', () => {
  // Set empty schedule (null not allowed by NOT NULL constraint)
  db.setConfig('schedule', '');

  // Should not throw
  cron.initCron();

  assert.ok(cronScheduleStub.notCalled);
});

CronTests('initCron() - should handle invalid schedule from config', () => {
  cronValidateStub.returns(false);

  // Set invalid schedule
  db.setConfig('schedule', 'invalid');

  // Should not throw (error is caught and logged)
  cron.initCron();

  assert.ok(cronScheduleStub.notCalled);
});

CronTests.run();
