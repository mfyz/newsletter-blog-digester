# Backend Test Coverage Analysis & Implementation Plan

## Executive Summary

Current test coverage is **minimal (~20-30%)** and focuses only on basic happy path scenarios. The core business logic (extractors, cron jobs) has **0% test coverage**. This document provides a comprehensive analysis of what's missing and a prioritized implementation plan.

---

## Current Coverage Overview

| Module             | Total Functions/Endpoints | Tested | Coverage | Status          |
| ------------------ | ------------------------- | ------ | -------- | --------------- |
| Sites API          | 10 endpoints              | 2      | 20%      | 🔴 Critical     |
| Posts API          | 5 endpoints               | 3      | 60%      | 🟡 Moderate     |
| Config API         | 3 endpoints               | 2      | 67%      | 🟡 Moderate     |
| Logs API           | 1 endpoint                | 1      | 100%     | ✅ Complete     |
| Cron API           | 1 endpoint                | 0      | 0%       | 🔴 Critical     |
| Database Functions | 25 functions              | 8      | 32%      | 🔴 Critical     |
| Extractors         | 7 functions               | 0      | 0%       | 🔴 **CRITICAL** |
| Cron Logic         | 5 functions               | 0      | 0%       | 🔴 **CRITICAL** |
| Utilities          | 4 functions               | 2      | 50%      | 🟢 Good         |

**Overall Estimated Coverage: 20-30%**

---

## Detailed Gap Analysis

### 1. Sites API (`src/server/api/sites.js`)

**Coverage: 2/10 endpoints (20%)**

#### ✅ Currently Tested:

- `GET /api/sites` - getAll() - basic test only
- `POST /api/sites` - create() - success + validation failure

#### ❌ NOT Tested:

**Missing Tests (8 endpoints):**

1. `GET /api/sites/:id` - getOne()
   - Success case
   - 404 for non-existent site
   - Invalid ID format

2. `PUT /api/sites/:id` - update()
   - Update all fields
   - Partial updates
   - Update extraction_rules (JSON handling)
   - Update is_active status
   - Non-existent site

3. `DELETE /api/sites/:id` - remove()
   - Successful deletion
   - Cascade delete of related posts
   - Non-existent site

4. `POST /api/sites/test-extraction` - testExtraction()
   - Valid CSS rules
   - Invalid CSS rules
   - Multiple rules
   - Empty results
   - Network errors

5. `POST /api/sites/test-llm-extraction` - testLLMExtraction()
   - Valid extraction
   - Missing OpenAI key
   - Invalid URL
   - LLM parsing errors
   - API errors

6. `POST /api/sites/:id/toggle` - toggleActive()
   - Toggle active to inactive
   - Toggle inactive to active
   - Non-existent site

7. `POST /api/sites/fetch-html` - fetchHTML()
   - Successful fetch
   - Invalid URL
   - Network timeout
   - Missing URL parameter

8. `POST /api/sites/generate-selectors` - generateSelectors()
   - Successful generation
   - Missing OpenAI key
   - Invalid HTML
   - LLM response parsing
   - JSON extraction from markdown

---

### 2. Posts API (`src/server/api/posts.js`)

**Coverage: 3/5 endpoints (60%)**

#### ✅ Currently Tested:

- `GET /api/posts` - getAll() - basic + site_id filter
- `GET /api/posts/:id` - getOne() - success + 404

#### ❌ NOT Tested:

**Missing Tests (2 endpoints):**

1. `DELETE /api/posts/:id` - remove()
   - Successful deletion
   - Non-existent post
   - Verify logging

2. `POST /api/posts/truncate/:site_id` - truncate()
   - Delete all posts for site
   - Return correct count
   - Verify logging

**Incomplete Coverage:**

- `GET /api/posts` filters not fully tested:
  - `search` parameter
  - `limit` parameter
  - Combined filters

---

### 3. Config API (`src/server/api/config.js`)

**Coverage: 2/3 endpoints (67%)**

#### ✅ Currently Tested:

- `GET /api/config` - getAll()
- `PUT /api/config` - update() - basic only

#### ❌ NOT Tested:

**Missing Tests (1 endpoint + logic):**

1. `POST /api/config/test-ai` - testAI()
   - Successful connection
   - Invalid API key
   - Invalid base URL
   - Invalid model name
   - Network errors
   - Timeout

2. `PUT /api/config` - update() - incomplete
   - Schedule update triggers cron reschedule
   - Multiple config updates at once
   - Invalid cron expression handling

---

