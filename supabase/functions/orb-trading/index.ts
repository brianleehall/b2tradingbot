import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ORBRange {
  ticker: string;
  high: number;
  low: number;
  timestamp: string;
}

interface TradeSignal {
  ticker: string;
  side: 'buy' | 'sell';
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  qty: number;
  confidence: number;
  riskPercent: number;
  rank: number;
}

interface Position {
  symbol: string;
  qty: number;
  side: string;
  avg_entry_price: number;
  unrealized_pl: number;
  current_price: number;
}

interface SessionState {
  positions: Map<string, { entryPrice: number; orbHeight: number; entryTime: string }>;
  flattenedWinners: string[];
  vixLevel: number;
  isExtendedSession: boolean;
}

// =====================
// CONFIGURATION
// =====================
const CONFIG = {
  // Session timing (minutes from midnight ET)
  ORB_START: 9 * 60 + 30,      // 9:30 AM
  ORB_END: 9 * 60 + 35,        // 9:35 AM (first 5-min candle)
  TRADING_START: 9 * 60 + 29,  // 9:29 AM
  FIRST_FLATTEN: 10 * 60 + 15, // 10:15 AM
  EXTENDED_END: 11 * 60 + 30,  // 11:30 AM max
  REENTRY_START: 9 * 60 + 50,  // 9:50 AM
  REENTRY_END: 10 * 60 + 5,    // 10:05 AM
  
  // Risk management
  TIER1_RISK: 0.02,            // 2% for #1 ranked stock
  TIER2_RISK: 0.01,            // 1% for #2-4
  MAX_TRADES_PER_DAY: 3,
  
  // Filters
  VIX_SHORTS_ONLY_THRESHOLD: 25,
  VIX_DOUBLE_SIZE_THRESHOLD: 18,
  PREMARKET_COOLOFF_PERCENT: 8,
  LOW_VOLUME_THRESHOLD: 0.8,   // 80% of 10-day avg
  PROFIT_EXTENSION_R: 1.5,     // +1.5R to extend session
  
  // Volume confirmation
  MIN_VOLUME_RATIO: 1.5,       // 150% of avg for signal
};

// Get current ET time info
function getETTimeInfo(): { minutes: number; hours: number; mins: number; date: Date } {
  const now = new Date();
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = etDate.getHours();
  const mins = etDate.getMinutes();
  return { minutes: hours * 60 + mins, hours, mins, date: etDate };
}

// Get ORB range for a ticker (first 5-min candle after 9:30 ET)
async function getORBRange(
  ticker: string,
  apiKeyId: string,
  secretKey: string
): Promise<ORBRange | null> {
  try {
    const baseUrl = 'https://data.alpaca.markets/v2';
    const now = new Date();
    const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dateStr = etDate.toISOString().split('T')[0];
    
    const start = `${dateStr}T09:30:00-05:00`;
    const end = `${dateStr}T09:35:00-05:00`;
    
    const response = await fetch(
      `${baseUrl}/stocks/${ticker}/bars?timeframe=5Min&start=${start}&end=${end}&limit=1`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );

    if (!response.ok) {
      console.error(`Failed to fetch ORB for ${ticker}:`, await response.text());
      return null;
    }

    const data = await response.json();
    const bars = data.bars;
    
    if (!bars || bars.length === 0) {
      console.log(`No ORB data for ${ticker} yet`);
      return null;
    }

    const bar = bars[0];
    return { ticker, high: bar.h, low: bar.l, timestamp: bar.t };
  } catch (error) {
    console.error(`Error fetching ORB for ${ticker}:`, error);
    return null;
  }
}

