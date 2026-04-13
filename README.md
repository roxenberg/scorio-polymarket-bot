# Scorio Polymarket Bot

AI-powered trading bot that finds mispriced outcomes on [Polymarket](https://polymarket.com) by comparing them to real-time bookmaker odds from [Scorio API](https://rapidapi.com/scorio-scorio-default/api/scorio).

**The idea is simple:** professional bookmakers price outcomes in milliseconds with billions in liquidity behind them. Polymarket is a prediction market where regular people trade. Bookmakers are more accurate. When there's a gap between the two — the bot buys the underpriced outcome on Polymarket and profits when it resolves.

---

## What does this bot actually do?

Every 60 seconds:

1. Pulls live odds from **Scorio** (500+ games across 80+ sports)
2. Pulls active sports/esports markets from **Polymarket**
3. Matches the same game across both platforms (e.g., "Vitality vs RED Canids")
4. Calculates the **edge** (bookmaker says 98%, Polymarket prices it at 95% — that's a 3% gap)
5. Sends opportunities to **GPT-5.4** which decides: **BUY** or **SKIP**

```
Example from day 1:

  CS2 match: Vitality vs RED Canids
  Scorio bookmaker odds:  98.5% Vitality wins
  Polymarket price:       95.7% ($0.957)
  Gap:                    2.8%

  Bot buys at $0.957 → match resolves → gets $1.00 → profit $0.043 per share
```

---

## Setup

### 1. Clone and configure

```bash
git clone <repo-url>
cd scorio-polymarket-bot
cp .env.example .env
```

Edit `.env` with your keys:

```env
# Polymarket wallet
PROXY_WALLET=0xYourWalletAddress
PRIVATE_KEY=your_wallet_private_key_without_0x
CLOB_HTTP_URL=https://clob.polymarket.com/
RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY

# Scorio API — subscribe at https://rapidapi.com/scorio-scorio-default/api/scorio
SCORIO_API_KEY=your_rapidapi_key
SCORIO_API_HOST=scorio.p.rapidapi.com

# OpenAI
OPENAI_API_KEY=sk-...

# Safety: start in dry run
DRY_RUN=true
```

**Where to get each key:**

| Key | Where | Cost |
|-----|-------|------|
| Polymarket wallet | [polymarket.com](https://polymarket.com) — sign up, deposit USDC on Polygon | Need USDC |
| Alchemy RPC | [alchemy.com](https://alchemy.com) | Free |
| Scorio API | [Scorio on RapidAPI](https://rapidapi.com/scorio-scorio-default/api/scorio) | Free tier available |
| OpenAI API | [platform.openai.com](https://platform.openai.com) | ~$0.01 per scan |

### 2. Run with Docker (recommended)

```bash
docker compose up -d
```

This starts:
- **MongoDB** for trade persistence and match caching
- **Bot** in continuous scanning mode (every 60s)

Check logs:

```bash
docker compose logs -f bot
```

Stop:

```bash
docker compose down
```

### 3. Or run locally

```bash
npm install
npm run scan           # single scan (read-only, safe)
npm run scan:loop      # continuous scanning
```

For local MongoDB:

```bash
docker compose up -d mongo    # start only MongoDB
npm run scan:loop              # run bot locally
```

---

## Usage

### Scan for opportunities (safe, no trades)

```bash
npm run scan
```

Output:

```
  Fetched 573 Scorio games
  Fetched 5 Polymarket match markets
  Matched 2 game pairs

  2 OPPORTUNITIES:

  16.0% Scorio 99% vs Poly $0.825  Vitality: Map Handicap -1.5
   2.4% Scorio 99% vs Poly $0.962  Vitality: Match Winner

  AI DECISION ENGINE (gpt-5.4):
  BUY 93% $10  Vitality map handicap
  BUY 82% $10  Vitality match winner
```

### Paper trading (simulate, check results next day)

```bash
npm run paper          # record overnight
npm run paper:check    # check results in the morning
```

### Go live

1. Set `DRY_RUN=false` in `.env`
2. Fund your Polymarket wallet with USDC on Polygon ($50 to start)
3. `docker compose up -d` or `npm run scan:loop`

**Start small.** Default max trade: $10. Change `MAX_TRADE_SIZE` in `.env`.

---

## How the AI decides

The bot doesn't blindly buy everything with an edge. GPT-5.4 evaluates each opportunity:

```
Input to AI:
  - Bookmaker odds (from Scorio) or news headlines (from Google)
  - Polymarket price and volume
  - Fee rate for this category
  - Game status (live score, prematch, etc.)
  - Order book depth (can we fill without slippage?)

Output from AI:
  {
    "action": "BUY",
    "confidence": 0.92,
    "size_usd": 10,
    "reasoning": "Bookmaker odds strongly favor this outcome..."
  }

Rules:
  - Confidence must be >= 75% to BUY
  - Max $10 per trade (configurable)
  - Bookmaker odds must imply > 85% probability
  - Net edge after fees must be > 2%
```

---

## Fee cheat sheet

Polymarket charges different fees by category. This matters for profitability.

| Category | Fee | Examples |
|----------|-----|----------|
| Sports | 3% | NBA, NFL, NHL, Tennis, Cricket, UFC |
| Culture | 5% | Esports — CS2, LoL, Dota, Valorant |

**Pro tip:** Maker orders (limit orders) have 0% fee on ALL categories. The bot uses market orders (FOK) for speed, but you can place limit orders manually for zero fees.

---

## Project structure

```
src/
├── scanner.ts         # Main pipeline — orchestrates everything
├── scorio.ts          # Scorio API client (live bookmaker odds)
├── polymarket.ts      # Polymarket API + CLOB order execution
├── matcher.ts         # Fuzzy game matching across platforms
├── ai-decision.ts     # GPT-5.4 decision engine
├── fees.ts            # Fee calculator (verified from Polymarket docs)
├── execute.ts         # Batch trade execution
├── paper-trading.ts   # Overnight simulation recorder
├── paper-check.ts     # Results verification
└── config.ts          # All settings in one place
```

---

## The full story

Read **[Story](https://x.com/dan_roxenberg/status/2043684380539842972?s=20)** — how we built this, what worked, and what didn't.

---

## FAQ

**Q: How much money do I need to start?**
$50 is enough. Default trade size is $5-$10.

**Q: What's the expected return?**
3-7% per trade, 3-5 trades per day. At $50 capital, roughly $10-25/month. Scales linearly with capital.

**Q: Can I lose money?**
Yes. If a "near-certain" outcome doesn't happen, you lose the full trade amount. The strategy targets 95%+ win rate, but losses happen. Start with paper trading.

**Q: Do I need to understand crypto/blockchain?**
Minimally. You need a wallet with USDC on Polygon. The bot handles all blockchain interaction.

**Q: How much does it cost to run?**
Scorio API: free tier. OpenAI: ~$0.01 per scan ($0.50/day with continuous scanning). Polygon gas: under $0.01 per trade.

**Q: Is this legal?**
Polymarket is a regulated prediction market. Trading on it is legal in most jurisdictions (check your local laws). This bot uses public APIs and doesn't manipulate markets.

---

## License

MIT — use it however you want.
