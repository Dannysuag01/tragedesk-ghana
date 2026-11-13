import test from 'node:test';
import assert from 'node:assert';
import { formatTelegramAlert, escapeHtml } from '../src/delivery/telegram.js';

test('escapeHtml safely converts special HTML characters', () => {
  assert.strictEqual(escapeHtml('Arsenal & Chelsea'), 'Arsenal &amp; Chelsea');
  assert.strictEqual(escapeHtml('<script>'), '&lt;script&gt;');
  assert.strictEqual(escapeHtml(null), '');
});

test('formatTelegramAlert produces clean, readable mobile alert with 1-tap copy codes', () => {
  const sampleArb = {
    match: {
      homeTeam: 'Arsenal FC',
      awayTeam: 'Chelsea FC',
      competition: 'Premier League',
      dateStr: 'Today 19:45'
    },
    market: 'Over/Under Goals',
    line: 'Total 3.5',
    marginPct: 5.64,
    executableRoi: 5.97,
    guaranteedProfit: 5.97,
    currency: 'GHS',
    totalStake: 100,
    legs: [
      {
        bookmaker: 'Betpawa Ghana',
        selection: 'Over 3.5',
        odds: 3.50,
        stake: 30.29,
        code: 'BP-99881',
        stakeFirst: true
      },
      {
        bookmaker: 'Sportybet',
        selection: 'Under 3.5',
        odds: 1.52,
        stake: 69.71,
        code: 'ARLNN9',
        stakeFirst: false
      }
    ]
  };

  const message = formatTelegramAlert(sampleArb);

  // Assertions for clean structure without booking codes
  assert(message.includes('🎯 <b>ARBITRAGE ALERT (+5.97% ROI)</b>'));
  assert(message.includes('⚽ <b>Arsenal FC vs Chelsea FC</b>'));
  assert(message.includes('Total 3.5'));
  assert(message.includes('• <b>Betpawa Ghana</b>: Over 3.5 @ <b>3.50</b>'));
  assert(message.includes('👉 Stake: <b>GHS 30.29</b>'));
  assert(!message.includes('Booking Code')); // No booking code in telegram
  assert(message.includes('⚡ <b>STAKE THIS FIRST</b>'));
  assert(message.includes('• <b>Sportybet</b>: Under 3.5 @ <b>1.52</b>'));
  assert(message.includes('👉 Stake: <b>GHS 69.71</b>'));
  assert(message.includes('💰 <b>Guaranteed Profit: +GHS 5.97</b>'));
});

test('formatTelegramAlert produces clean leg without links or booking codes', () => {
  const sampleArb = {
    match: {
      homeTeam: 'Juventus',
      awayTeam: 'AC Milan',
      competition: 'Serie A',
      dateStr: 'Tomorrow 20:00'
    },
    market: '1X2 (Full Time)',
    marginPct: 4.20,
    guaranteedProfit: 4.20,
    currency: 'GHS',
    totalStake: 100,
    legs: [
      {
        bookmaker: 'Soccabet Ghana',
        selection: 'Home',
        odds: 2.40,
        stake: 45.00,
        code: null,
        shareUrl: 'https://www.soccabet.com/sports/search?q=Juventus'
      },
      {
        bookmaker: 'Sportybet',
        selection: 'X2',
        odds: 1.95,
        stake: 55.00,
        code: 'SB1234',
        shareUrl: null
      }
    ]
  };

  const message = formatTelegramAlert(sampleArb);
  // Ensure no betslip links or booking codes are present
  assert(!message.includes('Open Soccabet Ghana Betslip'));
  assert(!message.includes('<a href='));
  assert(!message.includes('Booking Code'));
  assert(message.includes('• <b>Soccabet Ghana</b>: Home @ <b>2.40</b>'));
  assert(message.includes('👉 Stake: <b>GHS 45.00</b>'));
  assert(message.includes('• <b>Sportybet</b>: X2 @ <b>1.95</b>'));
  assert(message.includes('👉 Stake: <b>GHS 55.00</b>'));
});