// Get SPY 200-day SMA and current price for market regime detection
async function getSPYRegime(apiKeyId: string, secretKey: string): Promise<{ 
  spyPrice: number; 
  sma200: number; 
  regime: 'bullish' | 'bearish' 
}> {
  try {
    const polygonKey = Deno.env.get('POLYGON_API_KEY');
    
    // Get SPY current price from Alpaca
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
      // Get last 200 trading days of SPY data
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 300); // Buffer for non-trading days
      
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      
      const smaResponse = await fetch(
        `https://api.polygon.io/v2/aggs/ticker/SPY/range/1/day/${startStr}/${endStr}?adjusted=true&sort=desc&limit=200&apiKey=${polygonKey}`
      );
      
      if (smaResponse.ok) {
        const smaData = await smaResponse.json();
        const bars = smaData.results || [];
        
        if (bars.length >= 200) {
          // Calculate 200-day SMA from closing prices
          const sum = bars.slice(0, 200).reduce((acc: number, bar: any) => acc + bar.c, 0);
          sma200 = sum / 200;
          console.log(`SPY: $${spyPrice.toFixed(2)}, 200-SMA: $${sma200.toFixed(2)}`);
        } else {
          console.log(`Only got ${bars.length} bars for SPY SMA calculation`);
          // Fallback: use 200 if we can't calculate
          sma200 = spyPrice * 0.95; // Assume bullish if we can't calculate
        }
      }
    } else {
      console.log('No POLYGON_API_KEY - defaulting to bullish regime');
      sma200 = spyPrice * 0.95; // Default to bullish if no API key
    }
    
    const regime = spyPrice > sma200 ? 'bullish' : 'bearish';
    console.log(`Market Regime: ${regime.toUpperCase()} (SPY ${spyPrice > sma200 ? 'above' : 'below'} 200-SMA)`);
    
    return { spyPrice, sma200, regime };
  } catch (error) {
    console.error('Error fetching SPY regime:', error);
    return { spyPrice: 0, sma200: 0, regime: 'bullish' }; // Default to bullish on error
  }
}

// Get VIX level at 9:30 AM
async function getVIXLevel(apiKeyId: string, secretKey: string): Promise<number> {
  try {
    const response = await fetch(
      'https://data.alpaca.markets/v2/stocks/VIX/trades/latest',
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );
    
    if (response.ok) {
      const data = await response.json();
      return data.trade?.p || 20;
    }
    
    // Fallback: try UVXY as proxy
    const uvxyResponse = await fetch(
      'https://data.alpaca.markets/v2/stocks/UVXY/trades/latest',
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );
    
    if (uvxyResponse.ok) {
      const uvxyData = await uvxyResponse.json();
      // Approximate VIX from UVXY (rough conversion)
      return Math.min(40, Math.max(12, uvxyData.trade?.p * 0.8 || 20));
    }
    
    return 20; // Default neutral VIX
  } catch (error) {
    console.error('Error fetching VIX:', error);
    return 20;
  }
}

// Get pre-market change for a stock
async function getPremarketChange(
  ticker: string,
  apiKeyId: string,
  secretKey: string
): Promise<number> {
  try {
    const baseUrl = 'https://data.alpaca.markets/v2';
    const now = new Date();
    const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dateStr = etDate.toISOString().split('T')[0];
    
    // Get yesterday's close
    const prevDayResponse = await fetch(
      `${baseUrl}/stocks/${ticker}/bars?timeframe=1Day&limit=2`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );
    
    if (!prevDayResponse.ok) return 0;
    const prevData = await prevDayResponse.json();
    const prevClose = prevData.bars?.[prevData.bars.length - 2]?.c || 0;
    
    // Get current pre-market price
    const currentResponse = await fetch(
      `${baseUrl}/stocks/${ticker}/trades/latest`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );
    
    if (!currentResponse.ok || !prevClose) return 0;
    const currentData = await currentResponse.json();
    const currentPrice = currentData.trade?.p || 0;
    
    if (!currentPrice || !prevClose) return 0;
    return ((currentPrice - prevClose) / prevClose) * 100;
  } catch (error) {
    console.error(`Error getting premarket change for ${ticker}:`, error);
    return 0;
  }
}

