import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SelectedStock {
  symbol: string;
  preMarketChange: number;
  rvol: number;
  price: number;
  avgVolume: number;
  float?: number;
  exchange: string;
}

interface ScanResult {
  stocks: SelectedStock[];
  scannedAt: string;
  message?: string;
  marketRegime: 'bullish' | 'bearish';
  spyPrice?: number;
  spy200SMA?: number;
}

// High-volume stocks to scan (NASDAQ/NYSE only, commonly traded)
const SCAN_UNIVERSE = [
  'NVDA', 'TSLA', 'AMD', 'AAPL', 'MSFT', 'META', 'GOOGL', 'AMZN',
  'SPY', 'QQQ', 'COIN', 'PLTR', 'SOFI', 'RIVN', 'LCID', 'NIO',
  'MRNA', 'BABA', 'JD', 'PYPL', 'SQ', 'SNOW', 'CRWD', 'PANW',
  'SMCI', 'ARM', 'MARA', 'RIOT', 'HOOD', 'RBLX', 'SNAP', 'UBER',
  'ABNB', 'DKNG', 'ENPH', 'FSLR', 'LI', 'XPEV', 'SHOP', 'MU',
  'INTC', 'NFLX', 'DIS', 'BA', 'F', 'GM', 'AAL', 'DAL', 'UAL',
  'CCL', 'NCLH', 'RCL', 'WYNN', 'MGM', 'LVS', 'CHWY', 'ROKU',
  'ZM', 'DOCU', 'PTON', 'W', 'ETSY', 'PINS', 'TTD', 'OKTA'
];

// Stock metadata (float in millions, exchange)
const STOCK_METADATA: Record<string, { float: number; exchange: string }> = {
  'NVDA': { float: 2450, exchange: 'NASDAQ' },
  'TSLA': { float: 2850, exchange: 'NASDAQ' },
  'AMD': { float: 1620, exchange: 'NASDAQ' },
  'AAPL': { float: 15400, exchange: 'NASDAQ' },
  'MSFT': { float: 7440, exchange: 'NASDAQ' },
  'META': { float: 2280, exchange: 'NASDAQ' },
  'GOOGL': { float: 5800, exchange: 'NASDAQ' },
  'AMZN': { float: 10300, exchange: 'NASDAQ' },
  'SPY': { float: 920, exchange: 'NYSE' },
  'QQQ': { float: 490, exchange: 'NASDAQ' },
  'COIN': { float: 170, exchange: 'NASDAQ' },
  'PLTR': { float: 2100, exchange: 'NYSE' },
  'SOFI': { float: 950, exchange: 'NASDAQ' },
  'RIVN': { float: 850, exchange: 'NASDAQ' },
  'LCID': { float: 1800, exchange: 'NASDAQ' },
  'NIO': { float: 1650, exchange: 'NYSE' },
  'SMCI': { float: 52, exchange: 'NASDAQ' },
  'ARM': { float: 102, exchange: 'NASDAQ' },
  'MARA': { float: 280, exchange: 'NASDAQ' },
  'RIOT': { float: 250, exchange: 'NASDAQ' },
  'HOOD': { float: 780, exchange: 'NASDAQ' },
  'RBLX': { float: 590, exchange: 'NYSE' },
  'SNAP': { float: 1450, exchange: 'NYSE' },
  'UBER': { float: 1980, exchange: 'NYSE' },
  'ABNB': { float: 610, exchange: 'NASDAQ' },
  'DKNG': { float: 450, exchange: 'NASDAQ' },
  'MU': { float: 1100, exchange: 'NASDAQ' },
  'INTC': { float: 4200, exchange: 'NASDAQ' },
  'NFLX': { float: 430, exchange: 'NASDAQ' },
};

