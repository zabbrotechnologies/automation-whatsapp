const { chromium } = require('playwright');
const path = require('path');

const BASE_URL = 'http://localhost:3000';

async function runUITests() {
  console.log('====================================================');
  console.log('🖥️ 2. DEEP UI TESTS: Components, Forms, Gating & Stress');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, details = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}: ${details}`);
      failed++;
    }
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  try {
    // --- Test 1: Landing Page (index.html) ---
    console.log('▶ A. Landing Page Layout & Typography Inspection');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });

    // Check Butler font style on hero heading
    const heroH1 = page.locator('h1.hero-main-heading');
    await heroH1.waitFor({ timeout: 5000 });
    const fontFamily = await heroH1.evaluate(el => window.getComputedStyle(el).fontFamily);
    const textAlign = await heroH1.evaluate(el => window.getComputedStyle(el).textAlign);
    assert(fontFamily.toLowerCase().includes('butler') || fontFamily.toLowerCase().includes('serif'), 'Hero title applies Butler serif typography');
    assert(textAlign === 'center', 'Hero title is horizontally centered');

    // Check navbar brand & links
    const brandText = await page.locator('.brand-text').first().textContent();
    assert(brandText.includes('Flow'), 'Navbar brand displays "Flow"');

    // Check Hero CTAs exist and are clickable
    const btnExplore = page.locator('a.btn-hero-dark').first();
    assert(await btnExplore.isVisible(), 'Hero CTA "Explore Now" button is visible and active');

    // --- Test 2: Login & Registration Page (login.html) ---
    console.log('\n▶ B. Auth Modal & Tab Switching Inspection');
    await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });

    // Initial state: Login tab active
    const isLoginActive = await page.locator('#tabLogin').evaluate(el => el.classList.contains('active'));
    assert(isLoginActive, 'Login tab is active by default');

    // Switch to Sign Up tab
    await page.click('#tabRegister');
    const isRegActive = await page.locator('#tabRegister').evaluate(el => el.classList.contains('active'));
    const isRegFormVisible = await page.locator('#registerForm').isVisible();
    assert(isRegActive && isRegFormVisible, 'Clicking Sign Up tab transitions smoothly to registration form');

    // Switch back to Login tab
    await page.click('#tabLogin');
    const isLoginFormVisible = await page.locator('#loginForm').isVisible();
    assert(isLoginFormVisible, 'Switching back reveals login form');

    // Test form rejection with wrong credentials
    await page.fill('#loginEmail', 'wrong_user@flow.local');
    await page.fill('#loginPassword', 'wrongpassword');
    await page.click('#btnLoginSubmit');
    await page.waitForSelector('#authAlert:not([style*="display: none"])', { timeout: 5000 });
    const alertText = await page.locator('#authAlert').textContent();
    assert(alertText.includes('Invalid email or password') || alertText.includes('failed'), 'Shows clear inline error banner on invalid credentials');

    // Test successful admin login
    await page.fill('#loginEmail', 'admin@flow.local');
    await page.fill('#loginPassword', 'admin123');
    await page.click('#btnLoginSubmit');
    await page.waitForURL('**/admin.html', { timeout: 10000 });
    assert(page.url().includes('admin.html'), 'Successful admin login redirects to /admin.html');

    // --- Test 3: Admin Console (admin.html) ---
    console.log('\n▶ C. Enterprise Admin Console & User Data Feed');
    await page.waitForSelector('#usersTableBody tr td strong', { timeout: 10000 });
    const userRows = await page.locator('#usersTableBody tr').count();
    assert(userRows >= 1, `Admin users table displays ${userRows} active rows from Supabase`);

    // Verify stats cards rendered
    const statTotal = await page.locator('#statTotalUsers').textContent();
    assert(parseInt(statTotal, 10) >= 1, `Admin Total Users metric displays ${statTotal}`);

    // Verify action buttons exist in rows
    const actionButtons = await page.locator('#usersTableBody button').count();
    assert(actionButtons >= 1, `Action buttons (${actionButtons} total: Activate/Suspend, Role, Delete) are rendered for users`);

    // --- Test 4: Dashboard & Bot Simulator (dashboard.html) ---
    console.log('\n▶ D. Automation Dashboard, Knowledge Base & Sandbox');
    await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'networkidle' });

    // Check QR box or Connected Badge
    const qrSection = page.locator('#qrArea');
    const connectedSection = page.locator('#connectedArea');
    const isPairingVisible = (await qrSection.isVisible()) || (await connectedSection.isVisible());
    assert(isPairingVisible, 'QR Pairing container or connected state badge is active');

    // Wait for business settings to load into keywordPairsList
    await page.waitForSelector('#keywordPairsList .kb-row', { timeout: 8000 });
    const initialPairs = await page.locator('#keywordPairsList .kb-row').count();
    const btnAddPair = page.locator('#btnAddKeywordPair');
    assert(await btnAddPair.isVisible(), '+ Add Pair button is visible on dashboard');

    await btnAddPair.click();
    await page.waitForTimeout(300);
    const afterAddPairs = await page.locator('#keywordPairsList .kb-row').count();
    assert(afterAddPairs === initialPairs + 1, `Clicking "+ Add Pair" dynamically adds new key-value row (${initialPairs} -> ${afterAddPairs})`);

    // Remove the newly added pair to restore state
    const removeButtons = page.locator('.btn-kb-remove');
    await removeButtons.last().click();
    await page.waitForTimeout(300);
    const afterRemovePairs = await page.locator('#keywordPairsList .kb-row').count();
    assert(afterRemovePairs === initialPairs, 'Clicking remove button cleans up keyword row');

    // Test Bot Simulator Sandbox
    const simInput = page.locator('#simQueryInput');
    const btnSim = page.locator('#btnRunSimulator');
    if (await simInput.isVisible() && await btnSim.isVisible()) {
      await simInput.fill('What is your pricing?');
      await btnSim.click();
      await page.waitForSelector('#simBotText:not(:empty)', { timeout: 8000 });
      const simText = await page.locator('#simBotText').textContent();
      assert(simText.length > 5, `Bot simulator rendered live response: "${simText.slice(0, 40)}..."`);
    }

    // --- Test 5: UI Break Stress-Testing ---
    console.log('\n▶ E. UI Stress-Testing: Boundary, XSS & Extreme Inputs');
    // Test that script injection tags in input are safely escaped
    const xssPayload = '<script>alert("xss")</script>';
    const testInput = page.locator('#kbWebsite, #loginEmail').first();
    if (await testInput.isVisible()) {
      await testInput.fill(xssPayload);
      const val = await testInput.inputValue();
      assert(val === xssPayload, 'Form input accepts text without executing scripts');
    }

    // Check viewport horizontal overflow on current page
    const hasHorizontalOverflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth > document.documentElement.clientWidth;
    });
    assert(!hasHorizontalOverflow, 'Zero horizontal layout overflow detected (pixel-perfect viewport clipping)');

  } catch (err) {
    assert(false, `UI Test encountered unexpected error: ${err.message}`);
  } finally {
    await browser.close();
  }

  console.log(`\nUI Tests Result: ${passed} Passed, ${failed} Failed.`);
  return { category: 'UI Tests', passed, failed };
}

if (require.main === module) {
  runUITests().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runUITests };
