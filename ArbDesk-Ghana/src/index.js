/**
 * Main Application Orchestrator
 * Starts the Ghana Arbitrage Bot, scans for opportunities,
 * serves the TrageDesk UI, and sends Telegram alerts.
 */

import { TrageDeskDetector } from './engine/detector.js';
import { formatTelegramAlert, sendTelegramMessage } from './delivery/telegram.js';
import { createTrageDeskServer } from './web/server.js';
import { config } from './config.js';
import { LiveFeedManager } from './connectors/live_manager.js';

const liveManager = new LiveFeedManager();
const bookers = liveManager.getBookers();

const detector = new TrageDeskDetector({
  minMargin: config.minProfitMarginPct,
  maxMargin: config.maxProfitMarginPct,
  defaultBankroll: config.defaultBankroll
});

export let currentOpportunities = [];
export let lastScanAt = null;
export let isScanning = false;

const SEEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
const seenArbIds = new Map();

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

    for (const feed of feeds) {
      console.log(`  [${feed.bookmaker}] ${feed.matches.length} matches loaded`);
    }

    const opps = await detector.findOpportunities(feeds, bookers);
    const now = Date.now();
    // Strictly filter for actionable profitable opportunities and stamp verification time
    const verifiedOpps = [];
    for (const arb of opps) {
      if (arb && arb.isArb && arb.marginPct >= (config.minProfitMarginPct ?? 0.1) && arb.guaranteedProfit > 0) {
        arb.verifiedAt = now;
        if (!arb.discoveredAt) arb.discoveredAt = now;
        verifiedOpps.push(arb);
      }
    }
    currentOpportunities = verifiedOpps;

    // Prune seenArbIds for opportunities that evaporated so if profitability returns, it re-alerts
    const activeIds = new Set(verifiedOpps.map(o => o.id));
    for (const [id] of seenArbIds.entries()) {
      if (!activeIds.has(id)) {
        seenArbIds.delete(id);
      }
    }

    console.log(`[ArbDetector] Found ${verifiedOpps.length} actionable arbitrage opportunities!`);

    for (let i = 0; i < verifiedOpps.length; i++) {
      const arb = verifiedOpps[i];
      console.log(`--------------------------------------------------`);
      console.log(formatTelegramAlert(arb, i + 1));

      // Send to Telegram if enabled, margin >= minMarginPct, and not already notified
      const minMargin = config.telegram.minMarginPct ?? 1.0;
      // Clean up expired entries (older than 30 mins)
      for (const [id, ts] of seenArbIds.entries()) {
        if (now - ts > SEEN_TTL_MS) seenArbIds.delete(id);
      }
      // Check if already seen within active window
      if (config.telegram.enabled && arb.marginPct >= minMargin && !seenArbIds.has(arb.id)) {
        seenArbIds.set(arb.id, now);
        await sendTelegramMessage(
          config.telegram.botToken,
          config.telegram.chatId,
          formatTelegramAlert(arb, i + 1)
        );
        // Rate-limit buffer between consecutive Telegram alerts
        await new Promise(resolve => setTimeout(resolve, 400));
      }
    }

    console.log(`--------------------------------------------------`);
    lastScanAt = Date.now();
  } catch (err) {
    console.error('[Scanner] Scan cycle error:', err.message);
    // Auto-prune stale opportunities on error (20s TTL)
    const now = Date.now();
    currentOpportunities = currentOpportunities.filter(o => 
      o && o.isArb && o.marginPct > 0 && o.guaranteedProfit > 0 && (now - (o.verifiedAt || 0) <= 20000)
    );
  } finally {
    isScanning = false;
  }
}

// 1. Start Web Dashboard immediately so host health checks pass instantly on boot
const server = createTrageDeskServer(() => currentOpportunities, config.port);
await server.start();

console.log(`
=====================================================
🚀 TrageDesk Ghana is live!
📱 Web Dashboard: http://localhost:${config.port}
💬 Telegram Alerts: ${config.telegram.enabled ? 'Enabled' : 'Disabled (Set TELEGRAM_BOT_TOKEN to activate)'}
💰 Default Bankroll: GHS ${config.defaultBankroll}
🔁 Scan Interval: every ${(config.pollIntervalMs || 5000) / 1000}s
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
    await new Promise(resolve => setTimeout(resolve, config.pollIntervalMs || 5000));
  }
}

startScanLoop();