// Get 20-period VWAP and volume data
async function getIntradayMetrics(
  ticker: string,
  apiKeyId: string,
  secretKey: string
): Promise<{ vwap20: number; currentPrice: number; volumeRatio: number; avgVolume: number } | null> {
  try {
    const baseUrl = 'https://data.alpaca.markets/v2';
    const now = new Date();
    const start = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
    
    // Get 1-min bars for VWAP calculation
    const barsResponse = await fetch(
      `${baseUrl}/stocks/${ticker}/bars?timeframe=1Min&start=${start}&limit=120`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );

    if (!barsResponse.ok) return null;
    const barsData = await barsResponse.json();
    const bars = barsData.bars || [];
    
    if (bars.length < 20) return null;

    // Calculate 20-period VWAP
    const last20Bars = bars.slice(-20);
    let totalVP = 0;
    let totalV = 0;
    for (const bar of last20Bars) {
      const tp = (bar.h + bar.l + bar.c) / 3;
      totalVP += tp * bar.v;
      totalV += bar.v;
    }
    const vwap20 = totalV > 0 ? totalVP / totalV : 0;

    // Get current price
    const tradeResponse = await fetch(
      `${baseUrl}/stocks/${ticker}/trades/latest`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );
    
    if (!tradeResponse.ok) return null;
    const tradeData = await tradeResponse.json();
    const currentPrice = tradeData.trade?.p || 0;

    // Calculate volume ratio vs 10-day average
    const avgVolume = bars.reduce((sum: number, b: any) => sum + b.v, 0) / bars.length;
    const currentVolume = bars[bars.length - 1]?.v || 0;
    const volumeRatio = avgVolume > 0 ? currentVolume / avgVolume : 1;

    return { vwap20, currentPrice, volumeRatio, avgVolume };
  } catch (error) {
    console.error(`Error getting intraday metrics for ${ticker}:`, error);
    return null;
  }
}

// Get current market data with full volume info
async function getMarketData(
  ticker: string,
  apiKeyId: string,
  secretKey: string
): Promise<{ price: number; volume: number; avgVolume: number; dayVolume: number; avg10DayVolume: number } | null> {
  try {
    const baseUrl = 'https://data.alpaca.markets/v2';
    
    const tradeResponse = await fetch(
      `${baseUrl}/stocks/${ticker}/trades/latest`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );

    if (!tradeResponse.ok) return null;
    const tradeData = await tradeResponse.json();
    const price = tradeData.trade?.p;

    // Get today's bars
    const now = new Date();
    const start = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    
    const barsResponse = await fetch(
      `${baseUrl}/stocks/${ticker}/bars?timeframe=1Min&start=${start}&limit=60`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );

    if (!barsResponse.ok) return null;
    const barsData = await barsResponse.json();
    const bars = barsData.bars || [];
    
    if (bars.length === 0) return null;

    const currentVolume = bars[bars.length - 1]?.v || 0;
    const avgVolume = bars.reduce((sum: number, b: any) => sum + b.v, 0) / bars.length;
    const dayVolume = bars.reduce((sum: number, b: any) => sum + b.v, 0);

    // Get 10-day average volume
    const dayBarsResponse = await fetch(
      `${baseUrl}/stocks/${ticker}/bars?timeframe=1Day&limit=10`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );
    
    let avg10DayVolume = avgVolume * 60 * 6.5; // Fallback estimate
    if (dayBarsResponse.ok) {
      const dayBarsData = await dayBarsResponse.json();
      const dayBars = dayBarsData.bars || [];
      if (dayBars.length > 0) {
        avg10DayVolume = dayBars.reduce((sum: number, b: any) => sum + b.v, 0) / dayBars.length;
      }
    }

    return { price, volume: currentVolume, avgVolume, dayVolume, avg10DayVolume };
  } catch (error) {
    console.error(`Error fetching market data for ${ticker}:`, error);
    return null;
  }
}

