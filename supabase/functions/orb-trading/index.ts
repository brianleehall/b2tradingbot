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
}

// Get ORB range for a ticker (first 5-min candle after 9:30 ET)
async function getORBRange(
  ticker: string,
  apiKeyId: string,
  secretKey: string
): Promise<ORBRange | null> {
  try {
    const baseUrl = 'https://data.alpaca.markets/v2';
    
    // Get today's date in ET
    const now = new Date();
    const etDate = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const dateStr = etDate.toISOString().split('T')[0];
    
    // ORB period: 9:30 - 9:35 ET
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
    return {
      ticker,
      high: bar.h,
      low: bar.l,
      timestamp: bar.t,
    };
  } catch (error) {
    console.error(`Error fetching ORB for ${ticker}:`, error);
    return null;
  }
}

// Get current price and volume data
async function getMarketData(
  ticker: string,
  apiKeyId: string,
  secretKey: string
): Promise<{ price: number; volume: number; avgVolume: number } | null> {
  try {
    const baseUrl = 'https://data.alpaca.markets/v2';
    
    // Get latest trade
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

    // Get recent 1-min bars for volume comparison
    const now = new Date();
    const start = new Date(now.getTime() - 30 * 60 * 1000).toISOString(); // Last 30 mins
    
    const barsResponse = await fetch(
      `${baseUrl}/stocks/${ticker}/bars?timeframe=1Min&start=${start}&limit=30`,
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

    return { price, volume: currentVolume, avgVolume };
  } catch (error) {
    console.error(`Error fetching market data for ${ticker}:`, error);
    return null;
  }
}

// Check for ORB breakout signal
function checkORBSignal(
  orbRange: ORBRange,
  currentPrice: number,
  volume: number,
  avgVolume: number
): { signal: 'long' | 'short' | null; confidence: number } {
  const volumeRatio = volume / avgVolume;
  const volumeCondition = volumeRatio >= 1.5; // 150% of average

  // Long signal: price above ORB high with volume
  if (currentPrice > orbRange.high && volumeCondition) {
    return { signal: 'long', confidence: Math.min(0.95, 0.7 + (volumeRatio - 1.5) * 0.1) };
  }

  // Short signal: price below ORB low with volume
  if (currentPrice < orbRange.low && volumeCondition) {
    return { signal: 'short', confidence: Math.min(0.95, 0.7 + (volumeRatio - 1.5) * 0.1) };
  }

  return { signal: null, confidence: 0 };
}

// Calculate position size based on 1% risk
function calculatePositionSize(
  accountEquity: number,
  entryPrice: number,
  stopLoss: number
): number {
  const maxRisk = accountEquity * 0.01; // 1% max risk
  const riskPerShare = Math.abs(entryPrice - stopLoss);
  
  if (riskPerShare <= 0) return 0;
  
  const shares = Math.floor(maxRisk / riskPerShare);
  return Math.max(1, shares);
}

// Execute trade via Alpaca
async function executeTrade(
  signal: TradeSignal,
  apiKeyId: string,
  secretKey: string,
  isPaper: boolean
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  try {
    const baseUrl = isPaper 
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';

    // Place bracket order with stop and targets
    const orderPayload = {
      symbol: signal.ticker,
      qty: signal.qty.toString(),
      side: signal.side,
      type: 'market',
      time_in_force: 'day',
      order_class: 'bracket',
      stop_loss: {
        stop_price: signal.stopLoss.toFixed(2),
      },
      take_profit: {
        limit_price: signal.target1.toFixed(2),
      },
    };

    console.log(`Placing ${signal.side} order for ${signal.ticker}:`, orderPayload);

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

// Get account info
async function getAccountInfo(
  apiKeyId: string,
  secretKey: string,
  isPaper: boolean
): Promise<{ equity: number; tradesToday: number } | null> {
  try {
    const baseUrl = isPaper 
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';

    const accountRes = await fetch(`${baseUrl}/v2/account`, {
      headers: {
        'APCA-API-KEY-ID': apiKeyId,
        'APCA-API-SECRET-KEY': secretKey,
      },
    });

    if (!accountRes.ok) return null;
    const account = await accountRes.json();

    // Get today's orders
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, userId, tickers, marketRegime } = await req.json();

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

    if (action === 'get_orb_ranges') {
      // Fetch ORB ranges for all tickers
      const ranges: Record<string, ORBRange> = {};
      
      for (const ticker of tickers) {
        const range = await getORBRange(ticker, apiKeyId, secretKey);
        if (range) {
          ranges[ticker] = range;
        }
      }

      return new Response(
        JSON.stringify({ ranges }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'check_signals') {
      const accountInfo = await getAccountInfo(apiKeyId, secretKey, isPaper);
      
      if (!accountInfo) {
        return new Response(
          JSON.stringify({ error: 'Failed to get account info' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        );
      }

      // Check if we've hit max trades
      if (accountInfo.tradesToday >= 3) {
        return new Response(
          JSON.stringify({ 
            signals: [], 
            message: 'Max trades reached for today',
            tradesToday: accountInfo.tradesToday 
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const signals: TradeSignal[] = [];

      for (const ticker of tickers) {
        // Get ORB range
        const orbRange = await getORBRange(ticker, apiKeyId, secretKey);
        if (!orbRange) continue;

        // Get current market data
        const marketData = await getMarketData(ticker, apiKeyId, secretKey);
        if (!marketData) continue;

        // Check for breakout signal
        const { signal, confidence } = checkORBSignal(
          orbRange,
          marketData.price,
          marketData.volume,
          marketData.avgVolume
        );

        if (signal && confidence >= 0.7) {
          // BEAR MARKET FILTER: Only allow shorts in bearish regime
          if (marketRegime === 'bearish' && signal === 'long') {
            console.log(`Skipping LONG signal for ${ticker} - Bear market mode active (SPY below 200-SMA)`);
            continue;
          }

          const orbHeight = orbRange.high - orbRange.low;
          const stopLoss = signal === 'long' ? orbRange.low : orbRange.high;
          const target1 = signal === 'long' 
            ? marketData.price + (2 * orbHeight)  // 2R
            : marketData.price - (2 * orbHeight);
          const target2 = signal === 'long'
            ? marketData.price + (4 * orbHeight)  // 4R
            : marketData.price - (4 * orbHeight);

          const qty = calculatePositionSize(accountInfo.equity, marketData.price, stopLoss);

          signals.push({
            ticker,
            side: signal === 'long' ? 'buy' : 'sell',
            entryPrice: marketData.price,
            stopLoss,
            target1,
            target2,
            qty,
            confidence,
          });
        }
      }

      return new Response(
        JSON.stringify({ 
          signals,
          tradesToday: accountInfo.tradesToday,
          equity: accountInfo.equity
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'execute_trade') {
      const { signal } = await req.json();
      
      const result = await executeTrade(signal, apiKeyId, secretKey, isPaper);
      
      // Log trade
      if (result.success) {
        await supabase.from('trade_logs').insert({
          user_id: userId,
          symbol: signal.ticker,
          side: signal.side,
          qty: signal.qty,
          price: signal.entryPrice,
          status: 'filled',
          strategy: 'orb-5min',
        });
      }

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'flatten_all') {
      const baseUrl = isPaper 
        ? 'https://paper-api.alpaca.markets'
        : 'https://api.alpaca.markets';

      // Close all positions
      const response = await fetch(`${baseUrl}/v2/positions`, {
        method: 'DELETE',
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      });

      const success = response.ok;
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