### 4. Logs API (`src/server/api/logs.js`)

**Coverage: 1/1 endpoint (100%)**

#### ✅ Fully Tested:

- `GET /api/logs` - getAll() with filters

---

### 5. Cron API (`src/server/api/cron.js`)

**Coverage: 0/1 endpoint (0%)**

#### ❌ NOT Tested:

**Missing Tests (1 endpoint):**

1. `POST /api/cron/run` - runNow()
   - Triggers background job
   - Returns immediate success response
   - Handles errors gracefully

---

### 6. Database Functions (`src/server/db.js`)

**Coverage: 25/25 functions (100%)** ✅ **COMPLETED**

#### ✅ Currently Tested:

- `initDb()`
- `getDb()`
- `createTables()`
- `runMigrations()`
- `seedDefaultConfig()`
- `getAllSites()`
- `getActiveSites()`
- `getSite()`
- `createSite()`
- `updateSite()`
- `deleteSite()`
- `getPosts()` - including advanced filters (search, notified, limit, combined)
- `getPost()`
- `createPost()` - including duplicate detection
- `updatePost()`
- `deletePost()`
- `truncatePosts()`
- `cleanupOldContent()`
- `getAllConfig()`
- `getConfig()`
- `setConfig()`
- `getLogs()`
- `closeDb()`

**Implementation Notes:**

- Added 36 new test cases covering all previously untested database functions
- Tests include happy paths, error cases, edge cases, and idempotency checks
- All tests use in-memory SQLite database for isolation
- Note: Found a bug in `cleanupOldContent()` at db.js:482 - uses `setFullYear()` instead of properly calculating days, documented in test comments

---

### 7. Extractor Functions (`src/server/extractors.js`)

**Coverage: 0/7 functions (0%)** - 🔴 **CRITICAL GAP**

#### ❌ NOT Tested (Core Business Logic):

**Missing Tests (7 functions):**

1. **cleanHTML()**
   - Removes `<script>` tags with contents
   - Removes `<style>` tags with contents
   - Preserves other HTML

2. **fetchSiteContent()**
   - Routes to fetchRSSFeed for type='rss'
   - Routes to fetchHTMLWithRules for type='html_rules'
   - Routes to fetchHTMLWithLLM for type='html_llm'
   - Unknown type warning
   - Error handling

3. **fetchRSSFeed()**
   - Parse valid RSS feed
   - Parse Atom feed
   - Handle missing fields (title, link)
   - Network errors
   - Invalid feed format
   - Empty feed

4. **fetchHTMLWithRules()**
   - Single rule extraction
   - Multiple rules extraction
   - Track source_rule per post
   - Relative URL conversion
   - Missing container selector
   - Empty rules array
   - Invalid JSON rules
   - Network errors
   - Malformed HTML

5. **fetchHTMLWithLLM()**
   - Successful extraction
   - Missing OpenAI API key
   - LLM response parsing (array format)
   - LLM response parsing (wrapped in object)
   - Relative URL conversion
   - Filter invalid posts (missing title/url)
   - Network errors
   - Invalid JSON response
   - Base URL configuration

6. **summarizePost()**
   - Successful summarization
   - Missing OpenAI API key
   - Content truncation (10000 chars)
   - Returns null on error
   - API errors
   - Empty content

7. **sendToSlack()**
   - Send posts grouped by site
   - Missing webhook URL (skip gracefully)
   - Message formatting
   - Network errors
   - Invalid webhook URL
   - Empty posts array

---

### 8. Cron Functions (`src/server/cron.js`)

**Coverage: 0/5 functions (0%)** - 🔴 **CRITICAL GAP**

#### ❌ NOT Tested (Main Application Workflow):

**Missing Tests (5 functions):**

1. **runCheck()**
   - Process multiple active sites
   - Skip inactive sites
   - Fetch posts per site
   - Update last_checked timestamp
   - Create new posts
   - Skip duplicate posts
   - Summarize posts with content
   - Skip summarization for short content
   - Collect posts for Slack
   - Send Slack notification
   - Mark posts as notified
   - Handle per-site errors (continue processing)
   - Prevent concurrent execution (isRunning flag)
   - Handle empty active sites

2. **updateSchedule()**
   - Validate cron expression
   - Stop existing task
   - Start new task with new schedule
   - Invalid cron expression error
   - Update from no schedule

3. **initCron()**
   - Read schedule from config
   - Initialize cron task
   - Handle missing schedule

4. **startCleanupJob()**
   - Schedule midnight cleanup
   - Execute cleanup function
   - Handle cleanup errors

