/**
 * Telegram Bot Alert Formatter & Dispatcher
 * Formats arbitrage opportunities into clean, actionable Telegram messages with booking codes.
 */

/**
 * Formats an arbitrage opportunity into the Telegram alert template
 * @param {Object} arb 
 * @param {number} [arbIndex=1]
 * @returns {string} Formatted Telegram message
 */
export function formatTelegramAlert(arb, arbIndex = 1) {
  const {
    match,
    market,
    line,
    comparedBookies = [],
    marginPct,
    executableRoi,
    guaranteedProfit,
    currency = 'GHS',
    legs = []
  } = arb;

  let msg = `#${arbIndex} ${match.homeTeam} vs ${match.awayTeam}\n`;
  if (match.dateStr) {
    msg += `📅 ${match.dateStr}\n`;
  }
  if (match.competition) {
    msg += `🏆 ${match.competition}\n`;
  }

  msg += `📋 Market: ${market}${line ? ` | Line: ${line}` : ''}\n`;

  if (comparedBookies && comparedBookies.length > 0) {
    msg += `🔗 ${comparedBookies.join(' vs ')}\n`;
  }

  legs.forEach(leg => {
    const stakeFirstBadge = leg.stakeFirst ? ' ✅ stake first' : '';
    const codePart = leg.code ? ` | code ${leg.code}` : '';
    msg += `  • ${leg.selection}: ${leg.odds.toFixed(2)} @ ${leg.bookmaker} → stake ${currency} ${leg.stake.toFixed(2)}${codePart}${stakeFirstBadge}\n`;
  });

  msg += `💵 Guaranteed profit: ${currency} ${guaranteedProfit.toFixed(2)} (${executableRoi.toFixed(2)}% executable ROI) | Margin: ${marginPct.toFixed(2)}%`;

  return msg;
}

/**
 * Sends a message via Telegram Bot API using native fetch
 * @param {string} botToken - Telegram Bot Token from @BotFather
 * @param {string|number} chatId - Chat ID or Channel ID (@channelname)
 * @param {string} text - Message text
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