// Get SPY 200-day SMA for market regime detection
async function getSPY200SMA(
  apiKeyId: string,
  secretKey: string
): Promise<{ currentPrice: number; sma200: number } | null> {
  try {
    const baseUrl = 'https://data.alpaca.markets/v2';
    
    // Get latest SPY quote
    const quoteRes = await fetch(
      `${baseUrl}/stocks/SPY/quotes/latest`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );

    if (!quoteRes.ok) {
      console.log('SPY quote failed:', await quoteRes.text());
      return null;
    }

    const quoteData = await quoteRes.json();
    const currentPrice = quoteData.quote?.ap || quoteData.quote?.bp || 0;

    // Get 200 days of daily bars for SMA calculation
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 300); // Extra days for weekends/holidays

    const barsRes = await fetch(
      `${baseUrl}/stocks/SPY/bars?timeframe=1Day&start=${startDate.toISOString().split('T')[0]}&limit=200`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );

    if (!barsRes.ok) {
      console.log('SPY bars failed');
      return null;
    }

    const barsData = await barsRes.json();
    const bars = barsData.bars || [];

    if (bars.length < 200) {
      console.log(`Only got ${bars.length} bars for SPY, need 200 for SMA`);
      // Use what we have if close to 200
      if (bars.length < 150) return null;
    }

    // Calculate 200-day SMA using closing prices
    const closes = bars.slice(-200).map((b: any) => b.c);
    const sma200 = closes.reduce((sum: number, c: number) => sum + c, 0) / closes.length;

    console.log(`SPY current: $${currentPrice.toFixed(2)}, 200-SMA: $${sma200.toFixed(2)}`);

    return { currentPrice, sma200 };
  } catch (error) {
    console.error('Error fetching SPY 200-SMA:', error);
    return null;
  }
}

async function getPreMarketData(
  symbol: string,
  apiKeyId: string,
  secretKey: string
): Promise<{
  currentPrice: number;
  previousClose: number;
  preMarketVolume: number;
  avgVolume: number;
} | null> {
  try {
    const baseUrl = 'https://data.alpaca.markets/v2';
    
    // Get latest quote
    const quoteRes = await fetch(
      `${baseUrl}/stocks/${symbol}/quotes/latest`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );

    if (!quoteRes.ok) {
      console.log(`Quote failed for ${symbol}:`, await quoteRes.text());
      return null;
    }

    const quoteData = await quoteRes.json();
    const currentPrice = quoteData.quote?.ap || quoteData.quote?.bp || 0;

    // Get previous day's bar for close and avg volume calculation
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 45);

    const barsRes = await fetch(
      `${baseUrl}/stocks/${symbol}/bars?timeframe=1Day&start=${thirtyDaysAgo.toISOString().split('T')[0]}&limit=31`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );

    if (!barsRes.ok) {
      console.log(`Bars failed for ${symbol}`);
      return null;
    }

    const barsData = await barsRes.json();
    const bars = barsData.bars || [];

    if (bars.length < 2) return null;

    const previousClose = bars[bars.length - 1]?.c || 0;
    const avgVolume = bars.slice(0, -1).reduce((sum: number, b: any) => sum + b.v, 0) / Math.max(1, bars.length - 1);

    // Get today's pre-market volume
    const today = new Date().toISOString().split('T')[0];
    const preMarketRes = await fetch(
      `${baseUrl}/stocks/${symbol}/bars?timeframe=1Min&start=${today}T04:00:00-05:00&end=${today}T09:30:00-05:00&limit=500`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );

    let preMarketVolume = 0;
    if (preMarketRes.ok) {
      const preMarketData = await preMarketRes.json();
      const preMarketBars = preMarketData.bars || [];
      preMarketVolume = preMarketBars.reduce((sum: number, b: any) => sum + b.v, 0);
    }

    return {
      currentPrice: currentPrice || previousClose,
      previousClose,
      preMarketVolume,
      avgVolume,
    };
  } catch (error) {
    console.error(`Error fetching data for ${symbol}:`, error);
    return null;
  }
}

