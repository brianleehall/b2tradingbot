import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  // v2 - Token-based auth fix
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header to extract the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Extract and decode JWT token manually (SDK getUser has session issues)
    const token = authHeader.replace('Bearer ', '');
    let userId: string;
    
    try {
      // Decode JWT payload (base64url encoded)
      const parts = token.split('.');
      if (parts.length !== 3) throw new Error('Invalid JWT format');
      
      const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
      userId = payload.sub;
      
      if (!userId) throw new Error('No user ID in token');
      
      // Verify token hasn't expired
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        throw new Error('Token expired');
      }
      
      console.log('Authenticated user:', userId);
    } catch (e) {
      console.error('JWT decode error:', e);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const user = { id: userId };
    console.log(`Authenticated user: ${user.id}`);

    // Parse request body for endpoint
    const { endpoint } = await req.json();
    
    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: 'Missing endpoint parameter' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use the already-created admin client to get decrypted credentials
    
    const { data: configData, error: configError } = await supabaseAdmin
      .rpc('get_decrypted_trading_config', { p_user_id: user.id });

    if (configError) {
      console.error('Config fetch error:', configError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch trading configuration' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!configData || configData.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No trading configuration found. Please set up your API keys.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const config = configData[0];
    const apiKeyId = config.api_key_id;
    const secretKey = config.secret_key;
    const isPaperTrading = config.is_paper_trading;

    if (!apiKeyId || !secretKey) {
      return new Response(
        JSON.stringify({ error: 'Missing API credentials in configuration' }),
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

      case 'close_all_positions': {
        console.log('FLATTEN ALL: Canceling all orders and closing all positions');
        
        // Step 1: Cancel all open orders
        const cancelResponse = await fetch(`${baseUrl}/v2/orders`, { 
          method: 'DELETE',
          headers 
        });
        
        if (!cancelResponse.ok) {
          const error = await cancelResponse.text();
          console.error('Failed to cancel orders:', error);
        } else {
          console.log('All open orders canceled');
        }
        
        // Step 2: Close all positions
        const closeResponse = await fetch(`${baseUrl}/v2/positions?cancel_orders=true`, { 
          method: 'DELETE',
          headers 
        });
        
        if (!closeResponse.ok) {
          const error = await closeResponse.text();
          console.error('Failed to close positions:', error);
          throw new Error(`Failed to close positions: ${error}`);
        }
        
        const closedPositions = await closeResponse.json();
        console.log('Closed positions:', closedPositions);
        
        data = {
          success: true,
          message: 'All orders canceled and positions closed',
          closedCount: Array.isArray(closedPositions) ? closedPositions.length : 0
        };
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
