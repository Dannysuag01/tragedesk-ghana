/**
 * Telegram Bot Alert Formatter & Dispatcher
 * Formats arbitrage opportunities into clean, non-overwhelming, actionable Telegram messages.
 * Uses native Telegram HTML markup with <code> for 1-tap mobile code copying.
 */

/**
 * Escapes HTML characters for Telegram HTML mode
 * @param {string} str 
 * @returns {string}
 */
export function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Formats an arbitrage opportunity into a clean, mobile-optimized Telegram alert template
 * @param {Object} arb 
 * @param {number} [arbIndex=1]
 * @returns {string} Formatted Telegram message in HTML
 */
export function formatTelegramAlert(arb, arbIndex = 1) {
  const {
    match = {},
    market = 'Arbitrage Market',
    line,
    marginPct = 0,
    executableRoi,
    guaranteedProfit = 0,
    currency = 'GHS',
    totalStake = 100,
    legs = []
  } = arb;

  const home = escapeHtml(match.homeTeam || 'Home Team');
  const away = escapeHtml(match.awayTeam || 'Away Team');
  const comp = escapeHtml(match.competition || match.tournamentName || match.league || 'Football');
  const dateStr = escapeHtml(match.dateStr || 'Upcoming');
  const marketName = escapeHtml(market);
  const lineStr = line ? ` • <i>${escapeHtml(line)}</i>` : '';

  const roi = (executableRoi ?? marginPct).toFixed(2);
  const profit = guaranteedProfit.toFixed(2);

  const legsFormatted = legs.map((leg, idx) => {
    const bookie = escapeHtml(leg.bookmaker);
    const sel = escapeHtml(leg.selection);
    const odds = leg.odds.toFixed(2);
    const stake = (leg.stake || 0).toFixed(2);
    const stakeFirst = leg.stakeFirst ? '\n  ⚡ <b>STAKE THIS FIRST</b>' : '';

    return `• <b>${bookie}</b>: ${sel} @ <b>${odds}</b>\n  👉 Stake: <b>${currency} ${stake}</b>${stakeFirst}`;
  }).join('\n\n');

  return `🎯 <b>ARBITRAGE ALERT (+${roi}% ROI)</b>
━━━━━━━━━━━━━━━━━━━━━
⚽ <b>${home} vs ${away}</b>
🏆 <b>League:</b> ${comp}
📅 <b>Kickoff:</b> ${dateStr}
📋 <b>Market:</b> ${marketName}${lineStr}

💵 <b>Staking Plan (${currency} ${totalStake})</b>
${legsFormatted}

━━━━━━━━━━━━━━━━━━━━━
💰 <b>Guaranteed Profit: +${currency} ${profit}</b> (Risk-Free)
⚡ <i>TrageDesk Ghana • Real-Time Odds</i>`;
}

/**
 * Sends a message via Telegram Bot API using native fetch
 * @param {string} botToken - Telegram Bot Token from @BotFather
 * @param {string|number} chatId - Chat ID or Channel ID (@channelname)
 * @param {string} text - Message text formatted in HTML
 * @returns {Promise<Object>}
 */
export async function sendTelegramMessage(botToken, chatId, text) {
  if (!botToken || !chatId) {
    console.warn('[Telegram] Bot token or chatId not configured. Skipping alert delivery.');
    return { skipped: true };
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    const data = await res.json();
    if (!data.ok) {
      console.error('[Telegram] Failed to send message:', data.description);
    }
    return data;
  } catch (err) {
    console.error('[Telegram] Network error sending message:', err.message);
    return { ok: false, error: err.message };
  }
}
