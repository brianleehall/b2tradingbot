import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalysisRequest {
  symbol: string;
  strategy: string;
  currentPrice: number;
  priceChange: number;
  high: number;
  low: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const { symbol, strategy, currentPrice, priceChange, high, low } = await req.json() as AnalysisRequest;

    console.log(`Analyzing ${symbol} with strategy: ${strategy}`);

    const systemPrompt = `You are an expert quantitative trading analyst. Analyze market conditions and provide actionable trading recommendations.
    
Your responses should be:
- Concise and actionable
- Include specific entry/exit price levels
- Provide a confidence score (1-10)
- Consider risk management

Format your response as JSON with this structure:
{
  "signal": "BUY" | "SELL" | "HOLD",
  "confidence": number (1-10),
  "entryPrice": number | null,
  "stopLoss": number | null,
  "takeProfit": number | null,
  "reasoning": string (max 100 words),
  "riskLevel": "LOW" | "MEDIUM" | "HIGH"
}`;

    const userPrompt = `Analyze this trading opportunity:

Symbol: ${symbol}
Current Price: $${currentPrice}
Daily Change: ${priceChange > 0 ? '+' : ''}${priceChange.toFixed(2)}%
Daily High: $${high}
Daily Low: $${low}

Selected Strategy: ${strategy}

Based on the strategy parameters and current market conditions, provide your analysis and recommendation.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
    }

    console.log("AI response:", content);

    // Parse the JSON response from the AI
    let analysis;
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? (jsonMatch[1] || jsonMatch[0]) : content;
      analysis = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      // Fallback to a structured response
      analysis = {
        signal: "HOLD",
        confidence: 5,
        entryPrice: currentPrice,
        stopLoss: currentPrice * 0.95,
        takeProfit: currentPrice * 1.1,
        reasoning: content.slice(0, 200),
        riskLevel: "MEDIUM"
      };
    }

    return new Response(JSON.stringify({ 
      success: true, 
      analysis,
      timestamp: new Date().toISOString()
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error in analyze-strategy function:", error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : "Unknown error" 
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
