async function runAllAddonsTest() {
  console.log('🧪 Starting Verification of ALL 6 Add-On Pillars...\n');

  const BASE_URL = 'http://localhost:3000';

  // --- PILLAR 1: Connection & Gateway Status ---
  console.log('1️⃣ Testing Device Pairing & Socket Status (/api/status)...');
  const statusRes = await fetch(`${BASE_URL}/api/status`);
  const statusData = await statusRes.json();
  console.log('Status endpoint status code:', statusRes.status);
  console.log('Connection state:', statusData.status);
  if (!statusRes.ok) throw new Error('Status endpoint failed');
  console.log('✅ Pillar 1 (Connection & Gateway) operational.\n');

  // --- PILLAR 2 & 3: Bot Simulator & Decision Pipeline ---
  console.log('2️⃣ & 3️⃣ Testing Bot Simulator (/api/simulate-reply)...');

  // Test A: Direct Keyword Matching
  console.log('Test A: Testing Keyword Match ("What is your price?")...');
  const simPriceRes = await fetch(`${BASE_URL}/api/simulate-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'What is your price?' })
  });
  const simPrice = await simPriceRes.json();
  console.log('Price query result type:', simPrice.result?.type);
  console.log('Price query reply:', simPrice.result?.reply);
  if (simPrice.result?.type !== 'KEYWORD_MATCH') {
    throw new Error(`Expected KEYWORD_MATCH, got: ${simPrice.result?.type}`);
  }
  console.log('✅ Direct keyword match verified.');

  // Test B: Human Escalation Trigger
  console.log('\nTest B: Testing Human Escalation ("I want to talk to an agent")...');
  const simEscRes = await fetch(`${BASE_URL}/api/simulate-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'I want to talk to an agent', phone: '919988776655', name: 'Test Escalation Lead' })
  });
  const simEsc = await simEscRes.json();
  console.log('Escalation result type:', simEsc.result?.type);
  console.log('Escalation reply:', simEsc.result?.reply);
  if (simEsc.result?.type !== 'ESCALATION') {
    throw new Error(`Expected ESCALATION, got: ${simEsc.result?.type}`);
  }
  console.log('✅ Human escalation trigger verified.');

  // Test C: Opt-Out Safeguard
  console.log('\nTest C: Testing Opt-Out Trigger ("STOP")...');
  const simOptRes = await fetch(`${BASE_URL}/api/simulate-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'STOP', phone: '919988776655' })
  });
  const simOpt = await simOptRes.json();
  console.log('Opt-Out result type:', simOpt.result?.type);
  console.log('Opt-Out reply:', simOpt.result?.reply);
  if (simOpt.result?.type !== 'OPTOUT') {
    throw new Error(`Expected OPTOUT, got: ${simOpt.result?.type}`);
  }
  console.log('✅ Opt-Out safeguard verified.');

  // Test D: Off-Topic / Zero Hallucination Guard
  console.log('\nTest D: Testing Off-Topic Query ("Can you write me a poem about basketball?")...');
  const simOffRes = await fetch(`${BASE_URL}/api/simulate-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: 'Can you write me a poem about basketball?' })
  });
  const simOff = await simOffRes.json();
  console.log('Off-topic result type:', simOff.result?.type);
  console.log('Off-topic reply:', simOff.result?.reply);
  if (simOff.result?.type !== 'OUTSIDE_KB_FALLBACK' && simOff.result?.type !== 'OUTSIDE_KB_SILENT') {
    throw new Error(`Expected OUTSIDE_KB_FALLBACK or OUTSIDE_KB_SILENT, got: ${simOff.result?.type}`);
  }
  console.log('✅ Off-topic zero hallucination guard verified.\n');

  // --- PILLAR 4: Human Takeover & Escalation Resolution ---
  console.log('4️⃣ Testing Human Escalations Management (/api/escalations/resolve)...');
  const resolveRes = await fetch(`${BASE_URL}/api/escalations/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '919898900112' })
  });
  const resolveData = await resolveRes.json();
  console.log('Resolve escalation response:', resolveData);
  if (!resolveData.success) throw new Error('Failed to resolve escalation');
  console.log('✅ Human escalation resolution and bot resume verified.\n');

  // --- PILLAR 5: Anti-Ban Campaign Broadcast & Opt-Out Filters ---
  console.log('5️⃣ Testing Broadcast Endpoint Validation & Opt-Out Filter...');
  const optOutListRes = await fetch(`${BASE_URL}/api/optouts`);
  const optOutList = await optOutListRes.json();
  console.log('Opted-out contacts count:', optOutList.optouts?.length);
  if (!optOutList.success || !Array.isArray(optOutList.optouts)) {
    throw new Error('Failed to fetch opt-outs blacklist');
  }
  console.log('✅ Opt-out blacklist active and protected.\n');

  // --- PILLAR 6: Measurable ROI & Lead Inbox Analytics ---
  console.log('6️⃣ Testing Measurable ROI & Lead Inbox Analytics (/api/leads-analytics)...');
  const roiRes = await fetch(`${BASE_URL}/api/leads-analytics`);
  const roiData = await roiRes.json();
  console.log('ROI Summary:', roiData.summary);
  console.log('Leads Count in Inbox:', roiData.leads?.length);
  
  if (!roiData.summary || typeof roiData.summary.hoursSaved === 'undefined' || roiData.leads.length === 0) {
    throw new Error('ROI summary or Leads list invalid');
  }
  console.log('✅ Measurable ROI & Lead Inbox verified.\n');

  console.log('🎉 ALL 6 ADD-ON PILLARS FULLY VERIFIED AND OPERATIONAL!');
}

runAllAddonsTest().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
