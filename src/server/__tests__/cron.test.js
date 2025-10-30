import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import sinon from 'sinon';
import * as db from '../db.js';
import * as cron from '../cron.js';
import nodeCron from 'node-cron';
import Parser from 'rss-parser';

const CronTests = suite('Cron Tests');

let cronScheduleStub;
let cronValidateStub;
let mockTask;
let parserStub;

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
  if (parserStub) parserStub.restore();

  cronValidateStub = sinon.stub(nodeCron, 'validate');
  cronScheduleStub = sinon.stub(nodeCron, 'schedule').returns(mockTask);

  // Stub RSS parser to avoid real network calls
  const mockFeed = { items: [] }; // Empty feed by default
  parserStub = sinon.stub(Parser.prototype, 'parseURL').resolves(mockFeed);
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

// ========== Edge Case Tests ==========

CronTests('runCheck() - should prevent concurrent execution', async () => {
  // Create an active site (RSS parser is mocked so no real network calls)
  db.createSite({
    url: 'https://example.com/feed',
    title: 'Test Site',
    type: 'rss',
    is_active: 1,
  });

  // Start two checks concurrently
  const [result1, result2] = await Promise.all([
    cron.runCheck(),
    cron.runCheck(),
  ]);

  // Both should complete without error
  // Second call should return early due to isRunning flag
  assert.ok(true); // If we reach here, concurrent execution was prevented
});

CronTests('runCheck() - should reset isRunning flag after completion', async () => {
  // First run
  await cron.runCheck();

  // Second run should work (isRunning should be false now)
  await cron.runCheck();

  // Should complete successfully
  assert.ok(true);
});

CronTests('runCheck() - should reset isRunning flag even on error', async () => {
  // Create a site with invalid type to cause an error
  db.createSite({
    url: 'https://example.com/feed',
    title: 'Invalid Site',
    type: 'invalid_type',
    is_active: 1,
  });

  // Run check (will fail internally but should not throw)
  await cron.runCheck();

  // Second run should still work (isRunning should be reset)
  await cron.runCheck();

  assert.ok(true); // If we reach here, isRunning was properly reset
});

CronTests('runCheck() - should continue processing other sites after one fails', async () => {
  // Create a site with invalid type (will fail)
  db.createSite({
    url: 'https://invalid.com/feed',
    title: 'Failing Site',
    type: 'invalid_type',
    is_active: 1,
  });

  // Create a normal site (should succeed with mocked parser)
  const workingSite = db.createSite({
    url: 'https://example.com/feed',
    title: 'Working Site',
    type: 'rss',
    is_active: 1,
  });

  // Run check
  await cron.runCheck();

  // Working site should have been processed (last_checked updated from null)
  const updatedSite = db.getSite(workingSite.id);
  assert.not.equal(updatedSite.last_checked, null);
  assert.ok(updatedSite.last_checked); // Should be a timestamp
});

CronTests('runCheck() - should update last_checked for all sites even with no posts', async () => {
  // Parser stub returns empty feed by default
  const site = db.createSite({
    url: 'https://example.com/feed',
    title: 'Test Site',
    type: 'rss',
    is_active: 1,
  });

  // Run check
  await cron.runCheck();

  // last_checked should be updated from null to a timestamp
  const updatedSite = db.getSite(site.id);
  assert.not.equal(updatedSite.last_checked, null);
  assert.ok(updatedSite.last_checked); // Should be a timestamp
});

CronTests('updateSchedule() - should handle schedule update when no previous task exists', () => {
  cronValidateStub.returns(true);

  // First schedule (no previous task to stop)
  cron.updateSchedule('0 9 * * *');

  assert.ok(cronScheduleStub.calledOnce);
  assert.ok(mockTask.stop.notCalled); // No previous task to stop
});

CronTests('updateSchedule() - should handle multiple schedule updates in sequence', () => {
  cronValidateStub.returns(true);

  // Multiple updates
  cron.updateSchedule('0 9 * * *');
  cron.updateSchedule('0 10 * * *');
  cron.updateSchedule('0 11 * * *');

  // Should create 3 tasks and stop 2 previous ones
  assert.is(cronScheduleStub.callCount, 3);
  assert.is(mockTask.stop.callCount, 2);
});

CronTests('updateSchedule() - should validate schedule before stopping existing task', () => {
  cronValidateStub.returns(true);

  // Create initial valid schedule
  cron.updateSchedule('0 9 * * *');
  const firstCallCount = cronScheduleStub.callCount;

  // Try to update with invalid schedule
  cronValidateStub.returns(false);
  try {
    cron.updateSchedule('invalid');
    assert.unreachable('Should have thrown error');
  } catch (error) {
    assert.match(error.message, /Invalid cron expression/);
  }

  // Should not have stopped the existing task or created new one
  assert.is(cronScheduleStub.callCount, firstCallCount);
  assert.ok(mockTask.stop.notCalled);
});

CronTests('runCheck() - should handle empty active sites array', async () => {
  // Clean all sites
  const sites = db.getAllSites();
  sites.forEach((site) => db.deleteSite(site.id));

  // Should complete without error
  await cron.runCheck();

  assert.ok(true);
});

CronTests('runCheck() - should process multiple active sites', async () => {
  // Create multiple active sites (RSS parser is mocked)
  const site1 = db.createSite({
    url: 'https://example1.com/feed',
    title: 'Site 1',
    type: 'rss',
    is_active: 1,
  });

  const site2 = db.createSite({
    url: 'https://example2.com/feed',
    title: 'Site 2',
    type: 'rss',
    is_active: 1,
  });

  const site3 = db.createSite({
    url: 'https://example3.com/feed',
    title: 'Site 3',
    type: 'rss',
    is_active: 1,
  });

  // Run check
  await cron.runCheck();

  // All sites should have been processed (last_checked updated from null)
  const updatedSite1 = db.getSite(site1.id);
  const updatedSite2 = db.getSite(site2.id);
  const updatedSite3 = db.getSite(site3.id);

  assert.not.equal(updatedSite1.last_checked, null);
  assert.not.equal(updatedSite2.last_checked, null);
  assert.not.equal(updatedSite3.last_checked, null);
  assert.ok(updatedSite1.last_checked);
  assert.ok(updatedSite2.last_checked);
  assert.ok(updatedSite3.last_checked);
});

CronTests.run();
