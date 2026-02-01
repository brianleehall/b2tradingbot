import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GapStock {
  symbol: string;
  gapPercent: number;
  rvol: number;
  preMarketHigh: number;
  preMarketVolume: number;
  currentPrice: number;
  catalyst: string;
  hasNews: boolean;
}

// Common high-volume day trading stocks to scan
const SCAN_SYMBOLS = [
  'NVDA', 'TSLA', 'AMD', 'AAPL', 'MSFT', 'META', 'GOOGL', 'AMZN',
  'SPY', 'QQQ', 'COIN', 'PLTR', 'SOFI', 'RIVN', 'LCID', 'NIO',
  'MRNA', 'BABA', 'JD', 'PYPL', 'SQ', 'SNOW', 'CRWD', 'PANW',
  'SMCI', 'ARM', 'AVGO', 'MRVL', 'MU', 'INTC', 'MARA', 'RIOT',
];

interface TradingConfig {
  api_key_id: string;
  secret_key: string;
  is_paper_trading: boolean;
}

// Fetch quote from Alpaca
async function fetchQuote(symbol: string, apiKey: string, secretKey: string): Promise<any | null> {
  try {
    const response = await fetch(
      `https://data.alpaca.markets/v2/stocks/${symbol}/quotes/latest`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': secretKey,
        }
      }
    );
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error(`Error fetching quote for ${symbol}:`, error);
  }
  return null;
}

// Fetch daily bars from Alpaca
async function fetchBars(symbol: string, apiKey: string, secretKey: string): Promise<any | null> {
  try {
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const response = await fetch(
      `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=1Day&start=${yesterday.toISOString().split('T')[0]}&limit=2`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': secretKey,
        }
      }
    );
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error(`Error fetching bars for ${symbol}:`, error);
  }
  return null;
}

// Fetch pre-market snapshot from Alpaca
async function fetchSnapshot(symbol: string, apiKey: string, secretKey: string): Promise<any | null> {
  try {
    const response = await fetch(
      `https://data.alpaca.markets/v2/stocks/${symbol}/snapshot`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKey,
          'APCA-API-SECRET-KEY': secretKey,
        }
      }
    );
    if (response.ok) {
      return await response.json();
    }
  } catch (error) {
    console.error(`Error fetching snapshot for ${symbol}:`, error);
  }
  return null;
}

// Get trading credentials from a user's config
async function getTradingCredentials(supabase: any): Promise<TradingConfig | null> {
  try {
    // Get any active trading config (we just need API keys to fetch data)
    const { data, error } = await supabase.rpc('get_active_trading_configs');
    
    if (error || !data || data.length === 0) {
      return null;
    }
    
    // Return the first available config
    return {
      api_key_id: data[0].api_key_id,
      secret_key: data[0].secret_key,
      is_paper_trading: data[0].is_paper_trading,
    };
  } catch (error) {
    console.error('Error getting trading credentials:', error);
    return null;
  }
}

// Scan for gap stocks using real Alpaca data
async function scanGapStocks(
  apiKey: string, 
  secretKey: string, 
  minGapPercent: number, 
  minRvol: number
): Promise<GapStock[]> {
  const gapStocks: GapStock[] = [];
  
  console.log(`Scanning ${SCAN_SYMBOLS.length} symbols for gaps...`);
  
  for (const symbol of SCAN_SYMBOLS) {
    try {
      // Rate limit
      await new Promise(r => setTimeout(r, 100));
      
      // Get snapshot (includes pre-market data)
      const snapshot = await fetchSnapshot(symbol, apiKey, secretKey);
      if (!snapshot) continue;
      
      const prevClose = snapshot.prevDailyBar?.c || 0;
      const currentPrice = snapshot.latestTrade?.p || snapshot.latestQuote?.ap || 0;
      const dailyVolume = snapshot.dailyBar?.v || 0;
      const avgVolume = snapshot.prevDailyBar?.v || dailyVolume;
      
      if (prevClose === 0 || currentPrice === 0) continue;
      
      // Calculate gap and RVOL
      const gapPercent = ((currentPrice - prevClose) / prevClose) * 100;
      const rvol = avgVolume > 0 ? dailyVolume / avgVolume : 1;
      
      // Check if it meets criteria
      if (Math.abs(gapPercent) >= minGapPercent && rvol >= minRvol) {
        console.log(`✓ ${symbol}: Gap ${gapPercent.toFixed(1)}%, RVOL ${rvol.toFixed(1)}x`);
        
        gapStocks.push({
          symbol,
          gapPercent: Math.round(gapPercent * 100) / 100,
          rvol: Math.round(rvol * 100) / 100,
          preMarketHigh: snapshot.dailyBar?.h || currentPrice,
          preMarketVolume: dailyVolume,
          currentPrice: Math.round(currentPrice * 100) / 100,
          catalyst: gapPercent > 0 ? 'Gap up on volume' : 'Gap down on volume',
          hasNews: rvol >= 3, // High RVOL suggests news
        });
      }
    } catch (error) {
      console.error(`Error scanning ${symbol}:`, error);
    }
  }
  
  // Sort by gap percent (absolute value, descending)
  return gapStocks.sort((a, b) => Math.abs(b.gapPercent) - Math.abs(a.gapPercent));
}

// Mock data for demo/fallback
function getMockGapStocks(minGapPercent: number, minRvol: number): GapStock[] {
  const mockGapStocks: GapStock[] = [
    {
      symbol: 'NVDA',
      gapPercent: 12.5,
      rvol: 15.2,
      preMarketHigh: 142.50,
      preMarketVolume: 2500000,
      currentPrice: 141.30,
      catalyst: 'AI chip demand surge',
      hasNews: true
    },
    {
      symbol: 'TSLA',
      gapPercent: 9.8,
      rvol: 12.3,
      preMarketHigh: 268.00,
      preMarketVolume: 1800000,
      currentPrice: 265.50,
      catalyst: 'Record deliveries announced',
      hasNews: true
    },
    {
      symbol: 'AMD',
      gapPercent: 8.5,
      rvol: 11.1,
      preMarketHigh: 178.20,
      preMarketVolume: 1200000,
      currentPrice: 176.80,
      catalyst: 'New datacenter GPU launch',
      hasNews: true
    }
  ].filter(stock => Math.abs(stock.gapPercent) >= minGapPercent && stock.rvol >= minRvol);
  
  return mockGapStocks;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("Gap scanner triggered at:", new Date().toISOString());

  try {
    const { minGapPercent = 3, minRvol = 2 } = await req.json().catch(() => ({}));
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Try to get trading credentials from an active config
    const credentials = await getTradingCredentials(supabase);
    
    let stocks: GapStock[];
    let dataSource: string;
    
    if (credentials) {
      console.log('Using real Alpaca API credentials for gap scan');
      stocks = await scanGapStocks(credentials.api_key_id, credentials.secret_key, minGapPercent, minRvol);
      dataSource = 'alpaca';
      
      // If API scan returned nothing, fall back to mock
      if (stocks.length === 0) {
        console.log('No real gaps found, returning sample data');
        stocks = getMockGapStocks(minGapPercent, minRvol);
        dataSource = 'mock_fallback';
      }
    } else {
      console.log('No trading credentials available, using mock data');
      stocks = getMockGapStocks(minGapPercent, minRvol);
      dataSource = 'mock';
    }

    console.log(`Found ${stocks.length} gap stocks meeting criteria (source: ${dataSource})`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        stocks,
        dataSource,
        scannedAt: new Date().toISOString(),
        criteria: { minGapPercent, minRvol },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Gap scanner error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