serve(async (req) => {
  // v2 - Token-based auth fix
  console.log("ORB Stock Selector v2 triggered at:", new Date().toISOString());
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  console.log("ORB Stock Selector triggered at:", new Date().toISOString());

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Extract and decode JWT token manually (SDK getUser has session issues)
    const token = authHeader.replace('Bearer ', '');
    let userId: string;
    
    try {
      // Decode JWT payload (base64url encoded)
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid JWT format');
      
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      userId = payload.sub;
      
      if (!userId) throw new Error('No user ID in token');
      
      // Verify token hasn't expired
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        throw new Error('Token expired');
      }
      
      console.log("User authenticated:", userId);
    } catch (e) {
      console.error('JWT decode error:', e);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const user = { id: userId };

    // Get user's trading config for API keys
    const { data: configs, error: configError } = await supabase
      .rpc('get_decrypted_trading_config', { p_user_id: user.id });

    if (configError || !configs?.length) {
      console.log("No trading config found, returning mock data");
      // Return mock data if no config
      const mockStocks: SelectedStock[] = [
        { symbol: 'SMCI', preMarketChange: 8.5, rvol: 4.2, price: 45.20, avgVolume: 12000000, float: 52, exchange: 'NASDAQ' },
        { symbol: 'MARA', preMarketChange: 6.3, rvol: 3.8, price: 24.50, avgVolume: 18000000, float: 280, exchange: 'NASDAQ' },
        { symbol: 'RIOT', preMarketChange: 5.8, rvol: 3.5, price: 12.80, avgVolume: 22000000, float: 250, exchange: 'NASDAQ' },
        { symbol: 'ARM', preMarketChange: 4.2, rvol: 3.2, price: 142.00, avgVolume: 8500000, float: 102, exchange: 'NASDAQ' },
        { symbol: 'COIN', preMarketChange: 3.5, rvol: 3.1, price: 285.00, avgVolume: 6200000, float: 170, exchange: 'NASDAQ' },
      ];

      return new Response(
        JSON.stringify({
          stocks: mockStocks,
          scannedAt: new Date().toISOString(),
          message: 'Using demo data - connect Alpaca for live scanning',
          marketRegime: 'bullish' as const,
          spyPrice: 580.00,
          spy200SMA: 550.00,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const config = configs[0];
    const apiKeyId = config.api_key_id;
    const secretKey = config.secret_key;

    if (!apiKeyId || !secretKey) {
      console.log("API keys not properly decrypted");
      return new Response(
        JSON.stringify({ error: 'API keys not configured properly' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("Scanning stocks with live data...");

    // First, get SPY 200-day SMA for market regime detection
    const spyData = await getSPY200SMA(apiKeyId, secretKey);
    const marketRegime: 'bullish' | 'bearish' = spyData && spyData.currentPrice < spyData.sma200 
      ? 'bearish' 
      : 'bullish';
    
    console.log(`Market regime: ${marketRegime} (SPY: $${spyData?.currentPrice?.toFixed(2) || 'N/A'}, 200-SMA: $${spyData?.sma200?.toFixed(2) || 'N/A'})`);

    // Scan all stocks in universe

    // Collect all stock data first
    const allStockData: SelectedStock[] = [];

    for (const symbol of SCAN_UNIVERSE) {
      const metadata = STOCK_METADATA[symbol];
      
      // Skip if no metadata
      if (!metadata) {
        console.log(`${symbol}: No metadata, skipping`);
        continue;
      }

      const data = await getPreMarketData(symbol, apiKeyId, secretKey);
      if (!data) {
        console.log(`${symbol}: No data from API, skipping`);
        continue;
      }

      const { currentPrice, previousClose, preMarketVolume, avgVolume } = data;

      // Calculate metrics
      const dailyChange = previousClose > 0 
        ? ((currentPrice - previousClose) / previousClose) * 100 
        : 0;
      
      // RVOL calculation
      const expectedPreMarketVolume = avgVolume * 0.15;
      const rvol = expectedPreMarketVolume > 0 ? preMarketVolume / expectedPreMarketVolume : 1;

      console.log(`${symbol}: price=$${currentPrice?.toFixed(2)}, change=${dailyChange.toFixed(2)}%, rvol=${rvol.toFixed(2)}, avgVol=${avgVolume}`);

      // Add all stocks with valid data
      if (currentPrice > 0 && avgVolume > 0) {
        allStockData.push({
          symbol,
          preMarketChange: Math.round(dailyChange * 100) / 100,
          rvol: Math.round(Math.max(rvol, 1) * 100) / 100, // Minimum RVOL of 1
          price: Math.round(currentPrice * 100) / 100,
          avgVolume: Math.round(avgVolume),
          float: metadata.float,
          exchange: metadata.exchange,
        });
      }

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Sort by absolute daily change (most volatile first) and take top 6
    allStockData.sort((a, b) => Math.abs(b.preMarketChange) - Math.abs(a.preMarketChange));
    const topStocks = allStockData.slice(0, 6);
    
    console.log(`Found ${allStockData.length} stocks with data, returning top ${topStocks.length}`);

    const result: ScanResult = {
      stocks: topStocks,
      scannedAt: new Date().toISOString(),
      marketRegime,
      spyPrice: spyData?.currentPrice,
      spy200SMA: spyData?.sma200,
    };

    if (topStocks.length === 0) {
      result.message = "Waiting for better setups today – no trades yet";
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error("Stock selector error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
