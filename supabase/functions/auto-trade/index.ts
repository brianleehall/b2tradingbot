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
// MAX-GROWTH CONFIGURATION
// =====================
const CONFIG = {
  // Session timing (minutes from midnight ET)
  ORB_START: 9 * 60 + 30,      // 9:30 AM
  ORB_END: 9 * 60 + 35,        // 9:35 AM
  TRADING_START: 9 * 60 + 29,  // 9:29 AM
  TRADING_END: 10 * 60 + 30,   // 10:30 AM
  FIRST_FLATTEN: 10 * 60 + 15, // 10:15 AM
  EXTENDED_END: 11 * 60 + 30,  // 11:30 AM max
  REENTRY_START: 9 * 60 + 50,  // 9:50 AM
  REENTRY_END: 10 * 60 + 5,    // 10:05 AM
  EOD_FLATTEN: 16 * 60,        // 4:00 PM - Force flatten all positions
  
  // Risk management
  TIER1_RISK: 0.02,            // 2% for #1 ranked stock (default)
  TIER1_AGGRESSIVE_RISK: 0.03, // 3% for #1 in aggressive bull mode
  TIER2_RISK: 0.01,            // 1% for #2-4
  MAX_TRADES_PER_DAY: 3,
  MAX_DAILY_LOSS_PERCENT: 0.03, // -3% daily stop
  
  // Crypto allocation
  CRYPTO_MAX_PORTFOLIO_PERCENT: 0.20, // Max 20% of portfolio for crypto
  CRYPTO_RISK_PER_TRADE: 0.005,       // 0.5% risk per crypto trade
  
  // Filters
  VIX_SHORTS_ONLY_THRESHOLD: 25,
  VIX_DOUBLE_SIZE_THRESHOLD: 18,
  PREMARKET_COOLOFF_PERCENT: 8,
  LOW_VOLUME_THRESHOLD: 0.8,
  PROFIT_EXTENSION_R: 1.5,
  
  // Volume confirmation
  MIN_VOLUME_RATIO: 1.5,
};

// Proper timezone handling using Intl API
function getETTimeInfo(): { minutes: number; hours: number; mins: number; date: Date; dayOfWeek: number } {
  const now = new Date();
  // Use proper timezone conversion
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
  
  return { minutes: hours * 60 + mins, hours, mins, date: etDate, dayOfWeek };
}

function isWithinTradingWindow(): boolean {
  const { minutes, dayOfWeek } = getETTimeInfo();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false; // Weekend
  return minutes >= CONFIG.TRADING_START && minutes <= CONFIG.TRADING_END;
}

function isMarketHours(): boolean {
  const { minutes, dayOfWeek } = getETTimeInfo();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false; // Weekend
  return minutes >= CONFIG.ORB_START && minutes < CONFIG.EOD_FLATTEN;
}

function shouldFlattenEOD(): boolean {
  const { minutes, dayOfWeek } = getETTimeInfo();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  return minutes >= CONFIG.EOD_FLATTEN;
}

function shouldCheckDynamicFlatten(): boolean {
  const { minutes, dayOfWeek } = getETTimeInfo();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  return minutes >= CONFIG.FIRST_FLATTEN;
}

// Get combined market regime (SPY 200-SMA + VIX)
async function getCombinedRegime(apiKeyId: string, secretKey: string): Promise<{
  spyPrice: number;
  sma200: number;
  vixLevel: number;
  regime: 'bull' | 'elevated_vol' | 'bear';
  longsAllowed: boolean;
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
    
    // Get 200-day SMA from Polygon
    let sma200 = 0;
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
          const sum = bars.slice(0, 200).reduce((acc: number, bar: any) => acc + bar.c, 0);
          sma200 = sum / 200;
        } else {
          sma200 = spyPrice * 0.95;
        }
      }
    } else {
      sma200 = spyPrice * 0.95;
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
    const spyAboveSMA = spyPrice > sma200;
    const vixLow = vixLevel <= CONFIG.VIX_SHORTS_ONLY_THRESHOLD;
    
    let regime: 'bull' | 'elevated_vol' | 'bear';
    let longsAllowed: boolean;
    
    if (spyAboveSMA && vixLow) {
      regime = 'bull';
      longsAllowed = true;
    } else if (spyAboveSMA && !vixLow) {
      regime = 'elevated_vol';
      longsAllowed = false;
    } else {
      regime = 'bear';
      longsAllowed = false;
    }
    
    console.log(`[REGIME] SPY: $${spyPrice.toFixed(2)}, 200-SMA: $${sma200.toFixed(2)}, VIX: ${vixLevel.toFixed(1)} → ${regime.toUpperCase()} (Longs: ${longsAllowed ? 'YES' : 'NO'})`);
    
    return { spyPrice, sma200, vixLevel, regime, longsAllowed };
  } catch (error) {
    console.error('Error fetching regime:', error);
    return { spyPrice: 0, sma200: 0, vixLevel: 20, regime: 'bull', longsAllowed: true };
  }
}

