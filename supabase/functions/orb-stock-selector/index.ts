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
  isFallback?: boolean;
  daysAgo?: number;
  qualifyingDate?: string;
  isCrypto?: boolean;
}

interface ScanResult {
  stocks: SelectedStock[];
  cryptoStocks: SelectedStock[];
  scannedAt: string;
  message?: string;
  marketRegime: 'bullish' | 'bearish';
  spyPrice?: number;
  spy200SMA?: number;
  scanDates?: string[];
}

// Crypto pairs to scan
const CRYPTO_PAIRS = ['BTCUSD', 'ETHUSD'];

// Expanded scan list - high-volatility stocks known for ORB setups
// UPDATED: Added more liquid large-cap stocks per academic research
const SCAN_STOCKS = [
  // Tech/Semis
  'NVDA', 'AMD', 'SMCI', 'ARM', 'AVGO', 'MRVL', 'MU', 'INTC',
  // Crypto/Blockchain
  'MARA', 'RIOT', 'MSTR', 'HUT', 'COIN', 'CLSK', 'BITF',
  // Quantum/AI
  'IONQ', 'RGTI', 'QUBT', 'SOUN', 'PLTR',
  // EV
  'TSLA', 'RIVN', 'LCID', 'NIO', 'XPEV', 'LI',
  // Fintech
  'AFRM', 'UPST', 'SOFI', 'HOOD',
  // Other high-beta
  'PLUG', 'GSAT', 'META', 'AAPL', 'GOOGL', 'AMZN',
  // NEW: Large-cap liquid stocks (best ORB candidates per Zarattini/Barbon/Aziz 2024)
  'ORCL', 'CRM', 'NFLX', 'BA', 'DIS', 'JPM', 'GS', 'V', 'MA',
  'ABNB', 'UBER', 'SHOP', 'NET', 'DDOG', 'ZS',
];

// 4 fallback stocks when zero qualify - "Proven ORB Leaders"
const FALLBACK_STOCKS = ['NVDA', 'TSLA', 'AMD', 'SMCI'];
const MIN_FALLBACK_STOCKS = 4;
const MAX_STOCKS = 8;

// Float data in millions - for informational purposes only (no longer used to filter)
const STOCK_FLOAT: Record<string, number> = {
  'SMCI': 58, 'ARM': 102, 'COIN': 115,
  'MARA': 85, 'RIOT': 95, 'MSTR': 110, 'HUT': 250, 'CLSK': 75,
  'IONQ': 42, 'RGTI': 35, 'QUBT': 28, 'SOUN': 55, 'AFRM': 95,
  'UPST': 78, 'PLUG': 110, 'SOFI': 98, 'HOOD': 88, 'RIVN': 130,
  'XPEV': 90, 'LI': 95, 'NIO': 120, 'GSAT': 80, 'BITF': 65,
  // Large-cap stocks
  'NVDA': 2460, 'TSLA': 3180, 'AMD': 1620, 'META': 2570, 
  'AAPL': 15200, 'AVGO': 466, 'MRVL': 865, 'MU': 1100, 
  'INTC': 4250, 'PLTR': 2280, 'LCID': 1900, 'GOOGL': 12000, 'AMZN': 10500,
  'ORCL': 2700, 'CRM': 970, 'NFLX': 430, 'BA': 600, 'DIS': 1800,
  'JPM': 2900, 'GS': 320, 'V': 1650, 'MA': 930, 'ABNB': 600,
  'UBER': 2000, 'SHOP': 1250, 'NET': 330, 'DDOG': 320, 'ZS': 150,
};

// UPDATED CRITERIA - Loosened per academic research and QuantConnect studies
const CRITERIA = {
  MIN_RVOL: 1.5,              // Changed from 2.25 - industry standard per ForexTester
  MIN_CHANGE_PCT: 2.0,        // Changed from 3.5 - capture more setups
  MIN_AVG_VOLUME: 800000,     // Keep at 800K
  MIN_PRICE: 5,               // Changed from 20 - academic standard is $5+
  // Float filter REMOVED - large-caps are actually best ORB candidates due to liquidity
};

