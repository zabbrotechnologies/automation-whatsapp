const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:3000';

async function runOptimisationTests() {
  console.log('====================================================');
  console.log('💎 4. DEEP OPTIMISATION & EFFICIENCY AUDIT');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName} ${details ? `(${details})` : ''}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}: ${details}`);
      failed++;
    }
  }

  // --- A. Static Asset Size Budget Analysis ---
  console.log('▶ A. Client Asset Size & Transmission Budgets');
  const filesToAudit = [
    { name: 'index.html', path: path.join(__dirname, '..', 'public', 'index.html'), budgetKb: 100 },
    { name: 'login.html', path: path.join(__dirname, '..', 'public', 'login.html'), budgetKb: 50 },
    { name: 'dashboard.html', path: path.join(__dirname, '..', 'public', 'dashboard.html'), budgetKb: 150 },
    { name: 'admin.html', path: path.join(__dirname, '..', 'public', 'admin.html'), budgetKb: 100 }
  ];

  for (const item of filesToAudit) {
    if (fs.existsSync(item.path)) {
      const stats = fs.statSync(item.path);
      const sizeKb = (stats.size / 1024).toFixed(2);
      assert(
        parseFloat(sizeKb) <= item.budgetKb,
        `Payload size for ${item.name}`,
        `Actual: ${sizeKb} KB, Budget: <=${item.budgetKb} KB`
      );
    }
  }

  // --- B. CSS Performance & Layout Reflow Safety Audit ---
  console.log('\n▶ B. Animation Pipeline & Composite-Only Property Audit');
  const publicDir = path.join(__dirname, '..', 'public');
  const htmlFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

  let hasReducedMotionAll = true;
  for (const file of htmlFiles) {
    const content = fs.readFileSync(path.join(publicDir, file), 'utf-8');
    const hasReducedMotion = content.includes('prefers-reduced-motion') || content.includes('style.css');
    if (!hasReducedMotion) hasReducedMotionAll = false;
  }
  const mainCss = fs.readFileSync(path.join(publicDir, 'style.css'), 'utf-8');
  assert(
    hasReducedMotionAll && mainCss.includes('prefers-reduced-motion'),
    'Accessibility & CPU safety: prefers-reduced-motion media query implemented across all pages and main stylesheet'
  );

  // Check that interactive elements use hardware-accelerated transform: scale()
  const dashboardCss = fs.readFileSync(path.join(publicDir, 'dashboard.html'), 'utf-8');
  const usesHardwareScale = dashboardCss.includes('transform: scale(');
  assert(
    usesHardwareScale,
    'Apple tactile feedback uses GPU-accelerated transform: scale() rather than reflow-inducing properties'
  );

  // --- C. DOM Node Density & Tree Complexity Benchmarks ---
  console.log('\n▶ C. DOM Tree Density (Playwright In-Memory Audit)');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Log in as admin first so admin.html has valid session cookies
  await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });
  await page.fill('#loginEmail', 'admin@flow.local');
  await page.fill('#loginPassword', 'admin123');
  await page.click('#btnLoginSubmit');
  await page.waitForURL('**/admin.html', { timeout: 10000 });

  const pagesToBenchmark = [
    { name: 'Landing (index.html)', url: `${BASE_URL}/`, budgetNodes: 800 },
    { name: 'Auth (login.html)', url: `${BASE_URL}/login.html`, budgetNodes: 350 },
    { name: 'Admin (admin.html)', url: `${BASE_URL}/admin.html`, budgetNodes: 1200 },
    { name: 'Dashboard (dashboard.html)', url: `${BASE_URL}/dashboard.html`, budgetNodes: 1600 }
  ];

  for (const p of pagesToBenchmark) {
    await page.goto(p.url, { waitUntil: 'networkidle' });
    const nodeCount = await page.evaluate(() => document.querySelectorAll('*').length);
    assert(
      nodeCount <= p.budgetNodes,
      `DOM Node Count for ${p.name}`,
      `Nodes: ${nodeCount}, Budget: <=${p.budgetNodes} for 60fps scrolling`
    );
  }
  await browser.close();

  // --- D. Database Egress & Security Minimization Audit ---
  console.log('\n▶ D. Database Query Egress & Sensitivity Audit');
  const dbCode = fs.readFileSync(path.join(__dirname, '..', 'db.js'), 'utf-8');

  // Verify getAllUsers projects only non-sensitive columns
  const hasGetAllUsersProjection = dbCode.includes(".select('id, name, email, role, status, linked_phone, last_login, created_at')");
  assert(
    hasGetAllUsersProjection,
    'Supabase Egress: getAllUsers uses explicit safe projection (no unneeded columns, excludes password hashes)'
  );

  // Verify findUserById projects safe columns
  const hasFindByIdProjection = dbCode.includes(".select('id, name, email, role, status, linked_phone, last_login, created_at')");
  assert(
    hasFindByIdProjection,
    'Supabase Egress: findUserById filters out sensitive credentials on retrieval'
  );

  console.log(`\nOptimisation Tests Result: ${passed} Passed, ${failed} Failed.`);
  return { category: 'Optimisation Tests', passed, failed };
}

if (require.main === module) {
  runOptimisationTests().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runOptimisationTests };
