import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// US Market holidays for 2024-2026
const MARKET_HOLIDAYS = [
  '2024-01-01', '2024-01-15', '2024-02-19', '2024-03-29', '2024-05-27',
  '2024-06-19', '2024-07-04', '2024-09-02', '2024-11-28', '2024-12-25',
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
  '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
  '2026-01-01', '2026-01-19', '2026-02-16', '2026-04-03', '2026-05-25',
  '2026-06-19', '2026-07-03', '2026-09-07', '2026-11-26', '2026-12-25',
];

function isMarketDay(date: Date): boolean {
  const day = date.getDay();
  if (day === 0 || day === 6) return false;
  const dateStr = date.toISOString().split('T')[0];
  if (MARKET_HOLIDAYS.includes(dateStr)) return false;
  return true;
}

function getETDate(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

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
  vixLevel?: number;
  message?: string;
}

const formatVolume = (vol: number): string => {
  if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(0)}K`;
  return vol.toString();
};

const generateEmailHTML = (data: ScanData): string => {
  const isBullish = data.marketRegime === 'bullish';
  const vixLevel = data.vixLevel || 20;
  const isAggressiveBull = isBullish && vixLevel <= 18;
  
  // Determine regime display
  let regimeColor = '#10b981';
  let regimeEmoji = '🐂';
  let regimeText = 'BULL MARKET';
  let regimeDescription = 'SPY above 200-SMA → Long & Short breakouts allowed';
  
  if (!isBullish) {
    regimeColor = '#ef4444';
    regimeEmoji = '🐻';
    regimeText = 'SHORT-ONLY MODE';
    regimeDescription = 'SPY below 200-SMA → Only SHORT breakouts allowed';
  } else if (vixLevel > 25) {
    regimeColor = '#f59e0b';
    regimeEmoji = '⚠️';
    regimeText = 'ELEVATED VOL';
    regimeDescription = 'VIX > 25 → Shorts only, reduced size';
  } else if (isAggressiveBull) {
    regimeColor = '#22c55e';
    regimeEmoji = '🚀';
    regimeText = 'AGGRESSIVE BULL';
    regimeDescription = 'SPY > 200-SMA & VIX ≤ 18 → 3% risk on #1 stock';
  }
  
  const hasFallbacks = data.stocks.some(s => s.isFallback);
  const qualifiedStocks = data.stocks.filter(s => !s.isFallback);
  const fallbackStocks = data.stocks.filter(s => s.isFallback);
  
  const stocksHTML = data.stocks.map((stock, index) => `
    <div style="background: #1a1a2e; border-radius: 12px; padding: 16px; margin-bottom: 12px; border: 2px solid ${stock.isFallback ? '#f59e0b' : '#10b981'}40;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div>
          <span style="background: ${index === 0 ? '#10b981' : '#666'}; color: #fff; padding: 2px 8px; border-radius: 4px; font-size: 11px; margin-right: 8px;">#${index + 1}</span>
          <span style="font-size: 24px; font-weight: bold; font-family: monospace; color: #fff;">${stock.symbol}</span>
        </div>
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
      <title>Morning ORB Scan Summary</title>
    </head>
    <body style="margin: 0; padding: 20px; background-color: #0f0f1a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
      <div style="max-width: 600px; margin: 0 auto;">
        <!-- Header -->
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="color: #fff; margin: 0; font-size: 24px;">☀️ Morning ORB Scan Summary</h1>
          <p style="color: #888; margin-top: 8px;">${getETDate().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} • 8:00 AM ET</p>
        </div>

        <!-- Market Regime Badge -->
        <div style="background: ${regimeColor}15; border: 2px solid ${regimeColor}40; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div style="color: ${regimeColor}; font-size: 20px; font-weight: bold;">
                ${regimeEmoji} ${regimeText}
              </div>
              <div style="color: #888; font-size: 14px; margin-top: 4px;">
                ${regimeDescription}
              </div>
            </div>
          </div>
          <div style="display: flex; gap: 24px; margin-top: 16px; padding-top: 12px; border-top: 1px solid ${regimeColor}30;">
            <div style="color: #888; font-size: 14px;">
              SPY: <span style="color: #fff; font-weight: bold;">$${data.spyPrice.toFixed(2)}</span>
            </div>
            <div style="color: #888; font-size: 14px;">
              200-SMA: <span style="color: #fff; font-weight: bold;">$${data.spy200SMA.toFixed(2)}</span>
            </div>
            <div style="color: #888; font-size: 14px;">
              VIX: <span style="color: ${vixLevel > 25 ? '#ef4444' : vixLevel <= 18 ? '#10b981' : '#fff'}; font-weight: bold;">${vixLevel.toFixed(1)}</span>
            </div>
          </div>
        </div>

        <!-- Fallback Warning -->
        ${hasFallbacks ? `
        <div style="background: #f59e0b15; border: 1px solid #f59e0b40; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
          <div style="color: #f59e0b; font-weight: bold;">⚠️ No qualifiers this week – using fallback stocks</div>
          <div style="color: #f59e0b99; font-size: 13px; margin-top: 4px;">Fallback stocks: ${fallbackStocks.map(s => s.symbol).join(', ')}</div>
          <div style="color: #888; font-size: 12px; margin-top: 8px; font-style: italic;">Monitoring proven ORB leaders for setups.</div>
        </div>
        ` : `
        <div style="background: #10b98115; border: 1px solid #10b98140; border-radius: 8px; padding: 12px; margin-bottom: 16px;">
          <div style="color: #10b981; font-weight: bold;">✓ ${qualifiedStocks.length} stocks qualified from the last 5 trading days</div>
        </div>
        `}

        <!-- Today's ORB Stocks Header -->
        <h2 style="color: #fff; font-size: 18px; margin-bottom: 16px;">
          📊 Today's ORB Stocks (${data.stocks.length})
        </h2>

        <!-- Stocks List -->
        ${stocksHTML}

        <!-- Trading Window Reminder -->
        <div style="background: #1a1a2e; border-radius: 8px; padding: 16px; margin-top: 24px; border: 1px solid #333;">
          <h3 style="color: #888; font-size: 14px; margin: 0 0 8px 0; text-transform: uppercase;">⏰ Trading Window</h3>
          <p style="color: #fff; margin: 0; font-size: 14px;">
            <strong>9:30 - 10:15 AM ET</strong> (extended to 11:30 AM if +1.5R)
          </p>
          <p style="color: #888; margin: 8px 0 0 0; font-size: 12px;">
            ORB forms in first 5 minutes • Wait for breakout with volume confirmation
          </p>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid #333;">
          <p style="color: #666; font-size: 12px; margin: 0;">
            ORB Trading Bot • Morning Scan Summary<br>
            Trading involves risk. Past performance is not indicative of future results.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Function to send email to a specific user
