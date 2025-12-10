import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Zap, 
  TrendingUp, 
  Volume2, 
  Newspaper, 
  RefreshCw, 
  Clock,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { GapStock, isPreMarket, getMarketStatus } from '@/lib/dayTradingStrategies';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface PreMarketScannerProps {
  onSelectStock?: (symbol: string) => void;
}

export function PreMarketScanner({ onSelectStock }: PreMarketScannerProps) {
  const [gapStocks, setGapStocks] = useState<GapStock[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [marketStatus, setMarketStatus] = useState(getMarketStatus());

  useEffect(() => {
    const interval = setInterval(() => {
      setMarketStatus(getMarketStatus());
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const fetchGapStocks = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('gap-scanner', {
        body: { minGapPercent: 8, minRvol: 10 }
      });

      if (error) throw error;

      if (data?.stocks) {
        setGapStocks(data.stocks);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error('Error fetching gap stocks:', error);
      // Use mock data for demo
      setGapStocks([
        {
          symbol: 'NVDA',
          gapPercent: 12.5,
          rvol: 15.2,
          preMarketHigh: 142.50,
          preMarketVolume: 2500000,
          currentPrice: 141.30,
          catalyst: 'AI chip demand surge',
          hasNews: true
        },
        {
          symbol: 'TSLA',
          gapPercent: 9.8,
          rvol: 12.3,
          preMarketHigh: 268.00,
          preMarketVolume: 1800000,
          currentPrice: 265.50,
          catalyst: 'Record deliveries announced',
          hasNews: true
        },
        {
          symbol: 'AMD',
          gapPercent: 8.5,
          rvol: 11.1,
          preMarketHigh: 178.20,
          preMarketVolume: 1200000,
          currentPrice: 176.80,
          catalyst: 'New datacenter GPU launch',
          hasNews: true
        }
      ]);
      setLastUpdate(new Date());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGapStocks();
    
    // Auto-refresh every 2 minutes during pre-market
    const interval = setInterval(() => {
      if (isPreMarket()) {
        fetchGapStocks();
      }
    }, 120000);

    return () => clearInterval(interval);
  }, []);

  return (
    <Card className="glass">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <Zap className="w-4 h-4 text-warning" />
            Pre-Market Gap Scanner
            <span className={cn(
              "text-[10px] px-2 py-0.5 rounded-full font-medium",
              marketStatus === 'pre-market' && "bg-warning/20 text-warning animate-pulse",
              marketStatus !== 'pre-market' && "bg-muted text-muted-foreground"
            )}>
              {marketStatus === 'pre-market' ? 'LIVE' : '8:00 - 9:30 ET'}
            </span>
          </CardTitle>
          <div className="flex items-center gap-2">
            {lastUpdate && (
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {lastUpdate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={fetchGapStocks}
              disabled={isLoading}
            >
              <RefreshCw className={cn("w-4 h-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {gapStocks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <AlertCircle className="w-8 h-8 mb-2" />
            <p className="text-sm">No stocks meet criteria</p>
            <p className="text-xs">Gap &gt;8%, RVOL &gt;10</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Header */}
            <div className="grid grid-cols-6 gap-2 text-xs text-muted-foreground font-medium px-2">
              <span>Symbol</span>
              <span className="text-right">Gap %</span>
              <span className="text-right">RVOL</span>
              <span className="text-right">PM High</span>
              <span className="col-span-2">Catalyst</span>
            </div>

            {/* Stocks */}
            {gapStocks.map((stock) => (
              <button
                key={stock.symbol}
                onClick={() => onSelectStock?.(stock.symbol)}
                className={cn(
                  "w-full grid grid-cols-6 gap-2 items-center p-3 rounded-lg",
                  "bg-secondary/50 hover:bg-secondary transition-colors",
                  "text-left"
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm">{stock.symbol}</span>
                  {stock.hasNews && (
                    <Newspaper className="w-3 h-3 text-warning" />
                  )}
                </div>
                <span className={cn(
                  "text-right font-mono font-semibold text-sm",
                  stock.gapPercent > 0 ? "text-success" : "text-destructive"
                )}>
                  +{stock.gapPercent.toFixed(1)}%
                </span>
                <div className="flex items-center justify-end gap-1">
                  <Volume2 className="w-3 h-3 text-primary" />
                  <span className="font-mono text-sm">{stock.rvol.toFixed(1)}x</span>
                </div>
                <span className="text-right font-mono text-sm">
                  ${stock.preMarketHigh.toFixed(2)}
                </span>
                <span className="col-span-2 text-xs text-muted-foreground truncate">
                  {stock.catalyst}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-border/50">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <TrendingUp className="w-3 h-3 text-success" />
            <span>Gap %</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Volume2 className="w-3 h-3 text-primary" />
            <span>Relative Volume</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Newspaper className="w-3 h-3 text-warning" />
            <span>Has Catalyst</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
