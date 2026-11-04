const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  processInboundText,
  getBusinessSettings,
  saveBusinessSettings,
  hasReceivedWelcome,
  markReceivedWelcome
} = require('../server');

async function testMultiTenantIsolation() {
  console.log('========================================================');
  console.log('🧪 VERIFYING MULTI-TENANT ISOLATION (USER 10 vs USER 19)');
  console.log('========================================================');

  const userA = '10'; // Adhithyan J
  const userB = '19'; // Gowshigan

  // Clean test files before running
  ['10', '19'].forEach(u => {
    const fW = path.join(__dirname, '..', 'data', 'user_welcomed', `welcomed_${u}.json`);
    if (fs.existsSync(fW)) fs.unlinkSync(fW);
  });

  // 1. Configure distinct Business Settings for User A and User B
  const settingsA = {
    ...getBusinessSettings(userA),
    business_profile: "Adhithyan Digital Agency - Web & Enterprise Bots",
    welcome_message: "Welcome to Adhithyan Digital Agency! 🚀",
    keyword_pairs: [
      { keyword: "services", answer: "Adhithyan Agency provides custom web dev and AI bots." }
    ]
  };

  const settingsB = {
    ...getBusinessSettings(userB),
    business_profile: "Gowshigan Tech Solutions - Cloud & Automation Hub",
    welcome_message: "Welcome to Gowshigan Tech Solutions! 🌟",
    keyword_pairs: [
      { keyword: "services", answer: "Gowshigan Tech delivers 24/7 cloud automations and WhatsApp hubs." }
    ]
  };

  saveBusinessSettings(settingsA, userA);
  saveBusinessSettings(settingsB, userB);

  // Read back settings to ensure isolation
  const loadedA = getBusinessSettings(userA);
  const loadedB = getBusinessSettings(userB);

  assert.strictEqual(loadedA.welcome_message, "Welcome to Adhithyan Digital Agency! 🚀");
  assert.strictEqual(loadedB.welcome_message, "Welcome to Gowshigan Tech Solutions! 🌟");
  assert.notStrictEqual(loadedA.keyword_pairs[0].answer, loadedB.keyword_pairs[0].answer);
  console.log('✅ [PASS] Business Settings are completely isolated between User 10 and User 19.');

  // 2. Inbound bot conversation simulation with tenant context
  const testCustomer = '919876500123';
  
  // Step 1: Customer messages User A (1st time -> receives User A's custom welcome message!)
  const welcomeA = await processInboundText('Hello', testCustomer, 'Client A', userA);
  assert(welcomeA.reply.includes("Welcome to Adhithyan Digital Agency! 🚀"));
  console.log('✅ [PASS] User A\'s bot welcomes client with User A\'s welcome branding.');

  // Step 2: Customer asks User A "services" (2nd message -> receives User A's keyword answer)
  const resA = await processInboundText('services', testCustomer, 'Client A', userA);
  assert.strictEqual(resA.reply, "Adhithyan Agency provides custom web dev and AI bots.");
  console.log('✅ [PASS] User A\'s bot delivers User A\'s keyword answer.');

  // Step 3: Now the SAME customer messages User B!
  // Since customer has NEVER messaged User B, they must receive User B's 1-time welcome message!
  const welcomeB = await processInboundText('Hello', testCustomer, 'Client B', userB);
  assert(welcomeB.reply.includes("Welcome to Gowshigan Tech Solutions! 🌟"));
  console.log('✅ [PASS] Same customer messaging User B gets User B\'s distinct welcome branding.');

  // Step 4: Customer asks User B "services" (2nd message on User B -> receives User B's keyword answer)
  const resB = await processInboundText('services', testCustomer, 'Client B', userB);
  assert.strictEqual(resB.reply, "Gowshigan Tech delivers 24/7 cloud automations and WhatsApp hubs.");
  console.log('✅ [PASS] User B\'s bot delivers User B\'s keyword answer.');

  // 3. Welcome message gating isolation
  const phoneX = '919111222' + Math.floor(100 + Math.random() * 900);
  assert.strictEqual(hasReceivedWelcome(phoneX, userA), false);
  assert.strictEqual(hasReceivedWelcome(phoneX, userB), false);

  // Mark welcomed on User A only
  markReceivedWelcome(phoneX, userA);
  assert.strictEqual(hasReceivedWelcome(phoneX, userA), true);
  assert.strictEqual(hasReceivedWelcome(phoneX, userB), false, "User B should NOT have phoneX welcomed!");

  console.log('✅ [PASS] Welcome gating is strictly isolated per tenant account.');
  console.log('========================================================');
  console.log('🎉 MULTI-TENANT ISOLATION VERIFIED 100% SUCCESSFUL!');
  console.log('========================================================');
}

testMultiTenantIsolation().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
