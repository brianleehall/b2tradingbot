import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

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

interface TradeLog {
  id: string;
  symbol: string;
  side: string;
  qty: number;
  price: number | null;
  status: string;
  strategy: string | null;
  created_at: string;
  error_message: string | null;
  notes?: string;
}

function generatePerformanceHTML(trades: TradeLog[], date: string, accountEquity?: number): string {
  const successfulTrades = trades.filter(t => t.status === 'filled' || t.status === 'success' || t.status === 'flattened');
  const failedTrades = trades.filter(t => t.status === 'error' || t.status === 'failed');
  const flattenTrades = trades.filter(t => t.status === 'flattened');
  
  // Group trades by symbol to calculate P&L
  const tradesBySymbol: Record<string, TradeLog[]> = {};
  for (const trade of successfulTrades) {
    if (!tradesBySymbol[trade.symbol]) {
      tradesBySymbol[trade.symbol] = [];
    }
    tradesBySymbol[trade.symbol].push(trade);
  }

  // Calculate estimated P&L per symbol
  const symbolSummaries: { symbol: string; buys: number; sells: number; netQty: number; avgBuyPrice: number; avgSellPrice: number; estimatedPnL: number }[] = [];
  
  for (const [symbol, symbolTrades] of Object.entries(tradesBySymbol)) {
    const buys = symbolTrades.filter(t => t.side === 'buy');
    const sells = symbolTrades.filter(t => t.side === 'sell' || t.side === 'flatten');
    
    const totalBuyQty = buys.reduce((sum, t) => sum + t.qty, 0);
    const totalSellQty = sells.reduce((sum, t) => sum + t.qty, 0);
    const totalBuyCost = buys.reduce((sum, t) => sum + (t.qty * (t.price || 0)), 0);
    const totalSellProceeds = sells.reduce((sum, t) => sum + (t.qty * (t.price || 0)), 0);
    
    const avgBuyPrice = totalBuyQty > 0 ? totalBuyCost / totalBuyQty : 0;
    const avgSellPrice = totalSellQty > 0 ? totalSellProceeds / totalSellQty : 0;
    
    const closedQty = Math.min(totalBuyQty, totalSellQty);
    const estimatedPnL = closedQty > 0 ? (avgSellPrice - avgBuyPrice) * closedQty : 0;
    
    symbolSummaries.push({
      symbol,
      buys: totalBuyQty,
      sells: totalSellQty,
      netQty: totalBuyQty - totalSellQty,
      avgBuyPrice,
      avgSellPrice,
      estimatedPnL
    });
  }

  const totalPnL = symbolSummaries.reduce((sum, s) => sum + s.estimatedPnL, 0);
  const pnlColor = totalPnL >= 0 ? '#10b981' : '#ef4444';
  const pnlEmoji = totalPnL >= 0 ? '📈' : '📉';
  
  const noTrades = trades.length === 0;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>End of Session Report</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 12px; padding: 24px; margin-bottom: 20px; border: 1px solid #333;">
      <h1 style="color: #ffffff; margin: 0 0 8px 0; font-size: 24px;">🏁 End of Session Report</h1>
      <p style="color: #888; margin: 0; font-size: 14px;">${date} • 11:30 AM ET</p>
    </div>

    ${noTrades ? `
    <!-- No Trades Banner -->
    <div style="background: #f59e0b15; border: 2px solid #f59e0b40; border-radius: 12px; padding: 24px; margin-bottom: 20px; text-align: center;">
      <div style="font-size: 48px; margin-bottom: 12px;">😴</div>
      <h2 style="color: #f59e0b; margin: 0 0 8px 0; font-size: 20px;">No Trades Today</h2>
      <p style="color: #888; margin: 0; font-size: 14px;">
        No qualifying breakout signals during today's session.<br>
        This could be due to low volume, no ORB breaks, or market regime filters.
      </p>
    </div>
    ` : `
    <!-- P&L Summary -->
    <div style="background: linear-gradient(135deg, #1a1a1a 0%, #222 100%); border-radius: 12px; padding: 24px; margin-bottom: 20px; border: 1px solid #333; text-align: center;">
      <p style="color: #888; margin: 0 0 8px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Session P&L</p>
      <h2 style="color: ${pnlColor}; margin: 0; font-size: 36px; font-weight: bold;">
        ${pnlEmoji} ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}
      </h2>
      ${accountEquity ? `<p style="color: #666; margin: 8px 0 0 0; font-size: 12px;">Account Equity: $${accountEquity.toLocaleString()}</p>` : ''}
    </div>

    <!-- Trade Stats -->
    <div style="display: flex; gap: 12px; margin-bottom: 20px;">
      <div style="flex: 1; background: #1a1a1a; border-radius: 12px; padding: 16px; border: 1px solid #333; text-align: center;">
        <p style="color: #888; margin: 0 0 4px 0; font-size: 12px;">Total Trades</p>
        <p style="color: #fff; margin: 0; font-size: 24px; font-weight: bold;">${trades.length}</p>
      </div>
      <div style="flex: 1; background: #1a1a1a; border-radius: 12px; padding: 16px; border: 1px solid #333; text-align: center;">
        <p style="color: #888; margin: 0 0 4px 0; font-size: 12px;">Filled</p>
        <p style="color: #10b981; margin: 0; font-size: 24px; font-weight: bold;">${successfulTrades.length}</p>
      </div>
      <div style="flex: 1; background: #1a1a1a; border-radius: 12px; padding: 16px; border: 1px solid #333; text-align: center;">
        <p style="color: #888; margin: 0 0 4px 0; font-size: 12px;">Flattened</p>
        <p style="color: #f59e0b; margin: 0; font-size: 24px; font-weight: bold;">${flattenTrades.length}</p>
      </div>
    </div>

    <!-- Symbol Breakdown -->
    ${symbolSummaries.length > 0 ? `
    <div style="background: #1a1a1a; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #333;">
      <h3 style="color: #fff; margin: 0 0 16px 0; font-size: 16px;">📊 Symbol Breakdown</h3>
      ${symbolSummaries.map(s => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid #333;">
          <div>
            <span style="color: #fff; font-weight: bold; font-size: 16px;">${s.symbol}</span>
            <span style="color: #888; font-size: 12px; margin-left: 8px;">
              ${s.buys} buy${s.buys !== 1 ? 's' : ''} / ${s.sells} sell${s.sells !== 1 ? 's' : ''}
            </span>
          </div>
          <div style="text-align: right;">
            <span style="color: ${s.estimatedPnL >= 0 ? '#10b981' : '#ef4444'}; font-weight: bold;">
              ${s.estimatedPnL >= 0 ? '+' : ''}$${s.estimatedPnL.toFixed(2)}
            </span>
            ${s.netQty !== 0 ? `<span style="color: #f59e0b; font-size: 12px; display: block;">${s.netQty > 0 ? 'Open' : 'Net'}: ${Math.abs(s.netQty)} shares</span>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
    ` : ''}

    <!-- Trade Log -->
    <div style="background: #1a1a1a; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #333;">
      <h3 style="color: #fff; margin: 0 0 16px 0; font-size: 16px;">📝 Trade Log</h3>
      ${trades.map(trade => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #222;">
          <div>
            <span style="color: #fff; font-weight: bold;">${trade.symbol}</span>
            <span style="color: ${trade.side === 'buy' ? '#10b981' : trade.side === 'flatten' ? '#f59e0b' : '#ef4444'}; font-size: 12px; margin-left: 8px; text-transform: uppercase;">${trade.side}</span>
            <span style="color: #888; font-size: 12px; margin-left: 8px;">${trade.qty} @ $${(trade.price || 0).toFixed(2)}</span>
          </div>
          <div style="text-align: right;">
            <span style="color: #888; font-size: 12px;">
              ${new Date(trade.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/New_York' })} ET
            </span>
            <span style="color: ${trade.status === 'filled' || trade.status === 'success' ? '#10b981' : trade.status === 'flattened' ? '#f59e0b' : '#ef4444'}; font-size: 11px; margin-left: 8px;">
              ${trade.status.toUpperCase()}
            </span>
          </div>
        </div>
      `).join('')}
    </div>
    `}

    <!-- Tomorrow's Note -->
    <div style="background: #10b98115; border: 1px solid #10b98140; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <h3 style="color: #10b981; font-size: 14px; margin: 0 0 8px 0;">🔮 Tomorrow's Scan</h3>
      <p style="color: #888; margin: 0; font-size: 13px;">
        Fresh ORB stock scan will run tonight at midnight. Check your 8:00 AM email for tomorrow's trading candidates.
      </p>
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 20px 0;">
      <p style="color: #666; font-size: 12px; margin: 0;">
        ORB Trading Bot • End of Session Report<br>
        Trading involves risk. Past performance is not indicative of future results.
      </p>
    </div>

  </div>
</body>
</html>
  `;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("[SESSION-EMAIL] send-daily-performance function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check if this is a scheduled call
    const authHeader = req.headers.get('Authorization');
    const isScheduledCall = !authHeader || authHeader.includes(Deno.env.get('SUPABASE_ANON_KEY') || '');

    // For scheduled calls, check if market is open today
    const etDate = getETDate();
    if (isScheduledCall && !isMarketDay(etDate)) {
      console.log("[SESSION-EMAIL] Market is closed today, skipping email");
      return new Response(
        JSON.stringify({ message: "Market is closed today, no email sent" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const today = etDate.toISOString().split('T')[0];
    const todayStart = `${today}T00:00:00.000Z`;
    const todayEnd = `${today}T23:59:59.999Z`;

    // Get all users with trading configs
    const { data: configs, error: configError } = await supabase
      .from('trading_configurations')
      .select('user_id');

    if (configError) {
      console.error("[SESSION-EMAIL] Error fetching configs:", configError);
      throw configError;
    }

    if (!configs || configs.length === 0) {
      console.log("[SESSION-EMAIL] No trading configurations found");
      return new Response(
        JSON.stringify({ message: "No users to send emails to" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const emailsSent: string[] = [];

    for (const config of configs) {
      // Get user's email
      const { data: profile } = await supabase
        .from('profiles')
        .select('email')
        .eq('id', config.user_id)
        .single();

      if (!profile?.email) {
        console.log(`[SESSION-EMAIL] No email for user ${config.user_id}`);
        continue;
      }

      // Get today's trades for this user
      const { data: trades, error: tradesError } = await supabase
        .from('trade_logs')
        .select('*')
        .eq('user_id', config.user_id)
        .gte('created_at', todayStart)
        .lte('created_at', todayEnd)
        .order('created_at', { ascending: true });

      if (tradesError) {
        console.error(`[SESSION-EMAIL] Error fetching trades for user ${config.user_id}:`, tradesError);
        continue;
      }

      const formattedDate = etDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      // Send email even if no trades (show "No trades today" message)
      const html = generatePerformanceHTML(trades || [], formattedDate);
      const tradeCount = trades?.length || 0;
      const subjectEmoji = tradeCount > 0 ? '🏁' : '😴';
      const subjectText = tradeCount > 0 ? `${tradeCount} trades today` : 'No trades today';

      const { error: emailError } = await resend.emails.send({
        from: "ORB Trading <onboarding@resend.dev>",
        to: [profile.email],
        subject: `${subjectEmoji} Session Report - ${subjectText}`,
        html,
      });

      if (emailError) {
        console.error(`[SESSION-EMAIL] Failed to send email to ${profile.email}:`, emailError);
        // Log error to Supabase
        try {
          await supabase.from('trade_logs').insert({
            user_id: config.user_id,
            symbol: 'EMAIL',
            side: 'error',
            qty: 0,
            price: null,
            strategy: 'session-report-email',
            status: 'failed',
            error_message: JSON.stringify(emailError),
          });
        } catch {
          // Ignore logging errors
        }
      } else {
        console.log(`[SESSION-EMAIL] Session report email sent to ${profile.email}`);
        emailsSent.push(profile.email);
      }
    }

    return new Response(
      JSON.stringify({ 
        message: `Session report emails sent`,
        emailsSent: emailsSent.length,
        recipients: emailsSent
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("[SESSION-EMAIL] Error in send-daily-performance:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
