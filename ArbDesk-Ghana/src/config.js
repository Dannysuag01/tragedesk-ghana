/**
 * Bot Configuration Settings
 */

export const config = {
  // Financial settings
  defaultBankroll: 100, // GHS
  minProfitMarginPct: 0.1, // Strictly positive guaranteed arbitrage profit only (> 0%)
  maxProfitMarginPct: 20.0, // Filter out erroneous/palpable odds

  // Web Dashboard
  port: process.env.PORT || 3000,

  // Telegram Notifications (Pre-configured for @Tragedeskbot)
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '9246294974:AAH7ccqkW9TcojYdL3xglta-DIRFHpX6EVA',
    chatId: process.env.TELEGRAM_CHAT_ID || '8798424158',
    minMarginPct: parseFloat(process.env.TELEGRAM_MIN_MARGIN || '0.2'), // Alert on >= 0.2% margin so actionable arbs are never missed
    enabled: true
  },

  // 3-Second Rapid Background Polling Rate for instant odds re-calculation
  pollIntervalMs: 3000
};
