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

interface TradeSignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  symbol: string;
  qty: number;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  confidence: number;
  reason: string;
}

interface MarketData {
  price: number;
  high: number;
  low: number;
  volume: number;
  vwap: number;
  avgVolume: number;
}

// Default fallback symbols if user has none selected
const DEFAULT_ORB_SYMBOLS = ['NVDA', 'TSLA', 'AMD', 'META', 'AAPL', 'SMCI', 'SPY', 'QQQ'];

const strategies: Record<string, { 
  description: string,
  type: 'orb' | 'vwap' | 'gap'
}> = {
  'orb-5min': {
    description: '5-Minute Opening Range Breakout - Trade breakouts from first 5-min candle with volume confirmation',
    type: 'orb'
  },
  'vwap-momentum': {
    description: 'VWAP Momentum Bounce - Enter on pullback to VWAP with EMA crossover confirmation',
    type: 'vwap'
  },
  'gap-and-go': {
    description: 'Gap & Go - Trade high-momentum gap stocks with catalyst confirmation',
    type: 'gap'
  }
};

async function getMarketData(
  symbol: string, 
  apiKeyId: string, 
  secretKey: string
): Promise<MarketData | null> {
  const dataUrl = 'https://data.alpaca.markets';
  
  try {
    // Fetch latest trade
    const tradeResponse = await fetch(
      `${dataUrl}/v2/stocks/${symbol}/trades/latest`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        }
      }
    );
    
    // Fetch today's bars for VWAP and range
    const barsResponse = await fetch(
      `${dataUrl}/v2/stocks/${symbol}/bars?timeframe=5Min&limit=78`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        }
      }
    );

    if (tradeResponse.ok && barsResponse.ok) {
      const tradeData = await tradeResponse.json();
      const barsData = await barsResponse.json();
      
      const bars = barsData.bars || [];
      const price = tradeData.trade?.p || 0;
      
      // Calculate VWAP
      let totalVolume = 0;
      let totalVolumePrice = 0;
      let dayHigh = 0;
      let dayLow = Infinity;
      
      for (const bar of bars) {
        const typicalPrice = (bar.h + bar.l + bar.c) / 3;
        totalVolume += bar.v;
        totalVolumePrice += typicalPrice * bar.v;
        dayHigh = Math.max(dayHigh, bar.h);
        dayLow = Math.min(dayLow, bar.l);
      }
      
      const vwap = totalVolume > 0 ? totalVolumePrice / totalVolume : price;
      const avgVolume = bars.length > 0 ? totalVolume / bars.length : 0;
      const currentVolume = bars.length > 0 ? bars[bars.length - 1]?.v || 0 : 0;

      return {
        price,
        high: dayHigh,
        low: dayLow === Infinity ? price : dayLow,
        volume: currentVolume,
        vwap,
        avgVolume
      };
    }
  } catch (error) {
    console.error(`Error fetching market data for ${symbol}:`, error);
  }
  return null;
}

