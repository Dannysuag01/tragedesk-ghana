# TrageDesk Ghana 🇬🇭 - Sports Betting Arbitrage & Execution Platform

An automated real-time multi-sport arbitrage scanner and web dashboard tailored for Ghanaian sportsbooks (**SportyBet Ghana**, **Betpawa Ghana**, **1xBet Ghana**, **Soccabet Ghana**, and **Betway Ghana**).

TrageDesk detects risk-free arbitrage opportunities across bookmakers with identical rules, calculates guaranteed net profit and exact staking plans, assigns **"⚡ STAKE FIRST"** priority to volatile legs, and sends formatted mobile alerts directly via Telegram.

---

## 📸 Key Features

1. **Ghanaian Sportsbook Integration**: Real-time connectors for SportyBet, Betpawa, 1xBet, Soccabet, and Betway Ghana.
2. **Multi-Sport Coverage**: Scans pre-match fixtures up to **7 days ahead** across **Football**, **Basketball (NBA/EuroLeague)**, **Tennis**, **Table Tennis**, and **Ice Hockey**.
3. **Comprehensive Market Coverage**:
   - 1X2 Full Time & Half Time
   - 2-Way Moneyline / Winner (Head-to-Head)
   - Over / Under Total Goals, Points & Games (all lines)
   - Both Teams To Score (GG/NG)
   - Asian & European Handicaps / Point Spreads
   - Double Chance & Draw No Bet
   - Cross-Market Synthetic Hedges (e.g., Double Chance vs 1X2)
4. **"⚡ STAKE FIRST" Smart Execution**: Automatically flags the leg with the highest odds/volatility so you never get trapped if odds shift mid-placement.
5. **Unified Bankroll Controller**: Set your stake (e.g., GHS 50, 100, 200, 500, 1000) and all stakes, payouts, and profits synchronize instantly across the live feed, execution modal, and manual calculator.
6. **Instant Delivery**:
   - **TrageDesk Web Dashboard** (`http://localhost:3000` or deployed on Render)
   - **Automated Telegram Bot Alerts** via `@Tragedeskbot`

---

## 🚀 Quick Start

### 1. Install & Run
```bash
npm install
npm start
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 2. Run Verification Tests
```bash
npm test
```

---

## 💬 Telegram Alerts

Alerts are sent in real-time to your configured chat:

```text
🎯 ARBITRAGE ALERT (+6.85% ROI)
━━━━━━━━━━━━━━━━━━━━
⚽ Arsenal FC vs Chelsea FC
🏆 League: Premier League
📅 Kickoff: Today 19:45
📋 Market: Over/Under Goals • Total 3.5

💵 Staking Plan (GHS 100)
• Betpawa Ghana: Over 3.5 @ 3.50
  👉 Stake: GHS 30.29
  ⚡ STAKE THIS FIRST

• Sportybet: Under 3.5 @ 1.52
  👉 Stake: GHS 69.71

━━━━━━━━━━━━━━━━━━━━
💰 Guaranteed Profit: +GHS 5.97 (Risk-Free)
⚡ TrageDesk Ghana • Real-Time Odds
```

---

## 📁 Project Structure

```text
tragedesk-ghana/
├── src/
│   ├── config.js               # Bankroll, profit thresholds, Telegram tokens
│   ├── index.js                # Main orchestrator & sequential scan loop
│   ├── engine/
│   │   ├── calculator.js       # 2-way & 3-way arb math, pesewa flooring, stakes
│   │   ├── normalizer.js       # Cross-bookmaker matching (demographics, leagues, sports)
│   │   └── detector.js         # Cross-bookmaker market evaluator & synthetic hedge generator
│   ├── connectors/
│   │   ├── base.js             # Base bookmaker interface
│   │   ├── live_manager.js     # Multi-sport live feed manager with TTL cache
│   │   ├── sportybet_live.js   # SportyBet Ghana connector
│   │   ├── betpawa_live.js     # Betpawa Ghana connector
│   │   ├── 1xbet_live.js       # 1xBet Ghana dynamic bulk connector
│   │   ├── soccabet_live.js    # Soccabet Ghana connector
│   │   └── betway_live.js      # Betway Ghana connector
│   ├── delivery/
│   │   └── telegram.js         # Formatted Telegram alert delivery
│   └── web/
│       ├── server.js           # Production HTTP server with health endpoints
│       └── public/
│           ├── index.html      # TrageDesk responsive dashboard UI
│           └── app.js          # Synchronized frontend controller
├── test/                       # Comprehensive unit and integration test suite
├── package.json
└── render.yaml                 # Render cloud deployment specification
```
