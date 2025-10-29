import { suite } from 'uvu';
import * as assert from 'uvu/assert';
import { toAbsoluteUrl, timeAgo } from '../utils.js';

const UtilsTests = suite('Utils Tests');

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

UtilsTests.run();
