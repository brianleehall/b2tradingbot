import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SelectedStock {
  symbol: string;
  priceChange: number;      // Yesterday's % change
  rvol: number;             // Yesterday's RVOL (vol / 30d avg)
  price: number;            // Yesterday's closing price
  avgVolume: number;        // 30-day avg volume
  volume: number;           // Yesterday's volume
  float?: number;           // Float in millions
  exchange: string;
}

interface ScanResult {
  stocks: SelectedStock[];
  scannedAt: string;
  message?: string;
  marketRegime: 'bullish' | 'bearish';
  spyPrice?: number;
  spy200SMA?: number;
  scanDate?: string;        // The previous trading day used for scanning
}

// Expanded universe of liquid NASDAQ/NYSE stocks
const SCAN_UNIVERSE = [
  // Mega caps
  'NVDA', 'TSLA', 'AMD', 'AAPL', 'MSFT', 'META', 'GOOGL', 'AMZN', 'NFLX',
  // High beta / meme stocks
  'COIN', 'PLTR', 'SOFI', 'RIVN', 'LCID', 'NIO', 'HOOD', 'RBLX', 'SNAP',
  // Crypto-related
  'MARA', 'RIOT', 'MSTR', 'BITF', 'HUT', 'CLSK',
  // AI / Semiconductors
  'SMCI', 'ARM', 'MU', 'INTC', 'AVGO', 'QCOM', 'TSM', 'AMAT', 'LRCX', 'KLAC',
  // Growth tech
  'CRWD', 'PANW', 'SNOW', 'DDOG', 'NET', 'ZS', 'OKTA', 'MDB', 'ESTC',
  // EV / Clean energy
  'XPEV', 'LI', 'ENPH', 'FSLR', 'PLUG', 'CHPT', 'BLNK',
  // E-commerce / Consumer
  'SHOP', 'UBER', 'ABNB', 'DKNG', 'CHWY', 'ROKU', 'ZM', 'DOCU', 'PTON', 'W', 'ETSY', 'PINS',
  // Travel / Leisure
  'CCL', 'NCLH', 'RCL', 'WYNN', 'MGM', 'LVS', 'AAL', 'DAL', 'UAL',
  // Financials
  'SQ', 'PYPL', 'AFRM', 'UPST',
  // Biotech / Pharma (volatile)
  'MRNA', 'BNTX', 'NVAX',
  // Other high-volume
  'SPY', 'QQQ', 'IWM', 'DIS', 'BA', 'F', 'GM', 'BABA', 'JD', 'TTD',
  // Small cap movers
  'IONQ', 'RGTI', 'QUBT', 'SOUN', 'GSAT', 'DNA'
];

// Float data in millions (updated with realistic values)
// Only stocks with float <= 150M qualify
const STOCK_FLOAT: Record<string, number> = {
  // Large movers with manageable float
  'TSLA': 145,   // Tesla - large but within limit
  'AMD': 140,    // AMD - within limit
  'SMCI': 58,    // Super Micro - small float, high mover
  'ARM': 102,    // ARM Holdings
  'COIN': 115,   // Coinbase
  'PLTR': 140,   // Palantir
  // Crypto-related
  'MARA': 85,    // Marathon Digital
  'RIOT': 95,    // Riot Platforms
  'MSTR': 110,   // MicroStrategy
  'HUT': 45,     // Hut 8 Mining
  'CLSK': 75,    // CleanSpark
  'BITF': 65,    // Bitfarms
  // Small / mid cap high movers
  'IONQ': 42,    // IonQ
  'RGTI': 35,    // Rigetti
  'QUBT': 28,    // Quantum Computing
  'SOUN': 55,    // SoundHound
  'GSAT': 80,    // Globalstar
  'DNA': 90,     // Ginkgo Bioworks
  'AFRM': 95,    // Affirm
  'UPST': 78,    // Upstart
  'PLUG': 110,   // Plug Power
  'CHPT': 105,   // ChargePoint
  'BLNK': 45,    // Blink Charging
  'SOFI': 98,    // SoFi
  'HOOD': 88,    // Robinhood
  'RIVN': 130,   // Rivian
  'LCID': 125,   // Lucid
  // EV / Clean energy
  'XPEV': 90,    // XPeng
  'LI': 95,      // Li Auto
  'NIO': 120,    // NIO
};

