# ArbDesk Ghana 🇬🇭 - Sports Betting Arbitrage & Booking Code Bot

An automated sports betting arbitrage bot and live dashboard tailored for the Ghanaian betting market (**SportyBet**, **Soccabet**, **Betpawa Ghana**, **Betway Ghana**, and **Boltbet**).

It finds risk-free arbitrage opportunities across bookmakers, calculates guaranteed profit and exact stakes, assigns **"Stake First"** priority to vulnerable legs, and automatically generates **ready-to-use booking codes**.

---

## 📸 Key Features

1. **Ghana Bookmaker Focus**: Connectors tailored for SportyBet, Soccabet, Betpawa, Betway, and Boltbet.
2. **Instant Booking Codes**: Directly interfaces with bookmaker betslip APIs so you can copy and place bets in under 15 seconds before odds move.
3. **"Stake First" Smart Execution**: Automatically flags the leg with the highest odds/volatility with `✅ stake first` so you don't get trapped if odds shift mid-placement.
4. **Dynamic Staking**: Adjust your bankroll (e.g. GHS 50, 100, 200, 500) and all stakes, payouts, and profits recalculate in real-time.
5. **Two-Way Delivery**:
   - **ArbDesk Mobile & Desktop Web App** (`http://localhost:3000`)
   - **Automated Telegram Bot Alerts** with 1-click formatted copy

---

## 🚀 Quick Start

### 1. Run the Bot & Web Dashboard
```bash
cd "C:\Users\DANNY\.gemini\antigravity\scratch\ghana-arb-bot"
node src/index.js
```
Open [http://localhost:3000](http://localhost:3000) in your browser or phone.

### 2. Run the Verification Tests
```bash
node --test test/*.test.js
```

---

## 💬 Setting Up Telegram Alerts (Optional)

1. Open Telegram and search for `@BotFather`.
2. Type `/newbot` and follow the prompts to get your **Bot Token**.
3. Send a message to your bot or create a channel/group.
4. Add your credentials to `src/config.js` or set environment variables:
   ```env
   TELEGRAM_BOT_TOKEN="123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ"
   TELEGRAM_CHAT_ID="your_chat_or_channel_id"
   ```
5. When the bot discovers an arb, you'll receive real-time alerts formatted like:
   ```text
   #1 South Africa vs Kenya
   📅 13 Nov 16:00
   🏆 Africa Cup Of Nations Qualification
   📋 Market: 1X2 + Handicap 3-Way | Line: 0:1
   🔗 Soccabet vs Betpawa Ghana
     • Home: 1.38 @ Betpawa Ghana → stake GHS 75.27 | code V04D9OZ
     • Away(0:1): 4.20 @ Soccabet → stake GHS 24.73 | code E8P-743-7 ✅ stake first
   💵 Guaranteed profit: GHS 3.86 (3.86% executable ROI) | Margin: 3.73%
   ```

---

## 🛠 Project Structure

```text
ghana-arb-bot/
├── src/
│   ├── config.js               # Bankroll, profit thresholds, Telegram tokens
│   ├── index.js                # App entrypoint and scanner runner
│   ├── engine/
│   │   ├── calculator.js       # 2-way & 3-way arb math, pesewa flooring, stakes
│   │   ├── normalizer.js       # Team name fuzzy matching & fixture grouping
│   │   └── detector.js         # Cross-bookmaker scanner & code attacher
│   ├── connectors/
│   │   ├── base.js             # Base bookmaker interface
│   │   ├── bookers.js          # SportyBet, Soccabet, Betpawa & Boltbet APIs
│   │   └── sample_data.js      # Feeds matching Ghana fixtures
│   ├── delivery/
│   │   └── telegram.js         # Formats & sends alerts
│   └── web/
│       ├── server.js           # Native Node.js HTTP server
│       └── public/
│           ├── index.html      # ArbDesk responsive dashboard
│           └── app.js          # Live stake updater, calculator & copy buttons
└── test/
    ├── calculator.test.js      # Verifies math against real screenshots & tips
    └── normalizer.test.js      # Verifies team normalization
```