5. **Integration Tests**
   - Full runCheck workflow end-to-end
   - Cron schedule execution
   - Config update triggers reschedule

---

### 9. Utility Functions (`src/server/utils.js`)

**Coverage: 2/4 functions (50%)**

#### ✅ Currently Tested:

- `toAbsoluteUrl()` - multiple cases
- `timeAgo()` - multiple time ranges

#### ❌ NOT Tested:

**Missing Tests (2 functions/aspects):**

1. **logger.info() / error() / warn()**
   - Console output
   - Database logging
   - JSON stringification of details
   - Null details handling

2. **logger._logToDb()**
   - Successful DB insert
   - Fallback to console on DB error
   - Handle DB not initialized

---

## Edge Cases & Error Scenarios NOT Covered

### API Error Handling (0% tested):

- [ ] Database connection failures during requests
- [ ] Invalid request parameter types
- [ ] Missing required fields
- [ ] Malformed JSON in request bodies
- [ ] Server crashes/exceptions (500 responses)
- [ ] Network timeouts
- [ ] Large payload handling

### Database Edge Cases (0% tested):

- [ ] Concurrent write conflicts
- [ ] Foreign key constraint violations
- [ ] Unique constraint violations (only partially tested)
- [ ] Database migration failures
- [ ] WAL mode pragma failures
- [ ] Database file permissions
- [ ] Disk space issues

### Extractor Edge Cases (0% tested):

- [ ] Malformed RSS feeds (invalid XML)
- [ ] RSS feeds with missing required fields
- [ ] Invalid HTML structure
- [ ] Empty/null responses from websites
- [ ] HTTP error codes (404, 500, etc.)
- [ ] Redirects
- [ ] OpenAI API rate limits
- [ ] OpenAI API key invalid/expired
- [ ] LLM response in unexpected format
- [ ] LLM response with partial data
- [ ] Slack webhook failures (invalid URL, rate limits)
- [ ] Network timeouts during fetching
- [ ] SSL certificate errors

### Cron Edge Cases (0% tested):

- [ ] Concurrent execution prevention
- [ ] Invalid cron expressions
- [ ] Schedule update during active job
- [ ] Partial failures (some sites succeed, some fail)
- [ ] Database locked during cron
- [ ] Memory leaks on repeated runs

---

## Integration & E2E Tests

**Coverage: 0%**

No integration tests exist for:

- [ ] Full end-to-end workflow: add site → cron fetch → summarize → notify → verify DB
- [ ] Database + API interactions
- [ ] Cron job + extractors + notifications pipeline
- [ ] Config changes affecting running jobs
- [ ] Multi-site concurrent processing
- [ ] Error recovery and retry logic

---

## Implementation Plan

### Phase 1: Critical Core Logic (Week 1-2)

**Priority: 🔴 Critical - These are the most important gaps**

#### 1.1 Extractor Tests (`extractors.test.js`)

**Estimated: 2-3 days**

```
Create: src/server/__tests__/extractors.test.js
```

**Tests to implement:**

- [ ] cleanHTML() - 3 tests
- [ ] fetchRSSFeed() - 6 tests (mock axios/rss-parser)
- [ ] fetchHTMLWithRules() - 9 tests (mock axios/cheerio)
- [ ] fetchHTMLWithLLM() - 8 tests (mock OpenAI)
- [ ] summarizePost() - 6 tests (mock OpenAI)
- [ ] sendToSlack() - 6 tests (mock axios)
- [ ] fetchSiteContent() - 5 tests (integration of above)

**Key mocking required:**

- axios.get()
- rss-parser.parseURL()
- OpenAI client
- db.getConfig()

**Total: ~43 test cases**

#### 1.2 Cron Tests (`cron.test.js`)

**Estimated: 2 days**

```
Create: src/server/__tests__/cron.test.js
```

**Tests to implement:**

- [ ] runCheck() - 14 tests (mock all extractors)
- [ ] updateSchedule() - 4 tests
- [ ] initCron() - 3 tests
- [ ] startCleanupJob() - 3 tests
- [ ] Integration test - full workflow - 1 test

**Key mocking required:**

- node-cron
- extractors module
- db module (partially)

**Total: ~25 test cases**

#### 1.3 Database Critical Functions

**Estimated: 1 day**

```
Update: src/server/__tests__/db.test.js
```

**Tests to add:**

