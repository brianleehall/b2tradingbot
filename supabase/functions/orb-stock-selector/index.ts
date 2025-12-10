import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SelectedStock {
  symbol: string;
  priceChange: number;
  rvol: number;
  price: number;
  avgVolume: number;
  volume: number;
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
  scanDate?: string;
}

// Curated universe of liquid, high-beta NASDAQ/NYSE stocks
const SCAN_UNIVERSE = [
  // Mega caps (high liquidity)
  'NVDA', 'TSLA', 'AMD', 'AAPL', 'MSFT', 'META', 'GOOGL', 'AMZN', 'NFLX',
  // High beta / meme stocks
  'COIN', 'PLTR', 'SOFI', 'RIVN', 'LCID', 'NIO', 'HOOD', 'RBLX', 'SNAP',
  // Crypto-related
  'MARA', 'RIOT', 'MSTR', 'BITF', 'HUT', 'CLSK',
  // AI / Semiconductors
  'SMCI', 'ARM', 'MU', 'INTC', 'AVGO', 'QCOM', 'AMAT', 'LRCX',
  // Growth tech
  'CRWD', 'PANW', 'SNOW', 'DDOG', 'NET', 'ZS', 'OKTA', 'MDB',
  // EV / Clean energy
  'XPEV', 'LI', 'ENPH', 'FSLR', 'PLUG', 'CHPT',
  // E-commerce / Consumer
  'SHOP', 'UBER', 'ABNB', 'DKNG', 'ROKU', 'ZM', 'PTON', 'ETSY',
  // Financials
  'SQ', 'PYPL', 'AFRM', 'UPST',
  // Biotech (volatile)
  'MRNA', 'BNTX',
  // Small cap movers
  'IONQ', 'RGTI', 'QUBT', 'SOUN', 'GSAT',
];

// Fallback stocks (proven ORB performers)
const FALLBACK_STOCKS = ['NVDA', 'TSLA', 'AMD', 'META', 'SMCI'];

// Float data in millions
const STOCK_FLOAT: Record<string, number> = {
  'TSLA': 145, 'AMD': 140, 'SMCI': 58, 'ARM': 102, 'COIN': 115, 'PLTR': 140,
  'MARA': 85, 'RIOT': 95, 'MSTR': 110, 'HUT': 45, 'CLSK': 75, 'BITF': 65,
  'IONQ': 42, 'RGTI': 35, 'QUBT': 28, 'SOUN': 55, 'GSAT': 80, 'AFRM': 95,
  'UPST': 78, 'PLUG': 110, 'CHPT': 105, 'SOFI': 98, 'HOOD': 88, 'RIVN': 130,
  'LCID': 125, 'XPEV': 90, 'LI': 95, 'NIO': 120, 'NVDA': 200, 'META': 200,
};

// Selection criteria
const CRITERIA = {
  MIN_RVOL: 2.5,
  MIN_CHANGE_PCT: 3,
  MIN_AVG_VOLUME: 800000,
  MIN_PRICE: 15,
  MAX_FLOAT_MILLIONS: 150,
};

// Get previous trading day
function getPreviousTradingDay(): string {
  const now = new Date();
  const day = now.getUTCDay();
  let daysBack = 1;
  if (day === 1) daysBack = 3; // Monday -> Friday
  else if (day === 0) daysBack = 2; // Sunday -> Friday
  
  const prevDay = new Date(now);
  prevDay.setUTCDate(prevDay.getUTCDate() - daysBack);
  return prevDay.toISOString().split('T')[0];
}

