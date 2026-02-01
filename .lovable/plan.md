

# ORB Trading Bot Critical Fixes - Implementation Plan

## Problem Analysis

After auditing the codebase, I've identified the following critical issues preventing trades from executing:

### Issue 1: Stock Selection Too Restrictive (orb-stock-selector)
- **Current criteria**: RVOL >= 2.25, Change >= 3.5%, Price >= $20, Float <= 150M
- **Impact**: Almost all stocks are being filtered out, especially large-caps like NVDA, TSLA, AMD which are actually the BEST ORB candidates due to liquidity
- **Root cause**: The float filter at line 255-258 excludes any stock with float > 150M, which eliminates all the liquid large-cap stocks

### Issue 2: DST Bug in auto-trade (getORBRange)
- **Current code** at line 236: Uses hardcoded `-05:00` offset
- **Impact**: During Daylight Saving Time (EDT), the ORB range fetch is off by 1 hour, pulling wrong candle data
- **Fix**: Calculate dynamic offset using proper America/New_York timezone

### Issue 3: Trading Window Too Short
- **Current**: TRADING_END = 10:30 AM (630 minutes)
- **Impact**: Many valid ORB breakouts occur between 10:30-11:00 AM and are missed
- **Fix**: Extend to 11:00 AM

### Issue 4: Volume Confirmation Too Strict
- **Current**: MIN_VOLUME_RATIO = 1.5
- **Impact**: Good setups with RVOL 1.2-1.5 are rejected
- **Fix**: Lower to 1.2 per QuantConnect research

### Issue 5: Gap Scanner Returns Fake Data
- **Current**: Lines 82-113 return hardcoded mock data regardless of API availability
- **Impact**: No real pre-market data is ever fetched
- **Fix**: Use Alpaca credentials from trading config, fall back to mock only if unavailable

### Issue 6: Cron Jobs Already Exist (But May Need Adjustment)
- **Current cron jobs**:
  - `auto-trade-every-minute`: Runs every minute on weekdays (good)
  - `daily-orb-stock-selector`: Runs at 12:00 UTC (7/8 AM ET) - close but could be adjusted
  - `send-daily-performance-email`: Runs at 21:30 UTC (4:30 PM ET) - correct
- **Status**: Cron infrastructure is in place and active

### Issue 7: No Backend Auto-Reset for Daily Loss Lock
- **Current**: Frontend handles reset via shouldResetLock() in Index.tsx
- **Impact**: If frontend isn't open, bot stays locked forever
- **Fix**: Add backend check in auto-trade to reset lock on new trading day

---

## Implementation Plan

### Step 1: Fix orb-stock-selector/index.ts

**Changes:**
1. Update CRITERIA constants:
   - `MIN_RVOL`: 2.25 -> 1.5
   - `MIN_CHANGE_PCT`: 3.5 -> 2.0
   - `MIN_PRICE`: 20 -> 5
   - `MAX_FLOAT_MILLIONS`: 150 -> 999999 (effectively remove)

2. Remove float filter check at lines 253-258

3. Add 15 new stocks to SCAN_STOCKS:
   ```
   'ORCL', 'CRM', 'NFLX', 'BA', 'DIS', 'JPM', 'GS', 'V', 'MA', 
   'ABNB', 'UBER', 'SHOP', 'NET', 'DDOG', 'ZS'
   ```

4. Update crypto criteria to match:
   - `MIN_RVOL`: 2.25 -> 1.5
   - `MIN_CHANGE_PCT`: 3.5 -> 2.0

---

### Step 2: Fix auto-trade/index.ts - Multiple Issues

**2a. Fix DST Bug in getORBRange:**
Replace hardcoded offset with dynamic calculation:
```typescript
// Get dynamic timezone offset for America/New_York
function getETOffset(): string {
  const now = new Date();
  const etString = now.toLocaleString('en-US', { 
    timeZone: 'America/New_York', 
    timeZoneName: 'short' 
  });
  // Returns -05:00 for EST, -04:00 for EDT
  return etString.includes('EDT') ? '-04:00' : '-05:00';
}
```
Then update the fetch URL in getORBRange to use `getETOffset()`.

**2b. Lower volume confirmation threshold:**
- `MIN_VOLUME_RATIO`: 1.5 -> 1.2

**2c. Extend trading window:**
- `TRADING_END`: 630 (10:30 AM) -> 660 (11:00 AM)

**2d. Add ATR-based stop loss fallback:**
When ORB range is < 0.3% of stock price, use 1.5x ATR for stop distance instead.

**2e. Update other CONFIG values:**
- `PROFIT_EXTENSION_R`: 1.5 -> 1.0
- `MAX_TRADES_PER_DAY`: 3 -> 5
- Target calculation: 2x ORB height -> 3x ORB height

**2f. Add trend filter:**
If SPY > 200-SMA AND > 50-SMA, only take LONG trades.

**2g. Add backend auto-reset for daily loss lock:**
At the start of the serve function, check if it's a new trading day and reset the lock in the trading_configurations or add a new table to track this state.

---

### Step 3: Fix gap-scanner/index.ts

**Changes:**
1. Import Supabase client
2. At the start of the serve function:
   - Get user from auth header (similar to orb-stock-selector pattern)
   - Try to get Alpaca credentials from trading config
   - If credentials available, use them to fetch real pre-market data
3. Only fall back to mock data if:
   - No auth provided, OR
   - No trading config found, OR
   - API calls fail

---

### Step 4: Cron Job Updates (Optional)

The existing cron jobs are already set up correctly:
- `auto-trade-every-minute`: Already runs every minute on weekdays
- `daily-orb-stock-selector`: Runs at 12:00 UTC (7 AM ET in EST, 8 AM ET in EDT)

**Optional adjustment**: Update stock selector to run at 13:00 UTC to ensure it's 8-9 AM ET in both EST/EDT.

---

## Technical Details

### Files to Modify:
1. `supabase/functions/orb-stock-selector/index.ts`
2. `supabase/functions/auto-trade/index.ts`
3. `supabase/functions/gap-scanner/index.ts`

### New Database Table (if needed for backend lock reset):
```sql
CREATE TABLE IF NOT EXISTS public.trading_state (
  user_id UUID REFERENCES auth.users PRIMARY KEY,
  is_locked BOOLEAN DEFAULT FALSE,
  lock_reason TEXT,
  lock_date DATE,
  manual_stop BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Testing Strategy:
1. Deploy all edge functions
2. Call orb-stock-selector and verify more stocks qualify
3. Verify getORBRange returns correct bars with dynamic offset
4. Test gap-scanner with real credentials
5. Verify auto-trade picks up the new stocks

---

## Summary of Parameter Changes

| Parameter | Current | New | Rationale |
|-----------|---------|-----|-----------|
| RVOL threshold | 2.25 | 1.5 | Industry standard (ForexTester, QuantConnect) |
| Price change | 3.5% | 2.0% | Capture more setups |
| Min price | $20 | $5 | Academic standard |
| Max float | 150M | No limit | Large-caps are best ORB candidates |
| Trading end | 10:30 AM | 11:00 AM | Capture late breakouts |
| Volume ratio | 1.5 | 1.2 | QuantConnect research |
| Profit extension R | 1.5 | 1.0 | Extend session more often |
| Max trades/day | 3 | 5 | More opportunities |
| Target | 2x ORB | 3x ORB | Better risk/reward |