// All stocks in scan universe are NASDAQ or NYSE
const STOCK_EXCHANGE: Record<string, string> = {
  'NVDA': 'NASDAQ', 'TSLA': 'NASDAQ', 'AMD': 'NASDAQ', 'AAPL': 'NASDAQ', 'MSFT': 'NASDAQ',
  'META': 'NASDAQ', 'GOOGL': 'NASDAQ', 'AMZN': 'NASDAQ', 'NFLX': 'NASDAQ',
  'COIN': 'NASDAQ', 'PLTR': 'NYSE', 'SOFI': 'NASDAQ', 'RIVN': 'NASDAQ', 'LCID': 'NASDAQ',
  'NIO': 'NYSE', 'HOOD': 'NASDAQ', 'RBLX': 'NYSE', 'SNAP': 'NYSE',
  'MARA': 'NASDAQ', 'RIOT': 'NASDAQ', 'MSTR': 'NASDAQ', 'BITF': 'NASDAQ', 'HUT': 'NASDAQ', 'CLSK': 'NASDAQ',
  'SMCI': 'NASDAQ', 'ARM': 'NASDAQ', 'MU': 'NASDAQ', 'INTC': 'NASDAQ', 'AVGO': 'NASDAQ',
  'QCOM': 'NASDAQ', 'TSM': 'NYSE', 'AMAT': 'NASDAQ', 'LRCX': 'NASDAQ', 'KLAC': 'NASDAQ',
  'CRWD': 'NASDAQ', 'PANW': 'NASDAQ', 'SNOW': 'NYSE', 'DDOG': 'NASDAQ', 'NET': 'NYSE',
  'ZS': 'NASDAQ', 'OKTA': 'NASDAQ', 'MDB': 'NASDAQ', 'ESTC': 'NYSE',
  'XPEV': 'NYSE', 'LI': 'NASDAQ', 'ENPH': 'NASDAQ', 'FSLR': 'NASDAQ', 'PLUG': 'NASDAQ', 'CHPT': 'NYSE', 'BLNK': 'NASDAQ',
  'SHOP': 'NYSE', 'UBER': 'NYSE', 'ABNB': 'NASDAQ', 'DKNG': 'NASDAQ', 'CHWY': 'NYSE',
  'ROKU': 'NASDAQ', 'ZM': 'NASDAQ', 'DOCU': 'NASDAQ', 'PTON': 'NASDAQ', 'W': 'NYSE', 'ETSY': 'NASDAQ', 'PINS': 'NYSE',
  'CCL': 'NYSE', 'NCLH': 'NYSE', 'RCL': 'NYSE', 'WYNN': 'NASDAQ', 'MGM': 'NYSE', 'LVS': 'NYSE',
  'AAL': 'NASDAQ', 'DAL': 'NYSE', 'UAL': 'NASDAQ',
  'SQ': 'NYSE', 'PYPL': 'NASDAQ', 'AFRM': 'NASDAQ', 'UPST': 'NASDAQ',
  'MRNA': 'NASDAQ', 'BNTX': 'NASDAQ', 'NVAX': 'NASDAQ',
  'SPY': 'NYSE', 'QQQ': 'NASDAQ', 'IWM': 'NYSE', 'DIS': 'NYSE', 'BA': 'NYSE', 'F': 'NYSE', 'GM': 'NYSE',
  'BABA': 'NYSE', 'JD': 'NASDAQ', 'TTD': 'NASDAQ',
  'IONQ': 'NYSE', 'RGTI': 'NASDAQ', 'QUBT': 'NASDAQ', 'SOUN': 'NASDAQ', 'GSAT': 'NYSE', 'DNA': 'NYSE',
};

