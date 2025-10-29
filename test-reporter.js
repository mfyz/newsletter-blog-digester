// Custom uvu reporter for Jest-like output with colors
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
  yellow: '\x1b[33m',
};

let currentFile = '';
let currentSuite = '';
let allResults = [];
const startTime = Date.now();

export function test(name, suite, file) {
  // Print file name if changed
  if (file && file !== currentFile) {
    if (currentFile) {
      console.log(''); // Add spacing between files
    }
    currentFile = file;
  }

  // Print suite name if changed
  if (suite !== currentSuite) {
    if (currentSuite && !file) {
      console.log(''); // Add spacing between suites
    }
    currentSuite = suite;
    console.log(`${colors.bold}${suite}${colors.reset}`);
  }
}

export function pass(name) {
  console.log(`  ${colors.green}✓${colors.reset} ${colors.gray}${name}${colors.reset}`);
  allResults.push({ passed: true });
}

export function fail(name, error) {
  console.log(`  ${colors.red}✗${colors.reset} ${name}`);
  if (error) {
    console.log(`    ${colors.red}${error.message}${colors.reset}`);
  }
  allResults.push({ passed: false });
}

export function done(files) {
  const total = allResults.length;
  const passed = allResults.filter(r => r.passed).length;
  const failed = total - passed;
  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('');
  console.log(`${colors.bold}Tests:${colors.reset}  ${colors.green}${passed} passed${colors.reset}, ${total} total`);
  console.log(`${colors.bold}Time:${colors.reset}   ${duration}s`);
  if (failed > 0) {
    console.log(`${colors.bold}Failed:${colors.reset} ${colors.red}${failed}${colors.reset}`);
  }
  console.log('');
}

export default { test, pass, fail, done };
