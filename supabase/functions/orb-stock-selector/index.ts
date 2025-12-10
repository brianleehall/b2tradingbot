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

// Fallback stocks in order (if fewer than 3 qualify)
const FALLBACK_STOCKS = ['NVDA', 'TSLA', 'AMD', 'META', 'SMCI'];

// Selection criteria
const CRITERIA = {
  MIN_RVOL: 2.5,           // Relative volume ≥ 2.5x yesterday
  MIN_CHANGE_PCT: 3,       // Absolute % change ≥ 3%
  MIN_AVG_VOLUME: 800000,  // 30-day avg volume ≥ 800K
  MIN_PRICE: 15,           // Closing price ≥ $15
  MAX_FLOAT_MILLIONS: 150, // Float ≤ 150M shares
};

// Get previous trading day (skip weekends)
function getPreviousTradingDay(): string {
  const now = new Date();
  const day = now.getUTCDay();
  let daysBack = 1;
  
  // If Monday, go back to Friday
  if (day === 1) daysBack = 3;
  // If Sunday, go back to Friday
  else if (day === 0) daysBack = 2;
  
  const prevDay = new Date(now);
  prevDay.setUTCDate(prevDay.getUTCDate() - daysBack);
  return prevDay.toISOString().split('T')[0];
}

// Get date 35 days ago for 30-day average calculation
function getStartDate(): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 50);
  return date.toISOString().split('T')[0];
}