function getLast5TradingDays(): string[] {
  const dates: string[] = [];
  const now = new Date();
  let current = new Date(now);
  
  // Start from yesterday
  current.setUTCDate(current.getUTCDate() - 1);
  
  while (dates.length < 5) {
    const day = current.getUTCDay();
    // Skip weekends (0 = Sunday, 6 = Saturday)
    if (day !== 0 && day !== 6) {
      dates.push(current.toISOString().split('T')[0]);
    }
    current.setUTCDate(current.getUTCDate() - 1);
  }
  
  return dates; // Most recent first
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
  // Add timestamp to prevent caching
  const timestamp = Date.now();
  const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&apiKey=${apiKey}&_t=${timestamp}`;
  const response = await fetchWithRetry(url);
  if (!response || !response.ok) return null;
  const data = await response.json();
  return data.results || null;
}

// Get crypto daily bars from Polygon (uses X: prefix for crypto)
async function getPolygonCryptoBars(symbol: string, fromDate: string, toDate: string, apiKey: string): Promise<any[] | null> {
  const timestamp = Date.now();
  // Polygon uses X:BTCUSD format for crypto
  const polygonSymbol = `X:${symbol}`;
  const url = `https://api.polygon.io/v2/aggs/ticker/${polygonSymbol}/range/1/day/${fromDate}/${toDate}?adjusted=true&sort=asc&apiKey=${apiKey}&_t=${timestamp}`;
  const response = await fetchWithRetry(url);
  if (!response || !response.ok) return null;
  const data = await response.json();
  return data.results || null;
}

