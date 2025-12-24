import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// US Market holidays for 2024-2025
const MARKET_HOLIDAYS = [
  '2024-01-01', '2024-01-15', '2024-02-19', '2024-03-29', '2024-05-27',
  '2024-06-19', '2024-07-04', '2024-09-02', '2024-11-28', '2024-12-25',
  '2025-01-01', '2025-01-20', '2025-02-17', '2025-04-18', '2025-05-26',
  '2025-06-19', '2025-07-04', '2025-09-01', '2025-11-27', '2025-12-25',
];

function isMarketOpen(date: Date): boolean {
  const day = date.getDay();
  // Weekend check (0 = Sunday, 6 = Saturday)
  if (day === 0 || day === 6) return false;
  
  // Holiday check
  const dateStr = date.toISOString().split('T')[0];
  if (MARKET_HOLIDAYS.includes(dateStr)) return false;
  
  return true;
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
}

function generatePerformanceHTML(trades: TradeLog[], date: string): string {
  const successfulTrades = trades.filter(t => t.status === 'filled' || t.status === 'success');
  const failedTrades = trades.filter(t => t.status === 'error' || t.status === 'failed');
  
  // Group trades by symbol to calculate P&L
  const tradesBySymbol: Record<string, TradeLog[]> = {};
  for (const trade of successfulTrades) {
    if (!tradesBySymbol[trade.symbol]) {
      tradesBySymbol[trade.symbol] = [];
    }
    tradesBySymbol[trade.symbol].push(trade);
  }

  // Calculate estimated P&L per symbol (buy vs sell)
  const symbolSummaries: { symbol: string; buys: number; sells: number; netQty: number; avgBuyPrice: number; avgSellPrice: number; estimatedPnL: number }[] = [];
  
  for (const [symbol, symbolTrades] of Object.entries(tradesBySymbol)) {
    const buys = symbolTrades.filter(t => t.side === 'buy');
    const sells = symbolTrades.filter(t => t.side === 'sell');
    
    const totalBuyQty = buys.reduce((sum, t) => sum + t.qty, 0);
    const totalSellQty = sells.reduce((sum, t) => sum + t.qty, 0);
    const totalBuyCost = buys.reduce((sum, t) => sum + (t.qty * (t.price || 0)), 0);
    const totalSellProceeds = sells.reduce((sum, t) => sum + (t.qty * (t.price || 0)), 0);
    
    const avgBuyPrice = totalBuyQty > 0 ? totalBuyCost / totalBuyQty : 0;
    const avgSellPrice = totalSellQty > 0 ? totalSellProceeds / totalSellQty : 0;
    
    // Estimated P&L (closed positions only)
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

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Daily ORB Performance Report</title>
</head>
<body style="margin: 0; padding: 0; background-color: #0a0a0a; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border-radius: 12px; padding: 24px; margin-bottom: 20px; border: 1px solid #333;">
      <h1 style="color: #ffffff; margin: 0 0 8px 0; font-size: 24px;">📊 Daily ORB Performance</h1>
      <p style="color: #888; margin: 0; font-size: 14px;">${date}</p>
    </div>

    <!-- P&L Summary -->
    <div style="background: linear-gradient(135deg, #1a1a1a 0%, #222 100%); border-radius: 12px; padding: 24px; margin-bottom: 20px; border: 1px solid #333; text-align: center;">
      <p style="color: #888; margin: 0 0 8px 0; font-size: 14px; text-transform: uppercase; letter-spacing: 1px;">Estimated Day P&L</p>
      <h2 style="color: ${pnlColor}; margin: 0; font-size: 36px; font-weight: bold;">
        ${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}
      </h2>
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
        <p style="color: #888; margin: 0 0 4px 0; font-size: 12px;">Failed</p>
        <p style="color: #ef4444; margin: 0; font-size: 24px; font-weight: bold;">${failedTrades.length}</p>
      </div>
    </div>

    <!-- Symbol Breakdown -->
    ${symbolSummaries.length > 0 ? `
    <div style="background: #1a1a1a; border-radius: 12px; padding: 20px; margin-bottom: 20px; border: 1px solid #333;">
      <h3 style="color: #fff; margin: 0 0 16px 0; font-size: 16px;">Symbol Breakdown</h3>
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
      <h3 style="color: #fff; margin: 0 0 16px 0; font-size: 16px;">Trade Log</h3>
      ${trades.length > 0 ? trades.map(trade => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid #222;">
          <div>
            <span style="color: #fff; font-weight: bold;">${trade.symbol}</span>
            <span style="color: ${trade.side === 'buy' ? '#10b981' : '#ef4444'}; font-size: 12px; margin-left: 8px; text-transform: uppercase;">${trade.side}</span>
            <span style="color: #888; font-size: 12px; margin-left: 8px;">${trade.qty} shares</span>
          </div>
          <div style="text-align: right;">
            <span style="color: #888; font-size: 12px;">
              ${new Date(trade.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <span style="color: ${trade.status === 'filled' || trade.status === 'success' ? '#10b981' : '#ef4444'}; font-size: 11px; margin-left: 8px;">
              ${trade.status.toUpperCase()}
            </span>
          </div>
        </div>
      `).join('') : '<p style="color: #888; text-align: center;">No trades executed today</p>'}
    </div>

    <!-- Footer -->
    <div style="text-align: center; padding: 20px 0;">
      <p style="color: #666; font-size: 12px; margin: 0;">
        ORB Trading Bot • Automated Performance Report
      </p>
    </div>

  </div>
</body>
</html>
  `;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-daily-performance function called");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Check if market is open today
    const now = new Date();
    if (!isMarketOpen(now)) {
      console.log("Market is closed today, skipping email");
      return new Response(
        JSON.stringify({ message: "Market is closed today, no email sent" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const today = now.toISOString().split('T')[0];
    const todayStart = `${today}T00:00:00.000Z`;
    const todayEnd = `${today}T23:59:59.999Z`;

    // Get all users with trading configs who had auto-trading enabled
    const { data: configs, error: configError } = await supabase
      .from('trading_configurations')
      .select('user_id');

    if (configError) {
      console.error("Error fetching configs:", configError);
      throw configError;
    }

    if (!configs || configs.length === 0) {
      console.log("No trading configurations found");
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
        console.log(`No email for user ${config.user_id}`);
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
        console.error(`Error fetching trades for user ${config.user_id}:`, tradesError);
        continue;
      }

      // Only send email if there were trades today
      if (!trades || trades.length === 0) {
        console.log(`No trades today for user ${config.user_id}`);
        continue;
      }

      const formattedDate = now.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

      const html = generatePerformanceHTML(trades, formattedDate);

      const { error: emailError } = await resend.emails.send({
        from: "ORB Trading <onboarding@resend.dev>",
        to: [profile.email],
        subject: `📊 Daily ORB Performance - ${formattedDate}`,
        html,
      });

      if (emailError) {
        console.error(`Failed to send email to ${profile.email}:`, emailError);
      } else {
        console.log(`Performance email sent to ${profile.email}`);
        emailsSent.push(profile.email);
      }
    }

    return new Response(
      JSON.stringify({ 
        message: `Daily performance emails sent`,
        emailsSent: emailsSent.length,
        recipients: emailsSent
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in send-daily-performance:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