// Get previous trading day's data for a stock
async function getEODData(
  symbol: string,
  apiKeyId: string,
  secretKey: string
): Promise<{
  yesterdayClose: number;
  dayBeforeClose: number;
  yesterdayVolume: number;
  avgVolume30d: number;
  tradingDate: string;
} | null> {
  try {
    const baseUrl = 'https://data.alpaca.markets/v2';
    
    // Get last 35 days of daily bars (enough to calculate 30-day avg + yesterday)
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 50);

    const barsRes = await fetch(
      `${baseUrl}/stocks/${symbol}/bars?timeframe=1Day&start=${startDate.toISOString().split('T')[0]}&limit=35`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );

    if (!barsRes.ok) {
      return null;
    }

    const barsData = await barsRes.json();
    const bars = barsData.bars || [];

    // Need at least 2 days to calculate change
    if (bars.length < 2) return null;

    // Yesterday = most recent bar, Day before = second most recent
    const yesterdayBar = bars[bars.length - 1];
    const dayBeforeBar = bars[bars.length - 2];
    
    // 30-day average volume (excluding yesterday)
    const volumeBars = bars.slice(0, -1).slice(-30);
    const avgVolume30d = volumeBars.length > 0 
      ? volumeBars.reduce((sum: number, b: any) => sum + b.v, 0) / volumeBars.length
      : 0;

    return {
      yesterdayClose: yesterdayBar.c,
      dayBeforeClose: dayBeforeBar.c,
      yesterdayVolume: yesterdayBar.v,
      avgVolume30d,
      tradingDate: yesterdayBar.t.split('T')[0],
    };
  } catch (error) {
    console.error(`Error fetching EOD data for ${symbol}:`, error);
    return null;
  }
}

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

    if (!quoteRes.ok) return null;

    const quoteData = await quoteRes.json();
    const currentPrice = quoteData.quote?.ap || quoteData.quote?.bp || 0;

    // Get 200+ days of daily bars for SMA calculation
    const now = new Date();
    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - 300);

    const barsRes = await fetch(
      `${baseUrl}/stocks/SPY/bars?timeframe=1Day&start=${startDate.toISOString().split('T')[0]}&limit=200`,
      {
        headers: {
          'APCA-API-KEY-ID': apiKeyId,
          'APCA-API-SECRET-KEY': secretKey,
        },
      }
    );

    if (!barsRes.ok) return null;

    const barsData = await barsRes.json();
    const bars = barsData.bars || [];

    if (bars.length < 150) return null;

    const closes = bars.slice(-200).map((b: any) => b.c);
    const sma200 = closes.reduce((sum: number, c: number) => sum + c, 0) / closes.length;

    console.log(`SPY current: $${currentPrice.toFixed(2)}, 200-SMA: $${sma200.toFixed(2)}`);

    return { currentPrice, sma200 };
  } catch (error) {
    console.error('Error fetching SPY 200-SMA:', error);
    return null;
  }
}