async function sendEmailToUser(supabase: any, userEmail: string, scanData: ScanData): Promise<boolean> {
  try {
    const emailHTML = generateEmailHTML(scanData);
    const regimeEmoji = scanData.marketRegime === 'bullish' ? '🐂' : '🐻';
    const regimeText = scanData.marketRegime === 'bullish' ? 'Bull' : 'Short-Only';

    const { error: emailError } = await resend.emails.send({
      from: "ORB Trading <onboarding@resend.dev>",
      to: [userEmail],
      subject: `${regimeEmoji} ${regimeText} | Morning Scan: ${scanData.stocks.map(s => s.symbol).join(', ')}`,
      html: emailHTML,
    });

    if (emailError) {
      console.error(`Email send error for ${userEmail}:`, emailError);
      // Log to Supabase for debugging
      try {
        await supabase.from('trade_logs').insert({
          user_id: null,
          symbol: 'EMAIL',
          side: 'error',
          qty: 0,
          price: null,
          strategy: 'morning-scan-email',
          status: 'failed',
          error_message: JSON.stringify(emailError),
        });
      } catch {
        // Ignore logging errors
      }
      return false;
    }

    console.log(`Morning scan email sent successfully to ${userEmail}`);
    return true;
  } catch (err) {
    console.error(`Failed to send email to ${userEmail}:`, err);
    return false;
  }
}

