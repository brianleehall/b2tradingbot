import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TradingConfig {
  id: string;
  user_id: string;
  api_key_id: string;
  secret_key: string;
  is_paper_trading: boolean;
  selected_strategy: string;
  auto_trading_enabled: boolean;
}

interface Position {
  symbol: string;
  qty: string;
  side: string;
  avg_entry_price: string;
  unrealized_pl: string;
  asset_class?: string;
}

// =====================
// MAX-GROWTH CONFIGURATION - UPDATED per academic research
// =====================
const CONFIG = {
  // Session timing (minutes from midnight ET)
  ORB_START: 9 * 60 + 30,      // 9:30 AM
  ORB_END: 9 * 60 + 35,        // 9:35 AM
  TRADING_START: 9 * 60 + 29,  // 9:29 AM
  TRADING_END: 11 * 60,        // UPDATED: 11:00 AM (was 10:30 AM - 630)
  FIRST_FLATTEN: 10 * 60 + 15, // 10:15 AM
  EXTENDED_END: 11 * 60 + 30,  // 11:30 AM max
  REENTRY_START: 9 * 60 + 50,  // 9:50 AM
  REENTRY_END: 10 * 60 + 5,    // 10:05 AM
  EOD_FLATTEN: 16 * 60,        // 4:00 PM - Force flatten all positions
  
  // Risk management - UPDATED (v9: quality over quantity)
  TIER1_RISK: 0.02,            // 2% for #1 ranked stock (default)
  TIER1_AGGRESSIVE_RISK: 0.03, // 3% for #1 in aggressive bull mode
  TIER2_RISK: 0.01,            // 1% for #2-4
  MAX_TRADES_PER_DAY: 3,       // REDUCED: 3 (was 5 - focus on quality setups)
  MAX_DAILY_LOSS_PERCENT: 0.03, // -3% daily stop
  
  // Regime filter - UPDATED v9: skip ALL trading in bear regimes
  SKIP_BEAR_REGIME: true,      // NEW: No trades when SPY < 200-SMA
  
  // Crypto allocation
  CRYPTO_MAX_PORTFOLIO_PERCENT: 0.20, // Max 20% of portfolio for crypto
  CRYPTO_RISK_PER_TRADE: 0.005,       // 0.5% risk per crypto trade
  
  // Filters
  VIX_SHORTS_ONLY_THRESHOLD: 25,
  VIX_DOUBLE_SIZE_THRESHOLD: 18,
  PREMARKET_COOLOFF_PERCENT: 8,
  LOW_VOLUME_THRESHOLD: 0.8,
  PROFIT_EXTENSION_R: 1.0,     // UPDATED: 1.0 (was 1.5 - extend session more often)
  
  // Volume confirmation - UPDATED
  MIN_VOLUME_RATIO: 1.2,       // UPDATED: 1.2 (was 1.5 - per QuantConnect research)
  
  // Profit target multiplier - UPDATED
  TARGET_R_MULTIPLE: 3,        // UPDATED: 3x ORB height (was 2x - better risk:reward)
  
  // ATR-based stop fallback
  MIN_ORB_RANGE_PERCENT: 0.3,  // NEW: If ORB range < 0.3% of price, use ATR
  ATR_STOP_MULTIPLIER: 1.5,    // NEW: Use 1.5x ATR for stop distance
};

// Get dynamic timezone offset for America/New_York (handles DST automatically)
function getETOffset(): string {
  const now = new Date();
  const etString = now.toLocaleString('en-US', { 
    timeZone: 'America/New_York', 
    timeZoneName: 'short' 
  });
  // Returns -05:00 for EST, -04:00 for EDT
  return etString.includes('EDT') ? '-04:00' : '-05:00';
}

// Proper timezone handling using Intl API with America/New_York
function getETTimeInfo(): { minutes: number; hours: number; mins: number; date: Date; dayOfWeek: number; timeString: string } {
  const now = new Date();
  // Use proper timezone conversion with America/New_York
  const etFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  });
  
  const parts = etFormatter.formatToParts(now);
  const hours = parseInt(parts.find(p => p.type === 'hour')?.value || '0');
  const mins = parseInt(parts.find(p => p.type === 'minute')?.value || '0');
  const weekday = parts.find(p => p.type === 'weekday')?.value || '';
  
  // Map weekday to number (0=Sun, 1=Mon, ... 6=Sat)
  const dayMap: Record<string, number> = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
  const dayOfWeek = dayMap[weekday] ?? new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getDay();
  
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const timeString = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  
  return { minutes: hours * 60 + mins, hours, mins, date: etDate, dayOfWeek, timeString };
}

// Get the current ET date string for comparisons
function getETDateString(): string {
  const now = new Date();
  return now.toLocaleDateString('en-CA', { timeZone: 'America/New_York' }); // Returns YYYY-MM-DD
}

function isWithinTradingWindow(): boolean {
  const { minutes, dayOfWeek, timeString } = getETTimeInfo();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const inWindow = minutes >= CONFIG.TRADING_START && minutes <= CONFIG.TRADING_END;
  console.log(`[TIME-CHECK] ${timeString} ET - Trading window: ${inWindow ? 'YES' : 'NO'} (9:29-11:00 AM ET)${isWeekend ? ' [WEEKEND]' : ''}`);
  if (isWeekend) return false;
  return inWindow;
}

function isMarketHours(): boolean {
  const { minutes, dayOfWeek, timeString } = getETTimeInfo();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const inHours = minutes >= CONFIG.ORB_START && minutes < CONFIG.EOD_FLATTEN;
  console.log(`[TIME-CHECK] ${timeString} ET - Market hours: ${inHours ? 'YES' : 'NO'} (9:30 AM - 4:00 PM ET)${isWeekend ? ' [WEEKEND]' : ''}`);
  if (isWeekend) return false;
  return inHours;
}

function shouldFlattenEOD(): boolean {
  const { minutes, dayOfWeek, timeString } = getETTimeInfo();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const shouldFlatten = minutes >= CONFIG.EOD_FLATTEN;
  console.log(`[EOD-CHECK] Current time: ${timeString} ET - Flatten check: ${shouldFlatten ? 'YES - At or past 4:00 PM ET, MUST FLATTEN ALL' : 'NO - Before 4:00 PM ET'}${isWeekend ? ' [WEEKEND - No action]' : ''}`);
  if (isWeekend) return false;
  return shouldFlatten;
}

function shouldCheckDynamicFlatten(): boolean {
  const { minutes, dayOfWeek, timeString } = getETTimeInfo();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const shouldCheck = minutes >= CONFIG.FIRST_FLATTEN;
  console.log(`[TIME-CHECK] ${timeString} ET - Dynamic flatten check: ${shouldCheck ? 'YES (≥10:15 AM)' : 'NO (<10:15 AM)'}${isWeekend ? ' [WEEKEND]' : ''}`);
  if (isWeekend) return false;
  return shouldCheck;
}

