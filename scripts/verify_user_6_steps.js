const { processInboundText, inMemoryWelcomed } = require('../server');
const fs = require('fs');
const path = require('path');

async function runExactUserScenarios() {
  console.log('========================================================================');
  console.log('🧪 VERIFYING USER EXACT 6 CONVERSATION SCENARIOS');
  console.log('========================================================================\n');

  // Clear tracking files for clean isolated test
  const DATA_DIR = path.join(__dirname, '..', 'data');
  const welcomedFile = path.join(DATA_DIR, 'welcomed_contacts.json');
  if (fs.existsSync(welcomedFile)) {
    fs.unlinkSync(welcomedFile);
  }

  const phoneA = '919555000001';
  const phoneB = '919555000002';

  // Step 1: New user sends "Hello" ➔ WELCOME_MENU (1st time)
  console.log('▶ Step 1: New user sends "Hello" ➔ WELCOME_MENU (1st time)');
  const s1 = await processInboundText('Hello', phoneA, 'User A');
  console.log('  Type:', s1.type);
  if (s1.type !== 'WELCOME_MENU') throw new Error(`Step 1 failed: expected WELCOME_MENU, got ${s1.type}`);
  console.log('  ✅ [PASS] Sent 1-time welcome message and menu.\n');

  // Step 2: Same user asks "can i have price" ➔ "price" ➔ KEYWORD_MATCH (Welcome message வரவில்லை, நேரடி விலை சென்றது)
  console.log('▶ Step 2: Same user asks "can i have price" ➔ KEYWORD_MATCH');
  const s2 = await processInboundText('can i have price', phoneA, 'User A');
  console.log('  Type:', s2.type);
  console.log('  Reply:', s2.reply);
  if (s2.type === 'WELCOME_MENU') throw new Error('Step 2 failed: Welcome message was sent again!');
  if (s2.type !== 'KEYWORD_MATCH' || !s2.reply.includes('999')) throw new Error(`Step 2 failed: expected KEYWORD_MATCH for price, got ${s2.type}`);
  console.log('  ✅ [PASS] Direct price answer delivered without welcome message.\n');

  // Step 3: Same user asks complex/unknown query ➔ 2-line team contact message சென்றது
  console.log('▶ Step 3: Same user asks complex/unknown query ➔ 2-line contact message');
  const s3 = await processInboundText('Can you cook biryani for 500 guests tomorrow?', phoneA, 'User A');
  console.log('  Type:', s3.type);
  console.log('  Reply:', s3.reply);
  if (s3.type === 'WELCOME_MENU') throw new Error('Step 3 failed: Welcome message sent on complex query!');
  if (!s3.reply.includes('within an hour')) throw new Error('Step 3 failed: expected 2-line within an hour reply');
  console.log('  ✅ [PASS] Sent concise 2-line executive contact notification.\n');

  // Step 4: Same user sends "hi" again ➔ WELCOME_MENU சென்றது
  console.log('▶ Step 4: Same user sends "hi" again ➔ WELCOME_MENU');
  const s4 = await processInboundText('hi', phoneA, 'User A');
  console.log('  Type:', s4.type);
  if (s4.type !== 'WELCOME_MENU') throw new Error(`Step 4 failed: expected WELCOME_MENU on explicit "hi", got ${s4.type}`);
  console.log('  ✅ [PASS] Sent welcome menu when explicitly prompted with "hi".\n');

  // Step 5: Another new user sends random query ➔ 1-time WELCOME_MENU சென்றது
  console.log('▶ Step 5: Another new user sends random query "is anyone there?" ➔ 1-time WELCOME_MENU');
  const s5 = await processInboundText('is anyone there?', phoneB, 'User B');
  console.log('  Type:', s5.type);
  if (s5.type !== 'WELCOME_MENU') throw new Error(`Step 5 failed: expected 1-time WELCOME_MENU for new user, got ${s5.type}`);
  console.log('  ✅ [PASS] Brand new user welcomed on first interaction.\n');

  // Step 6: Same new user sends second inquiry "i need a demo" ➔ "demo" ➔ நேரடி demo பதில் சென்றது
  console.log('▶ Step 6: Same new user sends second inquiry "i need a demo" ➔ KEYWORD_MATCH');
  const s6 = await processInboundText('i need a demo', phoneB, 'User B');
  console.log('  Type:', s6.type);
  console.log('  Reply:', s6.reply);
  if (s6.type === 'WELCOME_MENU') throw new Error('Step 6 failed: Welcome message sent on second message!');
  if (s6.type !== 'KEYWORD_MATCH' || !s6.reply.toLowerCase().includes('dashboard')) throw new Error(`Step 6 failed: expected KEYWORD_MATCH for demo, got ${s6.type}`);
  console.log('  ✅ [PASS] Direct demo answer delivered without welcome message.\n');

  console.log('========================================================================');
  console.log('🎉 ALL 6 USER STEPS VERIFIED 100% WORKING EXACTLY AS REQUESTED!');
  console.log('========================================================================');
}

runExactUserScenarios().catch(err => {
  console.error('❌ Verification failed:', err.message);
  process.exit(1);
});
