const { processInboundText } = require('../server');
const fs = require('fs');
const path = require('path');

async function testGating() {
  const welcomedFile = path.join(__dirname, '..', 'data', 'welcomed_contacts.json');
  // Reset test file
  if (fs.existsSync(welcomedFile)) {
    fs.unlinkSync(welcomedFile);
  }

  const testPhone = '919876543210';

  console.log('--- Step 1: New contact sends "Hello" ---');
  let r1 = await processInboundText('Hello', testPhone, 'Test User');
  console.log('Result 1 Type:', r1.type);
  if (r1.type !== 'WELCOME_MENU') throw new Error('Expected WELCOME_MENU on step 1');

  console.log('\n--- Step 2: Same contact sends second message asking "price" ---');
  let r2 = await processInboundText('price', testPhone, 'Test User');
  console.log('Result 2 Type:', r2.type);
  console.log('Result 2 Reply:', r2.reply);
  if (r2.type === 'WELCOME_MENU') throw new Error('Should NOT be WELCOME_MENU on second message!');
  if (r2.type !== 'KEYWORD_MATCH') throw new Error('Expected KEYWORD_MATCH for price');

  console.log('\n--- Step 3: Same contact sends complicated/unrelated query ---');
  let r3 = await processInboundText('can you build a custom spaceship rocket engine?', testPhone, 'Test User');
  console.log('Result 3 Type:', r3.type);
  console.log('Result 3 Reply:', r3.reply);
  if (r3.type === 'WELCOME_MENU') throw new Error('Should NOT be WELCOME_MENU for query!');
  if (!r3.reply || !r3.reply.includes('contact you within an hour')) {
    throw new Error('Expected fallback message "within an hour"');
  }

  console.log('\n--- Step 4: Same contact sends "hi" again ---');
  let r4 = await processInboundText('hi', testPhone, 'Test User');
  console.log('Result 4 Type:', r4.type);
  if (r4.type !== 'WELCOME_MENU') throw new Error('Expected WELCOME_MENU when explicitly sending "hi"');

  console.log('\n--- Step 5: Brand new contact sends "Interested in flow" (not hi) ---');
  const newPhone = '919123456789';
  let r5 = await processInboundText('Interested in flow', newPhone, 'New User');
  console.log('Result 5 Type:', r5.type);
  if (r5.type !== 'WELCOME_MENU') throw new Error('Expected 1-time WELCOME_MENU for new contact');

  console.log('\n--- Step 6: Same new contact sends second message "demo" ---');
  let r6 = await processInboundText('demo', newPhone, 'New User');
  console.log('Result 6 Type:', r6.type);
  console.log('Result 6 Reply:', r6.reply);
  if (r6.type === 'WELCOME_MENU') throw new Error('Should NOT be WELCOME_MENU on second inquiry');

  console.log('\n🎉 ALL 6 GATING & WELCOME SCENARIOS PASSED FLAWLESSLY!');
}

testGating().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});