async function analyzeORB(
  symbol: string,
  data: MarketData,
  lovableApiKey: string
): Promise<TradeSignal | null> {
  try {
    const volumeRatio = data.avgVolume > 0 ? data.volume / data.avgVolume : 1;
    const range = data.high - data.low;
    const rangePercent = (range / data.low) * 100;
    
    const prompt = `
Analyze this 5-Minute Opening Range Breakout setup:
Symbol: ${symbol}
Current Price: $${data.price.toFixed(2)}
Opening Range High: $${data.high.toFixed(2)}
Opening Range Low: $${data.low.toFixed(2)}
Range Size: ${rangePercent.toFixed(2)}%
Volume vs Average: ${(volumeRatio * 100).toFixed(0)}%
VWAP: $${data.vwap.toFixed(2)}

ORB Rules:
- BUY signal: Price breaks above range high with volume > 150%
- SELL signal: Price breaks below range low with volume > 150%
- HOLD if price is within range or volume insufficient

Calculate position size for 1% account risk, stop at opposite range extreme.
Targets: 2:1 and 3:1 risk/reward.
`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a professional day trader analyzing ORB setups. Output ONLY valid JSON:
{
  "action": "BUY" | "SELL" | "HOLD",
  "confidence": 1-10,
  "qty": number (1-100 shares),
  "stopLoss": number (price),
  "target1": number (2:1 R:R price),
  "target2": number (3:1 R:R price),
  "reason": "brief 1-line explanation"
}`
          },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error:", response.status);
      return null;
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content;
    
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const signal = JSON.parse(jsonMatch[0]);
    return {
      action: signal.action,
      symbol,
      qty: signal.qty || 10,
      entryPrice: data.price,
      stopLoss: signal.stopLoss || data.low,
      target1: signal.target1 || data.price * 1.02,
      target2: signal.target2 || data.price * 1.03,
      confidence: signal.confidence || 5,
      reason: signal.reason || 'ORB analysis'
    };
  } catch (error) {
    console.error("Error analyzing ORB:", error);
    return null;
  }
}

async function analyzeVWAP(
  symbol: string,
  data: MarketData,
  lovableApiKey: string
): Promise<TradeSignal | null> {
  try {
    const priceVsVwap = ((data.price - data.vwap) / data.vwap) * 100;
    const volumeRatio = data.avgVolume > 0 ? data.volume / data.avgVolume : 1;
    
    const prompt = `
Analyze this VWAP Momentum Bounce setup:
Symbol: ${symbol}
Current Price: $${data.price.toFixed(2)}
VWAP: $${data.vwap.toFixed(2)}
Price vs VWAP: ${priceVsVwap.toFixed(2)}%
Volume vs Average: ${(volumeRatio * 100).toFixed(0)}%
Day High: $${data.high.toFixed(2)}
Day Low: $${data.low.toFixed(2)}

VWAP Bounce Rules:
- BUY: Price pulled back to VWAP from above, 9 EMA > 20 EMA, volume spike
- Stop: Just below VWAP
- Target: Prior swing high or 3:1 R:R
- HOLD if conditions not met
`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a professional day trader analyzing VWAP bounce setups. Output ONLY valid JSON:
{
  "action": "BUY" | "SELL" | "HOLD",
  "confidence": 1-10,
  "qty": number (1-100 shares),
  "stopLoss": number (just below VWAP),
  "target1": number (swing high),
  "target2": number (3:1 R:R),
  "reason": "brief 1-line explanation"
}`
          },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) return null;

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content;
    
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const signal = JSON.parse(jsonMatch[0]);
    return {
      action: signal.action,
      symbol,
      qty: signal.qty || 10,
      entryPrice: data.price,
      stopLoss: signal.stopLoss || data.vwap * 0.998,
      target1: signal.target1 || data.high,
      target2: signal.target2 || data.price * 1.03,
      confidence: signal.confidence || 5,
      reason: signal.reason || 'VWAP bounce analysis'
    };
  } catch (error) {
    console.error("Error analyzing VWAP:", error);
    return null;
  }
}

