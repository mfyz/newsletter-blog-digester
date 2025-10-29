#!/usr/bin/env node
import { exec } from 'child_process';
import { promisify } from 'util';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const execAsync = promisify(exec);

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

// Extract test names from test files
async function getTestNames() {
  const testDir = 'src/server/__tests__';
  const files = await readdir(testDir);
  const testFiles = files.filter(f => f.endsWith('.test.js'));

  const testsByFile = {};

  for (const file of testFiles) {
    const content = await readFile(join(testDir, file), 'utf-8');
    const testNames = [];

    // Match test definitions: SuiteName('test description', () => {
    const regex = /\w+Tests\(['"`]([^'"`]+)['"`]/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      testNames.push(match[1]);
    }

    testsByFile[file] = testNames;
  }

  return testsByFile;
}

async function runTests() {
  const startTime = Date.now();
  try {
    const testNames = await getTestNames();

    const { stdout } = await execAsync(
      'NODE_OPTIONS=--experimental-vm-modules node node_modules/uvu/bin.js src/server/__tests__'
    );

    // Parse output and reformat with actual test names
    const lines = stdout.split('\n');
    let passed = 0;
    let currentFile = '';
    let currentFileTests = [];
    let testIndex = 0;

    for (const line of lines) {
      // File header
      if (line.includes('.test.js')) {
        if (currentFile) console.log('');
        currentFile = line.replace(/\x1b\[\d+m/g, '').trim();
        const fileName = currentFile.replace(/.*\//, '');
        currentFileTests = testNames[fileName] || [];
        testIndex = 0;
        console.log(`${colors.bold}${currentFile.replace('.test.js', '')}${colors.reset}`);
      }
      // Suite line with dots
      else if (line.includes('•')) {
        const match = line.match(/\((\d+)\s*\/\s*(\d+)\)/);
        if (match) {
          const count = parseInt(match[1]);
          const suiteName = line.split('•')[0].replace(/\x1b\[\d+m/g, '').trim();

          console.log(`  ${colors.bold}${suiteName}${colors.reset}`);

          for (let i = 0; i < count; i++) {
            const testName = currentFileTests[testIndex] || `test ${testIndex + 1}`;
            console.log(`    ${colors.green}✓${colors.reset} ${colors.gray}${testName}${colors.reset}`);
            testIndex++;
            passed++;
          }
        }
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log('');
    console.log(`${colors.bold}Tests:${colors.reset}  ${colors.green}${passed} passed${colors.reset}, ${passed} total`);
    console.log(`${colors.bold}Time:${colors.reset}   ${duration}s`);
    console.log('');

  } catch (error) {
    console.error(`${colors.red}✗ Tests failed${colors.reset}`);
    if (error.stdout) console.error(error.stdout);
    if (error.stderr) console.error(error.stderr);
    process.exit(1);
  }
}

runTests();