// Get combined market regime (SPY 200-SMA + VIX) with trend filter
async function getCombinedRegime(apiKeyId: string, secretKey: string): Promise<{
  spyPrice: number;
  sma200: number;
  sma50: number;
  vixLevel: number;
  regime: 'bull' | 'elevated_vol' | 'bear';
  longsAllowed: boolean;
  strongUptrend: boolean; // NEW: For trend filter
}> {
  try {
    const polygonKey = Deno.env.get('POLYGON_API_KEY');
    
    // Get SPY current price
    const tradeResponse = await fetch(
      'https://data.alpaca.markets/v2/stocks/SPY/trades/latest',
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );
    
    let spyPrice = 0;
    if (tradeResponse.ok) {
      const tradeData = await tradeResponse.json();
      spyPrice = tradeData.trade?.p || 0;
    }
    
    // Get 200-day and 50-day SMA from Polygon
    let sma200 = 0;
    let sma50 = 0;
    if (polygonKey) {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 300);
      
      const smaResponse = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/${startDate.toISOString().split('T')[0]}/${endDate.toISOString().split('T')[0]}?adjusted=true&sort=desc&limit=200&apiKey=${polygonKey}`
      );
      
      if (smaResponse.ok) {
        const smaData = await smaResponse.json();
        const bars = smaData.results || [];
        if (bars.length >= 200) {
          const sum200 = bars.slice(0, 200).reduce((acc: number, bar: any) => acc + bar.c, 0);
          sma200 = sum200 / 200;
          const sum50 = bars.slice(0, 50).reduce((acc: number, bar: any) => acc + bar.c, 0);
          sma50 = sum50 / 50;
        } else if (bars.length >= 50) {
          sma200 = spyPrice * 0.95;
          const sum50 = bars.slice(0, 50).reduce((acc: number, bar: any) => acc + bar.c, 0);
          sma50 = sum50 / 50;
        } else {
          sma200 = spyPrice * 0.95;
          sma50 = spyPrice * 0.98;
        }
      }
    } else {
      sma200 = spyPrice * 0.95;
      sma50 = spyPrice * 0.98;
    }
    
    // Get VIX level
    let vixLevel = 20;
    try {
      const vixResponse = await fetch(
        'https://data.alpaca.markets/v2/stocks/VIX/trades/latest',
        {
          headers: {
            'APCA-API-KEY-ID': apiKeyId,
            'APCA-API-SECRET-KEY': secretKey,
          },
        }
      );
      if (vixResponse.ok) {
        const vixData = await vixResponse.json();
        vixLevel = vixData.trade?.p || 20;
      }
    } catch {
      console.log('VIX fetch failed, using default 20');
    }
    
    // Combined regime decision
    const spyAboveSMA200 = spyPrice > sma200;
    const spyAboveSMA50 = spyPrice > sma50;
    const vixLow = vixLevel <= CONFIG.VIX_SHORTS_ONLY_THRESHOLD;
    
    // NEW: Strong uptrend = above BOTH 50 and 200 SMA
    const strongUptrend = spyAboveSMA200 && spyAboveSMA50;
    
    let regime: 'bull' | 'elevated_vol' | 'bear';
    let longsAllowed: boolean;
    
    if (spyAboveSMA200 && vixLow) {
      regime = 'bull';
      longsAllowed = true;
    } else if (spyAboveSMA200 && !vixLow) {
      regime = 'elevated_vol';
      longsAllowed = false;
    } else {
      regime = 'bear';
      longsAllowed = false;
    }
    
    console.log(`[REGIME] SPY: $${spyPrice.toFixed(2)}, 50-SMA: $${sma50.toFixed(2)}, 200-SMA: $${sma200.toFixed(2)}, VIX: ${vixLevel.toFixed(1)} → ${regime.toUpperCase()} (Longs: ${longsAllowed ? 'YES' : 'NO'}, Strong Uptrend: ${strongUptrend ? 'YES' : 'NO'})`);
    
    return { spyPrice, sma200, sma50, vixLevel, regime, longsAllowed, strongUptrend };
  } catch (error) {
    console.error('Error fetching regime:', error);
    return { spyPrice: 0, sma200: 0, sma50: 0, vixLevel: 20, regime: 'bull', longsAllowed: true, strongUptrend: false };
  }
}

// Get ORB range (first 5-min candle) - FIXED DST BUG
async function getORBRange(ticker: string, apiKeyId: string, secretKey: string): Promise<{ high: number; low: number } | null> {
  try {
    const now = new Date();
    const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dateStr = etDate.toISOString().split('T')[0];
    
    // FIXED: Use dynamic offset instead of hardcoded -05:00
    const offset = getETOffset();
    
    const response = await fetch(
      `https://data.alpaca.markets/v2/stocks/${ticker}/bars?timeframe=5Min&start=${dateStr}T09:30:00${offset}&end=${dateStr}T09:35:00${offset}&limit=1`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );
    
    if (!response.ok) return null;
    const data = await response.json();
    const bars = data.bars;
    
    if (!bars || bars.length === 0) return null;
    return { high: bars[0].h, low: bars[0].l };
  } catch {
    return null;
  }
}

// Get ATR for a stock (for ATR-based stops)
async function getATR(ticker: string, apiKeyId: string, secretKey: string, periods: number = 14): Promise<number | null> {
  try {
    const response = await fetch(
      `https://data.alpaca.markets/v2/stocks/${ticker}/bars?timeframe=1Day&limit=${periods + 1}`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );
    
    if (!response.ok) return null;
    const data = await response.json();
    const bars = data.bars || [];
    
    if (bars.length < periods + 1) return null;
    
    // Calculate True Range for each day
    let atrSum = 0;
    for (let i = 1; i < bars.length; i++) {
      const high = bars[i].h;
      const low = bars[i].l;
      const prevClose = bars[i - 1].c;
      const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
      atrSum += tr;
    }
    
    return atrSum / periods;
  } catch {
    return null;
  }
}

// Get pre-market change (cool-off rule)
async function getPremarketChange(ticker: string, apiKeyId: string, secretKey: string): Promise<number> {
  try {
    const now = new Date();
    const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dateStr = etDate.toISOString().split('T')[0];
    
    // Get yesterday's close
    const closeResponse = await fetch(
      `https://data.alpaca.markets/v2/stocks/${ticker}/bars?timeframe=1Day&limit=2`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );
    
    if (!closeResponse.ok) return 0;
    const closeData = await closeResponse.json();
    const closeBars = closeData.bars || [];
    if (closeBars.length < 2) return 0;
    
    const prevClose = closeBars[closeBars.length - 2].c;
    
    // Get pre-market price
    const preResponse = await fetch(
      `https://data.alpaca.markets/v2/stocks/${ticker}/trades/latest`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );
    
    if (!preResponse.ok) return 0;
    const preData = await preResponse.json();
    const currentPrice = preData.trade?.p || prevClose;
    
    return prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;
  } catch {
    return 0;
  }
}

