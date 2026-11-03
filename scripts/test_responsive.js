require('dotenv').config();
const { chromium } = require('playwright');
const path = require('path');
const jwt = require('jsonwebtoken');

const ARTIFACTS_DIR = 'C:\\Users\\Gowshigan\\.gemini\\antigravity\\brain\\5adaf225-5f4e-4fe6-9256-39c072c34b7f';
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_flow_key_99182371';

const VIEWPORTS = [
  { name: 'mobile_320', width: 320, height: 640 },
  { name: 'mobile_375', width: 375, height: 812 },
  { name: 'mobile_414', width: 414, height: 896 },
  { name: 'tablet_768', width: 768, height: 1024 },
  { name: 'laptop_1024', width: 1024, height: 768 },
  { name: 'desktop_1440', width: 1440, height: 900 }
];

async function checkHorizontalOverflow(page, pageName, vpName) {
  return await page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth;
    const scrollWidth = document.documentElement.scrollWidth;
    const bodyScrollWidth = document.body ? document.body.scrollWidth : 0;
    const maxScroll = Math.max(scrollWidth, bodyScrollWidth);
    
    const overflowingElements = [];
    if (maxScroll > docWidth + 2) {
      document.querySelectorAll('*').forEach(el => {
        const rect = el.getBoundingClientRect();
        if (rect.right > docWidth + 3) {
          overflowingElements.push({
            tag: el.tagName,
            id: el.id,
            className: (el.className || '').toString().substring(0, 40),
            right: Math.round(rect.right),
            width: Math.round(rect.width)
          });
        }
      });
    }
    return {
      hasOverflow: maxScroll > docWidth + 2,
      docWidth,
      scrollWidth: maxScroll,
      overflowingElements: overflowingElements.slice(0, 5)
    };
  });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const summaryReport = [];

  const authToken = jwt.sign(
    { id: 1, email: 'admin@flow.local', name: 'System Admin', role: 'ADMIN' },
    JWT_SECRET,
    { expiresIn: '1d' }
  );

  console.log('Starting Playwright Responsive & Button Tests across 6 Screen Sizes...\n');

  for (const vp of VIEWPORTS) {
    console.log(`================ Viewport: ${vp.name} (${vp.width}x${vp.height}) ================`);
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    
    // Set persistent auth session
    await context.addCookies([{
      name: 'flow_auth_token',
      value: authToken,
      domain: 'localhost',
      path: '/'
    }]);

    const page = await context.newPage();

    // ---------------- 1. LANDING PAGE (index.html) ----------------
    await page.goto('http://localhost:3000/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    const indexOverflow = await checkHorizontalOverflow(page, 'index.html', vp.name);
    console.log(`[index.html @ ${vp.name}] Overflow: ${indexOverflow.hasOverflow ? 'FAILED (' + indexOverflow.scrollWidth + 'px)' : 'PASSED (0px overflow)'}`);

    // Test Hero buttons
    const ctaExplore = page.locator('.btn-hero-dark, .btn-landing-primary').first();
    const ctaExploreBox = await ctaExplore.boundingBox();
    console.log(`  CTA Button "Explore Now": box=[w:${Math.round(ctaExploreBox?.width || 0)}, h:${Math.round(ctaExploreBox?.height || 0)}]`);

    // Screenshot Landing
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, `responsive_landing_${vp.name}.png`),
      fullPage: false
    });

    // ---------------- 2. LOGIN / SIGNUP PAGE (login.html) ----------------
    await page.goto('http://localhost:3000/login.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    const loginOverflow = await checkHorizontalOverflow(page, 'login.html', vp.name);
    console.log(`[login.html @ ${vp.name}] Overflow: ${loginOverflow.hasOverflow ? 'FAILED' : 'PASSED (0px overflow)'}`);

    // Test tab buttons
    await page.click('#tabRegister');
    await page.waitForTimeout(200);
    const regTabActive = await page.locator('#registerForm').isVisible();
    await page.click('#tabLogin');
    await page.waitForTimeout(200);
    const loginTabActive = await page.locator('#loginForm').isVisible();
    console.log(`  Tabs Toggle (Login <-> Sign Up): ${regTabActive && loginTabActive ? 'PASSED' : 'FAILED'}`);

    // Screenshot Login
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, `responsive_login_${vp.name}.png`),
      fullPage: false
    });

    // ---------------- 3. DASHBOARD PAGE (dashboard.html) ----------------
    await page.goto('http://localhost:3000/dashboard.html', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#keywordPairsList .kb-row', { timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(400);
    const dashOverflow = await checkHorizontalOverflow(page, 'dashboard.html', vp.name);
    console.log(`[dashboard.html @ ${vp.name}] Overflow: ${dashOverflow.hasOverflow ? 'FAILED (' + dashOverflow.scrollWidth + 'px)' : 'PASSED (0px overflow)'}`);

    // Test small button: #btnManualSync
    const syncBtn = page.locator('#btnManualSync');
    const syncBox = await syncBtn.boundingBox();
    await syncBtn.click();
    console.log(`  Button #btnManualSync: box=[w:${Math.round(syncBox?.width || 0)}, h:${Math.round(syncBox?.height || 0)}] -> CLICKED`);

    // Test small button: #btnAddKeywordPair
    const addPairBtn = page.locator('#btnAddKeywordPair');
    await addPairBtn.scrollIntoViewIfNeeded();
    const addPairBox = await addPairBtn.boundingBox();
    const initialRows = await page.locator('#keywordPairsList .kb-row').count();
    await addPairBtn.click();
    await page.waitForTimeout(300);
    const afterAddRows = await page.locator('#keywordPairsList .kb-row').count();
    const addPassed = afterAddRows === initialRows + 1;
    console.log(`  Small Button #btnAddKeywordPair: box=[w:${Math.round(addPairBox?.width || 0)}, h:${Math.round(addPairBox?.height || 0)}] -> ${addPassed ? 'PASSED' : 'FAILED'} (rows: ${initialRows} -> ${afterAddRows})`);

    // Test small button: .btn-kb-remove (last row)
    const removeBtn = page.locator('#keywordPairsList .kb-row .btn-kb-remove').last();
    const removeBox = await removeBtn.boundingBox();
    await removeBtn.click();
    await page.waitForTimeout(300);
    const afterRemoveRows = await page.locator('#keywordPairsList .kb-row').count();
    const removePassed = afterRemoveRows === initialRows;
    console.log(`  Small Button .btn-kb-remove: box=[w:${Math.round(removeBox?.width || 0)}, h:${Math.round(removeBox?.height || 0)}] -> ${removePassed ? 'PASSED' : 'FAILED'} (rows: ${afterAddRows} -> ${afterRemoveRows})`);

    // Test save button: #btnSaveBusinessSettings
    const saveBtn = page.locator('#btnSaveBusinessSettings');
    const saveBox = await saveBtn.boundingBox();
    await saveBtn.click();
    await page.waitForTimeout(500);
    const noteVisible = await page.locator('#kbSaveNotification').isVisible();
    console.log(`  Button #btnSaveBusinessSettings: box=[w:${Math.round(saveBox?.width || 0)}, h:${Math.round(saveBox?.height || 0)}] -> ${noteVisible ? 'PASSED' : 'FAILED'}`);

    // Screenshot Dashboard
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, `responsive_dashboard_${vp.name}.png`),
      fullPage: true
    });

    // ---------------- 4. ADMIN PORTAL (admin.html) ----------------
    await page.goto('http://localhost:3000/admin.html', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(800);
    const adminOverflow = await checkHorizontalOverflow(page, 'admin.html', vp.name);
    console.log(`[admin.html @ ${vp.name}] Overflow: ${adminOverflow.hasOverflow ? 'FAILED (' + adminOverflow.scrollWidth + 'px)' : 'PASSED (0px overflow)'}`);

    // Test tabs on admin
    const adminTabs = page.locator('.tab-btn');
    const tabCount = await adminTabs.count();
    for (let i = 0; i < tabCount; i++) {
      const t = adminTabs.nth(i);
      const txt = (await t.textContent()).trim();
      const b = await t.boundingBox();
      await t.click();
      console.log(`  Admin Tab "${txt}": box=[w:${Math.round(b?.width || 0)}, h:${Math.round(b?.height || 0)}] -> CLICKED`);
    }

    // Screenshot Admin
    await page.screenshot({
      path: path.join(ARTIFACTS_DIR, `responsive_admin_${vp.name}.png`),
      fullPage: false
    });

    summaryReport.push({
      name: vp.name,
      width: vp.width,
      height: vp.height,
      indexOverflow: !indexOverflow.hasOverflow,
      loginOverflow: !loginOverflow.hasOverflow,
      dashOverflow: !dashOverflow.hasOverflow,
      adminOverflow: !adminOverflow.hasOverflow,
      buttonsPassed: addPassed && removePassed && regTabActive && loginTabActive
    });

    await context.close();
    console.log('');
  }

  await browser.close();
  console.log('================ Responsive Summary Matrix ================');
  console.table(summaryReport);
})();