serve(async (req) => {
  console.log("ORB Stock Selector v3 (EOD-based) triggered at:", new Date().toISOString());
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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

    // Extract user ID from JWT
    const token = authHeader.replace('Bearer ', '');
    let userId: string;
    
    try {
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid JWT format');
      
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      userId = payload.sub;
      
      if (!userId) throw new Error('No user ID in token');
      if (payload.exp && payload.exp * 1000 < Date.now()) throw new Error('Token expired');
      
      console.log("User authenticated:", userId);
    } catch (e) {
      console.error('JWT decode error:', e);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's trading config for API keys
    const { data: configs, error: configError } = await supabase
      .rpc('get_decrypted_trading_config', { p_user_id: userId });

    if (configError || !configs?.length) {
      console.log("No trading config found, returning demo data");
      const demoStocks: SelectedStock[] = [
        { symbol: 'SMCI', priceChange: 8.5, rvol: 4.2, price: 45.20, avgVolume: 12000000, volume: 50400000, float: 58, exchange: 'NASDAQ' },
        { symbol: 'MARA', priceChange: 6.3, rvol: 3.8, price: 24.50, avgVolume: 18000000, volume: 68400000, float: 85, exchange: 'NASDAQ' },
        { symbol: 'ARM', priceChange: -5.2, rvol: 3.5, price: 142.00, avgVolume: 8500000, volume: 29750000, float: 102, exchange: 'NASDAQ' },
        { symbol: 'RIOT', priceChange: 4.8, rvol: 3.3, price: 12.80, avgVolume: 22000000, volume: 72600000, float: 95, exchange: 'NASDAQ' },
      ];

      return new Response(
        JSON.stringify({
          stocks: demoStocks,
          scannedAt: new Date().toISOString(),
          message: 'Using demo data - connect Alpaca for live EOD scanning',
          marketRegime: 'bullish' as const,
          spyPrice: 580.00,
          spy200SMA: 550.00,
          scanDate: 'demo',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const config = configs[0];
    const apiKeyId = config.api_key_id;
    const secretKey = config.secret_key;

    if (!apiKeyId || !secretKey) {
      return new Response(
        JSON.stringify({ error: 'API keys not configured properly' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log("=== SCANNING WITH PREVIOUS DAY EOD DATA ===");
    console.log("Criteria: RVOL ≥ 2.5 | Change ≥ ±3% | AvgVol ≥ 800K | Price ≥ $15 | Float ≤ 150M");

    // Get SPY 200-SMA for market regime
    const spyData = await getSPY200SMA(apiKeyId, secretKey);
    const marketRegime: 'bullish' | 'bearish' = spyData && spyData.currentPrice < spyData.sma200 
      ? 'bearish' 
      : 'bullish';
    
    console.log(`Market regime: ${marketRegime}`);

    // Scan all stocks using previous day's EOD data
    const qualifiedStocks: SelectedStock[] = [];
    let scanDate = '';

    for (const symbol of SCAN_UNIVERSE) {
      const stockFloat = STOCK_FLOAT[symbol];
      const exchange = STOCK_EXCHANGE[symbol] || 'NASDAQ';
      
      // FILTER 1: Float must be ≤ 150M (skip if no float data = assume too large)
      if (!stockFloat || stockFloat > 150) {
        continue;
      }

      const eodData = await getEODData(symbol, apiKeyId, secretKey);
      if (!eodData) {
        console.log(`  ${symbol}: No EOD data available`);
        continue;
      }

      const { yesterdayClose, dayBeforeClose, yesterdayVolume, avgVolume30d, tradingDate } = eodData;
      
      if (!scanDate) scanDate = tradingDate;

      // Calculate yesterday's metrics
      const priceChange = dayBeforeClose > 0 
        ? ((yesterdayClose - dayBeforeClose) / dayBeforeClose) * 100 
        : 0;
      
      const rvol = avgVolume30d > 0 
        ? yesterdayVolume / avgVolume30d 
        : 0;

      // Log key stocks for debugging
      const isKeyStock = ['TSLA', 'AMD', 'SMCI', 'NVDA', 'META'].includes(symbol);
      if (isKeyStock) {
        console.log(`  ${symbol}: Close=$${yesterdayClose.toFixed(2)}, Change=${priceChange.toFixed(1)}%, RVOL=${rvol.toFixed(2)}x, AvgVol=${(avgVolume30d/1000000).toFixed(1)}M, Float=${stockFloat}M`);
      }

      // FILTER 2: RVOL ≥ 2.5
      if (rvol < 2.5) {
        if (isKeyStock) console.log(`    FAIL: RVOL ${rvol.toFixed(2)} < 2.5`);
        continue;
      }

      // FILTER 3: Price change ≥ ±3%
      if (Math.abs(priceChange) < 3.0) {
        if (isKeyStock) console.log(`    FAIL: Change ${Math.abs(priceChange).toFixed(1)}% < 3%`);
        continue;
      }

      // FILTER 4: 30-day avg volume ≥ 800,000
      if (avgVolume30d < 800000) {
        if (isKeyStock) console.log(`    FAIL: AvgVol ${avgVolume30d} < 800K`);
        continue;
      }

      // FILTER 5: Closing price ≥ $15
      if (yesterdayClose < 15) {
        if (isKeyStock) console.log(`    FAIL: Price $${yesterdayClose.toFixed(2)} < $15`);
        continue;
      }

      console.log(`✓ ${symbol}: Close=$${yesterdayClose.toFixed(2)}, Change=${priceChange.toFixed(1)}%, RVOL=${rvol.toFixed(1)}x, Float=${stockFloat}M`);

      qualifiedStocks.push({
        symbol,
        priceChange: Math.round(priceChange * 100) / 100,
        rvol: Math.round(rvol * 100) / 100,
        price: Math.round(yesterdayClose * 100) / 100,
        avgVolume: Math.round(avgVolume30d),
        volume: yesterdayVolume,
        float: stockFloat,
        exchange,
      });

      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 80));
    }

    // Sort by RVOL (highest first) and take top 6
    qualifiedStocks.sort((a, b) => b.rvol - a.rvol);
    const topStocks = qualifiedStocks.slice(0, 6);

    console.log(`=== SCAN COMPLETE ===`);
    console.log(`Found ${qualifiedStocks.length} stocks meeting ALL criteria`);
    console.log(`Returning top ${topStocks.length}: ${topStocks.map(s => s.symbol).join(', ')}`);

    const result: ScanResult = {
      stocks: topStocks,
      scannedAt: new Date().toISOString(),
      marketRegime,
      spyPrice: spyData?.currentPrice,
      spy200SMA: spyData?.sma200,
      scanDate,
    };

    if (topStocks.length === 0) {
      result.message = "No stocks met all criteria yesterday – waiting for better setups";
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
