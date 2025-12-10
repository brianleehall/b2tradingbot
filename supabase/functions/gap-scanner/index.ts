import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
  'MRNA', 'BABA', 'JD', 'PYPL', 'SQ', 'SNOW', 'CRWD', 'PANW'
];

async function fetchQuote(symbol: string, apiKey: string, secretKey: string) {
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

async function fetchBars(symbol: string, apiKey: string, secretKey: string) {
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("Gap scanner triggered at:", new Date().toISOString());

  try {
    const { minGapPercent = 8, minRvol = 10 } = await req.json().catch(() => ({}));
    
    // For demo purposes, return mock data since we don't have API keys in this context
    // In production, this would scan real pre-market data
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
    ].filter(stock => stock.gapPercent >= minGapPercent && stock.rvol >= minRvol);

    console.log(`Found ${mockGapStocks.length} gap stocks meeting criteria`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        stocks: mockGapStocks,
        scannedAt: new Date().toISOString()
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
