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
let isScanning = false;

/**
 * Executes a scan cycle across Ghana sportsbooks
 */
async function runScan() {
  if (isScanning) {
    console.log('[Scanner] Scan cycle already in progress, skipping overlapping run...');
    return;
  }
  isScanning = true;

  try {
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
  } catch (err) {
    console.error('[Scanner] Scan cycle error:', err.message);
  } finally {
    isScanning = false;
  }
}

// 1. Start Web Dashboard immediately so host health checks pass instantly on boot
const server = createArbServer(() => currentOpportunities, config.port);
await server.start();

console.log(`
=====================================================
🚀 TrageDesk Ghana is live!
📱 Web Dashboard: http://localhost:${config.port}
💬 Telegram Alerts: ${config.telegram.enabled ? 'Enabled' : 'Disabled (Set TELEGRAM_BOT_TOKEN to activate)'}
💰 Default Bankroll: GHS ${config.defaultBankroll}
=====================================================
`);

// 2. Continuous non-overlapping background scanner loop
async function startScanLoop() {
  while (true) {
    try {
      await runScan();
    } catch (err) {
      console.error('[Scanner] Unexpected error in scan loop:', err.message);
    }
    await new Promise(resolve => setTimeout(resolve, config.pollIntervalMs || 8000));
  }
}

startScanLoop();

