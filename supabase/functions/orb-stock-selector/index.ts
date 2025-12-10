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

// High-priority stocks to scan first (most likely to qualify)
const PRIORITY_STOCKS = [
  'SMCI', 'MARA', 'RIOT', 'MSTR', 'HUT', 'CLSK', 'COIN', 
  'IONQ', 'RGTI', 'QUBT', 'SOUN', 'ARM', 'HOOD', 'SOFI',
  'UPST', 'AFRM', 'PLUG', 'XPEV', 'LI', 'NIO', 'RIVN',
  'NVDA', 'TSLA', 'AMD', 'META', 'AAPL'
];

// Fallback stocks
const FALLBACK_STOCKS = ['NVDA', 'TSLA', 'AMD', 'META', 'SMCI'];

// Float data in millions
const STOCK_FLOAT: Record<string, number> = {
  'TSLA': 145, 'AMD': 140, 'SMCI': 58, 'ARM': 102, 'COIN': 115,
  'MARA': 85, 'RIOT': 95, 'MSTR': 110, 'HUT': 45, 'CLSK': 75,
  'IONQ': 42, 'RGTI': 35, 'QUBT': 28, 'SOUN': 55, 'AFRM': 95,
  'UPST': 78, 'PLUG': 110, 'SOFI': 98, 'HOOD': 88, 'RIVN': 130,
  'XPEV': 90, 'LI': 95, 'NIO': 120, 'NVDA': 200, 'META': 200,
  'AAPL': 200, 'GSAT': 80, 'BITF': 65,
};

const CRITERIA = {
  MIN_RVOL: 2.5,
  MIN_CHANGE_PCT: 3,
  MIN_AVG_VOLUME: 800000,
  MIN_PRICE: 15,
  MAX_FLOAT_MILLIONS: 150,
};

function getPreviousTradingDay(): string {
  const now = new Date();
  const day = now.getUTCDay();
  let daysBack = 1;
  if (day === 1) daysBack = 3;
  else if (day === 0) daysBack = 2;
  
  const prevDay = new Date(now);
  prevDay.setUTCDate(prevDay.getUTCDate() - daysBack);
  return prevDay.toISOString().split('T')[0];
}

async function fetchWithRetry(url: string, retries = 2): Promise<Response | null> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url);
      if (response.status === 429) {
        if (i < retries) {
          await new Promise(r => setTimeout(r, 2000));
          continue;
        }
        return null;
      }
      return response;
    } catch {
      if (i === retries) return null;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}

