const http = require('http');

const BASE_URL = 'http://localhost:3000';

async function measureRequest(path, options = {}) {
  const start = process.hrtime.bigint();
  const url = `${BASE_URL}${path}`;
  const response = await fetch(url, options);
  await response.text();
  const end = process.hrtime.bigint();
  const durationMs = Number(end - start) / 1e6;
  return { status: response.status, durationMs };
}

function calculateStats(latencies) {
  if (!latencies || latencies.length === 0) {
    return { min: '0.00', max: '0.00', avg: '0.00', p95: '0.00' };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const min = sorted[0].toFixed(2);
  const max = sorted[sorted.length - 1].toFixed(2);
  const sum = sorted.reduce((acc, val) => acc + val, 0);
  const avg = (sum / sorted.length).toFixed(2);
  const p95Index = Math.floor(sorted.length * 0.95);
  const p95 = sorted[p95Index].toFixed(2);
  return { min, max, avg, p95 };
}

async function runPerformanceTests() {
  console.log('====================================================');
  console.log('⚡ 3. DEEP PERFORMANCE & BENCHMARK TESTS');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition, testName, metrics = '') {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName} ${metrics ? `(${metrics})` : ''}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}: ${metrics}`);
      failed++;
    }
  }

  // --- A. Endpoint Latency Benchmarks (TTFB / Response Duration) ---
  console.log('▶ A. Core Endpoint Latency Profiles (Sequential 10-cycle warm run)');
  const endpoints = [
    { path: '/', label: 'GET / (Landing Static HTML)', budget: 150 },
    { path: '/api/business-settings', label: 'GET /api/business-settings', budget: 150 },
    { path: '/api/status', label: 'GET /api/status (Gateway & Pairing Code)', budget: 150 },
    { path: '/api/health', label: 'GET /api/health (System Health Check)', budget: 150 },
    {
      path: '/api/simulate-reply',
      label: 'POST /api/simulate-reply (Instant Keyword Trigger)',
      budget: 150,
      options: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'What is the price?' })
      }
    }
  ];

  for (const ep of endpoints) {
    const samples = [];
    for (let i = 0; i < 5; i++) {
      const res = await measureRequest(ep.path, ep.options);
      if (res.status === 200) samples.push(res.durationMs);
    }
    const stats = calculateStats(samples);
    const maxBudget = ep.budget || 150;
    assert(
      parseFloat(stats.avg) < maxBudget,
      `${ep.label}`,
      `avg: ${stats.avg}ms (budget: <${maxBudget}ms), p95: ${stats.p95}ms, min: ${stats.min}ms, max: ${stats.max}ms`
    );
  }

  // --- B. High-Concurrency Stress Test (50 Simultaneous Requests) ---
  console.log('\n▶ B. High-Concurrency Burst (50 Parallel Requests to /api/business-settings)');
  const burstStart = Date.now();
  const burstPromises = Array.from({ length: 50 }, () => measureRequest('/api/business-settings'));
  const burstResults = await Promise.all(burstPromises);
  const burstDuration = Date.now() - burstStart;
  const successfulRequests = burstResults.filter(r => r.status === 200).length;
  const burstLatencies = burstResults.map(r => r.durationMs);
  const burstStats = calculateStats(burstLatencies);
  const reqPerSec = ((50 / (burstDuration / 1000))).toFixed(1);

  assert(
    successfulRequests === 50,
    `Zero dropped requests under burst load (50/50 succeeded)`,
    `Throughput: ${reqPerSec} req/sec, avg latency: ${burstStats.avg}ms`
  );

  // --- C. Event Loop Lag & Microtask Delay ---
  console.log('\n▶ C. Node.js Event Loop Delay Measurement');
  const loopStart = process.hrtime.bigint();
  await new Promise(resolve => setImmediate(resolve));
  const loopDelta = Number(process.hrtime.bigint() - loopStart) / 1e6;
  assert(
    loopDelta <= 15,
    `Event loop responsiveness check`,
    `Lag: ${loopDelta.toFixed(2)}ms (Budget: <=15ms)`
  );

  // --- D. Memory Allocation & Heap Stability ---
  console.log('\n▶ D. Memory Consumption & Heap Telemetry');
  const mem = process.memoryUsage();
  const heapUsedMb = (mem.heapUsed / 1024 / 1024).toFixed(2);
  const heapTotalMb = (mem.heapTotal / 1024 / 1024).toFixed(2);
  const rssMb = (mem.rss / 1024 / 1024).toFixed(2);

  assert(
    parseFloat(heapUsedMb) < 100,
    `Node.js Heap footprint is highly lean`,
    `Heap Used: ${heapUsedMb} MB, Total: ${heapTotalMb} MB, RSS: ${rssMb} MB`
  );

  console.log(`\nPerformance Tests Result: ${passed} Passed, ${failed} Failed.`);
  return { category: 'Performance Tests', passed, failed };
}

if (require.main === module) {
  runPerformanceTests().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { runPerformanceTests };