// Fetch daily bars from Polygon with rate limit handling
async function getPolygonDailyBars(
  symbol: string,
  fromDate: string,
  toDate: string,
  apiKey: string
): Promise<any[] | null> {
  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&apiKey=${apiKey}`;
    const response = await fetch(url);
    
    if (response.status === 429) {
      // Rate limited - wait and retry once
      await new Promise(resolve => setTimeout(resolve, 12000));
      const retryResponse = await fetch(url);
      if (!retryResponse.ok) return null;
      const retryData = await retryResponse.json();
      return retryData.results || null;
    }
    
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.results || null;
  } catch (error) {
    console.error(`Error fetching Polygon data for ${symbol}:`, error);
    return null;
  }
}

// Get SPY 200-day SMA
async function getSPY200SMA(apiKey: string): Promise<{ currentPrice: number; sma200: number } | null> {
  try {
    const toDate = new Date().toISOString().split('T')[0];
    const fromDate = new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const bars = await getPolygonDailyBars('SPY', fromDate, toDate, apiKey);
    if (!bars || bars.length < 150) return null;
    
    const recentBars = bars.slice(-200);
    const currentPrice = recentBars[recentBars.length - 1].c;
    const sma200 = recentBars.reduce((sum: number, b: any) => sum + b.c, 0) / recentBars.length;
    
    console.log(`SPY current: $${currentPrice.toFixed(2)}, 200-SMA: $${sma200.toFixed(2)}`);
    return { currentPrice, sma200 };
  } catch (error) {
    console.error('Error fetching SPY data:', error);
    return null;
  }
}

serve(async (req) => {
  console.log("ORB Stock Selector v5 (Polygon.io curated) triggered at:", new Date().toISOString());
  
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
    const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
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
      console.log("User authenticated:", userId);
    } catch (e) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!polygonApiKey) {
      console.log("No Polygon API key, returning demo data");
      const demoStocks: SelectedStock[] = [
        { symbol: 'SMCI', priceChange: 8.5, rvol: 4.2, price: 45.20, avgVolume: 12000000, volume: 50400000, float: 58, exchange: 'NASDAQ' },
        { symbol: 'MARA', priceChange: 6.3, rvol: 3.8, price: 24.50, avgVolume: 18000000, volume: 68400000, float: 85, exchange: 'NASDAQ' },
        { symbol: 'ARM', priceChange: -5.2, rvol: 3.5, price: 142.00, avgVolume: 8500000, volume: 29750000, float: 102, exchange: 'NASDAQ' },
      ];
      return new Response(
        JSON.stringify({
          stocks: demoStocks,
          scannedAt: new Date().toISOString(),
          message: 'Demo mode - Polygon API key not configured',
          marketRegime: 'bullish' as const,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scanDate = getPreviousTradingDay();
    const fromDate = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log("=== SCANNING WITH POLYGON.IO EOD DATA ===");
    console.log(`Scan date (previous trading day): ${scanDate}`);
    console.log(`Criteria: RVOL ≥ ${CRITERIA.MIN_RVOL} | Change ≥ ±${CRITERIA.MIN_CHANGE_PCT}% | AvgVol ≥ 800K | Price ≥ $${CRITERIA.MIN_PRICE} | Float ≤ ${CRITERIA.MAX_FLOAT_MILLIONS}M`);

    // Get SPY 200-SMA for market regime
    const spyData = await getSPY200SMA(polygonApiKey);
    const marketRegime: 'bullish' | 'bearish' = spyData && spyData.currentPrice < spyData.sma200 
      ? 'bearish' 
      : 'bullish';
    console.log(`Market regime: ${marketRegime}`);

    const qualifiedStocks: SelectedStock[] = [];

    // Process stocks sequentially to respect rate limits (5 calls/min on free tier)
    for (const symbol of SCAN_UNIVERSE) {
      const stockFloat = STOCK_FLOAT[symbol];
      
      // Skip if float > 150M
      if (stockFloat && stockFloat > CRITERIA.MAX_FLOAT_MILLIONS) {
        continue;
      }

      // Rate limit: wait 12 seconds between calls (5 calls/min)
      await new Promise(resolve => setTimeout(resolve, 12500));

      const bars = await getPolygonDailyBars(symbol, fromDate, scanDate, polygonApiKey);
      if (!bars || bars.length < 2) {
        console.log(`  ${symbol}: No data`);
        continue;
      }

      const yesterdayBar = bars[bars.length - 1];
      const dayBeforeBar = bars[bars.length - 2];
      const yesterdayClose = yesterdayBar.c;
      const yesterdayVolume = yesterdayBar.v;

      // Calculate 30-day average volume
      const volumeBars = bars.slice(0, -1).slice(-30);
      const avgVolume30d = volumeBars.length > 0 
        ? volumeBars.reduce((sum: number, b: any) => sum + b.v, 0) / volumeBars.length
        : 0;

      // Calculate metrics
      const priceChange = dayBeforeBar.c > 0 
        ? ((yesterdayClose - dayBeforeBar.c) / dayBeforeBar.c) * 100 
        : 0;
      const rvol = avgVolume30d > 0 ? yesterdayVolume / avgVolume30d : 0;

      console.log(`  ${symbol}: $${yesterdayClose.toFixed(2)}, Change=${priceChange.toFixed(1)}%, RVOL=${rvol.toFixed(2)}x`);

      // Apply filters
      if (yesterdayClose < CRITERIA.MIN_PRICE) continue;
      if (avgVolume30d < CRITERIA.MIN_AVG_VOLUME) continue;
      if (rvol < CRITERIA.MIN_RVOL) continue;
      if (Math.abs(priceChange) < CRITERIA.MIN_CHANGE_PCT) continue;

      console.log(`✓ ${symbol} QUALIFIES!`);

      qualifiedStocks.push({
        symbol,
        priceChange: Math.round(priceChange * 100) / 100,
        rvol: Math.round(rvol * 100) / 100,
        price: Math.round(yesterdayClose * 100) / 100,
        avgVolume: Math.round(avgVolume30d),
        volume: yesterdayVolume,
        float: stockFloat,
        exchange: 'NASDAQ',
      });

      // Early exit if we have 6+ qualified stocks
      if (qualifiedStocks.length >= 6) break;
    }

    // Sort by RVOL and take top 6
    qualifiedStocks.sort((a, b) => b.rvol - a.rvol);
    let topStocks = qualifiedStocks.slice(0, 6);

    // Add fallbacks if fewer than 3 stocks qualify
    if (topStocks.length < 3) {
      console.log(`Only ${topStocks.length} stocks qualified, adding fallbacks...`);
      const existingSymbols = new Set(topStocks.map(s => s.symbol));
      
      for (const fallback of FALLBACK_STOCKS) {
        if (topStocks.length >= 3) break;
        if (existingSymbols.has(fallback)) continue;
        
        await new Promise(resolve => setTimeout(resolve, 12500));
        
        const bars = await getPolygonDailyBars(fallback, fromDate, scanDate, polygonApiKey);
        if (bars && bars.length >= 2) {
          const yesterdayBar = bars[bars.length - 1];
          const dayBeforeBar = bars[bars.length - 2];
          const volumeBars = bars.slice(0, -1).slice(-30);
          const avgVolume30d = volumeBars.length > 0 
            ? volumeBars.reduce((sum: number, b: any) => sum + b.v, 0) / volumeBars.length
            : 0;
          
          const priceChange = dayBeforeBar.c > 0 
            ? ((yesterdayBar.c - dayBeforeBar.c) / dayBeforeBar.c) * 100 
            : 0;
          const rvol = avgVolume30d > 0 ? yesterdayBar.v / avgVolume30d : 0;

          console.log(`+ Adding fallback ${fallback}: $${yesterdayBar.c.toFixed(2)}, ${priceChange.toFixed(1)}%, RVOL ${rvol.toFixed(1)}x`);
          
          topStocks.push({
            symbol: fallback,
            priceChange: Math.round(priceChange * 100) / 100,
            rvol: Math.round(rvol * 100) / 100,
            price: Math.round(yesterdayBar.c * 100) / 100,
            avgVolume: Math.round(avgVolume30d),
            volume: yesterdayBar.v,
            float: STOCK_FLOAT[fallback],
            exchange: 'NASDAQ',
          });
          existingSymbols.add(fallback);
        }
      }
    }

    console.log(`=== SCAN COMPLETE ===`);
    console.log(`Found ${qualifiedStocks.length} stocks meeting criteria`);
    console.log(`Returning ${topStocks.length}: ${topStocks.map(s => s.symbol).join(', ')}`);

    // Save to daily_orb_stocks table
    if (topStocks.length > 0) {
      const todayDate = new Date().toISOString().split('T')[0];
      
      await supabase.from('daily_orb_stocks').delete().eq('scan_date', todayDate);
      
      const insertData = topStocks.map(stock => ({
        scan_date: todayDate,
        symbol: stock.symbol,
        price_change: stock.priceChange,
        rvol: stock.rvol,
        price: stock.price,
        avg_volume: stock.avgVolume,
        volume: stock.volume,
        float_millions: stock.float || null,
        exchange: stock.exchange,
      }));

      const { error: insertError } = await supabase.from('daily_orb_stocks').insert(insertData);
      if (insertError) {
        console.error('Error saving to daily_orb_stocks:', insertError);
      } else {
        console.log(`Saved ${topStocks.length} stocks to daily_orb_stocks`);
      }
    }

    const result: ScanResult = {
      stocks: topStocks,
      scannedAt: new Date().toISOString(),
      marketRegime,
      spyPrice: spyData?.currentPrice,
      spy200SMA: spyData?.sma200,
      scanDate,
    };

    if (topStocks.length === 0) {
      result.message = "No stocks met all criteria – using fallbacks";
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