// Get current market data
async function getMarketData(ticker: string, apiKeyId: string, secretKey: string): Promise<{
  price: number;
  volume: number;
  avgVolume: number;
} | null> {
  try {
    const tradeResponse = await fetch(
      `https://data.alpaca.markets/v2/stocks/${ticker}/trades/latest`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );
    
    const barsResponse = await fetch(
      `https://data.alpaca.markets/v2/stocks/${ticker}/bars?timeframe=1Min&limit=20`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );
    
    if (!tradeResponse.ok || !barsResponse.ok) return null;
    
    const tradeData = await tradeResponse.json();
    const barsData = await barsResponse.json();
    
    const bars = barsData.bars || [];
    const price = tradeData.trade?.p || 0;
    const volume = bars.length > 0 ? bars[bars.length - 1]?.v || 0 : 0;
    const avgVolume = bars.length > 0 
      ? bars.reduce((sum: number, b: any) => sum + b.v, 0) / bars.length 
      : volume;
    
    return { price, volume, avgVolume };
  } catch {
    return null;
  }
}

// Check ORB breakout signal with all filters (including trend filter)
function checkORBSignal(
  orbHigh: number,
  orbLow: number,
  currentPrice: number,
  volume: number,
  avgVolume: number,
  premarketChange: number,
  longsAllowed: boolean,
  regime: string,
  strongUptrend: boolean
): { signal: 'long' | 'short' | null; skipReason?: string } {
  // Cool-off rule
  if (Math.abs(premarketChange) > CONFIG.PREMARKET_COOLOFF_PERCENT) {
    return { signal: null, skipReason: `Pre-market ${premarketChange.toFixed(1)}% > 8% cool-off limit` };
  }
  
  const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;
  const volumeCondition = volumeRatio >= CONFIG.MIN_VOLUME_RATIO;
  
  // Long breakout
  if (currentPrice > orbHigh && volumeCondition) {
    if (!longsAllowed) {
      return { signal: null, skipReason: `${regime} regime - shorts only` };
    }
    return { signal: 'long' };
  }
  
  // Short breakout - with trend filter
  if (currentPrice < orbLow && volumeCondition) {
    // NEW: If in strong uptrend, skip shorts (longs only in uptrend)
    if (strongUptrend) {
      return { signal: null, skipReason: `Strong uptrend (SPY > 50 & 200 SMA) - longs only` };
    }
    return { signal: 'short' };
  }
  
  return { signal: null, skipReason: 'No breakout signal' };
}

// Calculate tiered position size with aggressive bull mode
function calculatePositionSize(
  equity: number,
  entryPrice: number,
  stopLoss: number,
  rank: number,
  vixLevel: number,
  regime: 'bull' | 'elevated_vol' | 'bear',
  spyAboveSMA: boolean
): { shares: number; riskPercent: number; isAggressiveBull: boolean } {
  let riskPercent = rank === 1 ? CONFIG.TIER1_RISK : CONFIG.TIER2_RISK;
  let isAggressiveBull = false;
  
  // Aggressive Bull Mode: SPY > 200-SMA AND VIX ≤ 18
  // Set #1 stock risk to 3% instead of 2%
  if (rank === 1 && spyAboveSMA && vixLevel <= CONFIG.VIX_DOUBLE_SIZE_THRESHOLD) {
    riskPercent = CONFIG.TIER1_AGGRESSIVE_RISK;
    isAggressiveBull = true;
    console.log(`[AGGRESSIVE BULL] SPY > 200-SMA & VIX ${vixLevel.toFixed(1)} ≤ 18 → 3% risk on #1`);
  }
  
  const maxRisk = equity * riskPercent;
  const riskPerShare = Math.abs(entryPrice - stopLoss);
  
  if (riskPerShare <= 0) return { shares: 0, riskPercent, isAggressiveBull };
  
  const shares = Math.floor(maxRisk / riskPerShare);
  return { shares: Math.max(1, shares), riskPercent, isAggressiveBull };
}

