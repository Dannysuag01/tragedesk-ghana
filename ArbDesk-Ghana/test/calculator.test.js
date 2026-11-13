import test from 'node:test';
import assert from 'node:assert';
import { calculate2WayArbitrage, calculate3WayArbitrage } from '../src/engine/calculator.js';

test('matches screenshot: Kalamata vs AEK Athens (Soccabet 2.26 vs Boltbet 2.00)', () => {
  const result = calculate2WayArbitrage(
    2.26,
    2.00,
    100,
    { bookmaker: 'Soccabet', selection: 'Home(+1.5)', code: 'RCV-949-8' },
    { bookmaker: 'Boltbet', selection: 'Away(-1.5)', code: '03-693898' }
  );

  assert.strictEqual(result.isArb, true);
  assert.strictEqual(result.marginPct, 5.75);
  assert.strictEqual(result.roiPct, 6.10);
  assert.strictEqual(result.guaranteedProfit, 6.10);
  assert.strictEqual(result.legs[0].stake, 46.95);
  assert.strictEqual(result.legs[1].stake, 53.05);
  assert.strictEqual(result.legs[0].stakeFirst, true); // 2.26 is higher odds, stake first
});

test('matches telegram tip: South Africa vs Kenya (Betpawa 1.38 vs Soccabet 4.20)', () => {
  const result = calculate2WayArbitrage(
    1.38,
    4.20,
    100,
    { bookmaker: 'Betpawa Ghana', selection: 'Home', code: 'A1PSL5D' },
    { bookmaker: 'Soccabet', selection: 'Away(0:1)', code: 'CYO-941-2' }
  );

  assert.strictEqual(result.isArb, true);
  assert.strictEqual(result.marginPct, 3.73);
  assert.strictEqual(result.executableRoi, 3.86);
  assert.strictEqual(result.guaranteedProfit, 3.86);
  assert.strictEqual(result.legs[0].stake, 75.27);
  assert.strictEqual(result.legs[1].stake, 24.73);
  // Soccabet has higher odds (4.20), must be marked stake first
  assert.strictEqual(result.legs[1].stakeFirst, true);
});

test('returns isArb: false when sum of inverses >= 1.0', () => {
  const result = calculate2WayArbitrage(1.85, 1.85, 100);
  assert.strictEqual(result.isArb, false);
  assert.ok(result.marginPct < 0);
});

test('3-way arbitrage calculates properly', () => {
  // Typical 3-way arb: 3.20, 3.40, 3.50 -> inv sum = 0.3125 + 0.2941 + 0.2857 = 0.8923 (<1)
  const result = calculate3WayArbitrage(3.20, 3.40, 3.50, 100);
  assert.strictEqual(result.isArb, true);
  assert.ok(result.marginPct > 10);
  assert.ok(result.guaranteedProfit > 10);
});