- [ ] getActiveSites() - 3 tests
- [ ] createPost() duplicate handling - 3 tests
- [ ] cleanupOldContent() - 5 tests
- [ ] truncatePosts() - 2 tests
- [ ] deletePost() - 2 tests
- [ ] getPosts() advanced filters - 5 tests

**Total: ~20 test cases**

---

### Phase 2: API Completeness (Week 3)

**Priority: 🟡 High - Complete API coverage**

#### 2.1 Sites API Completion

**Estimated: 2 days**

```
Update: src/server/__tests__/sites-api.test.js
```

**Tests to add:**

- [ ] getOne() - 3 tests
- [ ] update() - 6 tests
- [ ] remove() - 3 tests
- [ ] testExtraction() - 5 tests
- [ ] testLLMExtraction() - 5 tests
- [ ] toggleActive() - 3 tests
- [ ] fetchHTML() - 4 tests
- [ ] generateSelectors() - 5 tests

**Total: ~34 test cases**

#### 2.2 Posts API Completion

**Estimated: 0.5 days**

```
Update: src/server/__tests__/posts-api.test.js
```

**Tests to add:**

- [ ] remove() - 2 tests
- [ ] truncate() - 2 tests
- [ ] getAll() advanced filters - 3 tests

**Total: ~7 test cases**

#### 2.3 Config API Completion

**Estimated: 0.5 days**

```
Update: src/server/__tests__/config-api.test.js
```

**Tests to add:**

- [ ] testAI() - 6 tests
- [ ] update() with schedule change - 2 tests

**Total: ~8 test cases**

#### 2.4 Cron API Tests

**Estimated: 0.5 days**

```
Create: src/server/__tests__/cron-api.test.js
```

**Tests to add:**

- [ ] runNow() - 3 tests

**Total: ~3 test cases**

---

### Phase 3: Edge Cases & Error Handling (Week 4)

**Priority: 🟡 High - Robustness**

#### 3.1 API Error Handling Tests

**Estimated: 1 day**

**Add to all API test files:**

- [ ] Database connection failures
- [ ] Invalid parameter types
- [ ] Malformed JSON
- [ ] Server exceptions
- [ ] Missing required fields

**Total: ~25 test cases across all APIs**

#### 3.2 Database Edge Cases

**Estimated: 1 day**

```
Update: src/server/__tests__/db.test.js
```

**Tests to add:**

- [ ] Concurrent operations
- [ ] Foreign key violations
- [ ] Unique constraint edge cases
- [ ] Migration idempotency
- [ ] Error recovery

**Total: ~15 test cases**

#### 3.3 Extractor Edge Cases

**Estimated: 1 day**

```
Update: src/server/__tests__/extractors.test.js
```

**Tests to add:**

- [ ] Network timeouts
- [ ] Malformed data
- [ ] API rate limits
- [ ] Empty responses
- [ ] Redirects
- [ ] SSL errors

**Total: ~20 test cases**

---

### Phase 4: Integration & E2E Tests (Week 5)

**Priority: 🟢 Medium - Quality assurance**

#### 4.1 Integration Tests

**Estimated: 2 days**

```
Create: src/server/__tests__/integration.test.js
```

**Tests to implement:**

- [ ] Full workflow: create site → manual trigger → verify posts → verify Slack
- [ ] Config update affects running cron
- [ ] Multi-site processing
- [ ] Error recovery scenarios
- [ ] Database + API interactions

**Total: ~10 test cases**

#### 4.2 Utilities Completion

**Estimated: 0.5 days**

```
Update: src/server/__tests__/utils.test.js
```

**Tests to add:**

- [ ] Logger database logging - 4 tests
- [ ] Logger error fallback - 2 tests

**Total: ~6 test cases**

---

### Phase 5: Test Infrastructure Improvements (Week 5)

**Priority: 🟢 Medium - Test quality**

#### 5.1 Improve Test Setup

**Estimated: 1 day**

**Improvements needed:**

- [ ] Create proper mock factory for Fastify reply objects
- [ ] Create shared test fixtures for sites/posts/config
- [ ] Better test isolation (separate DB per test file)
- [ ] Add test helpers for common operations
- [ ] Setup proper teardown for all tests

#### 5.2 Mock Improvements

**Estimated: 1 day**

**Create mock utilities:**

- [ ] Mock OpenAI client factory
- [ ] Mock axios factory with response fixtures
- [ ] Mock RSS parser factory
- [ ] Mock Slack webhook responses

---

## Testing Best Practices to Implement

### 1. Test Structure