const handler = async (req: Request): Promise<Response> => {
  console.log("[MORNING-EMAIL] send-orb-email function invoked");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if this is a scheduled call (no auth header) or manual call (with auth header)
    const authHeader = req.headers.get('Authorization');
    const isScheduledCall = !authHeader || authHeader.includes(Deno.env.get('SUPABASE_ANON_KEY') || '');

    // For scheduled calls, check if market is open today
    if (isScheduledCall) {
      const etDate = getETDate();
      if (!isMarketDay(etDate)) {
        console.log("[MORNING-EMAIL] Market is closed today (weekend/holiday), skipping email");
        return new Response(
          JSON.stringify({ message: "Market is closed today, no email sent" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    let scanData: ScanData;
    
    // Try to get stock data from request body (manual call with pre-fetched data)
    const contentType = req.headers.get('content-type');
    let bodyData: any = null;
    
    if (contentType?.includes('application/json')) {
      try {
        bodyData = await req.json();
      } catch {
        // No body or invalid JSON
      }
    }
    
    if (bodyData?.stocks && bodyData.stocks.length > 0) {
      console.log("[MORNING-EMAIL] Using stock data from request body");
      scanData = bodyData as ScanData;
    } else {
      // Fetch fresh from orb-stock-selector (for scheduled calls)
      console.log("[MORNING-EMAIL] Fetching stock data from orb-stock-selector");
      
      const { data: selectorData, error: selectorError } = await supabase.functions.invoke('orb-stock-selector', {
        method: 'POST',
        body: {},
      });

      if (selectorError) {
        console.error("[MORNING-EMAIL] Failed to get stock data:", selectorError);
        throw new Error(`Failed to fetch stock data: ${selectorError.message}`);
      }

      scanData = selectorData as ScanData;
    }
    
    console.log(`[MORNING-EMAIL] Scan data received: ${scanData.stocks?.length} stocks, regime: ${scanData.marketRegime}, VIX: ${scanData.vixLevel}`);

    if (!scanData.stocks || scanData.stocks.length === 0) {
      throw new Error("No stock data available");
    }

    if (isScheduledCall) {
      // Scheduled call: Send to all users with trading configurations
      console.log("[MORNING-EMAIL] Processing scheduled email send to all users");

      const { data: configs, error: configError } = await supabase
        .from('trading_configurations')
        .select('user_id');

      if (configError) {
        console.error("[MORNING-EMAIL] Error fetching configs:", configError);
        throw configError;
      }

      if (!configs || configs.length === 0) {
        console.log("[MORNING-EMAIL] No trading configurations found");
        return new Response(
          JSON.stringify({ message: "No users to send emails to" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const emailsSent: string[] = [];

      for (const config of configs) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', config.user_id)
          .single();

        if (!profile?.email) {
          console.log(`[MORNING-EMAIL] No email for user ${config.user_id}`);
          continue;
        }

        const success = await sendEmailToUser(supabase, profile.email, scanData);
        if (success) {
          emailsSent.push(profile.email);
        }
      }

      return new Response(
        JSON.stringify({ 
          message: `Morning scan emails sent`,
          emailsSent: emailsSent.length,
          recipients: emailsSent,
          stocks: scanData.stocks.map(s => s.symbol),
          marketRegime: scanData.marketRegime,
          vixLevel: scanData.vixLevel
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );

    } else {
      // Manual call: Send only to the authenticated user
      const token = authHeader!.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      
      if (authError || !user) {
        console.error("[MORNING-EMAIL] Auth error:", authError);
        return new Response(JSON.stringify({ error: 'Invalid token' }), {
          status: 401,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      console.log(`[MORNING-EMAIL] Manual email request from: ${user.email}`);

      const success = await sendEmailToUser(supabase, user.email!, scanData);
      
      if (!success) {
        throw new Error("Failed to send email");
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          message: `Morning scan email sent to ${user.email}`,
          stocks: scanData.stocks.map(s => s.symbol),
          marketRegime: scanData.marketRegime,
          vixLevel: scanData.vixLevel
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

  } catch (error: any) {
    console.error("[MORNING-EMAIL] Error in send-orb-email function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
