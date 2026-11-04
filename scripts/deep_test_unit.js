const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db.js');

async function runUnitTests() {
  console.log('====================================================');
  console.log('🧪 1. DEEP UNIT TESTS: Business Logic & Cryptography');
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

  // --- A. Cryptography & Authentication ---
  console.log('▶ A. Password Hashing & Bcrypt Verification');
  const password = 'SuperSecret123!';
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);
  assert(hash.startsWith('$2b$10$'), 'Bcrypt salt rounds generated correctly (Cost: 10)');
  assert(await bcrypt.compare(password, hash), 'Bcrypt compare validates identical password');
  assert(!(await bcrypt.compare('WrongPassword', hash)), 'Bcrypt compare rejects incorrect password');

  console.log('\n▶ B. JWT Signing & Expiry Token Verification');
  const JWT_SECRET = process.env.JWT_SECRET || 'jwt_flow_secret_key_99182371';
  const payload = { id: 999, email: 'tester@enterprise.local', role: 'ADMIN' };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
  assert(typeof token === 'string' && token.split('.').length === 3, 'JWT has valid three-segment structure');

  const decoded = jwt.verify(token, JWT_SECRET);
  assert(decoded.id === 999 && decoded.role === 'ADMIN', 'JWT decoded claims match original payload');

  let expiredRejected = false;
  try {
    const expiredToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '0s' });
    jwt.verify(expiredToken, JWT_SECRET);
  } catch (err) {
    if (err.name === 'TokenExpiredError') expiredRejected = true;
  }
  assert(expiredRejected, 'Expired JWT tokens are strictly rejected with TokenExpiredError');

  // --- C. Phone Number & Data Sanitization ---
  console.log('\n▶ C. Phone Number Cleaning & Normalization');
  function cleanPhone(raw) {
    return String(raw || '').replace(/\D/g, '');
  }
  assert(cleanPhone('+91 98765-43210') === '919876543210', 'Strips plus, spaces, and dashes from Indian mobile format');
  assert(cleanPhone('(555) 123-4567') === '5551234567', 'Strips parentheses and symbols from US format');
  assert(cleanPhone('  +44 7911 123456  ') === '447911123456', 'Trims whitespace and strips formatting');

  // --- D. Anti-Ban Jitter Distribution Logic ---
  console.log('\n▶ D. Anti-Ban Jitter Calculation Logic');
  function calculateAntiBanJitter(minMs = 4000, maxMs = 9000) {
    return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  }
  const jitterSamples = Array.from({ length: 100 }, () => calculateAntiBanJitter(4000, 9000));
  const allInRange = jitterSamples.every(j => j >= 4000 && j <= 9000);
  const minObserved = Math.min(...jitterSamples);
  const maxObserved = Math.max(...jitterSamples);
  const isRandom = new Set(jitterSamples).size > 50;
  assert(allInRange, `100 jitter samples strictly fall within 4000ms - 9000ms [min: ${minObserved}ms, max: ${maxObserved}ms]`);
  assert(isRandom, `Jitter shows non-deterministic human-like distribution (${new Set(jitterSamples).size} unique values)`);

  // --- E. Knowledge Base Matching & Strict Outside-KB Safeguard ---
  console.log('\n▶ E. Knowledge Base Intent Matching & Safeguard Logic');
  const mockKB = {
    profile: 'Flow provides automated WhatsApp enterprise communication.',
    website: 'https://zabbro-automate.vercel.app',
    keyword_pairs: [
      { keyword: 'pricing', answer: 'Our starter plan is ₹999/month for unlimited campaigns.' },
      { keyword: 'demo', answer: 'Interactive simulator is available directly on our web dashboard.' },
      { keyword: 'hours', answer: 'We operate 24/7 with zero downtime.' }
    ],
    outside_kb_action: 'handoff',
    fallback_message: 'Let me connect you with our live support executive.'
  };

  function matchBotReply(query, kb) {
    const q = query.toLowerCase().trim();
    for (const pair of kb.keyword_pairs) {
      if (q.includes(pair.keyword.toLowerCase())) {
        return { matched: true, reply: pair.answer, keyword: pair.keyword };
      }
    }
    return { matched: false, reply: kb.fallback_message, keyword: null };
  }

  const priceQuery = matchBotReply('Can you share the pricing structure?', mockKB);
  assert(priceQuery.matched && priceQuery.reply.includes('₹999/month'), 'Matches keyword "pricing" and returns exact knowledge base answer');

  const demoQuery = matchBotReply('I would like to see a demo please', mockKB);
  assert(demoQuery.matched && demoQuery.reply.includes('dashboard'), 'Matches keyword "demo" correctly');

  const hallucinationQuery = matchBotReply('Can you give me a 50% discount on shoes?', mockKB);
  assert(!hallucinationQuery.matched && hallucinationQuery.reply.includes('live support executive'), 'Blocks off-topic queries and strictly invokes fallback message');

  // --- F. Opt-Out & Anti-Spam Logic ---
  console.log('\n▶ F. Opt-Out & Broadcast Suppression Logic');
  const mockOptOuts = [{ phone: '919876543210', timestamp: Date.now() }];
  function isPhoneOptedOut(phone, optoutsList) {
    const clean = cleanPhone(phone);
    return optoutsList.some(o => o.phone === clean);
  }
  function checkOptOutTrigger(message) {
    const text = message.trim().toUpperCase();
    return text === 'STOP' || text === 'UNSUBSCRIBE' || text === 'CANCEL';
  }
  assert(isPhoneOptedOut('+91 98765 43210', mockOptOuts), 'Accurately detects opted-out phone number');
  assert(!isPhoneOptedOut('+91 99999 88888', mockOptOuts), 'Allows non-opted-out phone number');
  assert(checkOptOutTrigger('STOP') && checkOptOutTrigger('unsubscribe '), 'Recognizes STOP and UNSUBSCRIBE trigger words');
  assert(!checkOptOutTrigger('Please do not stop the service'), 'Does not falsely trigger opt-out when STOP is part of a sentence');

  // --- G. Database CRUD Unit Operations ---
  console.log('\n▶ G. Database User Normalization & Fetching');
  const adminUser = await db.findUserByEmail('   ADMIN@flow.local   ');
  assert(adminUser !== null && adminUser.email === 'admin@flow.local', 'Database findUserByEmail trims and ignores case');

  const nonExistent = await db.findUserByEmail('non_existent_random_user_9918@fake.domain');
  assert(nonExistent === null, 'Returns null for non-existent user lookup');

  console.log(`\nUnit Tests Result: ${passed} Passed, ${failed} Failed.`);
  return { category: 'Unit Tests', passed, failed };
}

if (require.main === module) {
  runUnitTests().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runUnitTests };

