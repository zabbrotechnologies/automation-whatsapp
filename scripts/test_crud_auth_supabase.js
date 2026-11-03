const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE_URL = 'http://localhost:3000';

async function runTestSuite() {
  console.log('====================================================');
  console.log('🚀 SUPABASE REST CRUD & AUTH VERIFICATION TEST SUITE');
  console.log('====================================================\n');

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

  // 1. Test Admin Login (POST /api/auth/login)
  console.log('\n--- 1. Testing POST /api/auth/login (Admin) ---');
  let adminCookie = '';
  let adminToken = '';
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@flow.local', password: 'admin123' })
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      adminCookie = setCookie.split(';')[0];
    }
    const data = await res.json();
    assert(res.ok && data.success && data.user.role === 'ADMIN', 'Admin login successful and role is ADMIN');
  } catch (e) {
    assert(false, `Admin login threw: ${e.message}`);
  }

  // 2. Test User Login for existing Supabase user: zabbrotechnologies@gmail.com
  console.log('\n--- 2. Testing POST /api/auth/login (Existing Supabase User: zabbrotechnologies@gmail.com) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'zabbrotechnologies@gmail.com', password: '123456' })
    });
    const data = await res.json();
    assert(res.ok && data.success && data.user.email === 'zabbrotechnologies@gmail.com', 'Supabase user zabbrotechnologies@gmail.com authenticated successfully');
  } catch (e) {
    assert(false, `Supabase user login threw: ${e.message}`);
  }

  // 3. Test Registration (POST /api/auth/register)
  console.log('\n--- 3. Testing POST /api/auth/register (Create new user in Supabase) ---');
  const testEmail = `test_crud_${Date.now()}@flow.local`;
  let testUserId = null;
  let testUserCookie = '';
  try {
    const res = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Playwright Test User', email: testEmail, password: 'testPassword123' })
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) {
      testUserCookie = setCookie.split(';')[0];
    }
    const data = await res.json();
    if (res.ok && data.success && data.user.id) {
      testUserId = data.user.id;
      assert(true, `New user registered in Supabase with ID: #${testUserId} (${testEmail})`);
    } else {
      assert(false, `Registration failed: ${JSON.stringify(data)}`);
    }
  } catch (e) {
    assert(false, `Registration threw: ${e.message}`);
  }

  // 4. Test GET /api/auth/me (Fetch Authenticated User Profile)
  console.log('\n--- 4. Testing GET /api/auth/me (Fetch profile) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/auth/me`, {
      headers: { Cookie: testUserCookie }
    });
    const data = await res.json();
    assert(res.ok && data.success && data.user.email === testEmail, `GET /api/auth/me fetched user #${testUserId}`);
  } catch (e) {
    assert(false, `GET /api/auth/me threw: ${e.message}`);
  }

  // 5. Test GET /api/admin/users (Fetch all users from Supabase)
  console.log('\n--- 5. Testing GET /api/admin/users (Admin fetch all users) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/admin/users`, {
      headers: { Cookie: adminCookie }
    });
    const data = await res.json();
    const foundTestUser = data.users.some(u => u.id === testUserId || u.email === testEmail);
    assert(res.ok && data.success && Array.isArray(data.users) && foundTestUser, `GET /api/admin/users returned ${data.totalUsers} users including test user #${testUserId}`);
  } catch (e) {
    assert(false, `GET /api/admin/users threw: ${e.message}`);
  }

  // 6. Test GET /api/admin/users/:id (Fetch single user)
  console.log('\n--- 6. Testing GET /api/admin/users/:id (Single user) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/admin/users/${testUserId}`, {
      headers: { Cookie: adminCookie }
    });
    const data = await res.json();
    assert(res.ok && data.success && data.user.id === testUserId, `GET /api/admin/users/${testUserId} fetched user data correctly`);
  } catch (e) {
    assert(false, `GET /api/admin/users/:id threw: ${e.message}`);
  }

  // 7. Test PUT /api/admin/user-status (Suspend user)
  console.log('\n--- 7. Testing PUT /api/admin/user-status (Suspend user) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/admin/user-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ userId: testUserId, status: 'SUSPENDED' })
    });
    const data = await res.json();
    assert(res.ok && data.success, `PUT /api/admin/user-status suspended user #${testUserId}`);

    // Verify suspended user cannot log in
    const loginAttempt = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: testEmail, password: 'testPassword123' })
    });
    const loginData = await loginAttempt.json();
    assert(loginAttempt.status === 403 && loginData.error.includes('suspended'), 'Suspended user login rejected with 403 Forbidden');
  } catch (e) {
    assert(false, `PUT /api/admin/user-status threw: ${e.message}`);
  }

  // 8. Test PUT /api/admin/users/:id (Update user role & name & status back to ACTIVE)
  console.log('\n--- 8. Testing PUT /api/admin/users/:id (Update role and details) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/admin/users/${testUserId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Cookie: adminCookie },
      body: JSON.stringify({ name: 'Playwright Updated Name', role: 'ADMIN', status: 'ACTIVE' })
    });
    const data = await res.json();
    assert(res.ok && data.success && data.user.name === 'Playwright Updated Name' && data.user.role === 'ADMIN' && data.user.status === 'ACTIVE', `PUT /api/admin/users/${testUserId} updated name, role to ADMIN, status to ACTIVE`);
  } catch (e) {
    assert(false, `PUT /api/admin/users/:id threw: ${e.message}`);
  }

  // 9. Test DELETE /api/admin/users/:id (Delete user)
  console.log('\n--- 9. Testing DELETE /api/admin/users/:id (Delete user) ---');
  try {
    const res = await fetch(`${BASE_URL}/api/admin/users/${testUserId}`, {
      method: 'DELETE',
      headers: { Cookie: adminCookie }
    });
    const data = await res.json();
    assert(res.ok && data.success, `DELETE /api/admin/users/${testUserId} successfully deleted test user`);

    // Verify user is no longer in db
    const checkRes = await fetch(`${BASE_URL}/api/admin/users/${testUserId}`, {
      headers: { Cookie: adminCookie }
    });
    assert(checkRes.status === 404, `User #${testUserId} confirmed deleted (returns 404)`);
  } catch (e) {
    assert(false, `DELETE /api/admin/users/:id threw: ${e.message}`);
  }

  // 10. Playwright Browser Automation Test (Login -> Admin Dashboard -> Actions)
  console.log('\n--- 10. Testing Browser Flow with Playwright ---');
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

    console.log('Navigating to http://localhost:3000/login.html ...');
    await page.goto(`${BASE_URL}/login.html`, { waitUntil: 'networkidle' });

    // Fill login form
    await page.fill('#loginEmail', 'admin@flow.local');
    await page.fill('#loginPassword', 'admin123');
    await page.click('#btnLoginSubmit');

    // Wait for redirect to admin.html
    await page.waitForURL('**/admin.html', { timeout: 10000 });
    assert(page.url().includes('admin.html'), 'Playwright browser successfully logged in and redirected to admin.html');

    // Wait for users table to populate
    await page.waitForSelector('#usersTableBody tr td strong', { timeout: 10000 });
    const rowCount = await page.locator('#usersTableBody tr').count();
    assert(rowCount >= 10, `Playwright confirmed ${rowCount} user rows loaded in admin table`);

    // Take screenshot artifact
    const screenshotPath = path.join(__dirname, '..', 'supabase_admin_crud_verified.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Playwright screenshot saved: ${screenshotPath}`);

    // Check that artifact directory exists and copy screenshot there
    const artifactDir = process.env.ARTIFACT_DIR || 'C:\\Users\\Gowshigan\\.gemini\\antigravity\\brain\\5adaf225-5f4e-4fe6-9256-39c072c34b7f';
    if (fs.existsSync(artifactDir)) {
      fs.copyFileSync(screenshotPath, path.join(artifactDir, 'supabase_admin_crud_verified.png'));
      console.log(`📸 Screenshot copied to artifact directory.`);
    }

    await browser.close();
    assert(true, 'Playwright browser automation verification completed cleanly');
  } catch (e) {
    assert(false, `Playwright browser automation threw: ${e.message}`);
  }

  console.log('\n====================================================');
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log('====================================================');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite uncaught error:', err);
  process.exit(1);
});
