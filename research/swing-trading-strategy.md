# Swing Trading Strategy Research for Small Accounts ($1K-$5K)

> **Research Date:** February 2, 2026  
> **Goal:** Identify the best automated swing trading strategy for a small account, buildable via Alpaca API, deployable through Lovable/Supabase architecture.

---

## Table of Contents

1. [Executive Summary & Recommended Strategy](#1-executive-summary--recommended-strategy)
2. [PDT Rule Considerations](#2-pdt-rule-considerations)
3. [Strategy Deep Dives](#3-strategy-deep-dives)
   - 3.1 Connors RSI-2 Mean Reversion
   - 3.2 Minervini VCP / SEPA
   - 3.3 Momentum Breakout with Volume
   - 3.4 O'Neil CANSLIM (Adapted)
   - 3.5 Mean Reversion Oversold Bounce
   - 3.6 Gap-and-Go (Multi-Day)
   - 3.7 Bollinger Band Squeeze Breakout
4. [Backtested Performance Data](#4-backtested-performance-data)
5. [Recommended Primary Strategy: Hybrid Momentum + Mean Reversion](#5-recommended-primary-strategy)
6. [Specific Entry/Exit Rules (Codeable)](#6-specific-entryexit-rules-codeable)
7. [Position Sizing & Risk Management](#7-position-sizing--risk-management)
8. [Realistic Performance Expectations](#8-realistic-performance-expectations)
9. [Alpaca API Compatibility](#9-alpaca-api-compatibility)
10. [Proposed Architecture: Lovable + Supabase](#10-proposed-architecture-lovable--supabase)
11. [Sources & References](#11-sources--references)

---

## 1. Executive Summary & Recommended Strategy

After researching dozens of strategies, backtests, and academic sources, the **recommended approach for a small $1K-$5K automated swing trading account** is a **dual-strategy system**:

### Primary Strategy: "Connors RSI-2 Mean Reversion" (ETFs/Index)
- **Why:** Highest backtested win rate (70-91%), shortest hold periods (1-5 days), avoids PDT, works on highly liquid ETFs (SPY, QQQ, IWM)
- **Backtested CAGR:** 5-12% (but with only ~10% time in market, exposure-adjusted returns far exceed buy-and-hold)
- **Win rate:** 70-91% depending on parameters
- **Avg hold:** 2-4 days
- **Best for:** Consistent compounding, low drawdowns, automatable

### Secondary Strategy: "Momentum Breakout Scanner" (Individual Stocks)
- **Why:** Catches the big movers; Minervini VCP/Stage 2 screening finds stocks about to break out
- **Backtested CAGR:** 13-40% (varies wildly by year/market regime)
- **Win rate:** 35-55% but outsized winners
- **Avg hold:** 3-10 days
- **Best for:** Growth capture, higher risk/reward

### Why This Combination Works
- Mean reversion provides **consistent base returns** with high win rate (good for psychology, compounding)
- Momentum breakout provides **asymmetric upside** when markets trend
- They're **negatively correlated** — mean reversion works best in choppy/range-bound markets; momentum works best in trending markets
- Together they provide year-round opportunity

---

## 2. PDT Rule Considerations

### The Constraint
- **Pattern Day Trader (PDT) Rule:** Accounts under $25K are limited to **3 day trades per 5 business days** in margin accounts
- A "day trade" = buying AND selling the same security in the same trading day

### Workarounds for Small Accounts

| Method | Details | Our Approach |
|--------|---------|-------------|
| **Swing trade (hold overnight)** | Buy today, sell tomorrow or later — NOT a day trade | ✅ Primary approach |
| **Cash account** | PDT doesn't apply to cash accounts; but T+1 settlement means funds aren't immediately available after selling | ✅ Use for flexibility |
| **Limit to 3 day trades/week** | Stay under the threshold in margin | Backup option |
| **Multiple broker accounts** | Split trades across brokers | Over-complicated |

### Our Strategy Design
- **Minimum hold period: 1 day (overnight)** — all positions held at least overnight
- **Target hold: 2-5 days** — sweet spot for swing trading
- **Maximum hold: 10 days** — time-based exit if nothing happens
- This completely **avoids PDT concerns**

---

## 3. Strategy Deep Dives

### 3.1 Connors RSI-2 Mean Reversion ⭐ (TOP PICK)

**Source:** Larry Connors, "Short Term Trading Strategies That Work" (2008)

**Core Logic:** When the S&P 500 (or any index ETF) gets extremely oversold on a short-term basis while still in a long-term uptrend, buy the dip and sell the bounce.

**Rules (Original):**
1. Price must close **above the 200-day moving average** (confirms long-term uptrend)
2. **RSI(2) drops below 5** (extremely oversold on a 2-period RSI)
3. **Buy at the close** (or next day open)
4. **Exit when price closes above the 5-day moving average**

**Backtested Results (34 years, S&P 500, 1990-2024):**
- **Win rate: ~73-91%** (varies by exact parameters)
- **Average hold: 2-4 days**
- **Time in market: ~7-10%** (only in trades ~25-35 days/year)
- **Exposure-adjusted returns far exceed buy-and-hold**
- **Max drawdown significantly lower than buy-and-hold**
- **Profit factor: 1.7**
- Source: Reddit backtest by u/russs123, StatOasis 146K+ strategy test

**Optimization Research (StatOasis, 146,880 Combinations Tested):**
- Best parameters: RSI(2) < 25 entry, RSI(2) > 65 exit, or exit after 5 bars
- Net Profit: $236,662 (on test)
- Win Rate: 73.3%
- Adding a market regime filter improved Ret/DD from 6.4 to 8.3
- Adding pattern filter improved profit factor to 2.4

**Key Variations to Test:**
- RSI(2) < 10 (more selective but higher win rate)
- RSI(2) < 25 (more trades, still good win rate)
- Exit on RSI(2) > 50 vs. close above 5-day MA
- Time-based exit (5 days max) as backstop

**Why It Works:** The S&P 500 (and broad market) exhibits strong mean reversion on short timeframes. After sharp declines, institutional buying + algorithmic rebalancing creates reliable bounces. This has persisted for 30+ years even after the strategy was published (2008), suggesting it's structural rather than alpha that gets arbitraged away.

---

### 3.2 Minervini VCP / SEPA (Volatility Contraction Pattern)

**Source:** Mark Minervini, "Trade Like a Stock Market Wizard" (2013)

**Core Logic:** Identify stocks in Stage 2 uptrends that are forming tightening consolidation patterns (VCPs), then buy the breakout.

**Minervini's 8-Point Trend Template (All Must Be True):**
1. Price > 50-day MA
2. Price > 150-day MA
3. Price > 200-day MA
4. 50-day MA > 150-day MA
5. 150-day MA > 200-day MA
6. 200-day MA trending upward (≥1 month, ideally 4-5 months)
7. Price within 25% of 52-week high
8. Relative Strength Rating > 70 (ideally > 90)

**VCP Pattern Rules:**
- After uptrend, stock forms a series of **contracting price ranges** (e.g., 25% → 15% → 8%)
- Each contraction shows **declining volume** (selling pressure drying up)
- Final contraction is very tight (< 10% range)
- **Breakout above the pivot point** on **above-average volume** = entry signal

**Entry/Exit Rules:**
- **Entry:** Buy on breakout above pivot with volume ≥ 1.5x 50-day average volume
- **Stop loss:** 5-8% below entry (or below the pivot low of the VCP)
- **Profit target:** Let winners run, trailing stop or sell on climax top signals
- **Hold period:** Days to weeks

**Automation Challenge:** VCP detection is **hard to code perfectly** — it requires identifying contracting swing highs/lows. However, several open-source implementations exist:
- `cookstock` (Python, GitHub) — implements Stage 2 template + VCP detection
- `vcp_screener` (Python, GitHub) — screens for Minervini criteria
- TradingView has community VCP indicators

**Backtested Performance:**
- Minervini claims 220% average annual return over 5+ years (his personal results, U.S. Investing Championship)
- CANSLIM-style portfolios (similar methodology): backtested 13.9%-20.2% average annual returns (LiberatedStockTrader test)
- Real-world: Top practitioners report 30-100%+ in good years, but significant drawdowns in bear markets

**Best For:** Catching "superperformance" stocks — the big 50-200% movers. Not ideal as sole strategy for small accounts due to lower win rate and need for diversification.

---

### 3.3 Momentum Breakout with Volume Confirmation

**Core Logic:** Buy stocks breaking above defined resistance on above-average volume. The volume confirms institutional participation.

**Rules:**
1. **Stock must be in an uptrend** (price > 50-day MA, 50-day MA rising)
2. **Identify resistance level** (recent high, horizontal resistance, or Donchian Channel high)
3. **Price breaks above resistance** by ≥ 0.5%
4. **Volume on breakout day ≥ 1.5x** the 20-day average volume
5. **RSI(14) between 50-70** (strong but not overextended)
6. **Stop loss:** Below the breakout level (the old resistance = new support) — typically 3-7%
7. **Profit target:** 2:1 R:R minimum, or trailing stop (e.g., close below 10-day MA)
8. **Hold:** 3-10 days

**Backtested Results (via various sources):**
- Win rate: 40-55%
- Average winner: 2-3x average loser
- Works best in trending/bull markets
- Struggles in choppy/range-bound markets

**Richard Dennis Turtle Strategy (Related):**
- Buy on 20-day Donchian Channel breakout
- Exit when price hits 10-day Donchian Channel low
- Historically 35-45% win rate but massive winners in trends

---

### 3.4 O'Neil CANSLIM (Adapted for Swing Trading)

**Source:** William O'Neil, "How to Make Money in Stocks"

**CANSLIM Criteria:**
- **C** - Current quarterly EPS growth ≥ 25%
- **A** - Annual EPS growth ≥ 25% over 3-5 years
- **N** - New product, new management, or new high in price
- **S** - Supply & demand: small float + high volume on breakout
- **L** - Leader, not laggard (RS rating ≥ 80)
- **I** - Institutional sponsorship (increasing number of fund holders)
- **M** - Market direction (general market must be in uptrend)

**Adaptation for Automated Swing:**
- Use CANSLIM as a **stock screener/universe filter** (not a timing tool)
- Combine with technical entry triggers (cup-with-handle breakout, flat base breakout)
- Requires fundamental data (earnings, revenue) — available via Alpaca + external data APIs

**Backtested Results:**
- AAII CANSLIM screen: 13.9% to 20.2% average annual returns (1998-present)
- IBD 50 ETF (FFTY) — tracks CANSLIM methodology: Mixed results, generally outperforms in bull markets
- Best years: 40-60%+, worst years: -30-40%

---

### 3.5 Mean Reversion Oversold Bounce (Broad Application)

**Core Logic:** Buy any stock/ETF that has dropped sharply and shows signs of reversal, with the expectation it bounces back.

**Rules (Generic Framework):**
1. **Primary trend up:** Price > 200-day MA (or 150-day MA)
2. **Oversold condition:** One or more of:
   - RSI(2) < 10
   - RSI(5) < 20
   - 3+ consecutive down days
   - Price touches lower Bollinger Band (2 std dev)
   - Price ≥ 5% below 20-day MA
3. **Entry:** At close or next day open after oversold signal
4. **Exit (any of):**
   - First profitable close (aggressive)
   - RSI(2) > 50
   - Close above 5-day MA
   - After 5 bars (time exit)
5. **Stop:** Wide — 10-20% from entry (or none if position is small enough)

**Key Insight from Enlightened Stock Trading:**
- Mean reversion exit should be **quick** — average hold 1-3 days
- Use **limit orders** slightly below current price for better entries
- Don't use tight stops — they break the strategy's high win rate
- Keep positions small (spread across 10-20 positions per strategy)
- Average profit per trade is small, so **liquidity and low commissions are critical**

**Backtested Results:**
- Win rate: 70-85%+
- Average profit per trade: 0.5-1.5%
- Time in market: Low (10-20%)
- Works on ETFs (SPY, QQQ, IWM, XLF) and large-cap stocks
- Much harder on small-caps (slippage kills edge)

---

### 3.6 Gap-and-Go (Multi-Day Version)

**Core Logic:** Stocks that gap up significantly on news/earnings often continue higher for 2-5 days due to momentum and short covering.

**Rules:**
1. **Stock gaps up ≥ 3%** from previous close on open
2. **Volume on gap day ≥ 2x** average daily volume
3. **Catalyst exists:** Earnings beat, upgrade, FDA approval, etc.
4. **Entry:** Buy at first pullback on day 1 (15-30 min after open) OR buy at close of day 1 if it holds above gap-open price
5. **Stop:** Below the gap-fill level (the previous day's close)
6. **Target:** Hold 2-5 days, exit when momentum fades (close below previous day low)

**Considerations:**
- Higher risk — gaps can reverse
- Requires real-time screening capability
- Best combined with volume and RS filters
- Not all gaps are equal — breakaway gaps > continuation gaps > exhaustion gaps

---

### 3.7 Bollinger Band Squeeze Breakout

**Core Logic:** When Bollinger Bands contract (volatility compression), a big move is imminent. Trade the breakout direction.

**Rules:**
1. **Bollinger Band width** drops to lowest level in 120 days (squeeze detected)
2. **Wait for breakout:** Price closes above upper band OR price breaks above the squeeze range
3. **Confirm direction:** MACD histogram turning positive, RSI > 50
4. **Entry:** On close of breakout day
5. **Stop:** Below the lower Bollinger Band or recent swing low
6. **Target:** 2:1 R:R or exit when price closes below the 20-day MA (middle band)

**This is essentially a simplified VCP — tightening volatility → breakout.**

---

## 4. Backtested Performance Data

### Strategy Comparison Table

| Strategy | Win Rate | Avg Hold | CAGR | Max DD | Sharpe | Automatable | Best Market |
|----------|----------|----------|------|--------|--------|-------------|-------------|
| **RSI-2 Mean Reversion (SPY)** | 73-91% | 2-4 days | 5-12%* | 10-15% | 1.5-2.0 | ⭐⭐⭐ Easy | Choppy/Range |
| **VCP/SEPA Breakout** | 35-50% | 5-20 days | 20-40%** | 15-30% | 0.8-1.5 | ⭐⭐ Medium | Bull/Trending |
| **Momentum Breakout** | 40-55% | 3-10 days | 10-25% | 15-25% | 0.7-1.2 | ⭐⭐ Medium | Trending |
| **CANSLIM Adapted** | 40-50% | 5-15 days | 14-20% | 20-40% | 0.6-1.0 | ⭐ Hard | Bull |
| **Oversold Bounce** | 75-85% | 1-3 days | 8-15%* | 8-12% | 1.5-2.5 | ⭐⭐⭐ Easy | Choppy/Range |
| **Gap-and-Go** | 45-60% | 2-5 days | Variable | Variable | Variable | ⭐⭐ Medium | Any |
| **BB Squeeze** | 50-60% | 3-8 days | 10-20% | 12-20% | 1.0-1.5 | ⭐⭐ Medium | Post-compression |

*Exposure-adjusted returns are much higher  
**Highly dependent on market regime

### Key Finding from Research
> **The Connors RSI-2 on indices/large-cap ETFs is the most robust backtested strategy available.** Across 146,880 parameter combinations tested on the S&P 500, **85.9% showed positive net profit.** This is rare — most strategies show positive results in fewer than 50% of parameter variations. The edge is structural and has persisted for 30+ years.

---

## 5. Recommended Primary Strategy

### "Adaptive Swing System" — Dual-Mode Architecture

#### Mode 1: Mean Reversion (Default / Always Running)

**Universe:** SPY, QQQ, IWM, DIA, XLF, XLK, XLE, XLV (8 liquid ETFs)

**Entry Rules:**
```
IF close > SMA(200)                    # Long-term uptrend
AND RSI(2) < 15                        # Extremely oversold
AND close < SMA(5)                     # Below short-term average
THEN BUY at next day open
```

**Exit Rules (first condition met):**
```
IF close > SMA(5)                      # Price recovered above 5-day MA
OR RSI(2) > 65                         # RSI recovered
OR bars_in_trade >= 5                  # Time exit (max 5 days)
THEN SELL at next day open
```

**Position Size:** 20-25% of account per position (max 3-4 positions)

---

#### Mode 2: Momentum Breakout (When Market is Trending)

**Universe:** Top 20 stocks passing Minervini Trend Template screen (daily scan)

**Trend Template Screen:**
```
Price > SMA(50)
Price > SMA(150) 
Price > SMA(200)
SMA(50) > SMA(150)
SMA(150) > SMA(200)
SMA(200) is rising (current > 1 month ago)
Price within 25% of 52-week high
RS_Rating > 70  (can approximate with 12-month price change percentile)
```

**Entry Rules:**
```
IF stock passes Trend Template
AND price breaks above 20-day high (Donchian breakout)
AND volume > 1.5 * SMA(volume, 50)    # Volume surge
AND RSI(14) between 50-70              # Strong but not overbought
THEN BUY at next day open
```

**Exit Rules:**
```
IF close < SMA(10)                     # Momentum fading
OR close < entry_price * 0.93         # 7% stop loss
OR bars_in_trade >= 10                 # Max 10 day hold
OR close > entry_price * 1.15         # 15% profit target
THEN SELL at next day open
```

**Position Size:** 15-20% of account per position (max 2-3 positions)

---

#### Mode Selection Logic:
```
Market Regime Detection:
IF SMA(50, SPY) > SMA(200, SPY) AND SPY > SMA(50):
    regime = "BULL_TRENDING"           # Favor Mode 2 (momentum)
ELIF SMA(50, SPY) < SMA(200, SPY):
    regime = "BEAR"                    # Mode 1 only (mean reversion), reduced sizing
ELSE:
    regime = "CHOPPY"                  # Mode 1 only (mean reversion)
    
Allocation:
- BULL_TRENDING: 40% Mean Reversion + 60% Momentum
- CHOPPY: 80% Mean Reversion + 20% Momentum  
- BEAR: 100% Mean Reversion (or cash)
```

---

## 6. Specific Entry/Exit Rules (Codeable)

### Indicators Needed

| Indicator | Period | Usage |
|-----------|--------|-------|
| **RSI** | 2 | Mean reversion entry/exit signal |
| **RSI** | 14 | Momentum filter (avoid overbought) |
| **SMA** | 5 | Mean reversion exit signal |
| **SMA** | 10 | Momentum trailing stop |
| **SMA** | 50 | Trend filter (short-term) |
| **SMA** | 150 | Trend filter (intermediate) |
| **SMA** | 200 | Primary trend filter |
| **Volume SMA** | 50 | Volume breakout confirmation |
| **Donchian High** | 20 | Breakout level |
| **ATR** | 14 | Volatility-based stop sizing |

### Timeframe
- **Daily charts** for all signals (simple, reliable, avoids noise)
- Scan runs **once per day at market close** (or 30 min before close)
- Orders placed as **market-on-open** for next day

### Complete Signal Flow (Pseudocode)

```python
# Daily at 3:30 PM ET (30 min before close)

def daily_scan():
    # 1. Get current positions
    positions = alpaca.get_positions()
    
    # 2. Check exits first
    for pos in positions:
        if should_exit(pos):
            place_sell_order(pos, "MOO")  # Market on open tomorrow
    
    # 3. Determine market regime
    regime = detect_regime()
    
    # 4. Scan for mean reversion entries
    if allocation_allows(regime, "mean_reversion"):
        for etf in MEAN_REVERSION_UNIVERSE:
            if mean_reversion_entry_signal(etf):
                size = calculate_position_size(etf, "mean_reversion")
                place_buy_order(etf, size, "MOO")
    
    # 5. Scan for momentum entries  
    if allocation_allows(regime, "momentum"):
        candidates = run_trend_template_screen()
        for stock in candidates:
            if momentum_entry_signal(stock):
                size = calculate_position_size(stock, "momentum")
                place_buy_order(stock, size, "MOO")

def mean_reversion_entry_signal(ticker):
    data = get_daily_bars(ticker, 250)
    rsi2 = calc_rsi(data.close, 2)
    sma200 = calc_sma(data.close, 200)
    sma5 = calc_sma(data.close, 5)
    
    return (
        data.close[-1] > sma200[-1] and      # Above 200 MA
        rsi2[-1] < 15 and                      # Oversold
        data.close[-1] < sma5[-1]              # Below 5 MA
    )

def mean_reversion_exit_signal(ticker, entry_date):
    data = get_daily_bars(ticker, 50)
    rsi2 = calc_rsi(data.close, 2)
    sma5 = calc_sma(data.close, 5)
    bars_held = business_days_since(entry_date)
    
    return (
        data.close[-1] > sma5[-1] or           # Recovered above 5 MA
        rsi2[-1] > 65 or                        # RSI recovered
        bars_held >= 5                          # Time exit
    )

def momentum_entry_signal(ticker):
    data = get_daily_bars(ticker, 250)
    rsi14 = calc_rsi(data.close, 14)
    sma50_vol = calc_sma(data.volume, 50)
    donchian_high_20 = max(data.high[-20:])
    
    return (
        passes_trend_template(data) and
        data.close[-1] > donchian_high_20 and   # Breakout
        data.volume[-1] > 1.5 * sma50_vol[-1] and  # Volume surge
        50 < rsi14[-1] < 70                      # Strong but not overextended
    )

def momentum_exit_signal(ticker, entry_price, entry_date):
    data = get_daily_bars(ticker, 50)
    sma10 = calc_sma(data.close, 10)
    bars_held = business_days_since(entry_date)
    
    return (
        data.close[-1] < sma10[-1] or           # Below 10 MA
        data.close[-1] < entry_price * 0.93 or  # 7% stop
        data.close[-1] > entry_price * 1.15 or  # 15% profit target
        bars_held >= 10                          # Max hold
    )
```

---

## 7. Position Sizing & Risk Management

### The Small Account Challenge
With $1K-$5K, every loss matters. The key principles:

1. **Never risk more than 2% of account on a single trade**
2. **Use fractional shares** (Alpaca supports this) to size properly
3. **Compound aggressively when winning**, scale down after losses

### Position Sizing Methods

#### Method 1: Fixed Percentage Risk (Recommended)
```
Risk per trade = 1-2% of account equity
Position Size = (Account * Risk%) / (Entry Price - Stop Price)

Example ($3,000 account, $50 stock, $47 stop):
Risk = $3,000 * 0.02 = $60
Position Size = $60 / ($50 - $47) = 20 shares = $1,000
```

#### Method 2: Equal Weight
```
For mean reversion: Max 4 positions = 25% each
For momentum: Max 3 positions = 20% each (with 40% reserved for MR)
```

#### Method 3: Half-Kelly Criterion
```
Kelly % = W - [(1-W) / R]
Where W = win rate, R = avg win / avg loss

For RSI-2 strategy: W = 0.75, R = 0.8
Kelly % = 0.75 - (0.25 / 0.8) = 0.4375 = 43.75%
Half-Kelly = 21.9% per position

For Momentum: W = 0.45, R = 2.0
Kelly % = 0.45 - (0.55 / 2.0) = 0.175 = 17.5%
Half-Kelly = 8.75% per position
```

### Drawdown Protection Rules

| Account Drawdown | Action |
|-----------------|--------|
| **0-5%** | Trade normally |
| **5-10%** | Reduce position sizes by 50% |
| **10-15%** | Mean reversion only, 50% normal size |
| **15-20%** | Pause all trading for 5 days, then resume at 25% size |
| **> 20%** | Full stop. Review and re-evaluate strategy |

### Compounding Schedule
```
Starting: $3,000
Month 1-3: Trade conservatively (1% risk/trade) — learn the system
Month 4-6: Normal mode (1.5% risk/trade)
Month 7+: Full mode (2% risk/trade)

Add new capital monthly if possible ($100-500/month accelerates growth massively)

Conservative projection (10% annual, no additions):
Year 1: $3,000 → $3,300
Year 2: $3,300 → $3,630
Year 3: $3,630 → $3,993

With $200/month additions + 10% returns:
Year 1: $3,000 → $5,640
Year 2: $5,640 → $8,604
Year 3: $8,604 → $11,864

Aggressive projection (25% annual + $200/month):
Year 1: $3,000 → $6,150
Year 2: $6,150 → $10,088
Year 3: $10,088 → $15,010
```

---

## 8. Realistic Performance Expectations

### What the Data Says

| Source | Claim | Context |
|--------|-------|---------|
| **QuantifiedStrategies** | 5-20% annually | Realistic swing trading range |
| **TheRobustTrader** | 10-40% annually | "Provided you have a profitable strategy" |
| **Reddit r/swingtrading** | 2-3% monthly (24-36% annually) | Experienced traders' self-reports |
| **TraderLion** | 1-2% monthly (12-24% annually) | "Good target to aim for" |
| **VectorVest** | 10-30% annually | "Successful year" benchmark |
| **StatOasis RSI-2 Backtest** | 73% win rate, PF 1.7 | On optimized RSI-2, S&P 500 |
| **Connors Original** | High win rate, low CAGR | But exposure-adjusted far exceeds B&H |

### Honest Assessment for a $3K Account

| Scenario | Annual Return | Monthly | $ Gain on $3K |
|----------|--------------|---------|---------------|
| **Conservative (realistic floor)** | 8-12% | 0.7-1% | $240-360 |
| **Moderate (achievable with discipline)** | 15-25% | 1.3-2% | $450-750 |
| **Aggressive (good year + skill)** | 30-50% | 2.5-4% | $900-1,500 |
| **Exceptional (everything works)** | 50-100%+ | 4-8% | $1,500-3,000 |

### The Real Edge for Small Accounts
The **true path to wealth** from $3K isn't just returns — it's:
1. **Learning to trade systematically** (transferable to any account size)
2. **Adding capital** ($200/month + returns = exponential growth)
3. **Reaching $25K** to unlock margin + day trading
4. **Scaling the proven system** once capitalized

---

## 9. Alpaca API Compatibility

### Why Alpaca is Perfect for This

| Feature | Details | Benefit |
|---------|---------|---------|
| **Commission-free** | No commissions on US stocks/ETFs | Critical for small accounts with small avg trade profit |
| **Fractional shares** | Buy $1 worth of any stock | Proper position sizing even with $1K account |
| **No minimum deposit** | $0 minimum to open | Start with whatever you have |
| **Paper trading** | Full paper trading API | Test strategy before risking real money |
| **REST + WebSocket API** | Full-featured Python SDK (`alpaca-py`) | Easy to automate |
| **Market data included** | Free basic market data, paid real-time | Sufficient for daily swing trading |
| **Order types** | Market, Limit, Stop, Stop-Limit, Trailing Stop, MOO, MOC | All we need |
| **PDT tracking** | Tracks day trades automatically | Warns before violation |

### Alpaca API Key Endpoints We Need

```python
from alpaca.trading.client import TradingClient
from alpaca.data.historical import StockHistoricalDataClient
from alpaca.trading.requests import MarketOrderRequest, LimitOrderRequest
from alpaca.trading.enums import OrderSide, TimeInForce

# Account info
client = TradingClient(api_key, secret_key, paper=True)
account = client.get_account()

# Historical data for indicators
data_client = StockHistoricalDataClient(api_key, secret_key)
bars = data_client.get_stock_bars(request)  # Daily bars

# Place orders
order = MarketOrderRequest(
    symbol="SPY",
    qty=10,  # or notional=500 for dollar amount
    side=OrderSide.BUY,
    time_in_force=TimeInForce.OPG  # Market-on-open
)
client.submit_order(order)

# Get positions
positions = client.get_all_positions()

# Close position
client.close_position("SPY")
```

### Alpaca Limitations to Note
- **PDT still applies** to margin accounts under $25K (use cash account or swing trade)
- **T+1 settlement** in cash accounts — sold funds available next business day
- **No options** in basic accounts (stocks/ETFs only — fine for our strategy)
- **Free data is 15-min delayed** (paid subscription for real-time; for daily swing strategy, delayed is fine since we use daily close data)
- **Rate limits:** 200 requests/minute for trading, higher for data

---

## 10. Proposed Architecture: Lovable + Supabase

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                    LOVABLE (Frontend)                     │
│  React App — Dashboard, Trade History, Settings, Alerts  │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  ┌──────────┐  ┌───────────┐  ┌─────────────────────┐   │
│  │Dashboard │  │Trade Log  │  │Strategy Config      │   │
│  │- P&L     │  │- History  │  │- Parameters         │   │
│  │- Open    │  │- Win/Loss │  │- Risk Rules          │   │
│  │  Trades  │  │- Charts   │  │- Universe            │   │
│  │- Signals │  │- Stats    │  │- On/Off Switch       │   │
│  └──────────┘  └───────────┘  └─────────────────────┘   │
│                                                           │
└─────────────────────┬───────────────────────────────────┘
                      │ Supabase Client SDK
                      ▼
┌─────────────────────────────────────────────────────────┐
│                    SUPABASE (Backend)                     │
│                                                           │
│  ┌─────────────┐  ┌────────────┐  ┌───────────────┐    │
│  │ PostgreSQL  │  │Edge        │  │ pg_cron       │    │
│  │ Database    │  │Functions   │  │ (Scheduler)   │    │
│  │             │  │(Deno/TS)   │  │               │    │
│  │ - trades    │  │            │  │ Daily at      │    │
│  │ - signals   │  │ - scan()   │  │ 3:30 PM ET   │    │
│  │ - config    │  │ - execute()│  │               │    │
│  │ - account   │  │ - monitor()│  │ Every 5 min   │    │
│  │ - history   │  │            │  │ (market hours)│    │
│  └──────┬──────┘  └─────┬──────┘  └───────┬───────┘    │
│         │               │                  │             │
│         └───────────────┼──────────────────┘             │
│                         │                                │
└─────────────────────────┼────────────────────────────────┘
                          │ HTTP/REST
                          ▼
              ┌───────────────────────┐
              │    ALPACA API          │
              │                       │
              │ - Market Data          │
              │ - Order Execution      │
              │ - Account Info         │
              │ - Position Management  │
              └───────────────────────┘
```

### Database Schema (Supabase PostgreSQL)

```sql
-- Strategy configuration
CREATE TABLE strategy_config (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    strategy_name TEXT NOT NULL,  -- 'mean_reversion' or 'momentum'
    enabled BOOLEAN DEFAULT true,
    parameters JSONB NOT NULL,
    -- Example parameters:
    -- {"rsi_period": 2, "rsi_entry": 15, "rsi_exit": 65, 
    --  "sma_trend": 200, "sma_exit": 5, "max_hold_days": 5}
    universe TEXT[] NOT NULL,  -- ['SPY','QQQ','IWM']
    max_positions INTEGER DEFAULT 4,
    risk_per_trade DECIMAL DEFAULT 0.02,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trade signals (generated by scan)
CREATE TABLE signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticker TEXT NOT NULL,
    strategy TEXT NOT NULL,
    signal_type TEXT NOT NULL,  -- 'BUY' or 'SELL'
    signal_date DATE NOT NULL,
    signal_data JSONB NOT NULL,
    -- Example: {"rsi2": 8.5, "close": 450.25, "sma200": 440.10, 
    --           "sma5": 452.30, "volume": 85000000}
    executed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Trade history
CREATE TABLE trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alpaca_order_id TEXT,
    ticker TEXT NOT NULL,
    strategy TEXT NOT NULL,
    side TEXT NOT NULL,  -- 'buy' or 'sell'
    quantity DECIMAL NOT NULL,
    entry_price DECIMAL,
    exit_price DECIMAL,
    entry_date TIMESTAMPTZ,
    exit_date TIMESTAMPTZ,
    pnl DECIMAL,
    pnl_percent DECIMAL,
    status TEXT DEFAULT 'open',  -- 'open', 'closed', 'cancelled'
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Account snapshots (daily)
CREATE TABLE account_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    snapshot_date DATE NOT NULL,
    equity DECIMAL NOT NULL,
    cash DECIMAL NOT NULL,
    buying_power DECIMAL NOT NULL,
    open_positions INTEGER,
    daily_pnl DECIMAL,
    total_pnl DECIMAL,
    drawdown_percent DECIMAL,
    max_drawdown_percent DECIMAL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Alert/notification log
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type TEXT NOT NULL,  -- 'signal', 'fill', 'error', 'drawdown'
    message TEXT NOT NULL,
    metadata JSONB,
    acknowledged BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### Edge Functions (Supabase)

#### 1. `scan-signals` — Daily Strategy Scanner
```typescript
// supabase/functions/scan-signals/index.ts
// Triggered by pg_cron at 3:30 PM ET (Monday-Friday)

import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js";

serve(async (req) => {
    const supabase = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    
    // 1. Fetch strategy configs
    // 2. Get market data from Alpaca
    // 3. Calculate indicators (RSI, SMAs, etc.)
    // 4. Check entry/exit conditions
    // 5. Write signals to 'signals' table
    // 6. Call execute-trades function if signals found
    
    return new Response(JSON.stringify({ signals_generated: count }));
});
```

#### 2. `execute-trades` — Order Execution
```typescript
// supabase/functions/execute-trades/index.ts
// Called by scan-signals, or triggered manually

// 1. Read unexecuted signals
// 2. Check account buying power
// 3. Calculate position sizes
// 4. Submit orders to Alpaca
// 5. Update signals as executed
// 6. Log trades
```

#### 3. `monitor-positions` — Position Monitor
```typescript
// supabase/functions/monitor-positions/index.ts  
// Triggered every 5 min during market hours (or at close only)

// 1. Check all open positions
// 2. Evaluate exit conditions
// 3. Check drawdown rules
// 4. Generate exit signals if needed
// 5. Send alerts for important events
```

#### 4. `daily-snapshot` — End of Day Summary
```typescript
// supabase/functions/daily-snapshot/index.ts
// Triggered at 4:15 PM ET daily

// 1. Get account state from Alpaca
// 2. Calculate daily P&L
// 3. Update drawdown tracking
// 4. Write to account_snapshots
// 5. Send daily summary notification
```

### pg_cron Schedule

```sql
-- Daily scan at 3:30 PM ET (20:30 UTC during EST, 19:30 UTC during EDT)
SELECT cron.schedule(
    'daily-scan',
    '30 15 * * 1-5',  -- Adjust for timezone
    $$SELECT net.http_post(
        url := 'https://YOUR_PROJECT.supabase.co/functions/v1/scan-signals',
        headers := '{"Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb
    )$$
);

-- Position monitor every 5 min during market hours (9:30 AM - 4:00 PM ET)
SELECT cron.schedule(
    'position-monitor',
    '*/5 9-15 * * 1-5',  -- Adjust for timezone
    $$SELECT net.http_post(
        url := 'https://YOUR_PROJECT.supabase.co/functions/v1/monitor-positions',
        headers := '{"Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb
    )$$
);

-- Daily snapshot at 4:15 PM ET
SELECT cron.schedule(
    'daily-snapshot',
    '15 16 * * 1-5',  -- Adjust for timezone
    $$SELECT net.http_post(
        url := 'https://YOUR_PROJECT.supabase.co/functions/v1/daily-snapshot',
        headers := '{"Authorization": "Bearer YOUR_SERVICE_KEY"}'::jsonb
    )$$
);
```

### Lovable Frontend Pages

1. **Dashboard** — Real-time P&L, open positions, account equity chart, today's signals
2. **Trade History** — Filterable table of all trades, win/loss stats, strategy breakdown  
3. **Strategy Config** — Enable/disable strategies, adjust parameters, set risk limits
4. **Signals Log** — All generated signals with indicator values, whether executed
5. **Performance** — Equity curve, drawdown chart, monthly returns heatmap, strategy comparison
6. **Alerts** — Notification feed, configurable alert rules

### Implementation Order

| Phase | What | Effort | Priority |
|-------|------|--------|----------|
| **Phase 1** | Paper trading RSI-2 on SPY only | 1-2 weeks | 🔴 Critical |
| **Phase 2** | Dashboard + trade history UI | 1 week | 🔴 Critical |
| **Phase 3** | Expand to 8 ETF universe | 2-3 days | 🟡 High |
| **Phase 4** | Add momentum breakout strategy | 1 week | 🟡 High |
| **Phase 5** | Performance analytics + equity curves | 3-5 days | 🟢 Medium |
| **Phase 6** | Strategy configuration UI | 3-5 days | 🟢 Medium |
| **Phase 7** | Alert system (push notifications) | 2-3 days | 🟢 Medium |
| **Phase 8** | Go live with real money (small) | 1 day | 🔴 Critical |
| **Phase 9** | Backtest engine in-app | 1-2 weeks | 🔵 Nice to have |

---

## 11. Sources & References

### Academic / Quantitative
- StatOasis: "RSI Deep Dive: How to Trade the S&P 500 Like a Pro with Mean Reversion" — 146,880 strategy combinations tested
- Larry Connors & Cesar Alvarez: "Short Term Trading Strategies That Work" (2008)
- Connors & Connors: "High Probability ETF Trading" (2009)

### Books
- Mark Minervini: "Trade Like a Stock Market Wizard" (2013) — VCP/SEPA methodology
- William O'Neil: "How to Make Money in Stocks" — CANSLIM methodology
- Van Tharp: "Trade Your Way to Financial Freedom" — Position sizing, risk management

### Backtests & Data
- Reddit u/russs123: RSI-2 backtest on 34 years of S&P 500 data ([GitHub](https://github.com/russs123/RSI))
- QuantifiedStrategies.com: 10 swing trading strategies with backtests
- TheRobustTrader.com: Mean reversion and momentum strategy comparisons
- LiberatedStockTrader: CANSLIM backtest (13.9-20.2% annual returns)
- Medium @varunchitale: Two backtested swing trading algorithms with source code

### Tools & APIs
- Alpaca Markets: Commission-free trading API ([alpaca.markets](https://alpaca.markets))
- `cookstock` (GitHub shiyu2011): Python VCP screener with Minervini criteria
- `vcp_screener` (GitHub marco-hui-95): VCP detection with RS rating
- TradingView community: VCP indicators, RSI strategies (Pine Script)

### Strategy Sources
- NewTrading.io: "7 Popular Swing Trading Strategies with Practical Examples"
- EnlightenedStockTrading.com: "Mean Reversion Trading: Proven Strategies for Higher Returns"
- Alpaca Learn: "How to Build a Free Trading Bot with ChatGPT and Alpaca"
- FinerMarketPoints: Complete Minervini Trend Template criteria breakdown

### Communities
- r/algotrading — Backtest results, code sharing
- r/swingtrading — Real-world return expectations  
- QuantConnect Forum — Algorithmic strategy discussion
- AmiBroker Forum — VCP detection code

---

## Quick Start Checklist

- [ ] Open Alpaca paper trading account
- [ ] Build RSI-2 mean reversion scanner (Python)
- [ ] Backtest on SPY with historical data (verify results)
- [ ] Deploy to Supabase Edge Function with pg_cron
- [ ] Build Lovable dashboard (Phase 1 minimal)
- [ ] Paper trade for 30 days minimum
- [ ] Review results, adjust parameters
- [ ] Go live with $500-1,000 initial capital
- [ ] Scale up as confidence/account grows