```javascript
// Use AAA pattern consistently
test('should create site with valid data', async () => {
  // Arrange
  const siteData = { url: '...', title: '...', type: 'rss' };

  // Act
  const result = await sitesAPI.create({ body: siteData }, mockReply);

  // Assert
  assert.ok(result.id);
  assert.equal(result.title, 'Expected Title');
});
```

### 2. Proper Mocking

```javascript
// Mock external dependencies
import sinon from 'sinon';

// Before test
const axiosStub = sinon.stub(axios, 'get').resolves({ data: '...' });

// After test
axiosStub.restore();
```

### 3. Test Isolation

```javascript
// Each test should have independent data
beforeEach(() => {
  // Create fresh test data
  // Mock fresh dependencies
});

afterEach(() => {
  // Clean up
  // Restore mocks
});
```

### 4. Error Testing

```javascript
test('should handle network errors gracefully', async () => {
  axiosStub.rejects(new Error('Network timeout'));

  const result = await fetchRSSFeed('http://example.com');

  assert.equal(result, []);
  // Verify error was logged
});
```

### 5. Async Testing

```javascript
// Always use async/await
test('async operation', async () => {
  const result = await asyncFunction();
  assert.ok(result);
});
```

---

## Test Coverage Goals

### Target Coverage Metrics:

| Module      | Current  | Target  | Priority    |
| ----------- | -------- | ------- | ----------- |
| Extractors  | 0%       | **90%** | 🔴 Critical |
| Cron Logic  | 0%       | **85%** | 🔴 Critical |
| Sites API   | 20%      | **80%** | 🟡 High     |
| Posts API   | 60%      | **85%** | 🟡 High     |
| Config API  | 67%      | **90%** | 🟡 High     |
| Database    | 32%      | **85%** | 🟡 High     |
| Utilities   | 50%      | **80%** | 🟢 Medium   |
| **Overall** | **~25%** | **85%** | -           |

---

## Success Criteria

### Phase 1 Complete When:

- [ ] All extractor functions have >85% coverage
- [ ] All cron functions have >80% coverage
- [ ] Critical DB functions (getActiveSites, createPost duplicates, cleanup) tested
- [ ] Can run `npm test` and see >50% overall coverage

### Phase 2 Complete When:

- [ ] All API endpoints have at least 2 test cases (happy + error)
- [ ] All CRUD operations fully tested
- [ ] Coverage >65%

### Phase 3 Complete When:

- [ ] All error paths tested
- [ ] All edge cases documented and tested
- [ ] Coverage >75%

### Phase 4 Complete When:

- [ ] At least 5 integration tests passing
- [ ] End-to-end workflow verified
- [ ] Coverage >85%

### Phase 5 Complete When:

- [ ] Test infrastructure robust
- [ ] CI/CD can run tests reliably
- [ ] Coverage reports generated automatically

---

## Resources Needed

### Dependencies:

- `sinon` - Already installed ✅
- `nock` - For HTTP mocking (consider adding)
- `@faker-js/faker` - For test data generation (consider adding)

### Documentation:

- Mock examples for OpenAI API
- Test fixtures for RSS feeds
- Sample HTML for selector testing

### Time Estimate:

- **Phase 1:** 5-6 days (Critical)
- **Phase 2:** 3-4 days (High)
- **Phase 3:** 3 days (High)
- **Phase 4:** 2-3 days (Medium)
- **Phase 5:** 2 days (Medium)

**Total: 15-18 days (3-4 weeks)**

---

## Risk Mitigation

### Potential Issues:

1. **External API Mocking Complexity**
   - Risk: OpenAI/Slack mocking may be complex
   - Mitigation: Use `nock` or create mock classes

2. **Test Data Management**
   - Risk: Test fixtures become stale
   - Mitigation: Use factories/generators

3. **Async Race Conditions**
   - Risk: Cron tests may have timing issues
   - Mitigation: Use proper async/await, mock timers

4. **Database State Leakage**
   - Risk: Tests affecting each other
   - Mitigation: Use in-memory DB per test suite, proper cleanup

---

## Conclusion

The current test suite validates basic CRUD operations but **completely misses the core application logic** (extractors, cron jobs). Implementing Phase 1 should be the **immediate priority** as it covers the most critical business logic that has zero coverage today.

**Recommended Approach:**

1. Start with Phase 1 (Extractors + Cron) - **2 weeks**
2. Move to Phase 2 (API Completion) - **1 week**
3. Add Phase 3 (Edge Cases) as time permits - **1 week**
4. Phases 4-5 can be done incrementally

This plan would bring coverage from **~25% to ~85%** and provide confidence in the core application functionality.