async function analyzeGapAndGo(
  symbol: string,
  data: MarketData,
  lovableApiKey: string
): Promise<TradeSignal | null> {
  try {
    const prompt = `
Analyze this Gap & Go setup:
Symbol: ${symbol}
Current Price: $${data.price.toFixed(2)}
Pre-market High: $${data.high.toFixed(2)}
Pre-market Low: $${data.low.toFixed(2)}
VWAP: $${data.vwap.toFixed(2)}
Volume vs Average: ${(data.avgVolume > 0 ? (data.volume / data.avgVolume) * 100 : 100).toFixed(0)}%

Gap & Go Rules:
- BUY: First pullback hold or pre-market high breakout
- Risk: Below pre-market low
- Partial profits: 20% at first target, 40% at second, trail rest
`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a professional day trader analyzing Gap & Go setups. Output ONLY valid JSON:
{
  "action": "BUY" | "SELL" | "HOLD",
  "confidence": 1-10,
  "qty": number (1-100 shares),
  "stopLoss": number (below pre-market low),
  "target1": number (20% profit target),
  "target2": number (40% profit target),
  "reason": "brief 1-line explanation"
}`
          },
          { role: "user", content: prompt }
        ],
      }),
    });

    if (!response.ok) return null;

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content;
    
    if (!content) return null;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const signal = JSON.parse(jsonMatch[0]);
    return {
      action: signal.action,
      symbol,
      qty: signal.qty || 10,
      entryPrice: data.price,
      stopLoss: signal.stopLoss || data.low * 0.99,
      target1: signal.target1 || data.price * 1.002,
      target2: signal.target2 || data.price * 1.004,
      confidence: signal.confidence || 5,
      reason: signal.reason || 'Gap & Go analysis'
    };
  } catch (error) {
    console.error("Error analyzing Gap & Go:", error);
    return null;
  }
}

async function executeTrade(
  signal: TradeSignal,
  apiKeyId: string,
  secretKey: string,
  isPaper: boolean
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  if (signal.action === 'HOLD' || signal.confidence < 7) {
    return { success: false, error: 'Signal below confidence threshold or HOLD' };
  }

  const baseUrl = isPaper 
    ? 'https://paper-api.alpaca.markets'
    : 'https://api.alpaca.markets';

  try {
    // Place bracket order with stop loss and take profit
    const response = await fetch(`${baseUrl}/v2/orders`, {
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID': apiKeyId,
        'APCA-API-SECRET-KEY': secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        symbol: signal.symbol,
        qty: signal.qty.toString(),
        side: signal.action.toLowerCase(),
        type: 'market',
        time_in_force: 'day',
        order_class: 'bracket',
        stop_loss: {
          stop_price: signal.stopLoss.toFixed(2)
        },
        take_profit: {
          limit_price: signal.target1.toFixed(2)
        }
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Order error:", error);
      return { success: false, error };
    }

    const order = await response.json();
    console.log(`Bracket order placed: ${order.id} - ${signal.action} ${signal.qty} ${signal.symbol}`);
    return { success: true, orderId: order.id };
  } catch (error) {
    console.error("Trade execution error:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

// Check if within ORB trading window (9:29 AM - 10:30 AM ET)
function isWithinTradingWindow(): boolean {
  const now = new Date();
  // Convert to ET
  const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = etTime.getDay();
  
  // No trading on weekends
  if (day === 0 || day === 6) return false;
  
  const hours = etTime.getHours();
  const minutes = etTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  
  // Trading window: 9:29 AM - 10:30 AM ET (569 - 630 minutes)
  return timeInMinutes >= 569 && timeInMinutes <= 630;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("Day trading auto-trade triggered at:", new Date().toISOString());

  // CRITICAL: Check trading window FIRST
  if (!isWithinTradingWindow()) {
    const now = new Date();
    const etTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    console.log(`Outside ORB trading window (9:29-10:30 AM ET). Current ET time: ${etTime.toLocaleTimeString()}`);
    return new Response(
      JSON.stringify({ 
        message: "Outside ORB trading window (9:29 AM - 10:30 AM ET)", 
        currentTimeET: etTime.toLocaleTimeString() 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all users with auto-trading enabled using the secure decryption function
    const { data: configs, error: configError } = await supabase
      .rpc('get_active_trading_configs');

    if (configError) {
      console.error("Error fetching configs:", configError);
      throw configError;
    }

    if (!configs || configs.length === 0) {
      console.log("No users with auto-trading enabled");
      return new Response(
        JSON.stringify({ message: "No active auto-traders" }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing ${configs.length} auto-trading configurations`);

    const results = [];

    for (const config of configs as TradingConfig[]) {
      console.log(`Processing user ${config.user_id} with strategy ${config.selected_strategy}`);
      
      const strategy = strategies[config.selected_strategy];
      if (!strategy) {
        console.log(`Unknown strategy: ${config.selected_strategy}`);
        continue;
      }

      // Fetch user's selected tickers from database
      let symbols: string[] = DEFAULT_ORB_SYMBOLS;
      
      if (strategy.type === 'orb') {
        const { data: userTickers } = await supabase
          .rpc('get_user_orb_tickers', { p_user_id: config.user_id });
        
        if (userTickers && userTickers.length > 0) {
          symbols = userTickers;
          console.log(`Using user-selected tickers for ${config.user_id}:`, symbols);
        } else {
          console.log(`No user tickers found, using defaults for ${config.user_id}`);
        }
      }

      for (const symbol of symbols) {
        try {
          // Get current market data
          const marketData = await getMarketData(
            symbol, 
            config.api_key_id, 
            config.secret_key
          );

          if (!marketData) {
            console.log(`Could not get market data for ${symbol}`);
            continue;
          }

          console.log(`${symbol} price: $${marketData.price}, VWAP: $${marketData.vwap}`);

          // Analyze based on strategy type
          let signal: TradeSignal | null = null;
          
          switch (strategy.type) {
            case 'orb':
              signal = await analyzeORB(symbol, marketData, lovableApiKey);
              break;
            case 'vwap':
              signal = await analyzeVWAP(symbol, marketData, lovableApiKey);
              break;
            case 'gap':
              signal = await analyzeGapAndGo(symbol, marketData, lovableApiKey);
              break;
          }
          
          if (!signal) {
            console.log(`No signal generated for ${symbol}`);
            continue;
          }

          console.log(`Signal for ${symbol}:`, signal);

          // Execute trade if confidence is high enough
          const result = await executeTrade(
            signal,
            config.api_key_id,
            config.secret_key,
            config.is_paper_trading
          );

          // Log the trade
          await supabase.from('trade_logs').insert({
            user_id: config.user_id,
            symbol: signal.symbol,
            side: signal.action.toLowerCase(),
            qty: signal.qty,
            price: signal.entryPrice,
            strategy: config.selected_strategy,
            status: result.success ? 'success' : 'failed',
            error_message: result.error || null,
          });

          results.push({
            userId: config.user_id,
            symbol,
            signal: signal.action,
            confidence: signal.confidence,
            stopLoss: signal.stopLoss,
            target1: signal.target1,
            executed: result.success,
            reason: signal.reason
          });

        } catch (error) {
          console.error(`Error processing ${symbol} for user ${config.user_id}:`, error);
        }
      }
    }

    console.log("Day trading auto-trade completed. Results:", results);

    return new Response(
      JSON.stringify({ success: true, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Auto-trade error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
