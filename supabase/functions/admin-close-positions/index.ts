import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id } = await req.json();
    
    if (!user_id) {
      return new Response(
        JSON.stringify({ error: 'Missing user_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's trading config
    const { data: configData, error: configError } = await supabase
      .rpc('get_decrypted_trading_config', { p_user_id: user_id });

    if (configError || !configData || configData.length === 0) {
      return new Response(
        JSON.stringify({ error: 'No trading config found for user' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const config = configData[0];
    const baseUrl = config.is_paper_trading 
      ? 'https://paper-api.alpaca.markets'
      : 'https://api.alpaca.markets';

    const headers = {
      'APCA-API-KEY-ID': config.api_key_id,
      'APCA-API-SECRET-KEY': config.secret_key,
    };

    console.log(`Closing all positions for user ${user_id}`);

    // Cancel all orders first
    const cancelResponse = await fetch(`${baseUrl}/v2/orders`, { 
      method: 'DELETE',
      headers 
    });
    console.log('Cancel orders response:', cancelResponse.status);

    // Close all positions
    const closeResponse = await fetch(`${baseUrl}/v2/positions?cancel_orders=true`, { 
      method: 'DELETE',
      headers 
    });

    if (!closeResponse.ok) {
      const error = await closeResponse.text();
      console.error('Failed to close positions:', error);
      return new Response(
        JSON.stringify({ error: `Failed to close positions: ${error}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const closedPositions = await closeResponse.json();
    console.log('Closed positions:', closedPositions);

    return new Response(
      JSON.stringify({
        success: true,
        user_id,
        closedCount: Array.isArray(closedPositions) ? closedPositions.length : 0,
        message: 'All positions closed'
      }),
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