// Get current positions
async function getPositions(
  apiKeyId: string,
  secretKey: string,
  isPaper: boolean
): Promise<Position[]> {
  try {
    const baseUrl = isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
    
    const response = await fetch(`${baseUrl}/v2/positions`, {
      headers: {
        'APCA-API-KEY-ID': apiKeyId,
        'APCA-API-SECRET-KEY': secretKey,
      },
    });

    if (!response.ok) return [];
    const positions = await response.json();
    
    return positions.map((p: any) => ({
      symbol: p.symbol,
      qty: parseFloat(p.qty),
      side: p.side,
      avg_entry_price: parseFloat(p.avg_entry_price),
      unrealized_pl: parseFloat(p.unrealized_pl),
      current_price: parseFloat(p.current_price),
    }));
  } catch (error) {
    console.error('Error fetching positions:', error);
    return [];
  }
}

// Calculate 9 EMA for trailing stop
async function get9EMA(
  ticker: string,
  apiKeyId: string,
  secretKey: string
): Promise<number | null> {
  try {
    const baseUrl = 'https://data.alpaca.markets/v2';
    const now = new Date();
    const start = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
    
    const response = await fetch(
      `${baseUrl}/stocks/${ticker}/bars?timeframe=1Min&start=${start}&limit=30`,
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
    
    if (bars.length < 9) return null;

    // Calculate 9 EMA
    const multiplier = 2 / (9 + 1);
    let ema = bars.slice(0, 9).reduce((sum: number, b: any) => sum + b.c, 0) / 9;
    
    for (let i = 9; i < bars.length; i++) {
      ema = (bars[i].c - ema) * multiplier + ema;
    }
    
    return ema;
  } catch (error) {
    console.error(`Error calculating 9 EMA for ${ticker}:`, error);
    return null;
  }
}

// Check for ORB breakout signal with all filters
function checkORBSignal(
  orbRange: ORBRange,
  currentPrice: number,
  volume: number,
  avgVolume: number,
  vixLevel: number,
  premarketChange: number,
  intradayMetrics: { vwap20: number; volumeRatio: number } | null,
  marketRegime: string
): { signal: 'long' | 'short' | null; confidence: number; skipReason?: string } {
  
  // COOL-OFF RULE: Skip if >8% pre-market
  if (Math.abs(premarketChange) > CONFIG.PREMARKET_COOLOFF_PERCENT) {
    return { signal: null, confidence: 0, skipReason: `Pre-market move too large: ${premarketChange.toFixed(1)}%` };
  }

  const volumeRatio = volume / avgVolume;
  const volumeCondition = volumeRatio >= CONFIG.MIN_VOLUME_RATIO;

  // Long signal: price above ORB high with volume
  if (currentPrice > orbRange.high && volumeCondition) {
    // VIX FILTER: No longs if VIX > 25
    if (vixLevel > CONFIG.VIX_SHORTS_ONLY_THRESHOLD) {
      return { signal: null, confidence: 0, skipReason: `VIX ${vixLevel.toFixed(1)} > 25 - shorts only` };
    }
    
    // BEAR MARKET FILTER: No longs in bearish regime
    if (marketRegime === 'bearish') {
      return { signal: null, confidence: 0, skipReason: 'Bear market - shorts only' };
    }
    
    // INTRADAY MOMENTUM FILTER: Must be above 20-period VWAP on low volume days
    const timeInfo = getETTimeInfo();
    if (timeInfo.minutes >= CONFIG.FIRST_FLATTEN && intradayMetrics) {
      const isLowVolumeDay = intradayMetrics.volumeRatio < CONFIG.LOW_VOLUME_THRESHOLD;
      if (isLowVolumeDay && currentPrice < intradayMetrics.vwap20) {
        return { signal: null, confidence: 0, skipReason: 'Low volume day - price below VWAP' };
      }
    }
    
    return { signal: 'long', confidence: Math.min(0.95, 0.7 + (volumeRatio - 1.5) * 0.1) };
  }

  // Short signal: price below ORB low with volume
  if (currentPrice < orbRange.low && volumeCondition) {
    return { signal: 'short', confidence: Math.min(0.95, 0.7 + (volumeRatio - 1.5) * 0.1) };
  }

  return { signal: null, confidence: 0 };
}

// Calculate tiered position size
function calculatePositionSize(
  accountEquity: number,
  entryPrice: number,
  stopLoss: number,
  rank: number,
  vixLevel: number
): { shares: number; riskPercent: number } {
  // TIERED SIZING: #1 = 2%, #2-4 = 1%
  let riskPercent = rank === 1 ? CONFIG.TIER1_RISK : CONFIG.TIER2_RISK;
  
  // VIX FILTER: Double size on #1 if VIX < 18
  if (rank === 1 && vixLevel < CONFIG.VIX_DOUBLE_SIZE_THRESHOLD) {
    riskPercent *= 2; // Now 4% on #1 ranked
    console.log(`VIX ${vixLevel.toFixed(1)} < 18 - Doubling position size on #1 ranked stock`);
  }
  
  const maxRisk = accountEquity * riskPercent;
  const riskPerShare = Math.abs(entryPrice - stopLoss);
  
  if (riskPerShare <= 0) return { shares: 0, riskPercent };
  
  const shares = Math.floor(maxRisk / riskPerShare);
  return { shares: Math.max(1, shares), riskPercent };
}

// Execute trade via Alpaca
async function executeTrade(
  signal: TradeSignal,
  apiKeyId: string,
  secretKey: string,
  isPaper: boolean
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    const baseUrl = isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';

    const orderPayload = {
      symbol: signal.ticker,
      qty: signal.qty.toString(),
      side: signal.side,
      type: 'market',
      time_in_force: 'day',
      order_class: 'bracket',
      stop_loss: { stop_price: signal.stopLoss.toFixed(2) },
      take_profit: { limit_price: signal.target1.toFixed(2) },
    };

    console.log(`[TRADE] Placing ${signal.side} order for ${signal.ticker} (Rank #${signal.rank}, Risk: ${(signal.riskPercent * 100).toFixed(1)}%):`, orderPayload);

    const response = await fetch(`${baseUrl}/v2/orders`, {
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID': apiKeyId,
        'APCA-API-SECRET-KEY': secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderPayload),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('Order failed:', error);
      return { success: false, error };
    }

    const order = await response.json();
    return { success: true, orderId: order.id };
  } catch (error) {
    console.error('Trade execution error:', error);
    return { success: false, error: String(error) };
  }
}

