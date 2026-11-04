const { runUnitTests } = require('./deep_test_unit.js');
const { runUITests } = require('./deep_test_ui.js');
const { runPerformanceTests } = require('./deep_test_performance.js');
const { runOptimisationTests } = require('./deep_test_optimisation.js');

async function runMasterSuite() {
  console.log('\n========================================================================');
  console.log('🌟 ENTERPRISE AUTOMATION FOR WHATSAPP: MASTER DEEP ANALYSIS SUITE 🌟');
  console.log('========================================================================\n');

  const startTime = Date.now();
  const summary = [];

  try {
    const resUnit = await runUnitTests();
    summary.push(resUnit);
  } catch (e) {
    summary.push({ category: 'Unit Tests', passed: 0, failed: 1, error: e.message });
  }

  try {
    const resUI = await runUITests();
    summary.push(resUI);
  } catch (e) {
    summary.push({ category: 'UI Tests', passed: 0, failed: 1, error: e.message });
  }

  try {
    const resPerf = await runPerformanceTests();
    summary.push(resPerf);
  } catch (e) {
    summary.push({ category: 'Performance Tests', passed: 0, failed: 1, error: e.message });
  }

  try {
    const resOpt = await runOptimisationTests();
    summary.push(resOpt);
  } catch (e) {
    summary.push({ category: 'Optimisation Tests', passed: 0, failed: 1, error: e.message });
  }

  const totalDuration = ((Date.now() - startTime) / 1000).toFixed(2);
  const totalPassed = summary.reduce((acc, s) => acc + s.passed, 0);
  const totalFailed = summary.reduce((acc, s) => acc + s.failed, 0);

  console.log('\n========================================================================');
  console.log('📊 MASTER EXECUTIVE DEEP ANALYSIS SUMMARY MATRIX');
  console.log('========================================================================');
  console.table(summary.map(s => ({
    'Test Category': s.category,
    'Tests Passed': s.passed,
    'Tests Failed': s.failed,
    'Status': s.failed === 0 ? '✅ 100% HEALTHY' : '❌ ATTENTION REQUIRED'
  })));

  console.log(`⏱️ Total Execution Duration: ${totalDuration}s`);
  console.log(`🎯 OVERALL SCORE: ${totalPassed} Passed, ${totalFailed} Failed (${((totalPassed / (totalPassed + totalFailed)) * 100).toFixed(1)}%)`);
  console.log('========================================================================\n');

  if (totalFailed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runMasterSuite().catch(err => {
  console.error('Master suite fatal error:', err);
  process.exit(1);
});

