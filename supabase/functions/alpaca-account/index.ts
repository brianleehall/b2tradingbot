import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AlpacaAccount {
  equity: string;
  cash: string;
  buying_power: string;
  portfolio_value: string;
  last_equity: string;
}

interface AlpacaPosition {
  symbol: string;
  qty: string;
  avg_entry_price: string;
  current_price: string;
  market_value: string;
  unrealized_pl: string;
  unrealized_plpc: string;
}

interface AlpacaOrder {
  id: string;
  symbol: string;
  side: string;
  qty: string;
  type: string;
  status: string;
  filled_avg_price: string | null;
  created_at: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { apiKeyId, secretKey, isPaperTrading, endpoint } = await req.json();

    if (!apiKeyId || !secretKey) {
      return new Response(
        JSON.stringify({ error: 'Missing API credentials' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const baseUrl = isPaperTrading 
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';

    const headers = {
      'APCA-API-KEY-ID': apiKeyId,
      'APCA-API-SECRET-KEY': secretKey,
    };

    let data;

    switch (endpoint) {
      case 'account': {
        const response = await fetch(`${baseUrl}/v2/account`, { headers });
        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Alpaca API error: ${error}`);
        }
        const account: AlpacaAccount = await response.json();
        
        const equity = parseFloat(account.equity);
        const lastEquity = parseFloat(account.last_equity);
        const dayChange = equity - lastEquity;
        const dayChangePercent = lastEquity > 0 ? (dayChange / lastEquity) * 100 : 0;

        data = {
          equity,
          cash: parseFloat(account.cash),
          buyingPower: parseFloat(account.buying_power),
          portfolioValue: parseFloat(account.portfolio_value),
          dayChange,
          dayChangePercent,
        };
        break;
      }

      case 'positions': {
        const response = await fetch(`${baseUrl}/v2/positions`, { headers });
        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Alpaca API error: ${error}`);
        }
        const positions: AlpacaPosition[] = await response.json();
        
        data = positions.map(pos => ({
          symbol: pos.symbol,
          qty: parseFloat(pos.qty),
          avgEntryPrice: parseFloat(pos.avg_entry_price),
          currentPrice: parseFloat(pos.current_price),
          marketValue: parseFloat(pos.market_value),
          unrealizedPl: parseFloat(pos.unrealized_pl),
          unrealizedPlPercent: parseFloat(pos.unrealized_plpc) * 100,
        }));
        break;
      }

      case 'orders': {
        const response = await fetch(`${baseUrl}/v2/orders?status=all&limit=20`, { headers });
        if (!response.ok) {
          const error = await response.text();
          throw new Error(`Alpaca API error: ${error}`);
        }
        const orders: AlpacaOrder[] = await response.json();
        
        data = orders.map(order => ({
          id: order.id,
          symbol: order.symbol,
          side: order.side,
          qty: parseFloat(order.qty),
          type: order.type,
          status: order.status,
          filledAvgPrice: order.filled_avg_price ? parseFloat(order.filled_avg_price) : null,
          createdAt: order.created_at,
        }));
        break;
      }

      default:
        throw new Error('Invalid endpoint');
    }

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
