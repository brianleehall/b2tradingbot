import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Brain, Loader2, TrendingUp, TrendingDown, Minus, AlertTriangle, Target, Shield } from 'lucide-react';
import { PriceData, Strategy } from '@/lib/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AIAnalysis {
  signal: 'BUY' | 'SELL' | 'HOLD';
  confidence: number;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  reasoning: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
}

interface AIAnalyzerCardProps {
  prices: PriceData[];
  strategies: Strategy[];
  selectedStrategy: string | null;
}

export function AIAnalyzerCard({ prices, strategies, selectedStrategy }: AIAnalyzerCardProps) {
  const [selectedSymbol, setSelectedSymbol] = useState<string>(prices[0]?.symbol || '');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysis | null>(null);

  const handleAnalyze = async () => {
    if (!selectedSymbol) {
      toast.error('Please select a symbol to analyze');
      return;
    }

    const strategy = strategies.find(s => s.id === selectedStrategy);
    if (!strategy) {
      toast.error('Please select a strategy first');
      return;
    }

    const priceData = prices.find(p => p.symbol === selectedSymbol);
    if (!priceData) {
      toast.error('Price data not available');
      return;
    }

    setIsAnalyzing(true);
    setAnalysis(null);

    try {
      const { data, error } = await supabase.functions.invoke('analyze-strategy', {
        body: {
          symbol: selectedSymbol,
          strategy: `${strategy.name}: ${strategy.description}`,
          currentPrice: priceData.price,
          priceChange: priceData.changePercent,
          high: priceData.high,
          low: priceData.low,
        },
      });

      if (error) {
        throw error;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setAnalysis(data.analysis);
      toast.success('Analysis complete');
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to analyze');
    } finally {
      setIsAnalyzing(false);
    }
  };

  const SignalIcon = analysis?.signal === 'BUY' ? TrendingUp : analysis?.signal === 'SELL' ? TrendingDown : Minus;
  const signalColor = analysis?.signal === 'BUY' ? 'text-success' : analysis?.signal === 'SELL' ? 'text-destructive' : 'text-muted-foreground';
  const riskColor = analysis?.riskLevel === 'LOW' ? 'bg-success/20 text-success' : analysis?.riskLevel === 'HIGH' ? 'bg-destructive/20 text-destructive' : 'bg-warning/20 text-warning';

  return (
    <Card className="glass">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Brain className="w-4 h-4" />
          AI Strategy Analyzer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <Select value={selectedSymbol} onValueChange={setSelectedSymbol}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder="Select symbol" />
            </SelectTrigger>
            <SelectContent>
              {prices.map((price) => (
                <SelectItem key={price.symbol} value={price.symbol}>
                  {price.symbol} - ${price.price.toLocaleString()}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button 
            onClick={handleAnalyze} 
            disabled={isAnalyzing || !selectedStrategy}
            className="shrink-0"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing
              </>
            ) : (
              <>
                <Brain className="w-4 h-4 mr-2" />
                Analyze
              </>
            )}
          </Button>
        </div>

        {!selectedStrategy && (
          <p className="text-xs text-muted-foreground text-center py-2">
            Select a trading strategy to enable AI analysis
          </p>
        )}

        {analysis && (
          <div className="space-y-4 pt-2">
            {/* Signal Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-lg bg-secondary", signalColor)}>
                  <SignalIcon className="w-5 h-5" />
                </div>
                <div>
                  <p className={cn("text-2xl font-bold", signalColor)}>{analysis.signal}</p>
                  <p className="text-xs text-muted-foreground">Signal</p>
                </div>
              </div>
              <div className="text-right">
                <div className="flex items-center gap-1">
                  {[...Array(10)].map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "w-2 h-4 rounded-sm",
                        i < analysis.confidence ? "bg-primary" : "bg-muted"
                      )}
                    />
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Confidence: {analysis.confidence}/10
                </p>
              </div>
            </div>

            {/* Price Levels */}
            <div className="grid grid-cols-3 gap-2">
              {analysis.entryPrice && (
                <div className="p-3 rounded-lg bg-secondary/50">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                    <Target className="w-3 h-3" />
                    Entry
                  </div>
                  <p className="font-semibold">${analysis.entryPrice.toLocaleString()}</p>
                </div>
              )}
              {analysis.stopLoss && (
                <div className="p-3 rounded-lg bg-destructive/10">
                  <div className="flex items-center gap-1 text-xs text-destructive mb-1">
                    <Shield className="w-3 h-3" />
                    Stop Loss
                  </div>
                  <p className="font-semibold text-destructive">${analysis.stopLoss.toLocaleString()}</p>
                </div>
              )}
              {analysis.takeProfit && (
                <div className="p-3 rounded-lg bg-success/10">
                  <div className="flex items-center gap-1 text-xs text-success mb-1">
                    <TrendingUp className="w-3 h-3" />
                    Take Profit
                  </div>
                  <p className="font-semibold text-success">${analysis.takeProfit.toLocaleString()}</p>
                </div>
              )}
            </div>

            {/* Risk & Reasoning */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Risk Level:</span>
                <Badge variant="secondary" className={riskColor}>
                  {analysis.riskLevel}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {analysis.reasoning}
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