// Get ORB range (first 5-min candle)
async function getORBRange(ticker: string, apiKeyId: string, secretKey: string): Promise<{ high: number; low: number } | null> {
  try {
    const now = new Date();
    const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dateStr = etDate.toISOString().split('T')[0];
    
    const response = await fetch(
      `https://data.alpaca.markets/v2/stocks/${ticker}/bars?timeframe=5Min&start=${dateStr}T09:30:00-05:00&end=${dateStr}T09:35:00-05:00&limit=1`,
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

// Check ORB breakout signal with all filters
function checkORBSignal(
  orbHigh: number,
  orbLow: number,
  currentPrice: number,
  volume: number,
  avgVolume: number,
  premarketChange: number,
  longsAllowed: boolean,
  regime: string
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
  
  // Short breakout
  if (currentPrice < orbLow && volumeCondition) {
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
      notes: JSON.stringify({
        reason,
        entryPrice,
        exitPrice,
        pnl,
        timestamp: new Date().toISOString(),
      }),
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
async function runAutoFlatten(supabase: any, reason: string): Promise<{ flattened: number; errors: number }> {
  console.log(`\n=== AUTO-FLATTEN: ${reason} ===`);
  
  // Get all active trading configs
  const { data: configs, error } = await supabase.rpc('get_active_trading_configs');
  
  if (error || !configs || configs.length === 0) {
    console.log('No active trading configs found');
    return { flattened: 0, errors: 0 };
  }
  
  let flattened = 0;
  let errors = 0;
  
  for (const config of configs as TradingConfig[]) {
    console.log(`\n--- Processing user ${config.user_id} ---`);
    
    // Cancel all open orders first
    await cancelAllOrders(config.api_key_id, config.secret_key, config.is_paper_trading);
    
    // Get all open positions
    const positions = await getOpenPositions(config.api_key_id, config.secret_key, config.is_paper_trading);
    
    if (positions.length === 0) {
      console.log('No open positions');
      continue;
    }
    
    console.log(`Found ${positions.length} open positions`);
    
    for (const position of positions) {
      const symbol = position.symbol;
      const qty = Math.abs(parseFloat(position.qty));
      const entryPrice = parseFloat(position.avg_entry_price);
      const unrealizedPnL = parseFloat(position.unrealized_pl);
      
      // Get current price for logging
      const marketData = await getMarketData(symbol, config.api_key_id, config.secret_key);
      const exitPrice = marketData?.price || entryPrice;
      
      console.log(`[${symbol}] Closing ${qty} shares @ ~$${exitPrice.toFixed(2)} | P&L: $${unrealizedPnL.toFixed(2)}`);
      
      const result = await closePosition(symbol, config.api_key_id, config.secret_key, config.is_paper_trading);
      
      if (result.success) {
        flattened++;
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
        console.error(`[${symbol}] Failed to close: ${result.error}`);
      }
    }
  }
  
  console.log(`\n=== FLATTEN COMPLETE: ${flattened} closed, ${errors} errors ===`);
  return { flattened, errors };
}

// Run dynamic flatten check (10:15 AM rule with +1.5R extension)
async function runDynamicFlatten(supabase: any): Promise<{ flattened: number; extended: number }> {
  const timeInfo = getETTimeInfo();
  console.log(`\n=== DYNAMIC FLATTEN CHECK at ${timeInfo.hours}:${timeInfo.mins.toString().padStart(2, '0')} ET ===`);
  
  // Only run after 10:15 AM ET
  if (timeInfo.minutes < CONFIG.FIRST_FLATTEN) {
    return { flattened: 0, extended: 0 };
  }
  
  // If past 11:30 AM, force flatten everything
  if (timeInfo.minutes >= CONFIG.EXTENDED_END) {
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
      
      // If position is +1.5R or better, allow extension to 11:30 AM
      if (rMultiple >= CONFIG.PROFIT_EXTENSION_R) {
        console.log(`[${symbol}] +${rMultiple.toFixed(2)}R ≥ 1.5R → Session extended to 11:30 AM`);
        extended++;
        // TODO: Could implement trailing stop to 9 EMA here
      } else if (timeInfo.minutes >= CONFIG.FIRST_FLATTEN + 15) {
        // After 10:30 AM, flatten positions not meeting threshold
        await closePosition(symbol, config.api_key_id, config.secret_key, config.is_paper_trading);
        await logFlattenEvent(supabase, config.user_id, symbol, `Dynamic stop at ${timeInfo.hours}:${timeInfo.mins.toString().padStart(2, '0')} ET (${rMultiple.toFixed(2)}R < 1.5R)`, qty, entryPrice, marketData.price, unrealizedPnL);
        flattened++;
      }
    }
  }
  
  return { flattened, extended };
}

// Core trading logic extracted for reuse
async function runTradingCycle(supabase: any): Promise<{ results: any[], skipped: boolean, reason?: string }> {
  const timeInfo = getETTimeInfo();
  console.log(`[TRADE-CYCLE] Running at ${timeInfo.hours}:${timeInfo.mins.toString().padStart(2, '0')} ET`);

  // Check trading window
  if (!isWithinTradingWindow()) {
    return { results: [], skipped: true, reason: 'Outside ORB trading window (9:29-10:30 AM ET)' };
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
    
    // Check daily loss limit
    if (accountInfo.dailyPnLPercent <= -(CONFIG.MAX_DAILY_LOSS_PERCENT * 100)) {
      console.log(`Daily loss limit hit: ${accountInfo.dailyPnLPercent.toFixed(2)}%`);
      continue;
    }
    
    // Check max trades per day
    if (accountInfo.tradesToday >= CONFIG.MAX_TRADES_PER_DAY) {
      console.log(`Max trades reached: ${accountInfo.tradesToday}/${CONFIG.MAX_TRADES_PER_DAY}`);
      continue;
    }

    // Get market regime
    const regimeData = await getCombinedRegime(config.api_key_id, config.secret_key);
    
    // Get today's ORB stocks from the daily scan (auto-selected)
    const today = new Date().toISOString().split('T')[0];
    const { data: dailyStocks, error: stocksError } = await supabase
      .from('daily_orb_stocks')
      .select('symbol')
      .eq('scan_date', today)
      .order('rvol', { ascending: false })
      .limit(4);
    
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
        .limit(4);
      
      if (yesterdayStocks && yesterdayStocks.length > 0) {
        tickers = yesterdayStocks.map((s: { symbol: string }) => s.symbol);
        console.log(`Using yesterday's stocks (today's scan pending): ${tickers.join(', ')}`);
      } else {
        // Ultimate fallback to proven ORB leaders
        tickers = ['NVDA', 'TSLA'];
        console.log(`Using fallback stocks: ${tickers.join(', ')}`);
      }
    }
    
    console.log(`Tickers: ${tickers.join(', ')}`);
    
    // Process each ticker by rank
    for (let i = 0; i < tickers.length && accountInfo.tradesToday + i < CONFIG.MAX_TRADES_PER_DAY; i++) {
      const ticker = tickers[i];
      const rank = i + 1;
      
      // Get ORB range
      const orbRange = await getORBRange(ticker, config.api_key_id, config.secret_key);
      if (!orbRange) {
        console.log(`[${ticker}] No ORB range`);
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
      
      // Check for signal
      const { signal, skipReason } = checkORBSignal(
        orbRange.high,
        orbRange.low,
        marketData.price,
        marketData.volume,
        marketData.avgVolume,
        premarketChange,
        regimeData.longsAllowed,
        regimeData.regime
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
      
      // Calculate position size
      const stopLoss = signal === 'long' ? orbRange.low : orbRange.high;
      const orbHeight = orbRange.high - orbRange.low;
      const target = signal === 'long' 
        ? marketData.price + (2 * orbHeight)
        : marketData.price - (2 * orbHeight);
      
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
      
      console.log(`[${ticker}] SIGNAL: ${signal.toUpperCase()} @ $${marketData.price.toFixed(2)}, ${shares} shares, Risk: ${(riskPercent * 100).toFixed(1)}%`);
      
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
  
  try {
    const body = await req.json();
    testMode = body?.test === true;
    forceEODFlatten = body?.forceEODFlatten === true;
    simulateTime = body?.simulateTimeMinutes || null;
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

  // Check for 4:00 PM EOD flatten
  const effectiveTime = simulateTime !== null ? simulateTime : timeInfo.minutes;
  if (effectiveTime >= CONFIG.EOD_FLATTEN && timeInfo.dayOfWeek !== 0 && timeInfo.dayOfWeek !== 6) {
    console.log('\n=== 4:00 PM ET - END OF DAY FLATTEN ===');
    const result = await runAutoFlatten(supabase, 'End of day flatten (4:00 PM ET)');
    return new Response(
      JSON.stringify({ 
        action: 'eod_flatten',
        reason: 'End of day - no overnight positions',
        flattened: result.flattened, 
        errors: result.errors,
        timeET: `${timeInfo.hours}:${timeInfo.mins.toString().padStart(2, '0')}` 
      }),
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
    console.log('Outside ORB trading window (9:29-10:30 AM ET)');
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