// Fetch aggregated daily bars from Polygon
async function getPolygonDailyBars(
  symbol: string,
  fromDate: string,
  toDate: string,
  apiKey: string
): Promise<any[] | null> {
  try {
    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&apiKey=${apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.log(`Polygon API error for ${symbol}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    return data.results || null;
  } catch (error) {
    console.error(`Error fetching Polygon data for ${symbol}:`, error);
    return null;
  }
}

// Fetch ticker details (for float/shares outstanding)
async function getPolygonTickerDetails(
  symbol: string,
  apiKey: string
): Promise<{ sharesOutstanding?: number; marketCap?: number } | null> {
  try {
    const url = `https://api.polygon.io/v3/reference/tickers/${symbol}?apiKey=${apiKey}`;
    const response = await fetch(url);
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const results = data.results;
    
    return {
      sharesOutstanding: results?.share_class_shares_outstanding || results?.weighted_shares_outstanding,
      marketCap: results?.market_cap,
    };
  } catch (error) {
    return null;
  }
}

// Get all active US tickers from Polygon (NASDAQ/NYSE only)
async function getActiveUSStocks(apiKey: string): Promise<string[]> {
  const allTickers: string[] = [];
  let nextUrl: string | null = `https://api.polygon.io/v3/reference/tickers?market=stocks&active=true&limit=1000&apiKey=${apiKey}`;
  
  // Limit to 5 pages to avoid rate limits (5000 stocks)
  let pageCount = 0;
  const maxPages = 5;
  
  while (nextUrl && pageCount < maxPages) {
    try {
      const res: Response = await fetch(nextUrl);
      if (!res.ok) break;
      
      const json: { results?: any[]; next_url?: string } = await res.json();
      const results = json.results || [];
      
      for (const ticker of results) {
        // Only include NASDAQ and NYSE stocks
        if (
          ticker.ticker &&
          ticker.market === 'stocks' &&
          (ticker.primary_exchange === 'XNAS' || ticker.primary_exchange === 'XNYS') &&
          ticker.type === 'CS' // Common stock only
        ) {
          allTickers.push(ticker.ticker);
        }
      }
      
      nextUrl = json.next_url ? `${json.next_url}&apiKey=${apiKey}` : null;
      pageCount++;
      
      // Rate limit delay
      await new Promise(resolve => setTimeout(resolve, 200));
    } catch (error) {
      console.error('Error fetching tickers:', error);
      break;
    }
  }
  
  console.log(`Fetched ${allTickers.length} US stocks from Polygon`);
  return allTickers;
}

// Get SPY 200-day SMA for market regime
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

// Estimate float in millions
function estimateFloat(details: { sharesOutstanding?: number; marketCap?: number } | null, price: number): number | null {
  if (!details) return null;
  
  if (details.sharesOutstanding) {
    return details.sharesOutstanding / 1000000;
  }
  
  if (details.marketCap && price > 0) {
    return (details.marketCap / price) / 1000000;
  }
  
  return null;
}

serve(async (req) => {
  console.log("ORB Stock Selector v4 (Polygon.io) triggered at:", new Date().toISOString());
  
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
      if (payload.exp && payload.exp * 1000 < Date.now()) throw new Error('Token expired');
      
      console.log("User authenticated:", userId);
    } catch (e) {
      console.error('JWT decode error:', e);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if Polygon API key is configured
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
    const fromDate = getStartDate();

    console.log("=== SCANNING WITH POLYGON.IO EOD DATA ===");
    console.log(`Scan date (previous trading day): ${scanDate}`);
    console.log(`Criteria: RVOL ≥ ${CRITERIA.MIN_RVOL} | Change ≥ ±${CRITERIA.MIN_CHANGE_PCT}% | AvgVol ≥ ${CRITERIA.MIN_AVG_VOLUME/1000}K | Price ≥ $${CRITERIA.MIN_PRICE} | Float ≤ ${CRITERIA.MAX_FLOAT_MILLIONS}M`);

    // Get SPY 200-SMA for market regime
    const spyData = await getSPY200SMA(polygonApiKey);
    const marketRegime: 'bullish' | 'bearish' = spyData && spyData.currentPrice < spyData.sma200 
      ? 'bearish' 
      : 'bullish';
    
    console.log(`Market regime: ${marketRegime}`);

    // Get list of all active US stocks
    const allStocks = await getActiveUSStocks(polygonApiKey);
    console.log(`Scanning ${allStocks.length} stocks...`);

    const qualifiedStocks: SelectedStock[] = [];

    // Process stocks in batches to manage rate limits
    const batchSize = 50;
    for (let i = 0; i < Math.min(allStocks.length, 500); i += batchSize) {
      const batch = allStocks.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (symbol) => {
        try {
          // Get daily bars for the stock
          const bars = await getPolygonDailyBars(symbol, fromDate, scanDate, polygonApiKey);
          if (!bars || bars.length < 2) return;

          // Yesterday = most recent bar, Day before = second most recent
          const yesterdayBar = bars[bars.length - 1];
          const dayBeforeBar = bars[bars.length - 2];
          
          const yesterdayClose = yesterdayBar.c;
          const yesterdayVolume = yesterdayBar.v;
          
          // Calculate 30-day average volume (excluding yesterday)
          const volumeBars = bars.slice(0, -1).slice(-30);
          const avgVolume30d = volumeBars.length > 0 
            ? volumeBars.reduce((sum: number, b: any) => sum + b.v, 0) / volumeBars.length
            : 0;

          // Calculate yesterday's % change
          const priceChange = dayBeforeBar.c > 0 
            ? ((yesterdayClose - dayBeforeBar.c) / dayBeforeBar.c) * 100 
            : 0;
          
          // Calculate RVOL
          const rvol = avgVolume30d > 0 ? yesterdayVolume / avgVolume30d : 0;

          // FILTER 1: Price ≥ $15
          if (yesterdayClose < CRITERIA.MIN_PRICE) return;

          // FILTER 2: 30-day avg volume ≥ 800K
          if (avgVolume30d < CRITERIA.MIN_AVG_VOLUME) return;

          // FILTER 3: RVOL ≥ 2.5
          if (rvol < CRITERIA.MIN_RVOL) return;

          // FILTER 4: Absolute % change ≥ 3%
          if (Math.abs(priceChange) < CRITERIA.MIN_CHANGE_PCT) return;

          // FILTER 5: Float ≤ 150M (get ticker details)
          const details = await getPolygonTickerDetails(symbol, polygonApiKey);
          const floatMillions = estimateFloat(details, yesterdayClose);
          
          // If we can't determine float, skip (assume too large)
          if (floatMillions === null || floatMillions > CRITERIA.MAX_FLOAT_MILLIONS) return;

          // Determine exchange
          const exchange = details ? 'NASDAQ/NYSE' : 'NASDAQ';

          console.log(`✓ ${symbol}: Close=$${yesterdayClose.toFixed(2)}, Change=${priceChange.toFixed(1)}%, RVOL=${rvol.toFixed(1)}x, Float=${floatMillions.toFixed(0)}M`);

          qualifiedStocks.push({
            symbol,
            priceChange: Math.round(priceChange * 100) / 100,
            rvol: Math.round(rvol * 100) / 100,
            price: Math.round(yesterdayClose * 100) / 100,
            avgVolume: Math.round(avgVolume30d),
            volume: yesterdayVolume,
            float: Math.round(floatMillions),
            exchange,
          });
        } catch (error) {
          // Skip stocks that error
        }
      }));

      // Rate limit between batches
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Early exit if we have enough qualified stocks
      if (qualifiedStocks.length >= 10) break;
    }

    // Sort by RVOL (highest first) and take top 6
    qualifiedStocks.sort((a, b) => b.rvol - a.rvol);
    let topStocks = qualifiedStocks.slice(0, 6);

    // If fewer than 3 stocks qualify, add fallbacks
    if (topStocks.length < 3) {
      console.log(`Only ${topStocks.length} stocks qualified, adding fallbacks...`);
      const existingSymbols = new Set(topStocks.map(s => s.symbol));
      
      for (const fallback of FALLBACK_STOCKS) {
        if (topStocks.length >= 3) break;
        if (existingSymbols.has(fallback)) continue;
        
        // Fetch fallback stock data
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
            float: undefined,
            exchange: 'NASDAQ',
          });
          existingSymbols.add(fallback);
        }
      }
    }

    console.log(`=== SCAN COMPLETE ===`);
    console.log(`Found ${qualifiedStocks.length} stocks meeting ALL criteria`);
    console.log(`Returning ${topStocks.length}: ${topStocks.map(s => s.symbol).join(', ')}`);

    // Save to daily_orb_stocks table
    if (topStocks.length > 0) {
      const todayDate = new Date().toISOString().split('T')[0];
      
      // Delete existing entries for today first
      await supabase
        .from('daily_orb_stocks')
        .delete()
        .eq('scan_date', todayDate);
      
      // Insert new entries
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

      const { error: insertError } = await supabase
        .from('daily_orb_stocks')
        .insert(insertData);

      if (insertError) {
        console.error('Error saving to daily_orb_stocks:', insertError);
      } else {
        console.log(`Saved ${topStocks.length} stocks to daily_orb_stocks table`);
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