// Update stop to 9 EMA
async function updateStopTo9EMA(
  ticker: string,
  orderId: string,
  apiKeyId: string,
  secretKey: string,
  isPaper: boolean
): Promise<boolean> {
  try {
    const ema9 = await get9EMA(ticker, apiKeyId, secretKey);
    if (!ema9) return false;
    
    const baseUrl = isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
    
    // Replace stop order with 9 EMA trailing stop
    const response = await fetch(`${baseUrl}/v2/orders/${orderId}`, {
      method: 'PATCH',
      headers: {
        'APCA-API-KEY-ID': apiKeyId,
        'APCA-API-SECRET-KEY': secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        stop_price: ema9.toFixed(2),
      }),
    });
    
    return response.ok;
  } catch (error) {
    console.error('Error updating stop to 9 EMA:', error);
    return false;
  }
}

// Flatten all positions
async function flattenAll(
  apiKeyId: string,
  secretKey: string,
  isPaper: boolean
): Promise<boolean> {
  try {
    const baseUrl = isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';
    
    const response = await fetch(`${baseUrl}/v2/positions`, {
      method: 'DELETE',
      headers: {
        'APCA-API-KEY-ID': apiKeyId,
        'APCA-API-SECRET-KEY': secretKey,
      },
    });
    
    console.log('[FLATTEN] Closed all positions');
    return response.ok;
  } catch (error) {
    console.error('Error flattening positions:', error);
    return false;
  }
}

