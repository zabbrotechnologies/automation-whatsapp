const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:3000';

async function runWelcomeMediaTests() {
  console.log('========================================================================');
  console.log('🚀 TESTING WELCOME GREETING, MEDIA UPLOAD & INTERACTIVE QUESTIONS');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ [PASS] ${message}`);
      passed++;
    } else {
      console.error(`❌ [FAIL] ${message}`);
      failed++;
    }
  }

  // 1. Verify GET /api/business-settings contains welcome message, media & options
  console.log('\n--- 1. Testing GET /api/business-settings (Schema Verification) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/business-settings`);
    const data = await res.json();
    assert(res.ok && data.success, 'Fetched business settings successfully');
    assert(typeof data.settings.welcome_message === 'string' && data.settings.welcome_message.length > 5, 'Settings has welcome_message configured');
    assert(data.settings.welcome_media_url !== undefined, 'Settings has welcome_media_url field');
    assert(Array.isArray(data.settings.welcome_options) && data.settings.welcome_options.length >= 3, `Settings has ${data.settings.welcome_options?.length} interactive welcome options`);
  } catch (e) {
    assert(false, `GET /api/business-settings threw: ${e.message}`);
  }

  // 2. Test Media Upload endpoint (POST /api/upload-media)
  console.log('\n--- 2. Testing POST /api/upload-media (File Upload) ---');
  try {
    const dummyFilePath = path.join(__dirname, 'test_sample_upload.png');
    // Create a 1x1 dummy PNG if not exists
    const dummyPngBuffer = Buffer.from('89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C63000100000500010D0A2D4B0000000049454E44AE426082', 'hex');
    fs.writeFileSync(dummyFilePath, dummyPngBuffer);

    const formData = new FormData();
    const blob = new Blob([dummyPngBuffer], { type: 'image/png' });
    formData.append('mediaFile', blob, 'test_sample_upload.png');

    const uploadRes = await fetch(`${BASE_URL}/api/upload-media`, {
      method: 'POST',
      body: formData
    });
    const uploadData = await uploadRes.json();
    assert(uploadRes.ok && uploadData.success && uploadData.url.startsWith('/uploads/'), `Media uploaded successfully: ${uploadData.url}`);
    assert(uploadData.mediaType === 'image', 'Media correctly categorized as "image"');

    // Clean up temporary local upload file
    if (fs.existsSync(dummyFilePath)) fs.unlinkSync(dummyFilePath);
  } catch (e) {
    assert(false, `POST /api/upload-media threw: ${e.message}`);
  }

  // 3. Test Inbound Greeting Trigger (POST /api/simulate-reply with "Hi")
  console.log('\n--- 3. Testing Welcome Trigger with "Hi" ---');
  try {
    const res = await fetch(`${BASE_URL}/api/simulate-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: 'Hi' })
    });
    const data = await res.json();
    const r = data.result;
    assert(res.ok && data.success, 'Simulator replied to greeting');
    assert(r.type === 'WELCOME_MENU', `Trigger recognized as WELCOME_MENU (got: ${r.type})`);
    assert(r.media_url !== null, `Reply includes media attachment: ${r.media_url}`);
    assert(r.reply.includes('1️⃣') && r.reply.includes('2️⃣'), 'Reply formats numbered interactive questions for customer');
  } catch (e) {
    assert(false, `Simulator greeting threw: ${e.message}`);
  }

  // 4. Test Selecting Option 1 (POST /api/simulate-reply with "1")
  console.log('\n--- 4. Testing Option Selection with "1" ---');
  try {
    const res = await fetch(`${BASE_URL}/api/simulate-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '1' })
    });
    const data = await res.json();
    const r = data.result;
    assert(r.type === 'OPTION_SELECTION', `Selecting "1" routed to OPTION_SELECTION (got: ${r.type})`);
    assert(r.reply.includes('₹999/month') || r.reply.includes('packages'), `Delivered Option 1 pricing answer: "${r.reply.slice(0, 45)}..."`);
  } catch (e) {
    assert(false, `Option 1 selection threw: ${e.message}`);
  }

  // 5. Test Selecting Option 4 (POST /api/simulate-reply with "4") -> Human Escalation
  console.log('\n--- 5. Testing Option Selection with "4" (Escalation) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/simulate-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '4' })
    });
    const data = await res.json();
    const r = data.result;
    assert(r.type === 'ESCALATION', `Selecting Option 4 routed to ESCALATION (got: ${r.type})`);
    assert(r.explanation.includes('Human takeover'), 'Alerts live executive when user requests support option');
  } catch (e) {
    assert(false, `Option 4 selection threw: ${e.message}`);
  }

  // 6. Playwright Browser E2E Test
  console.log('\n--- 6. Testing Dashboard UI with Playwright Browser ---');
  try {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    // Authenticate first
    console.log('Logging in at http://localhost:3000/login.html ...');
    await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });
    await page.fill('#loginEmail', 'admin@flow.local');
    await page.fill('#loginPassword', 'admin123');
    await page.click('#btnLoginSubmit');
    await page.waitForURL('**/admin.html', { timeout: 10000 });

    console.log('Navigating to http://localhost:3000/dashboard.html ...');
    await page.goto(`${BASE_URL}/dashboard.html`, { waitUntil: 'networkidle' });

    // Verify Welcome Greeting input is present and has text
    await page.waitForSelector('#kbWelcomeMessage', { timeout: 8000 });
    const welcomeVal = await page.locator('#kbWelcomeMessage').inputValue();
    assert(welcomeVal.length > 5, `Welcome greeting input populated with: "${welcomeVal.slice(0, 35)}..."`);

    // Verify Media Preview card is displayed with thumbnail
    const isMediaCardVisible = await page.locator('#mediaPreviewCard').isVisible();
    assert(isMediaCardVisible, 'Media attachment preview card is visible in Business Knowledge Base');

    // Verify Welcome Options rows rendered
    const optRowsCount = await page.locator('#welcomeOptionsList .kb-opt-row').count();
    assert(optRowsCount >= 3, `Rendered ${optRowsCount} interactive option rows`);

    // Test Simulator with "Hi"
    const simInput = page.locator('#simQueryInput');
    const btnSim = page.locator('#btnRunSimulator');
    await simInput.fill('Hi');
    await btnSim.click();

    // Wait for Simulator response bubble with media preview
    await page.waitForSelector('#simMediaPreview:not([style*="display: none"])', { timeout: 10000 });
    const simMediaVisible = await page.locator('#simMediaPreview').isVisible();
    assert(simMediaVisible, 'Simulator rendered media preview inside bot response bubble');

    // Wait for option pills in simulator
    await page.waitForSelector('#simOptionsContainer .sim-opt-pill', { timeout: 10000 });
    const pillCount = await page.locator('#simOptionsContainer .sim-opt-pill').count();
    assert(pillCount >= 3, `Simulator generated ${pillCount} interactive option buttons for customer`);

    // Click Option 1 pill in simulator
    const pill1 = page.locator('#simOptionsContainer .sim-opt-pill').first();
    await pill1.click();
    await page.waitForTimeout(1000);

    const botText = await page.locator('#simBotText').textContent();
    assert(botText.includes('₹999/month') || botText.includes('packages'), `Clicking interactive option pill delivered response: "${botText.slice(0, 45)}..."`);

    // Take screenshot artifact
    const screenshotPath = path.join(__dirname, '..', 'welcome_media_options_verified.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);

    const artifactDir = 'C:\\Users\\Gowshigan\\.gemini\\antigravity\\brain\\5adaf225-5f4e-4fe6-9256-39c072c34b7f';
    if (fs.existsSync(artifactDir)) {
      fs.copyFileSync(screenshotPath, path.join(artifactDir, 'welcome_media_options_verified.png'));
      console.log('📸 Copied screenshot to conversation artifacts.');
    }

    await browser.close();
    assert(true, 'Playwright end-to-end UI verification passed cleanly');
  } catch (e) {
    assert(false, `Playwright test threw: ${e.message}`);
  }

  console.log('\n========================================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('========================================================================');

  if (failed > 0) process.exit(1);
  else process.exit(0);
}

runWelcomeMediaTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