// Get last 5 calendar days (crypto trades 24/7, no weekends skip)
function getLast5CalendarDays(): string[] {
  const dates: string[] = [];
  const now = new Date();
  let current = new Date(now);
  
  // Start from yesterday
  current.setUTCDate(current.getUTCDate() - 1);
  
  while (dates.length < 5) {
    dates.push(current.toISOString().split('T')[0]);
    current.setUTCDate(current.getUTCDate() - 1);
  }
  
  return dates; // Most recent first
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
  console.log("ORB Stock Selector v8 (Loosened Criteria) triggered at:", new Date().toISOString());
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const polygonApiKey = Deno.env.get('POLYGON_API_KEY');
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth is optional - for internal calls we don't require user auth
    const authHeader = req.headers.get('Authorization');
    let userId: string = 'system';
    
    if (authHeader) {
      try {
        const token = authHeader.replace('Bearer ', '');
        const parts = token.split('.');
        const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        userId = payload.sub || 'system';
        console.log("User:", userId);
      } catch {
        console.log("Using system user (internal call)");
      }
    } else {
      console.log("No auth header - internal/scheduled call");
    }

    if (!polygonApiKey) {
      // Return fallback stocks if no API key
      const fallbackStocks: SelectedStock[] = FALLBACK_STOCKS.map(symbol => ({
        symbol, priceChange: 0, rvol: 1, price: 100, avgVolume: 10000000, 
        volume: 10000000, float: STOCK_FLOAT[symbol], exchange: 'NASDAQ',
        isFallback: true,
      }));
      return new Response(JSON.stringify({
        stocks: fallbackStocks,
        scannedAt: new Date().toISOString(),
        message: 'Demo mode - add POLYGON_API_KEY',
        marketRegime: 'bullish' as const,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get last 5 trading days
    const tradingDays = getLast5TradingDays();
    const fromDate = new Date(Date.now() - 50 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const toDate = tradingDays[0]; // Most recent

    console.log(`=== 5-DAY LOOKBACK SCAN (v8 LOOSENED CRITERIA) ===`);
    console.log(`Scanning days: ${tradingDays.join(', ')}`);
    console.log(`Criteria: RVOL≥${CRITERIA.MIN_RVOL}, Change≥±${CRITERIA.MIN_CHANGE_PCT}%, Price≥$${CRITERIA.MIN_PRICE}, AvgVol≥${CRITERIA.MIN_AVG_VOLUME/1000}K`);
    console.log(`Float filter: REMOVED (large-caps are best ORB candidates)`);

    // Get market regime
    const spyData = await getSPY200SMA(polygonApiKey);
    const marketRegime = spyData && spyData.currentPrice < spyData.sma200 ? 'bearish' : 'bullish';

    // Map to track best qualifying day for each stock
    interface QualifyingData {
      symbol: string;
      daysAgo: number;
      qualifyingDate: string;
      rvol: number;
      priceChange: number;
      price: number;
      avgVolume: number;
      volume: number;
      float?: number;
      exchange: string;
    }
    
    const qualifiedStocks: Map<string, QualifyingData> = new Map();
    let scannedCount = 0;

    // Scan each stock - NO FLOAT FILTER
    for (const symbol of SCAN_STOCKS) {
      // Rate limit
      await new Promise(r => setTimeout(r, 120));
      scannedCount++;

      const bars = await getPolygonDailyBars(symbol, fromDate, toDate, polygonApiKey);
      if (!bars || bars.length < 32) continue; // Need 30-day avg + recent days

      // Calculate 30-day average volume (excluding last 5 days)
      const avgVolumeBars = bars.slice(0, -5).slice(-30);
      const avgVolume30d = avgVolumeBars.length > 0 
        ? avgVolumeBars.reduce((sum: number, b: any) => sum + b.v, 0) / avgVolumeBars.length 
        : 0;

      if (avgVolume30d < CRITERIA.MIN_AVG_VOLUME) continue;

      // Check each of the last 5 trading days
      for (let daysAgo = 0; daysAgo < 5; daysAgo++) {
        const targetDate = tradingDays[daysAgo];
        
        // Find the bar for this date
        const barIndex = bars.findIndex((b: any) => {
          const barDate = new Date(b.t).toISOString().split('T')[0];
          return barDate === targetDate;
        });
        
        if (barIndex <= 0) continue; // Need previous day for change calc
        
        const dayBar = bars[barIndex];
        const prevBar = bars[barIndex - 1];
        
        const closePrice = dayBar.c;
        const dayVolume = dayBar.v;
        const priceChange = prevBar.c > 0 
          ? ((closePrice - prevBar.c) / prevBar.c) * 100 
          : 0;
        const rvol = avgVolume30d > 0 ? dayVolume / avgVolume30d : 0;

        // Check criteria (no float filter)
        const meetsRVOL = rvol >= CRITERIA.MIN_RVOL;
        const meetsChange = Math.abs(priceChange) >= CRITERIA.MIN_CHANGE_PCT;
        const meetsPrice = closePrice >= CRITERIA.MIN_PRICE;

        // Log why stocks don't qualify for debugging
        if (!meetsRVOL || !meetsChange || !meetsPrice) {
          if (Math.abs(priceChange) >= 1.5 || rvol >= 1.2) {
            console.log(`✗ ${symbol} on ${targetDate}: $${closePrice.toFixed(2)} (price≥$5: ${meetsPrice}), ${priceChange.toFixed(1)}% (≥±2%: ${meetsChange}), RVOL ${rvol.toFixed(2)}x (≥1.5x: ${meetsRVOL})`);
          }
          continue;
        }

        // Only keep if this is the most recent qualifying day for this stock
        const existing = qualifiedStocks.get(symbol);
        if (!existing || daysAgo < existing.daysAgo) {
          console.log(`✓ ${symbol} QUALIFIED on ${targetDate} (${daysAgo} days ago): $${closePrice.toFixed(2)}, ${priceChange >= 0 ? '+' : ''}${priceChange.toFixed(1)}%, RVOL ${rvol.toFixed(2)}x`);
          qualifiedStocks.set(symbol, {
            symbol,
            daysAgo,
            qualifyingDate: targetDate,
            rvol: Math.round(rvol * 100) / 100,
            priceChange: Math.round(priceChange * 100) / 100,
            price: Math.round(closePrice * 100) / 100,
            avgVolume: Math.round(avgVolume30d),
            volume: dayVolume,
            float: STOCK_FLOAT[symbol],
            exchange: 'NASDAQ',
          });
        }
        break; // Found most recent qualifying day for this stock
      }
    }

    console.log(`Scanned ${scannedCount} stocks, ${qualifiedStocks.size} qualified`);

    // Convert to array and sort
    let topStocks: SelectedStock[] = Array.from(qualifiedStocks.values())
      .sort((a, b) => {
        // First by most recent qualifying day
        if (a.daysAgo !== b.daysAgo) return a.daysAgo - b.daysAgo;
        // Then by highest RVOL
        return b.rvol - a.rvol;
      })
      .slice(0, MAX_STOCKS)
      .map(q => ({
        symbol: q.symbol,
        priceChange: q.priceChange,
        rvol: q.rvol,
        price: q.price,
        avgVolume: q.avgVolume,
        volume: q.volume,
        float: q.float,
        exchange: q.exchange,
        daysAgo: q.daysAgo,
        qualifyingDate: q.qualifyingDate,
        isFallback: false,
      }));

    // If ZERO stocks qualified, add fallbacks
    if (topStocks.length === 0) {
      console.log(`No stocks qualified across 5 days. Adding ${FALLBACK_STOCKS.length} fallbacks: ${FALLBACK_STOCKS.join(', ')}`);
      
      for (const fallback of FALLBACK_STOCKS) {
        await new Promise(r => setTimeout(r, 200));
        
        let fallbackStock: SelectedStock | null = null;
        
        try {
          const bars = await getPolygonDailyBars(fallback, fromDate, toDate, polygonApiKey);
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
            
            fallbackStock = {
              symbol: fallback,
              priceChange: Math.round(priceChange * 100) / 100,
              rvol: Math.round(rvol * 100) / 100,
              price: Math.round(yesterdayBar.c * 100) / 100,
              avgVolume: Math.round(avgVolume30d),
              volume: yesterdayBar.v,
              float: STOCK_FLOAT[fallback],
              exchange: 'NASDAQ',
              isFallback: true,
            };
          }
        } catch (e) {
          console.log(`API fetch failed for ${fallback}, using static data`);
        }
        
        // Use static fallback data if API failed
        if (!fallbackStock) {
          console.log(`+ Fallback ${fallback} (static data)`);
          const staticData: Record<string, { price: number; avgVolume: number }> = {
            'NVDA': { price: 185, avgVolume: 250000000 },
            'TSLA': { price: 445, avgVolume: 100000000 },
            'AMD': { price: 120, avgVolume: 50000000 },
            'SMCI': { price: 30, avgVolume: 20000000 },
          };
          const data = staticData[fallback] || { price: 100, avgVolume: 10000000 };
          fallbackStock = {
            symbol: fallback,
            priceChange: 0,
            rvol: 1,
            price: data.price,
            avgVolume: data.avgVolume,
            volume: data.avgVolume,
            float: STOCK_FLOAT[fallback],
            exchange: 'NASDAQ',
            isFallback: true,
          };
        }
        
        topStocks.push(fallbackStock);
      }
    }

    // ========== CRYPTO SCANNING ==========
    console.log(`\n=== CRYPTO SCAN (5-Day Lookback) ===`);
    const cryptoDays = getLast5CalendarDays();
    console.log(`Scanning crypto days: ${cryptoDays.join(', ')}`);
    
    const cryptoStocks: SelectedStock[] = [];
    
    // Crypto-specific criteria (UPDATED to match stock criteria)
    const CRYPTO_CRITERIA = {
      MIN_RVOL: 1.5,              // Changed from 2.25
      MIN_CHANGE_PCT: 2.0,        // Changed from 3.5
      MIN_AVG_VOLUME: 100000000,  // $100M volume for crypto
    };
    
    for (const symbol of CRYPTO_PAIRS) {
      await new Promise(r => setTimeout(r, 200));
      
      const bars = await getPolygonCryptoBars(symbol, fromDate, toDate, polygonApiKey);
      if (!bars || bars.length < 32) {
        console.log(`[CRYPTO] ${symbol}: Insufficient data`);
        continue;
      }
      
      // Calculate 30-day average volume (in USD)
      const avgVolumeBars = bars.slice(0, -5).slice(-30);
      const avgVolume30d = avgVolumeBars.length > 0 
        ? avgVolumeBars.reduce((sum: number, b: any) => sum + (b.v * b.vw || b.v), 0) / avgVolumeBars.length 
        : 0;
      
      // Check each of last 5 days
      for (let daysAgo = 0; daysAgo < 5; daysAgo++) {
        const targetDate = cryptoDays[daysAgo];
        
        const barIndex = bars.findIndex((b: any) => {
          const barDate = new Date(b.t).toISOString().split('T')[0];
          return barDate === targetDate;
        });
        
        if (barIndex <= 0) continue;
        
        const dayBar = bars[barIndex];
        const prevBar = bars[barIndex - 1];
        
        const closePrice = dayBar.c;
        const dayVolume = dayBar.v * (dayBar.vw || closePrice);
        const priceChange = prevBar.c > 0 
          ? ((closePrice - prevBar.c) / prevBar.c) * 100 
          : 0;
        const rvol = avgVolume30d > 0 ? dayVolume / avgVolume30d : 0;
        
        const meetsRVOL = rvol >= CRYPTO_CRITERIA.MIN_RVOL;
        const meetsChange = Math.abs(priceChange) >= CRYPTO_CRITERIA.MIN_CHANGE_PCT;
        
        console.log(`[CRYPTO] ${symbol} on ${targetDate}: $${closePrice.toFixed(2)}, ${priceChange.toFixed(1)}%, RVOL ${rvol.toFixed(2)}x (RVOL≥1.5: ${meetsRVOL}, Change≥2%: ${meetsChange})`);
        
        if (meetsRVOL && meetsChange) {
          console.log(`✓ ${symbol} QUALIFIED (crypto)`);
          cryptoStocks.push({
            symbol,
            priceChange: Math.round(priceChange * 100) / 100,
            rvol: Math.round(rvol * 100) / 100,
            price: Math.round(closePrice * 100) / 100,
            avgVolume: Math.round(avgVolume30d),
            volume: Math.round(dayVolume),
            exchange: 'CRYPTO',
            daysAgo,
            qualifyingDate: targetDate,
            isFallback: false,
            isCrypto: true,
          });
          break; // Found most recent qualifying day
        }
      }
    }
    
    console.log(`Crypto scan complete: ${cryptoStocks.length} qualified`);
    console.log(`=== COMPLETE: Returning ${topStocks.length} stocks + ${cryptoStocks.length} crypto: ${[...topStocks, ...cryptoStocks].map(s => s.symbol).join(', ')} ===`);

    // Save to database (stocks only, crypto handled separately)
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

    const qualifiedCount = topStocks.filter(s => !s.isFallback).length;
    const fallbackCount = topStocks.filter(s => s.isFallback).length;

    return new Response(JSON.stringify({
      stocks: topStocks,
      cryptoStocks,
      scannedAt: new Date().toISOString(),
      marketRegime,
      spyPrice: spyData?.currentPrice,
      spy200SMA: spyData?.sma200,
      scanDates: tradingDays,
      cryptoDates: cryptoDays,
      message: qualifiedCount === 0 
        ? `No stocks qualified in past 5 days - showing ${fallbackCount} proven ORB leaders` 
        : `${qualifiedCount} stocks + ${cryptoStocks.length} crypto qualified across 5-day lookback`,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
