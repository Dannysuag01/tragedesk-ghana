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

  // Telegram Notifications (Optional)
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN || '',
    chatId: process.env.TELEGRAM_CHAT_ID || '',
    enabled: Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID)
  },

  // 5-Second Adaptive Polling Rate
  pollIntervalMs: 5000
};
