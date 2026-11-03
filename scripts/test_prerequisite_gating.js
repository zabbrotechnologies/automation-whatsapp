const { chromium } = require('playwright');

async function runPrerequisiteGatingTest() {
  console.log('🧪 Starting Business Data Prerequisite Gating Verification...');

  // Step 1: Direct API Validation test
  console.log('\n--- 1. Testing Backend API Gating (/api/business-settings) ---');
  
  // Test rejecting auto_reply_enabled=true when knowledge is empty
  const rejectRes = await fetch('http://localhost:3000/api/business-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_profile: '',
      website_url: '',
      keyword_pairs: [],
      auto_reply_enabled: true
    })
  });

  const rejectData = await rejectRes.json();
  console.log('Empty Data Submission Response Status:', rejectRes.status);
  console.log('Empty Data Submission Response Body:', rejectData);

  if (rejectRes.status === 400 && rejectData.error && rejectData.error.includes('Setup Required')) {
    console.log('✅ Backend API successfully blocked turning auto_reply ON without business data.');
  } else {
    throw new Error(`Backend API failed to reject unconfigured auto_reply: ${JSON.stringify(rejectData)}`);
  }

  // Restore valid data for UI testing
  const validProfile = 'Flow provides automated WhatsApp communication engineered for enterprise precision. Broadcast personalized campaigns directly from public Google Sheets.';
  const restoreRes = await fetch('http://localhost:3000/api/business-settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      business_profile: validProfile,
      website_url: 'https://zabbro-automate.vercel.app',
      keyword_pairs: [
        { keyword: 'price', answer: 'Our packages start at ₹999/month for unlimited campaigns.' }
      ],
      auto_reply_enabled: true
    })
  });
  const restoreData = await restoreRes.json();
  if (!restoreData.success) {
    throw new Error('Failed to restore valid business data');
  }
  console.log('✅ Valid business data restored for UI testing.');

  // Step 2: Browser UI Testing with Playwright
  console.log('\n--- 2. Testing Browser UI Prerequisite Enforcement ---');
  const jwt = require('jsonwebtoken');
  const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt_flow_key_99182371';
  const authToken = jwt.sign(
    { id: 1, email: 'admin@flow.local', name: 'Test User', role: 'USER' },
    JWT_SECRET,
    { expiresIn: '1d' }
  );

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addCookies([{
    name: 'flow_auth_token',
    value: authToken,
    domain: 'localhost',
    path: '/'
  }]);

  const page = await context.newPage();
  await page.goto('http://localhost:3000/dashboard.html');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForSelector('#autoReplyStatusBadge', { timeout: 10000 });

  // Verify initial state with valid data
  const statusBadge = await page.locator('#autoReplyStatusBadge');
  const badgeText = await statusBadge.innerText();
  console.log('Initial Status Badge text:', badgeText);
  if (!badgeText.includes('Ready')) {
    throw new Error(`Expected badge to say Ready, got: "${badgeText}"`);
  }
  console.log('✅ Status Badge shows "Ready" when business data is configured.');

  // Clear business profile and keyword pairs to simulate unconfigured user
  console.log('Simulating unconfigured user: clearing profile and keyword pairs in UI...');
  await page.fill('#kbBusinessProfile', '');
  
  // Remove keyword pairs
  const removeButtons = await page.locator('.btn-kb-remove').all();
  for (const btn of removeButtons) {
    await btn.click();
    await page.waitForTimeout(100);
  }

  // Trigger input change
  await page.evaluate(() => {
    document.getElementById('kbBusinessProfile').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(300);

  // Check that badge changed to "Requires Setup"
  const updatedBadgeText = await page.locator('#autoReplyStatusBadge').innerText();
  console.log('Updated Status Badge text (after clearing):', updatedBadgeText);
  if (!updatedBadgeText.includes('Requires Setup')) {
    throw new Error(`Expected badge to say "Requires Setup", got: "${updatedBadgeText}"`);
  }
  console.log('✅ Status Badge dynamically updated to "Requires Setup".');

  // Check that prerequisite banner is visible
  const bannerVisible = await page.locator('#kbPrerequisiteNotice').isVisible();
  console.log('Prerequisite Notice Banner visible:', bannerVisible);
  if (!bannerVisible) {
    throw new Error('Expected #kbPrerequisiteNotice to be visible when unconfigured');
  }
  console.log('✅ Prerequisite Notice Banner is visible.');

  // Attempt to toggle Auto Reply switch ON while unconfigured
  console.log('Attempting to turn Auto Reply toggle ON while unconfigured...');
  await page.locator('#toggleAutoReplyLabel').click();
  await page.waitForTimeout(400);

  // Verify switch stayed unchecked
  const isChecked = await page.locator('#toggleAutoReply').isChecked();
  console.log('Toggle switch checked state after attempt:', isChecked);
  if (isChecked) {
    throw new Error('Toggle switch should have been reverted to unchecked!');
  }
  console.log('✅ Toggle switch was prevented and remained OFF.');

  // Verify toast notification appeared
  const toastVisible = await page.locator('.global-toast.visible').isVisible();
  const toastText = await page.locator('.global-toast').innerText();
  console.log('Toast notification text:', toastText);
  if (!toastVisible || !toastText.includes('Setup Required')) {
    throw new Error(`Expected Setup Required toast, got: "${toastText}" (visible: ${toastVisible})`);
  }
  console.log('✅ Friendly Toast notification appeared warning user of setup requirement.');

  // Re-enter data and verify it unlocks
  console.log('Re-entering business data in UI...');
  await page.fill('#kbBusinessProfile', 'My Awesome Business provides real-time automated customer support for retail stores.');
  await page.evaluate(() => {
    document.getElementById('kbBusinessProfile').dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.waitForTimeout(300);

  const restoredBadgeText = await page.locator('#autoReplyStatusBadge').innerText();
  console.log('Badge text after re-entering profile:', restoredBadgeText);
  if (!restoredBadgeText.includes('Ready')) {
    throw new Error(`Expected badge to return to Ready, got: "${restoredBadgeText}"`);
  }
  console.log('✅ Badge dynamically returned to "Ready" once customer entered their business profile.');

  // Save business settings
  await page.click('#btnSaveBusinessSettings');
  await page.waitForTimeout(600);
  const saveNotif = await page.locator('#kbSaveNotification').innerText();
  console.log('Save notification text:', saveNotif);
  if (!saveNotif.includes('Saved Successfully')) {
    throw new Error(`Save failed: "${saveNotif}"`);
  }
  console.log('✅ Settings saved successfully.');

  // Now turning toggle ON should work
  await page.locator('#toggleAutoReplyLabel').click();
  await page.waitForTimeout(500);
  const isCheckedNow = await page.locator('#toggleAutoReply').isChecked();
  console.log('Toggle switch checked state now:', isCheckedNow);
  if (!isCheckedNow) {
    throw new Error('Toggle switch should have turned ON now that data is present!');
  }
  console.log('✅ Toggle switch successfully turns ON once data is configured.');

  // Take screenshot for artifact
  await page.screenshot({ path: 'prerequisite_gating_verified.png', fullPage: true });
  console.log('📸 Screenshot saved to prerequisite_gating_verified.png');

  await browser.close();
  console.log('\n🎉 ALL PREREQUISITE GATING TESTS PASSED PERFECTLY!');
}

runPrerequisiteGatingTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