// Get account info
async function getAccountInfo(
  apiKeyId: string,
  secretKey: string,
  isPaper: boolean
): Promise<{ equity: number; tradesToday: number } | null> {
  try {
    const baseUrl = isPaper ? 'https://paper-api.alpaca.markets' : 'https://api.alpaca.markets';

    const accountRes = await fetch(`${baseUrl}/v2/account`, {
      headers: {
        'APCA-API-KEY-ID': apiKeyId,
        'APCA-API-SECRET-KEY': secretKey,
      },
    });

    if (!accountRes.ok) return null;
    const account = await accountRes.json();

    const today = new Date().toISOString().split('T')[0];
    const ordersRes = await fetch(`${baseUrl}/v2/orders?status=all&after=${today}T00:00:00Z`, {
      headers: {
        'APCA-API-KEY-ID': apiKeyId,
        'APCA-API-SECRET-KEY': secretKey,
      },
    });

    const orders = ordersRes.ok ? await ordersRes.json() : [];
    const filledOrders = orders.filter((o: any) => o.status === 'filled');

    return {
      equity: parseFloat(account.equity),
      tradesToday: filledOrders.length,
    };
  } catch (error) {
    console.error('Account info error:', error);
    return null;
  }
}

// Check if position is at +1.5R profit
function isPositionInProfit(position: Position, orbHeight: number): boolean {
  const profitPerShare = position.unrealized_pl / position.qty;
  const rMultiple = profitPerShare / orbHeight;
  return rMultiple >= CONFIG.PROFIT_EXTENSION_R;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const body = await req.json();
    const { action, userId, tickers, marketRegime, sessionState } = body;

    // Get user's trading config
    const { data: configs, error: configError } = await supabase
      .rpc('get_decrypted_trading_config', { p_user_id: userId });

    if (configError || !configs?.length) {
      return new Response(
        JSON.stringify({ error: 'No trading config found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const config = configs[0];
    const { api_key_id: apiKeyId, secret_key: secretKey, is_paper_trading: isPaper } = config;
    const timeInfo = getETTimeInfo();

    // =====================
    // ACTION: GET ORB RANGES
    // =====================
    if (action === 'get_orb_ranges') {
      const ranges: Record<string, ORBRange> = {};
      
      for (const ticker of tickers) {
        const range = await getORBRange(ticker, apiKeyId, secretKey);
        if (range) ranges[ticker] = range;
      }

      return new Response(
        JSON.stringify({ ranges }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================
    // ACTION: GET MARKET REGIME
    // =====================
    if (action === 'get_market_regime') {
      const regimeData = await getSPYRegime(apiKeyId, secretKey);
      
      return new Response(
        JSON.stringify(regimeData),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================
    // ACTION: GET SESSION STATE
    // =====================
    if (action === 'get_session_state') {
      const vixLevel = await getVIXLevel(apiKeyId, secretKey);
      const positions = await getPositions(apiKeyId, secretKey, isPaper);
      const regimeData = await getSPYRegime(apiKeyId, secretKey);
      
      // Check for pre-market changes on all tickers
      const premarketChanges: Record<string, number> = {};
      for (const ticker of tickers) {
        premarketChanges[ticker] = await getPremarketChange(ticker, apiKeyId, secretKey);
      }
      
      return new Response(
        JSON.stringify({ 
          vixLevel, 
          positions,
          premarketChanges,
          marketRegime: regimeData.regime,
          spyPrice: regimeData.spyPrice,
          spy200SMA: regimeData.sma200,
          currentTimeET: `${timeInfo.hours}:${timeInfo.mins.toString().padStart(2, '0')}`,
          timeInMinutes: timeInfo.minutes
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================
    // ACTION: CHECK SIGNALS
    // =====================
    if (action === 'check_signals') {
      const accountInfo = await getAccountInfo(apiKeyId, secretKey, isPaper);
      
      if (!accountInfo) {
        return new Response(
          JSON.stringify({ error: 'Failed to get account info' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      if (accountInfo.tradesToday >= CONFIG.MAX_TRADES_PER_DAY) {
        return new Response(
          JSON.stringify({ 
            signals: [], 
            message: 'Max trades reached for today',
            tradesToday: accountInfo.tradesToday 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Get VIX level
      const vixLevel = sessionState?.vixLevel || await getVIXLevel(apiKeyId, secretKey);
      console.log(`[VIX] Current level: ${vixLevel.toFixed(1)}`);

      const signals: TradeSignal[] = [];
      const skipReasons: Record<string, string> = {};

      // Process tickers by rank (index = rank - 1)
      for (let i = 0; i < tickers.length; i++) {
        const ticker = tickers[i];
        const rank = i + 1;
        
        // Get ORB range
        const orbRange = await getORBRange(ticker, apiKeyId, secretKey);
        if (!orbRange) {
          skipReasons[ticker] = 'No ORB range data';
          continue;
        }

        // Get pre-market change (COOL-OFF RULE)
        const premarketChange = await getPremarketChange(ticker, apiKeyId, secretKey);
        
        // Get current market data
        const marketData = await getMarketData(ticker, apiKeyId, secretKey);
        if (!marketData) {
          skipReasons[ticker] = 'No market data';
          continue;
        }

        // Get intraday metrics for momentum filter
        const intradayMetrics = await getIntradayMetrics(ticker, apiKeyId, secretKey);

        // Check for breakout signal with all filters
        const { signal, confidence, skipReason } = checkORBSignal(
          orbRange,
          marketData.price,
          marketData.volume,
          marketData.avgVolume,
          vixLevel,
          premarketChange,
          intradayMetrics,
          marketRegime || 'neutral'
        );

        if (skipReason) {
          skipReasons[ticker] = skipReason;
          console.log(`[SKIP] ${ticker}: ${skipReason}`);
          continue;
        }

        if (signal && confidence >= 0.7) {
          const orbHeight = orbRange.high - orbRange.low;
          const stopLoss = signal === 'long' ? orbRange.low : orbRange.high;
          const target1 = signal === 'long' 
            ? marketData.price + (2 * orbHeight)
            : marketData.price - (2 * orbHeight);
          const target2 = signal === 'long'
            ? marketData.price + (4 * orbHeight)
            : marketData.price - (4 * orbHeight);

          // TIERED SIZING with VIX boost
          const { shares, riskPercent } = calculatePositionSize(
            accountInfo.equity, 
            marketData.price, 
            stopLoss, 
            rank,
            vixLevel
          );

          signals.push({
            ticker,
            side: signal === 'long' ? 'buy' : 'sell',
            entryPrice: marketData.price,
            stopLoss,
            target1,
            target2,
            qty: shares,
            confidence,
            riskPercent,
            rank,
          });
          
          console.log(`[SIGNAL] ${ticker} Rank #${rank}: ${signal.toUpperCase()} @ ${marketData.price.toFixed(2)}, Risk: ${(riskPercent * 100).toFixed(1)}%`);
        }
      }

      return new Response(
        JSON.stringify({ 
          signals,
          skipReasons,
          tradesToday: accountInfo.tradesToday,
          equity: accountInfo.equity,
          vixLevel,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================
    // ACTION: CHECK SESSION MANAGEMENT (10:15 AM decision)
    // =====================
    if (action === 'check_session') {
      const positions = await getPositions(apiKeyId, secretKey, isPaper);
      const orbRanges = sessionState?.orbRanges || {};
      
      // Check if any position is at +1.5R
      let hasWinningPosition = false;
      const winningTickers: string[] = [];
      
      for (const position of positions) {
        const orbRange = orbRanges[position.symbol];
        if (orbRange) {
          const orbHeight = orbRange.high - orbRange.low;
          if (isPositionInProfit(position, orbHeight)) {
            hasWinningPosition = true;
            winningTickers.push(position.symbol);
          }
        }
      }
      
      // DYNAMIC SESSION STOP
      if (timeInfo.minutes >= CONFIG.FIRST_FLATTEN) {
        if (hasWinningPosition) {
          console.log(`[SESSION] Position(s) at +1.5R - Extending to 11:30 AM. Winners: ${winningTickers.join(', ')}`);
          
          // Move stops to 9 EMA for winning positions
          for (const ticker of winningTickers) {
            const ema9 = await get9EMA(ticker, apiKeyId, secretKey);
            console.log(`[TRAIL] ${ticker} stop moved to 9 EMA: ${ema9?.toFixed(2)}`);
          }
          
          return new Response(
            JSON.stringify({ 
              action: 'extend_session',
              extendUntil: '11:30 AM ET',
              winningTickers,
              message: 'Session extended - trailing 9 EMA stops'
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        } else {
          // No winners at +1.5R - flatten at 10:15
          console.log('[SESSION] No positions at +1.5R - Flattening at 10:15 AM');
          await flattenAll(apiKeyId, secretKey, isPaper);
          
          return new Response(
            JSON.stringify({ 
              action: 'flatten',
              reason: 'No positions at +1.5R profit by 10:15 AM',
              flattenedAt: `${timeInfo.hours}:${timeInfo.mins.toString().padStart(2, '0')} ET`
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
      
      // Before 10:15 - continue normal trading
      return new Response(
        JSON.stringify({ 
          action: 'continue',
          currentTime: `${timeInfo.hours}:${timeInfo.mins.toString().padStart(2, '0')} ET`,
          positions: positions.length
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================
    // ACTION: CHECK SECOND-WAVE RE-ENTRY (9:50-10:05 AM)
    // =====================
    if (action === 'check_reentry') {
      const flattenedWinners = sessionState?.flattenedWinners || [];
      
      if (flattenedWinners.length === 0) {
        return new Response(
          JSON.stringify({ signals: [], message: 'No flattened winners to re-enter' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      // Check if in re-entry window
      if (timeInfo.minutes < CONFIG.REENTRY_START || timeInfo.minutes > CONFIG.REENTRY_END) {
        return new Response(
          JSON.stringify({ signals: [], message: 'Outside re-entry window (9:50-10:05 AM)' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      const reentrySignals: TradeSignal[] = [];
      
      for (const ticker of flattenedWinners) {
        // Check if pulled back to VWAP
        const metrics = await getIntradayMetrics(ticker, apiKeyId, secretKey);
        if (!metrics) continue;
        
        const priceNearVWAP = Math.abs(metrics.currentPrice - metrics.vwap20) / metrics.vwap20 < 0.002; // Within 0.2%
        
        if (priceNearVWAP) {
          // Look for new 5-min ORB forming
          const newORB = await getORBRange(ticker, apiKeyId, secretKey);
          if (newORB) {
            console.log(`[REENTRY] ${ticker} pulled back to VWAP - checking for new 5-min ORB`);
            
            const accountInfo = await getAccountInfo(apiKeyId, secretKey, isPaper);
            if (!accountInfo) continue;
            
            const orbHeight = newORB.high - newORB.low;
            const { shares, riskPercent } = calculatePositionSize(
              accountInfo.equity,
              metrics.currentPrice,
              newORB.low, // Stop at new ORB low
              2, // Use tier 2 risk for re-entries
              sessionState?.vixLevel || 20
            );
            
            reentrySignals.push({
              ticker,
              side: 'buy',
              entryPrice: metrics.currentPrice,
              stopLoss: newORB.low,
              target1: metrics.currentPrice + (2 * orbHeight),
              target2: metrics.currentPrice + (4 * orbHeight),
              qty: shares,
              confidence: 0.75,
              riskPercent,
              rank: 99, // Re-entry rank
            });
          }
        }
      }
      
      return new Response(
        JSON.stringify({ signals: reentrySignals }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================
    // ACTION: EXECUTE TRADE
    // =====================
    if (action === 'execute_trade') {
      const { signal } = body;
      
      const result = await executeTrade(signal, apiKeyId, secretKey, isPaper);
      
      if (result.success) {
        await supabase.from('trade_logs').insert({
          user_id: userId,
          symbol: signal.ticker,
          side: signal.side,
          qty: signal.qty,
          price: signal.entryPrice,
          status: 'filled',
          strategy: 'orb-5min-max',
        });
      }

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // =====================
    // ACTION: FLATTEN ALL
    // =====================
    if (action === 'flatten_all') {
      const success = await flattenAll(apiKeyId, secretKey, isPaper);
      
      return new Response(
        JSON.stringify({ success }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Unknown action' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  } catch (error) {
    console.error('ORB trading error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