async function getPolygonDailyBars(symbol: string, fromDate: string, toDate: string, apiKey: string): Promise<any[] | null> {
  const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&apiKey=${apiKey}`;
  const response = await fetchWithRetry(url);
  if (!response || !response.ok) return null;
  const data = await response.json();
  return data.results || null;
}

async function getSPY200SMA(apiKey: string): Promise<{ currentPrice: number; sma200: number } | null> {
  const toDate = new Date().toISOString().split('T')[0];
  const fromDate = new Date(Date.now() - 300 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  
  const bars = await getPolygonDailyBars('SPY', fromDate, toDate, apiKey);
  if (!bars || bars.length < 150) return null;
  
  const recentBars = bars.slice(-200);
  const currentPrice = recentBars[recentBars.length - 1].c;
  const sma200 = recentBars.reduce((sum: number, b: any) => sum + b.c, 0) / recentBars.length;
  
  console.log(`SPY: $${currentPrice.toFixed(2)}, 200-SMA: $${sma200.toFixed(2)}`);
  return { currentPrice, sma200 };
}

serve(async (req) => {
  console.log("ORB Stock Selector v6 triggered at:", new Date().toISOString());
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    const token = authHeader.replace('Bearer ', '');
    let userId: string;
    
    try {
      const parts = token.split('.');
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      userId = payload.sub;
      if (!userId) throw new Error('No user ID');
      console.log("User:", userId);
    } catch {
      return new Response(JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (!polygonApiKey) {
      // Return fallback stocks if no API key
      const fallbackStocks: SelectedStock[] = FALLBACK_STOCKS.slice(0, 3).map(symbol => ({
        symbol, priceChange: 0, rvol: 1, price: 100, avgVolume: 10000000, 
        volume: 10000000, float: STOCK_FLOAT[symbol], exchange: 'NASDAQ'
      }));
      return new Response(JSON.stringify({
        stocks: fallbackStocks,
        scannedAt: new Date().toISOString(),
        message: 'Demo mode - add POLYGON_API_KEY',
        marketRegime: 'bullish' as const,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const scanDate = getPreviousTradingDay();
    const fromDate = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    console.log(`Scanning ${scanDate} with criteria: RVOL≥${CRITERIA.MIN_RVOL}, Change≥±${CRITERIA.MIN_CHANGE_PCT}%`);

    // Get market regime
    const spyData = await getSPY200SMA(polygonApiKey);
    const marketRegime = spyData && spyData.currentPrice < spyData.sma200 ? 'bearish' : 'bullish';

    const qualifiedStocks: SelectedStock[] = [];
    let scannedCount = 0;
    const maxScans = 15; // Limit scans to avoid timeout

    // Scan priority stocks first
    for (const symbol of PRIORITY_STOCKS) {
      if (scannedCount >= maxScans || qualifiedStocks.length >= 6) break;
      
      const stockFloat = STOCK_FLOAT[symbol];
      if (stockFloat && stockFloat > CRITERIA.MAX_FLOAT_MILLIONS) continue;

      // Small delay to be polite to API
      await new Promise(r => setTimeout(r, 500));

      const bars = await getPolygonDailyBars(symbol, fromDate, scanDate, polygonApiKey);
      scannedCount++;
      
      if (!bars || bars.length < 2) continue;

      const yesterdayBar = bars[bars.length - 1];
      const dayBeforeBar = bars[bars.length - 2];
      const yesterdayClose = yesterdayBar.c;
      const yesterdayVolume = yesterdayBar.v;

      const volumeBars = bars.slice(0, -1).slice(-30);
      const avgVolume30d = volumeBars.length > 0 
        ? volumeBars.reduce((sum: number, b: any) => sum + b.v, 0) / volumeBars.length : 0;

      const priceChange = dayBeforeBar.c > 0 
        ? ((yesterdayClose - dayBeforeBar.c) / dayBeforeBar.c) * 100 : 0;
      const rvol = avgVolume30d > 0 ? yesterdayVolume / avgVolume30d : 0;

      console.log(`${symbol}: $${yesterdayClose.toFixed(2)}, ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(1)}%, RVOL ${rvol.toFixed(2)}x`);

      // Check strict criteria
      const meetsRVOL = rvol >= CRITERIA.MIN_RVOL;
      const meetsChange = Math.abs(priceChange) >= CRITERIA.MIN_CHANGE_PCT;
      const meetsPrice = yesterdayClose >= CRITERIA.MIN_PRICE;
      const meetsVolume = avgVolume30d >= CRITERIA.MIN_AVG_VOLUME;

      if (meetsRVOL && meetsChange && meetsPrice && meetsVolume) {
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
      }
    }

    // Sort by RVOL
    qualifiedStocks.sort((a, b) => b.rvol - a.rvol);
    let topStocks = qualifiedStocks.slice(0, 6);

    // Add fallbacks if needed
    if (topStocks.length < 3) {
      console.log(`Adding fallbacks (only ${topStocks.length} qualified)`);
      const existingSymbols = new Set(topStocks.map(s => s.symbol));
      
      for (const fallback of FALLBACK_STOCKS) {
        if (topStocks.length >= 3) break;
        if (existingSymbols.has(fallback)) continue;
        
        await new Promise(r => setTimeout(r, 500));
        
        const bars = await getPolygonDailyBars(fallback, fromDate, scanDate, polygonApiKey);
        if (bars && bars.length >= 2) {
          const yesterdayBar = bars[bars.length - 1];
          const dayBeforeBar = bars[bars.length - 2];
          const volumeBars = bars.slice(0, -1).slice(-30);
          const avgVolume30d = volumeBars.length > 0 
            ? volumeBars.reduce((sum: number, b: any) => sum + b.v, 0) / volumeBars.length : 0;
          
          const priceChange = dayBeforeBar.c > 0 
            ? ((yesterdayBar.c - dayBeforeBar.c) / dayBeforeBar.c) * 100 : 0;
          const rvol = avgVolume30d > 0 ? yesterdayBar.v / avgVolume30d : 0;

          console.log(`+ Fallback ${fallback}: $${yesterdayBar.c.toFixed(2)}, ${priceChange.toFixed(1)}%, RVOL ${rvol.toFixed(1)}x`);
          
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

    console.log(`=== COMPLETE: Returning ${topStocks.length} stocks: ${topStocks.map(s => s.symbol).join(', ')} ===`);

    // Save to database
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

      await supabase.from('daily_orb_stocks').insert(insertData);
    }

    return new Response(JSON.stringify({
      stocks: topStocks,
      scannedAt: new Date().toISOString(),
      marketRegime,
      spyPrice: spyData?.currentPrice,
      spy200SMA: spyData?.sma200,
      scanDate,
      message: qualifiedStocks.length === 0 ? 'No stocks met strict criteria - showing fallbacks' : undefined,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