// Execute trade with bracket order (stocks)
async function executeTrade(
  ticker: string,
  side: 'buy' | 'sell',
  qty: number,
  stopLoss: number,
  target: number,
  apiKeyId: string,
  secretKey: string,
  isPaper: boolean
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  const baseUrl = isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
  
  try {
    const response = await fetch(`${baseUrl}/v2/orders`, {
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID': apiKeyId,
        'APCA-API-SECRET-KEY': secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        symbol: ticker,
        qty: qty.toString(),
        side,
        type: 'market',
        time_in_force: 'day',
        order_class: 'bracket',
        stop_loss: { stop_price: stopLoss.toFixed(2) },
        take_profit: { limit_price: target.toFixed(2) },
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }
    
    const order = await response.json();
    return { success: true, orderId: order.id };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Execute crypto trade via Alpaca crypto API
async function executeCryptoTrade(
  symbol: string,
  side: 'buy' | 'sell',
  notional: number,
  stopLoss: number,
  target: number,
  apiKeyId: string,
  secretKey: string,
  isPaper: boolean
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  const baseUrl = isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
  
  try {
    // Alpaca uses /BTC/USD format for crypto
    const alpacaSymbol = symbol.replace('USD', '/USD');
    
    const response = await fetch(`${baseUrl}/v2/orders`, {
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID': apiKeyId,
        'APCA-API-SECRET-KEY': secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        symbol: alpacaSymbol,
        notional: notional.toFixed(2),
        side,
        type: 'market',
        time_in_force: 'gtc', // Crypto uses GTC
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }
    
    const order = await response.json();
    console.log(`[CRYPTO] Executed ${side} ${alpacaSymbol} for $${notional.toFixed(2)}`);
    return { success: true, orderId: order.id };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Get crypto market data from Alpaca
async function getCryptoMarketData(symbol: string, apiKeyId: string, secretKey: string): Promise<{
  price: number;
  volume: number;
  avgVolume: number;
} | null> {
  try {
    const alpacaSymbol = symbol.replace('USD', '/USD');
    
    const tradeResponse = await fetch(
      `https://data.alpaca.markets/v1beta3/crypto/us/latest/trades?symbols=${alpacaSymbol}`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );
    
    if (!tradeResponse.ok) return null;
    
    const tradeData = await tradeResponse.json();
    const trade = tradeData.trades?.[alpacaSymbol];
    const price = trade?.p || 0;
    
    return { price, volume: 0, avgVolume: 0 };
  } catch {
    return null;
  }
}

// Calculate crypto position size (notional value)
function calculateCryptoPositionSize(
  equity: number,
  entryPrice: number,
  stopLoss: number
): { notional: number; riskPercent: number } {
  const maxCryptoAllocation = equity * CONFIG.CRYPTO_MAX_PORTFOLIO_PERCENT;
  const riskPercent = CONFIG.CRYPTO_RISK_PER_TRADE;
  const maxRisk = equity * riskPercent;
  
  const riskPerUnit = Math.abs(entryPrice - stopLoss) / entryPrice;
  
  if (riskPerUnit <= 0) return { notional: 0, riskPercent };
  
  // Calculate notional based on risk
  let notional = maxRisk / riskPerUnit;
  
  // Cap at max crypto allocation
  notional = Math.min(notional, maxCryptoAllocation);
  
  return { notional: Math.max(100, notional), riskPercent };
}

// Get account info (equity, trades today, daily P&L)
async function getAccountInfo(apiKeyId: string, secretKey: string, isPaper: boolean): Promise<{
  equity: number;
  tradesToday: number;
  dailyPnLPercent: number;
} | null> {
  const baseUrl = isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
  
  try {
    const accountResponse = await fetch(`${baseUrl}/v2/account`, {
      headers: {
        'APCA-API-KEY-ID': apiKeyId,
        'APCA-API-SECRET-KEY': secretKey,
      },
    });
    
    if (!accountResponse.ok) return null;
    const account = await accountResponse.json();
    
    const equity = parseFloat(account.equity);
    const lastEquity = parseFloat(account.last_equity);
    const dailyPnLPercent = lastEquity > 0 ? ((equity - lastEquity) / lastEquity) * 100 : 0;
    
    // Count today's trades
    const ordersResponse = await fetch(
      `${baseUrl}/v2/orders?status=all&limit=100`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );
    
    let tradesToday = 0;
    if (ordersResponse.ok) {
      const orders = await ordersResponse.json();
      const today = new Date().toISOString().split('T')[0];
      tradesToday = orders.filter((o: any) => 
        o.filled_at && o.filled_at.startsWith(today)
      ).length;
    }
    
    return { equity, tradesToday, dailyPnLPercent };
  } catch {
    return null;
  }
}

// Get all open positions
async function getOpenPositions(apiKeyId: string, secretKey: string, isPaper: boolean): Promise<Position[]> {
  const baseUrl = isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
  
  try {
    const response = await fetch(`${baseUrl}/v2/positions`, {
      headers: {
        'APCA-API-KEY-ID': apiKeyId,
        'APCA-API-SECRET-KEY': secretKey,
      },
    });
    
    if (!response.ok) return [];
    return await response.json();
  } catch {
    return [];
  }
}

// Close a single position (market sell)
async function closePosition(
  symbol: string,
  apiKeyId: string,
  secretKey: string,
  isPaper: boolean
): Promise<{ success: boolean; error?: string }> {
  const baseUrl = isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
  
  try {
    const response = await fetch(`${baseUrl}/v2/positions/${symbol}`, {
      method: 'DELETE',
      headers: {
        'APCA-API-KEY-ID': apiKeyId,
        'APCA-API-SECRET-KEY': secretKey,
      },
    });
    
    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
}

// Cancel all open orders
async function cancelAllOrders(apiKeyId: string, secretKey: string, isPaper: boolean): Promise<boolean> {
  const baseUrl = isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
  
  try {
    const response = await fetch(`${baseUrl}/v2/orders`, {
      method: 'DELETE',
      headers: {
        'APCA-API-KEY-ID': apiKeyId,
        'APCA-API-SECRET-KEY': secretKey,
      },
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Log flatten event to Supabase
async function logFlattenEvent(
  supabase: any,
  userId: string,
  symbol: string,
  reason: string,
  qty: number,
  entryPrice: number,
  exitPrice: number,
  pnl: number
): Promise<void> {
  try {
    await supabase.from('trade_logs').insert({
      user_id: userId,
      symbol,
      side: 'flatten',
      qty,
      price: exitPrice,
      strategy: 'orb-max-growth',
      status: 'flattened',
      error_message: reason,
    });
    console.log(`[FLATTEN-LOG] ${symbol}: ${reason} | P&L: $${pnl.toFixed(2)}`);
  } catch (error) {
    console.error('Failed to log flatten event:', error);
  }
}

// Calculate R-multiple for a position
function calculateRMultiple(entryPrice: number, currentPrice: number, orbRange: { high: number; low: number }, side: 'long' | 'short'): number {
  const riskPerShare = Math.abs(orbRange.high - orbRange.low);
  if (riskPerShare === 0) return 0;
  
  const profitPerShare = side === 'long' 
    ? currentPrice - entryPrice 
    : entryPrice - currentPrice;
  
  return profitPerShare / riskPerShare;
}

// Run auto-flatten check for all users
// CRITICAL: This is the UNBREAKABLE end-of-day flatten to prevent overnight holds
async function runAutoFlatten(supabase: any, reason: string): Promise<{ flattened: number; errors: number }> {
  const timeInfo = getETTimeInfo();
  const timestamp = `${timeInfo.timeString} ET (America/New_York)`;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`=== UNBREAKABLE AUTO-FLATTEN: ${reason} ===`);
  console.log(`${'='.repeat(60)}`);
  console.log(`[FLATTEN] Timestamp: ${timestamp}`);
  console.log(`[FLATTEN] This flatten CANNOT be bypassed - all positions MUST close`);
  
  // Allow safe simulation/testing without needing real user configs.
  // NOTE: In normal operation we always load configs from the database.
  const configsOverride = (supabase as any)?.__configsOverride as TradingConfig[] | undefined;
  const positionsOverrideByUser = (supabase as any)?.__positionsOverrideByUser as Record<string, Position[]> | undefined;
  const simulateCloseOnly = Boolean((supabase as any)?.__simulateCloseOnly);

  // Get all active trading configs
  const { data: configs, error } = configsOverride
    ? ({ data: configsOverride, error: null } as any)
    : await supabase.rpc('get_active_trading_configs');
  
  if (error || !configs || configs.length === 0) {
    console.log('[FLATTEN] No active trading configs found');
    return { flattened: 0, errors: 0 };
  }
  
  let flattened = 0;
  let errors = 0;
  
  for (const config of configs as TradingConfig[]) {
    console.log(`\n--- Processing user ${config.user_id} ---`);
    
    // Cancel all open orders first
    if (!simulateCloseOnly) {
      console.log(`[${config.user_id}] Cancelling all open orders...`);
      await cancelAllOrders(config.api_key_id, config.secret_key, config.is_paper_trading);
    }
    
    // Get all open positions
    const positions = positionsOverrideByUser?.[config.user_id]
      ? positionsOverrideByUser[config.user_id]
      : await getOpenPositions(config.api_key_id, config.secret_key, config.is_paper_trading);
    
    if (positions.length === 0) {
      console.log('[FLATTEN] No open positions to close');
      continue;
    }
    
    console.log(`[FLATTEN] Found ${positions.length} open position(s) - CLOSING ALL`);
    
    for (const position of positions) {
      const symbol = position.symbol;
      const qty = Math.abs(parseFloat(position.qty));
      const entryPrice = parseFloat(position.avg_entry_price);
      const unrealizedPnL = parseFloat(position.unrealized_pl);
      
      // Get current price for logging
      const marketData = simulateCloseOnly
        ? null
        : await getMarketData(symbol, config.api_key_id, config.secret_key);
      const exitPrice = marketData?.price || entryPrice;
      
      const closeTimestamp = getETTimeInfo().timeString;
      console.log(`[FLATTEN] ${symbol}: Closing ${qty} shares @ ~$${exitPrice.toFixed(2)}`);
      console.log(`[FLATTEN] ${symbol}: Entry: $${entryPrice.toFixed(2)} | Exit: $${exitPrice.toFixed(2)} | P&L: $${unrealizedPnL.toFixed(2)}`);
      console.log(`[FLATTEN] ${symbol}: Timestamp: ${closeTimestamp} ET | Reason: ${reason}`);
      
      const result = simulateCloseOnly
        ? ({ success: true } as const)
        : await closePosition(symbol, config.api_key_id, config.secret_key, config.is_paper_trading);
      
      if (result.success) {
        flattened++;
        console.log(`[FLATTEN] ${symbol}: ✓ CLOSED SUCCESSFULLY`);
        await logFlattenEvent(
          supabase,
          config.user_id,
          symbol,
          reason,
          qty,
          entryPrice,
          exitPrice,
          unrealizedPnL
        );
      } else {
        errors++;
        console.error(`[FLATTEN] ${symbol}: ✗ FAILED TO CLOSE: ${result.error}`);
        // Log the failure
        await supabase.from('trade_logs').insert({
          user_id: config.user_id,
          symbol,
          side: 'flatten',
          qty,
          price: exitPrice,
          strategy: 'orb-max-growth',
          status: 'failed',
          error_message: `EOD flatten failed: ${result.error}`,
        });
      }
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`=== FLATTEN COMPLETE: ${flattened} closed, ${errors} errors ===`);
  console.log(`${'='.repeat(60)}`);
  return { flattened, errors };
}

// Run dynamic flatten check (10:15 AM rule with +1.0R extension)
// NOTE: This runs REGARDLESS of daily loss limit - positions are always managed/exited
async function runDynamicFlatten(supabase: any): Promise<{ flattened: number; extended: number }> {
  const timeInfo = getETTimeInfo();
  console.log(`\n=== DYNAMIC FLATTEN CHECK at ${timeInfo.timeString} ET ===`);
  console.log(`[DYNAMIC-FLATTEN] This runs regardless of daily loss limit - exits are never blocked`);
  
  // Only run after 10:15 AM ET
  if (timeInfo.minutes < CONFIG.FIRST_FLATTEN) {
    console.log(`[DYNAMIC-FLATTEN] Too early (before 10:15 AM ET) - no action yet`);
    return { flattened: 0, extended: 0 };
  }
  
  // If past 11:30 AM, force flatten everything
  if (timeInfo.minutes >= CONFIG.EXTENDED_END) {
    console.log(`[DYNAMIC-FLATTEN] Past 11:30 AM ET - force flattening ALL remaining positions`);
    const result = await runAutoFlatten(supabase, 'Extended session end (11:30 AM ET)');
    return { flattened: result.flattened, extended: 0 };
  }
  
  const { data: configs, error } = await supabase.rpc('get_active_trading_configs');
  
  if (error || !configs || configs.length === 0) {
    return { flattened: 0, extended: 0 };
  }
  
  let flattened = 0;
  let extended = 0;
  
  for (const config of configs as TradingConfig[]) {
    const positions = await getOpenPositions(config.api_key_id, config.secret_key, config.is_paper_trading);
    
    if (positions.length === 0) continue;
    
    for (const position of positions) {
      const symbol = position.symbol;
      const qty = Math.abs(parseFloat(position.qty));
      const entryPrice = parseFloat(position.avg_entry_price);
      const unrealizedPnL = parseFloat(position.unrealized_pl);
      const side = parseFloat(position.qty) > 0 ? 'long' : 'short';
      
      // Get ORB range to calculate R-multiple
      const orbRange = await getORBRange(symbol, config.api_key_id, config.secret_key);
      const marketData = await getMarketData(symbol, config.api_key_id, config.secret_key);
      
      if (!orbRange || !marketData) {
        // Can't calculate R, flatten to be safe
        await closePosition(symbol, config.api_key_id, config.secret_key, config.is_paper_trading);
        await logFlattenEvent(supabase, config.user_id, symbol, 'Dynamic stop (no ORB data)', qty, entryPrice, marketData?.price || entryPrice, unrealizedPnL);
        flattened++;
        continue;
      }
      
      const rMultiple = calculateRMultiple(entryPrice, marketData.price, orbRange, side as 'long' | 'short');
      
      console.log(`[${symbol}] R-Multiple: ${rMultiple.toFixed(2)}R | P&L: $${unrealizedPnL.toFixed(2)}`);
      
      // UPDATED: If position is +1.0R or better, allow extension to 11:30 AM (was +1.5R)
      if (rMultiple >= CONFIG.PROFIT_EXTENSION_R) {
        console.log(`[${symbol}] +${rMultiple.toFixed(2)}R ≥ ${CONFIG.PROFIT_EXTENSION_R}R → Session extended to 11:30 AM`);
        extended++;
        // TODO: Could implement trailing stop to 9 EMA here
      } else if (timeInfo.minutes >= CONFIG.FIRST_FLATTEN + 15) {
        // After 10:30 AM, flatten positions not meeting threshold
        await closePosition(symbol, config.api_key_id, config.secret_key, config.is_paper_trading);
        await logFlattenEvent(supabase, config.user_id, symbol, `Dynamic stop at ${timeInfo.hours}:${timeInfo.mins.toString().padStart(2, '0')} ET (${rMultiple.toFixed(2)}R < ${CONFIG.PROFIT_EXTENSION_R}R)`, qty, entryPrice, marketData.price, unrealizedPnL);
        flattened++;
      }
    }
  }
  
  return { flattened, extended };
}

// Backend auto-reset for daily loss lock
async function checkAndResetDailyLock(supabase: any): Promise<void> {
  const today = getETDateString();
  
  // Check trading_state table for locks that need resetting
  const { data: states, error } = await supabase
    .from('trading_state')
    .select('*')
    .eq('is_locked', true)
    .eq('manual_stop', false); // Only auto-reset if NOT a manual stop
  
  if (error || !states || states.length === 0) {
    return;
  }
  
  for (const state of states) {
    // If lock was from a previous day, reset it
    if (state.lock_date && state.lock_date !== today) {
      console.log(`[AUTO-RESET] Resetting daily lock for user ${state.user_id} (lock from ${state.lock_date})`);
      
      await supabase
        .from('trading_state')
        .update({
          is_locked: false,
          lock_reason: null,
          lock_date: null,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', state.user_id);
    }
  }
}

// Core trading logic extracted for reuse
async function runTradingCycle(supabase: any): Promise<{ results: any[], skipped: boolean, reason?: string }> {
  const timeInfo = getETTimeInfo();
  console.log(`[TRADE-CYCLE] Running at ${timeInfo.hours}:${timeInfo.mins.toString().padStart(2, '0')} ET`);

  // Check trading window
  if (!isWithinTradingWindow()) {
    return { results: [], skipped: true, reason: 'Outside ORB trading window (9:29-11:00 AM ET)' };
  }

  // Get active trading configs
  const { data: configs, error } = await supabase.rpc('get_active_trading_configs');
  
  if (error || !configs || configs.length === 0) {
    return { results: [], skipped: true, reason: 'No active auto-traders' };
  }

  console.log(`Processing ${configs.length} auto-trading configurations`);
  const results = [];

  for (const config of configs as TradingConfig[]) {
    console.log(`\n=== Processing user ${config.user_id} ===`);
    
    // Get account info
    const accountInfo = await getAccountInfo(
      config.api_key_id, 
      config.secret_key, 
      config.is_paper_trading
    );
    
    if (!accountInfo) {
      console.log('Failed to get account info');
      continue;
    }
    
    // Check daily loss limit - only block NEW trades, not exits
    if (accountInfo.dailyPnLPercent <= -(CONFIG.MAX_DAILY_LOSS_PERCENT * 100)) {
      console.log(`[LOSS-LIMIT] Daily loss limit hit: ${accountInfo.dailyPnLPercent.toFixed(2)}% (threshold: -${(CONFIG.MAX_DAILY_LOSS_PERCENT * 100).toFixed(0)}%)`);
      console.log(`[LOSS-LIMIT] NEW entries blocked - but existing positions will still be managed/flattened by dynamic stop and EOD rules`);
      continue;
    }
    
    // Check max trades per day (UPDATED: now 5)
    if (accountInfo.tradesToday >= CONFIG.MAX_TRADES_PER_DAY) {
      console.log(`Max trades reached: ${accountInfo.tradesToday}/${CONFIG.MAX_TRADES_PER_DAY}`);
      continue;
    }

    // Get market regime (with trend filter)
    const regimeData = await getCombinedRegime(config.api_key_id, config.secret_key);
    
    // v9: Skip ALL trading in bear/elevated_vol regimes
    if (CONFIG.SKIP_BEAR_REGIME && (regimeData.regime === 'bear' || regimeData.regime === 'elevated_vol')) {
      console.log(`[REGIME-SKIP] ${regimeData.regime.toUpperCase()} regime detected — SKIPPING all trades today`);
      console.log(`[REGIME-SKIP] SPY: $${regimeData.spyPrice.toFixed(2)} vs 200-SMA: $${regimeData.sma200.toFixed(2)}, VIX: ${regimeData.vixLevel.toFixed(1)}`);
      console.log(`[REGIME-SKIP] Backtest showed -$22,800 in bear trades. Cash is a position.`);
      continue;
    }
    
    // Get today's ORB stocks from the daily scan (auto-selected)
    const today = new Date().toISOString().split('T')[0];
    const { data: dailyStocks, error: stocksError } = await supabase
      .from('daily_orb_stocks')
      .select('symbol')
      .eq('scan_date', today)
      .order('rvol', { ascending: false })
      .limit(3); // REDUCED: Top 3 only (was 5 - quality over quantity)
    
    let tickers: string[];
    if (dailyStocks && dailyStocks.length > 0) {
      tickers = dailyStocks.map((s: { symbol: string }) => s.symbol);
      console.log(`Using today's auto-selected stocks: ${tickers.join(', ')}`);
    } else {
      // Fallback: check yesterday's stocks (in case scan hasn't run yet today)
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toISOString().split('T')[0];
      
      const { data: yesterdayStocks } = await supabase
        .from('daily_orb_stocks')
        .select('symbol')
        .eq('scan_date', yesterdayStr)
        .order('rvol', { ascending: false })
        .limit(5);
      
      if (yesterdayStocks && yesterdayStocks.length > 0) {
        tickers = yesterdayStocks.map((s: { symbol: string }) => s.symbol);
        console.log(`Using yesterday's stocks (today's scan pending): ${tickers.join(', ')}`);
      } else {
        // Ultimate fallback to proven ORB leaders
        tickers = ['NVDA', 'TSLA', 'AMD', 'SMCI'];
        console.log(`Using fallback stocks: ${tickers.join(', ')}`);
      }
    }
    
    console.log(`Tickers: ${tickers.join(', ')}`);

    for (let i = 0; i < tickers.length; i++) {
      const ticker = tickers[i];
      const rank = i + 1;
      
      // Check if we already have a position in this stock
      const positions = await getOpenPositions(config.api_key_id, config.secret_key, config.is_paper_trading);
      const hasPosition = positions.some((p: Position) => p.symbol === ticker);
      
      if (hasPosition) {
        console.log(`[${ticker}] Already have position - skipping`);
        continue;
      }
      
      // Get ORB range
      const orbRange = await getORBRange(ticker, config.api_key_id, config.secret_key);
      if (!orbRange) {
        console.log(`[${ticker}] No ORB range yet`);
        continue;
      }
      
      // Get market data
      const marketData = await getMarketData(ticker, config.api_key_id, config.secret_key);
      if (!marketData) {
        console.log(`[${ticker}] No market data`);
        continue;
      }
      
      // Get pre-market change
      const premarketChange = await getPremarketChange(ticker, config.api_key_id, config.secret_key);
      
      // Check for signal (with trend filter)
      const { signal, skipReason } = checkORBSignal(
        orbRange.high,
        orbRange.low,
        marketData.price,
        marketData.volume,
        marketData.avgVolume,
        premarketChange,
        regimeData.longsAllowed,
        regimeData.regime,
        regimeData.strongUptrend
      );
      
      // Log ORB levels vs current price
      const distanceToHigh = ((marketData.price - orbRange.high) / orbRange.high * 100).toFixed(2);
      const distanceToLow = ((marketData.price - orbRange.low) / orbRange.low * 100).toFixed(2);
      const volumeRatio = (marketData.volume / marketData.avgVolume).toFixed(2);
      
      console.log(`[${ticker}] ORB: $${orbRange.low.toFixed(2)} - $${orbRange.high.toFixed(2)} | Price: $${marketData.price.toFixed(2)} | To High: ${distanceToHigh}% | To Low: ${distanceToLow}% | Vol: ${volumeRatio}x`);
      
      if (!signal) {
        console.log(`[${ticker}] Skip: ${skipReason}`);
        continue;
      }
      
      // Calculate stop loss - with ATR fallback for tight ranges
      const orbHeight = orbRange.high - orbRange.low;
      const orbRangePercent = (orbHeight / marketData.price) * 100;
      
      let stopDistance = orbHeight;
      let useATRStop = false;
      
      // NEW: ATR-based stop fallback for tight ORB ranges
      if (orbRangePercent < CONFIG.MIN_ORB_RANGE_PERCENT) {
        const atr = await getATR(ticker, config.api_key_id, config.secret_key);
        if (atr && atr > orbHeight) {
          stopDistance = atr * CONFIG.ATR_STOP_MULTIPLIER;
          useATRStop = true;
          console.log(`[${ticker}] ORB range ${orbRangePercent.toFixed(2)}% < ${CONFIG.MIN_ORB_RANGE_PERCENT}% - Using ATR stop: $${stopDistance.toFixed(2)} (1.5x ATR)`);
        }
      }
      
      const stopLoss = signal === 'long' 
        ? marketData.price - stopDistance 
        : marketData.price + stopDistance;
      
      // UPDATED: Target is 3x ORB height (was 2x)
      const target = signal === 'long' 
        ? marketData.price + (CONFIG.TARGET_R_MULTIPLE * stopDistance)
        : marketData.price - (CONFIG.TARGET_R_MULTIPLE * stopDistance);
      
      const spyAboveSMA = regimeData.spyPrice > regimeData.sma200;
      const { shares, riskPercent, isAggressiveBull } = calculatePositionSize(
        accountInfo.equity,
        marketData.price,
        stopLoss,
        rank,
        regimeData.vixLevel,
        regimeData.regime,
        spyAboveSMA
      );
      
      if (shares <= 0) {
        console.log(`[${ticker}] Position size 0`);
        continue;
      }
      
      console.log(`[${ticker}] SIGNAL: ${signal.toUpperCase()} @ $${marketData.price.toFixed(2)}, ${shares} shares, Risk: ${(riskPercent * 100).toFixed(1)}%${useATRStop ? ' (ATR stop)' : ''}, Target: 3R`);
      
      // Execute trade
      const result = await executeTrade(
        ticker,
        signal === 'long' ? 'buy' : 'sell',
        shares,
        stopLoss,
        target,
        config.api_key_id,
        config.secret_key,
        config.is_paper_trading
      );
      
      // Log trade
      await supabase.from('trade_logs').insert({
        user_id: config.user_id,
        symbol: ticker,
        side: signal === 'long' ? 'buy' : 'sell',
        qty: shares,
        price: marketData.price,
        strategy: 'orb-max-growth',
        status: result.success ? 'success' : 'failed',
        error_message: result.error || null,
      });
      
      results.push({
        userId: config.user_id,
        ticker,
        signal,
        shares,
        price: marketData.price,
        stopLoss,
        target,
        riskPercent,
        regime: regimeData.regime,
        executed: result.success,
        error: result.error,
        useATRStop,
      });
      
      if (result.success) {
        console.log(`[${ticker}] ORDER FILLED: ${result.orderId}`);
      } else {
        console.log(`[${ticker}] ORDER FAILED: ${result.error}`);
      }
    }
  }

  return { results, skipped: false };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const timeInfo = getETTimeInfo();
  console.log(`[AUTO-TRADE] Triggered at ${timeInfo.hours}:${timeInfo.mins.toString().padStart(2, '0')} ET (${timeInfo.dayOfWeek === 0 ? 'Sun' : timeInfo.dayOfWeek === 6 ? 'Sat' : 'Weekday'})`);

  // Check for test mode or special commands
  let testMode = false;
  let forceEODFlatten = false;
  let simulateTime: number | null = null;
  let testEodFlatten = false;
  let testSmciEod = false; // New: Test SMCI at 4:01 PM ET
  
  try {
    const body = await req.json();
    testMode = body?.test === true;
    forceEODFlatten = body?.forceEODFlatten === true;
    simulateTime = body?.simulateTimeMinutes || null;
    testEodFlatten = body?.testEodFlatten === true;
    testSmciEod = body?.testSmciEod === true; // Test: Simulate SMCI position at 4:01 PM
  } catch {
    // No body or invalid JSON, continue normally
  }

  // For testing: simulate a specific time
  if (simulateTime !== null) {
    console.log(`\n=== SIMULATING TIME: ${Math.floor(simulateTime / 60)}:${(simulateTime % 60).toString().padStart(2, '0')} ET ===`);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // NEW: Check and auto-reset daily loss locks on new trading day
  await checkAndResetDailyLock(supabase);

  // Force EOD flatten (for testing or manual trigger)
  if (forceEODFlatten) {
    console.log('\n=== FORCED EOD FLATTEN ===');
    const result = await runAutoFlatten(supabase, 'Manual EOD flatten trigger');
    return new Response(
      JSON.stringify({ 
        action: 'eod_flatten',
        flattened: result.flattened, 
        errors: result.errors,
        timeET: `${timeInfo.hours}:${timeInfo.mins.toString().padStart(2, '0')}` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Check for 4:00 PM EOD flatten - UNBREAKABLE rule to prevent overnight holds
  const effectiveTime = simulateTime !== null ? simulateTime : timeInfo.minutes;
  const isEODTime = effectiveTime >= CONFIG.EOD_FLATTEN;
  const isWeekday = timeInfo.dayOfWeek !== 0 && timeInfo.dayOfWeek !== 6;
  
  console.log(`[EOD-CHECK] Current time: ${timeInfo.timeString} ET | Effective time: ${Math.floor(effectiveTime / 60)}:${(effectiveTime % 60).toString().padStart(2, '0')} ET`);
  console.log(`[EOD-CHECK] EOD threshold: 16:00 ET (${CONFIG.EOD_FLATTEN} minutes) | Is EOD time: ${isEODTime} | Is weekday: ${isWeekday}`);
  
  if (isEODTime && isWeekday) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`=== 4:00 PM ET - UNBREAKABLE END OF DAY FLATTEN ===`);
    console.log(`${'='.repeat(60)}`);
    console.log(`[EOD] This flatten CANNOT be bypassed - all positions MUST close to prevent overnight holds`);

    // Test: Simulate SMCI position at 4:01 PM ET
    if (testSmciEod) {
      console.log('\n[TEST] Simulating SMCI open position at 4:01 PM ET');
      console.log('[TEST] Expected behavior: SMCI MUST be closed automatically');
      (supabase as any).__simulateCloseOnly = true;
      (supabase as any).__configsOverride = [
        {
          id: 'test-config-smci',
          user_id: 'test-user-smci',
          api_key_id: 'test',
          secret_key: 'test',
          is_paper_trading: true,
          selected_strategy: 'orb-max-growth',
          auto_trading_enabled: true,
        } satisfies TradingConfig,
      ];
      (supabase as any).__positionsOverrideByUser = {
        'test-user-smci': [
          {
            symbol: 'SMCI',
            qty: '100',
            side: 'long',
            avg_entry_price: '32.50',
            unrealized_pl: '-45.00',
          } satisfies Position,
        ],
      };
    }
    // Legacy test hook for AAPL
    else if (testEodFlatten) {
      console.log('[EOD-TEST] Running simulated EOD flatten (no Alpaca calls)');
      (supabase as any).__simulateCloseOnly = true;
      (supabase as any).__configsOverride = [
        {
          id: 'test-config',
          user_id: 'test-user',
          api_key_id: 'test',
          secret_key: 'test',
          is_paper_trading: true,
          selected_strategy: 'orb-max-growth',
          auto_trading_enabled: true,
        } satisfies TradingConfig,
      ];
      (supabase as any).__positionsOverrideByUser = {
        'test-user': [
          {
            symbol: 'AAPL',
            qty: '10',
            side: 'long',
            avg_entry_price: '100',
            unrealized_pl: '25',
          } satisfies Position,
        ],
      };
    }

    const result = await runAutoFlatten(supabase, 'End-of-day flatten (4:00 PM ET) - Preventing overnight holds');
    
    const response: any = { 
      action: 'eod_flatten',
      reason: 'End-of-day flatten (4:00 PM ET)',
      message: 'UNBREAKABLE: All positions closed to prevent overnight holds',
      flattened: result.flattened, 
      errors: result.errors,
      timeET: `${timeInfo.hours}:${timeInfo.mins.toString().padStart(2, '0')}`,
      effectiveTimeET: `${Math.floor(effectiveTime / 60)}:${(effectiveTime % 60).toString().padStart(2, '0')}`
    };
    
    if (testSmciEod) {
      response.test = 'SMCI EOD flatten simulation';
      response.testResult = result.flattened > 0 ? 'PASS - SMCI was closed' : 'FAIL - SMCI was NOT closed';
      console.log(`\n[TEST RESULT] ${response.testResult}`);
    }
    
    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Test mode: simulate aggressive bull conditions
  if (testMode) {
    console.log('\n=== TEST MODE: AGGRESSIVE BULL SIMULATION ===');
    const simulatedRegime = {
      spyPrice: 520.50,
      sma200: 480.00,
      vixLevel: 16.0,
      regime: 'bull' as const,
      longsAllowed: true,
    };
    const spyAboveSMA = simulatedRegime.spyPrice > simulatedRegime.sma200;
    
    console.log(`[TEST] SPY: $${simulatedRegime.spyPrice} > 200-SMA: $${simulatedRegime.sma200} → Above SMA: ${spyAboveSMA}`);
    console.log(`[TEST] VIX: ${simulatedRegime.vixLevel} ≤ 18 → Low volatility: YES`);
    console.log(`[TEST] Regime: ${simulatedRegime.regime.toUpperCase()}`);
    
    // Test position sizing with mock data
    const testEquity = 100000;
    const testEntryPrice = 150.00;
    const testStopLoss = 148.00; // $2 risk per share
    
    const rank1Result = calculatePositionSize(testEquity, testEntryPrice, testStopLoss, 1, simulatedRegime.vixLevel, simulatedRegime.regime, spyAboveSMA);
    const rank2Result = calculatePositionSize(testEquity, testEntryPrice, testStopLoss, 2, simulatedRegime.vixLevel, simulatedRegime.regime, spyAboveSMA);
    
    console.log(`\n[TEST] Position Sizing Simulation:`);
    console.log(`  Equity: $${testEquity.toLocaleString()}`);
    console.log(`  Entry: $${testEntryPrice}, Stop: $${testStopLoss} (Risk/share: $${(testEntryPrice - testStopLoss).toFixed(2)})`);
    console.log(`\n  #1 Ranked Stock:`);
    console.log(`    Risk: ${(rank1Result.riskPercent * 100).toFixed(1)}% ($${(testEquity * rank1Result.riskPercent).toLocaleString()})`);
    console.log(`    Shares: ${rank1Result.shares}`);
    console.log(`    Aggressive Bull Mode: ${rank1Result.isAggressiveBull ? 'YES ✓' : 'NO'}`);
    console.log(`\n  #2 Ranked Stock:`);
    console.log(`    Risk: ${(rank2Result.riskPercent * 100).toFixed(1)}% ($${(testEquity * rank2Result.riskPercent).toLocaleString()})`);
    console.log(`    Shares: ${rank2Result.shares}`);
    console.log(`    Aggressive Bull Mode: ${rank2Result.isAggressiveBull ? 'YES' : 'NO'}`);
    
    // Verify expected values
    const expectedRisk1 = 0.03; // 3% in aggressive bull
    const expectedRisk2 = 0.01; // 1% for #2-4
    const tests = [
      { name: '#1 risk is 3%', pass: rank1Result.riskPercent === expectedRisk1 },
      { name: '#2 risk is 1%', pass: rank2Result.riskPercent === expectedRisk2 },
      { name: '#1 aggressive bull flag', pass: rank1Result.isAggressiveBull === true },
      { name: '#2 aggressive bull flag false', pass: rank2Result.isAggressiveBull === false },
      { name: '#1 shares = 1500', pass: rank1Result.shares === 1500 }, // $3000 risk / $2 per share
      { name: '#2 shares = 500', pass: rank2Result.shares === 500 },   // $1000 risk / $2 per share
    ];
    
    console.log(`\n=== TEST RESULTS ===`);
    tests.forEach(t => console.log(`  ${t.pass ? '✓' : '✗'} ${t.name}`));
    const allPassed = tests.every(t => t.pass);
    console.log(`\n  ${allPassed ? '✓ ALL TESTS PASSED' : '✗ SOME TESTS FAILED'}`);
    
    return new Response(
      JSON.stringify({ 
        test: true, 
        allPassed,
        regime: simulatedRegime,
        results: {
          rank1: { ...rank1Result, expectedRisk: '3%' },
          rank2: { ...rank2Result, expectedRisk: '1%' },
        },
        tests
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Check for dynamic flatten (10:15 AM rule)
  if (shouldCheckDynamicFlatten()) {
    const dynamicResult = await runDynamicFlatten(supabase);
    if (dynamicResult.flattened > 0) {
      console.log(`Dynamic flatten: ${dynamicResult.flattened} positions closed, ${dynamicResult.extended} extended`);
    }
  }

  // Quick check if we're outside trading window entirely
  if (!isWithinTradingWindow()) {
    console.log('Outside ORB trading window (9:29-11:00 AM ET)');
    return new Response(
      JSON.stringify({ message: 'Outside trading window', timeET: `${timeInfo.hours}:${timeInfo.mins}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Run first trading cycle immediately
    console.log('\n=== CYCLE 1 (0s) ===');
    const cycle1 = await runTradingCycle(supabase);
    
    if (cycle1.skipped) {
      console.log(`Cycle 1 skipped: ${cycle1.reason}`);
    } else {
      console.log(`Cycle 1 complete: ${cycle1.results.length} signals processed`);
    }

    // Wait 30 seconds then run second cycle
    console.log('\n--- Waiting 30 seconds for Cycle 2 ---');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Run second trading cycle
    console.log('\n=== CYCLE 2 (30s) ===');
    const cycle2 = await runTradingCycle(supabase);
    
    if (cycle2.skipped) {
      console.log(`Cycle 2 skipped: ${cycle2.reason}`);
    } else {
      console.log(`Cycle 2 complete: ${cycle2.results.length} signals processed`);
    }

    const allResults = [...cycle1.results, ...cycle2.results];
    console.log(`\n=== AUTO-TRADE COMPLETE: ${allResults.length} total signals processed ===`);

    return new Response(
      JSON.stringify({ success: true, results: allResults, cycles: 2 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Auto-trade error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
