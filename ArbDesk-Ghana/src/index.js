/**
 * Main Application Orchestrator
 * Starts the Ghana Arbitrage Bot, scans for opportunities,
 * generates booking codes, serves the ArbDesk UI, and sends Telegram alerts.
 */

import { ArbDetector } from './engine/detector.js';
import { formatTelegramAlert, sendTelegramMessage } from './delivery/telegram.js';
import { createArbServer } from './web/server.js';
import { config } from './config.js';
import { LiveFeedManager } from './connectors/live_manager.js';

const liveManager = new LiveFeedManager();
const bookers = liveManager.getBookers();

const detector = new ArbDetector({
  minMargin: config.minProfitMarginPct,
  maxMargin: config.maxProfitMarginPct,
  defaultBankroll: config.defaultBankroll
});

let currentOpportunities = [];
const seenArbIds = new Set();

/**
 * Executes a scan cycle across Ghana sportsbooks
 */
async function runScan() {
  console.log(`\n[${new Date().toLocaleTimeString()}] 🔍 Scanning Ghanaian bookmakers for arbitrage...`);

  // Pulls real-time feeds across SportyBet, Betpawa, 1xBet, Soccabet, and Betway
  const feeds = await liveManager.getLatestFeeds();

  const opps = await detector.findOpportunities(feeds, bookers);
  currentOpportunities = opps;

  console.log(`[ArbDetector] Found ${opps.length} actionable arbitrage opportunities!`);

  for (let i = 0; i < opps.length; i++) {
    const arb = opps[i];
    console.log(`--------------------------------------------------`);
    console.log(formatTelegramAlert(arb, i + 1));

    // Send to Telegram if enabled, margin >= minMarginPct, and not already notified
    const minMargin = config.telegram.minMarginPct ?? 1.0;
    if (config.telegram.enabled && arb.marginPct >= minMargin && !seenArbIds.has(arb.id)) {
      seenArbIds.add(arb.id);
      await sendTelegramMessage(
        config.telegram.botToken,
        config.telegram.chatId,
        formatTelegramAlert(arb, i + 1)
      );
    }
  }

  // Prevent memory leak over prolonged 24/7 uptime
  if (seenArbIds.size > 500) {
    seenArbIds.clear();
  }
  console.log(`--------------------------------------------------`);
}

// Start Web Dashboard
const server = createArbServer(() => currentOpportunities, config.port);
await server.start();

// Run immediate first scan
await runScan();

// Set up periodic scanning
setInterval(runScan, config.pollIntervalMs);

console.log(`
=====================================================
🚀 TrageDesk Ghana is live!
📱 Web Dashboard: http://localhost:${config.port}
💬 Telegram Alerts: ${config.telegram.enabled ? 'Enabled' : 'Disabled (Set TELEGRAM_BOT_TOKEN to activate)'}
💰 Default Bankroll: GHS ${config.defaultBankroll}
=====================================================
`);

