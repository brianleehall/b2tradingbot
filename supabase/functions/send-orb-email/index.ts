import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Stock {
  symbol: string;
  priceChange: number;
  rvol: number;
  price: number;
  avgVolume: number;
  exchange: string;
  isFallback?: boolean;
}

interface ScanData {
  stocks: Stock[];
  marketRegime: 'bullish' | 'bearish';
  spyPrice: number;
  spy200SMA: number;
  message?: string;
}

const formatVolume = (vol: number): string => {
  if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(0)}K`;
  return vol.toString();
};

const generateEmailHTML = (data: ScanData): string => {
  const isBullish = data.marketRegime === 'bullish';
  const regimeColor = isBullish ? '#10b981' : '#ef4444';
  const regimeEmoji = isBullish ? '🐂' : '🐻';
  const regimeText = isBullish ? 'BULL MARKET MODE' : 'BEAR MARKET MODE';
  const regimeDescription = isBullish 
    ? 'SPY above 200-SMA → Long & Short breakouts allowed'
    : 'SPY below 200-SMA → Only SHORT breakouts allowed';
  
  const hasFallbacks = data.stocks.some(s => s.isFallback);
  
  const stocksHTML = data.stocks.map(stock => `
    <div style="background: #1a1a2e; border-radius: 12px; padding: 16px; margin-bottom: 12px; border: 2px solid ${stock.isFallback ? '#f59e0b' : '#10b981'}40;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="font-size: 24px; font-weight: bold; font-family: monospace; color: #fff;">${stock.symbol}</span>
        <span style="background: #333; padding: 4px 8px; border-radius: 4px; font-size: 12px; color: #888;">${stock.exchange}</span>
      </div>
      ${stock.isFallback ? `<span style="background: #f59e0b33; color: #f59e0b; padding: 4px 8px; border-radius: 4px; font-size: 11px; margin-bottom: 8px; display: inline-block;">Fallback – Proven ORB Leader</span>` : ''}
      <div style="color: ${stock.priceChange >= 0 ? '#10b981' : '#ef4444'}; font-size: 20px; font-weight: bold; margin: 8px 0;">
        ${stock.priceChange >= 0 ? '+' : ''}${stock.priceChange.toFixed(2)}%
      </div>
      <div style="display: flex; justify-content: space-between; color: #888; font-size: 14px;">
        <span>RVOL: <strong style="color: #fff;">${stock.rvol.toFixed(1)}x</strong></span>
        <span>$${stock.price.toFixed(2)}</span>
        <span>Vol: ${formatVolume(stock.avgVolume)}</span>
      </div>
    </div>
  `).join('');

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Daily ORB Stock Alert</title>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #0f0f1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #fff; margin: 0; font-size: 24px;">📊 Daily ORB Stock Alert</h1>
          <p style="color: #888; margin-top: 8px;">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/New_York' })}</p>
        </div>

        <!-- Market Regime -->
        <div style="background: ${regimeColor}15; border: 2px solid ${regimeColor}40; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="color: ${regimeColor}; font-size: 20px; font-weight: bold;">
                ${regimeEmoji} ${regimeText}
              </div>
              <div style="color: #888; font-size: 14px; margin-top: 4px;">
                ${regimeDescription}
              </div>
            </div>
            <div style="text-align: right; color: #888; font-size: 14px;">
              <div>SPY: <span style="color: #fff; font-weight: bold;">$${data.spyPrice.toFixed(2)}</span></div>
              <div>200-SMA: <span style="color: #fff; font-weight: bold;">$${data.spy200SMA.toFixed(2)}</span></div>
            </div>
          </div>
        </div>

        <!-- Fallback Warning -->
        ${hasFallbacks ? `
        <div style="background: #f59e0b15; border: 1px solid #f59e0b40; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
          <div style="color: #f59e0b; font-weight: bold;">⚠️ ${data.message || 'No stocks qualified in past 5 days - showing 2 proven ORB leaders'}</div>
          <div style="color: #f59e0b99; font-size: 13px; margin-top: 4px;">Fallback stocks: ${data.stocks.filter(s => s.isFallback).map(s => s.symbol).join(', ')}</div>
        </div>
        ` : ''}

        <!-- Today's ORB Stocks Header -->
        <h2 style="color: #fff; font-size: 18px; margin-bottom: 16px;">
          Today's ORB Stocks (${data.stocks.length})
        </h2>

        <!-- Stocks List -->
        ${stocksHTML}

        <!-- Footer -->
        <div style="text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid #333;">
          <p style="color: #666; font-size: 12px; margin: 0;">
            Sent from ORB Trading System<br>
            Trading involves risk. Past performance is not indicative of future results.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

const handler = async (req: Request): Promise<Response> => {
  console.log("send-orb-email function invoked");

  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify the user's token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    console.log("User authenticated:", user.email);

    // Call the orb-stock-selector to get current data
    const selectorResponse = await fetch(`${supabaseUrl}/functions/v1/orb-stock-selector`, {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json',
      },
    });

    if (!selectorResponse.ok) {
      const errorText = await selectorResponse.text();
      console.error("Failed to get stock data:", errorText);
      throw new Error(`Failed to fetch stock data: ${errorText}`);
    }

    const scanData: ScanData = await selectorResponse.json();
    console.log("Scan data received:", scanData.stocks?.length, "stocks, regime:", scanData.marketRegime);

    if (!scanData.stocks || scanData.stocks.length === 0) {
      throw new Error("No stock data available");
    }

    // Generate email HTML
    const emailHTML = generateEmailHTML(scanData);
    const regimeEmoji = scanData.marketRegime === 'bullish' ? '🐂' : '🐻';
    const regimeText = scanData.marketRegime === 'bullish' ? 'Bull' : 'Bear';

    // Send the email
    const { data: emailData, error: emailError } = await resend.emails.send({
      from: "ORB Trading <onboarding@resend.dev>",
      to: [user.email!],
      subject: `${regimeEmoji} ${regimeText} Market | Today's ORB Stocks: ${scanData.stocks.map(s => s.symbol).join(', ')}`,
      html: emailHTML,
    });

    if (emailError) {
      console.error("Email send error:", emailError);
      throw new Error(emailError.message);
    }

    console.log("Email sent successfully:", emailData);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Email sent to ${user.email}`,
        stocks: scanData.stocks.map(s => s.symbol),
        marketRegime: scanData.marketRegime
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-orb-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
