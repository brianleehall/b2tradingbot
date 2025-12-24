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
  
  // Risk management
  TIER1_RISK: 0.02,            // 2% for #1 ranked stock
  TIER2_RISK: 0.01,            // 1% for #2-4
  MAX_TRADES_PER_DAY: 3,
  MAX_DAILY_LOSS_PERCENT: 0.03, // -3% daily stop
  
  // Filters
  VIX_SHORTS_ONLY_THRESHOLD: 25,
  VIX_DOUBLE_SIZE_THRESHOLD: 18,
  PREMARKET_COOLOFF_PERCENT: 8,
  LOW_VOLUME_THRESHOLD: 0.8,
  PROFIT_EXTENSION_R: 1.5,
  
  // Volume confirmation
  MIN_VOLUME_RATIO: 1.5,
};

function getETTimeInfo(): { minutes: number; hours: number; mins: number; date: Date } {
  const now = new Date();
  const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = etDate.getHours();
  const mins = etDate.getMinutes();
  return { minutes: hours * 60 + mins, hours, mins, date: etDate };
}

function isWithinTradingWindow(): boolean {
  const { minutes, date } = getETTimeInfo();
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  return minutes >= CONFIG.TRADING_START && minutes <= CONFIG.TRADING_END;
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

// Calculate tiered position size
function calculatePositionSize(
  equity: number,
  entryPrice: number,
  stopLoss: number,
  rank: number,
  vixLevel: number
): { shares: number; riskPercent: number } {
  let riskPercent = rank === 1 ? CONFIG.TIER1_RISK : CONFIG.TIER2_RISK;
  
  // VIX double size on #1 if VIX < 18
  if (rank === 1 && vixLevel < CONFIG.VIX_DOUBLE_SIZE_THRESHOLD) {
    riskPercent *= 2;
    console.log(`VIX ${vixLevel.toFixed(1)} < 18 - Doubling position size on #1`);
  }
  
  const maxRisk = equity * riskPercent;
  const riskPerShare = Math.abs(entryPrice - stopLoss);
  
  if (riskPerShare <= 0) return { shares: 0, riskPercent };
  
  const shares = Math.floor(maxRisk / riskPerShare);
  return { shares: Math.max(1, shares), riskPercent };
}

// Execute trade with bracket order
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const timeInfo = getETTimeInfo();
  console.log(`[AUTO-TRADE] Triggered at ${timeInfo.hours}:${timeInfo.mins.toString().padStart(2, '0')} ET`);

  // Check trading window
  if (!isWithinTradingWindow()) {
    console.log('Outside ORB trading window (9:29-10:30 AM ET)');
    return new Response(
      JSON.stringify({ message: 'Outside trading window', timeET: `${timeInfo.hours}:${timeInfo.mins}` }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get active trading configs
    const { data: configs, error } = await supabase.rpc('get_active_trading_configs');
    
    if (error || !configs || configs.length === 0) {
      console.log('No active auto-traders');
      return new Response(
        JSON.stringify({ message: 'No active auto-traders' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
        
        const { shares, riskPercent } = calculatePositionSize(
          accountInfo.equity,
          marketData.price,
          stopLoss,
          rank,
          regimeData.vixLevel
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

    console.log(`\n=== AUTO-TRADE COMPLETE: ${results.length} signals processed ===`);

    return new Response(
      JSON.stringify({ success: true, results }),
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
