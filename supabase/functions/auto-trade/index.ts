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
  confidence: number;
  reason: string;
}

const strategies: Record<string, { symbols: string[], description: string }> = {
  'rsi-dip': {
    symbols: ['AAPL', 'MSFT', 'GOOGL', 'TSLA'],
    description: 'RSI Dip Buy - Buy when RSI drops below 30, sell when above 70'
  },
  'momentum': {
    symbols: ['BTCUSD', 'ETHUSD'],
    description: 'Momentum Crypto - Buy on positive momentum with SMA crossover'
  },
  'mean-reversion': {
    symbols: ['AAPL', 'MSFT', 'GOOGL'],
    description: 'Mean Reversion - Buy when price deviates 2 std below 50-day MA'
  },
  'breakout': {
    symbols: ['BTCUSD', 'ETHUSD'],
    description: 'Breakout Trader - Buy on breakout above 20-day high'
  }
};

async function getMarketData(symbol: string, apiKeyId: string, secretKey: string, isPaper: boolean) {
  const dataUrl = 'https://data.alpaca.markets';
  
  try {
    // For crypto, use crypto endpoint
    if (symbol.includes('USD')) {
      const cryptoSymbol = symbol.replace('USD', '/USD');
      const response = await fetch(
        `${dataUrl}/v1beta3/crypto/us/latest/trades?symbols=${cryptoSymbol}`,
        {
          headers: {
            'APCA-API-KEY-ID': apiKeyId,
            'APCA-API-SECRET-KEY': secretKey,
          }
        }
      );
      if (response.ok) {
        const data = await response.json();
        return data.trades?.[cryptoSymbol]?.p || null;
      }
    } else {
      // For stocks
      const response = await fetch(
        `${dataUrl}/v2/stocks/${symbol}/trades/latest`,
        {
          headers: {
            'APCA-API-KEY-ID': apiKeyId,
            'APCA-API-SECRET-KEY': secretKey,
          }
        }
      );
      if (response.ok) {
        const data = await response.json();
        return data.trade?.p || null;
      }
    }
  } catch (error) {
    console.error(`Error fetching market data for ${symbol}:`, error);
  }
  return null;
}

async function analyzeWithAI(
  symbol: string, 
  price: number, 
  strategy: string,
  lovableApiKey: string
): Promise<TradeSignal | null> {
  try {
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
            content: `You are a trading signal generator. Given market data and a strategy, output a JSON trade signal.
            
Strategy: ${strategies[strategy]?.description || strategy}

Output format (JSON only, no markdown):
{
  "action": "BUY" | "SELL" | "HOLD",
  "confidence": 1-10,
  "qty": number (small position size, 1-5 for stocks, 0.01-0.1 for crypto),
  "reason": "brief explanation"
}`
          },
          {
            role: "user",
            content: `Symbol: ${symbol}\nCurrent Price: $${price}\n\nGenerate a trade signal based on the strategy.`
          }
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error:", response.status);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) return null;

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    
    const signal = JSON.parse(jsonMatch[0]);
    return {
      action: signal.action,
      symbol,
      qty: signal.qty || 1,
      confidence: signal.confidence || 5,
      reason: signal.reason || 'AI analysis'
    };
  } catch (error) {
    console.error("Error analyzing with AI:", error);
    return null;
  }
}

async function executeTrade(
  signal: TradeSignal,
  apiKeyId: string,
  secretKey: string,
  isPaper: boolean
): Promise<{ success: boolean; orderId?: string; error?: string }> {
  if (signal.action === 'HOLD' || signal.confidence < 6) {
    return { success: true, error: 'Signal below confidence threshold or HOLD' };
  }

  const baseUrl = isPaper 
    ? 'https://paper-api.alpaca.markets'
    : 'https://api.alpaca.markets';

  try {
    const response = await fetch(`${baseUrl}/v2/orders`, {
      method: 'POST',
      headers: {
        'APCA-API-KEY-ID': apiKeyId,
        'APCA-API-SECRET-KEY': secretKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        symbol: signal.symbol.replace('/', ''),
        qty: signal.qty.toString(),
        side: signal.action.toLowerCase(),
        type: 'market',
        time_in_force: 'day',
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Order error:", error);
      return { success: false, error };
    }

    const order = await response.json();
    console.log(`Order placed: ${order.id} - ${signal.action} ${signal.qty} ${signal.symbol}`);
    return { success: true, orderId: order.id };
  } catch (error) {
    console.error("Trade execution error:", error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("Auto-trade function triggered at:", new Date().toISOString());

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all users with auto-trading enabled
    const { data: configs, error: configError } = await supabase
      .from('trading_configurations')
      .select('*')
      .eq('auto_trading_enabled', true);

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

      for (const symbol of strategy.symbols) {
        try {
          // Get current price
          const price = await getMarketData(
            symbol, 
            config.api_key_id, 
            config.secret_key, 
            config.is_paper_trading
          );

          if (!price) {
            console.log(`Could not get price for ${symbol}`);
            continue;
          }

          console.log(`${symbol} current price: $${price}`);

          // Analyze with AI
          const signal = await analyzeWithAI(symbol, price, config.selected_strategy, lovableApiKey);
          
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
            price: price,
            strategy: config.selected_strategy,
            status: result.success ? 'success' : 'failed',
            error_message: result.error || null,
          });

          results.push({
            userId: config.user_id,
            symbol,
            signal: signal.action,
            confidence: signal.confidence,
            executed: result.success,
          });

        } catch (error) {
          console.error(`Error processing ${symbol} for user ${config.user_id}:`, error);
        }
      }
    }

    console.log("Auto-trade completed. Results:", results);

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
