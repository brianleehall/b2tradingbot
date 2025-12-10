import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Sparkles, ShieldAlert, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { getETTime } from '@/lib/orbConfig';

export interface SelectedStock {
  symbol: string;
  priceChange: number;      // Yesterday's % change (was preMarketChange)
  rvol: number;
  price: number;
  avgVolume: number;
  volume?: number;          // Yesterday's actual volume
  float?: number;
  exchange: string;
  isChecked: boolean;
}

interface AutoSelectedStocksProps {
  onStocksChange: (symbols: string[]) => void;
  onMarketRegimeChange?: (regime: 'bullish' | 'bearish') => void;
  disabled?: boolean;
}

export function AutoSelectedStocks({ onStocksChange, onMarketRegimeChange, disabled }: AutoSelectedStocksProps) {
  const [stocks, setStocks] = useState<SelectedStock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marketRegime, setMarketRegime] = useState<'bullish' | 'bearish'>('bullish');
  const [spyPrice, setSpyPrice] = useState<number | null>(null);
  const [spy200SMA, setSpy200SMA] = useState<number | null>(null);

  const saveSelectedTickers = useCallback(async (symbols: string[]) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // Upsert the user's selected tickers
      const { error } = await supabase
        .from('user_orb_tickers')
        .upsert(
          { user_id: session.user.id, symbols },
          { onConflict: 'user_id' }
        );

      if (error) {
        console.error('Failed to save tickers:', error);
      } else {
        console.log('Saved selected tickers:', symbols);
      }
    } catch (err) {
      console.error('Error saving tickers:', err);
    }
  }, []);

  const fetchStocks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError('Not authenticated');
        setIsLoading(false);
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke('orb-stock-selector', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (fnError) {
        console.error('Stock selector error:', fnError);
        setError(fnError.message);
        setIsLoading(false);
        return;
      }

      if (data.error) {
        setError(data.error);
        setIsLoading(false);
        return;
      }

      const stocksWithChecked = (data.stocks || []).map((stock: Omit<SelectedStock, 'isChecked'>) => ({
        ...stock,
        // Map priceChange for compatibility (API returns priceChange, not preMarketChange)
        priceChange: stock.priceChange ?? (stock as any).preMarketChange ?? 0,
        isChecked: true, // All checked by default
      }));

      setStocks(stocksWithChecked);
      setLastScanTime(data.scannedAt);
      setMessage(data.message || null);
      
      // Set market regime from scan
      const regime = data.marketRegime || 'bullish';
      setMarketRegime(regime);
      setSpyPrice(data.spyPrice || null);
      setSpy200SMA(data.spy200SMA || null);
      onMarketRegimeChange?.(regime);

      // Notify parent of selected symbols
      const checkedSymbols = stocksWithChecked
        .filter((s: SelectedStock) => s.isChecked)
        .map((s: SelectedStock) => s.symbol);
      onStocksChange(checkedSymbols);
      
      // Save initial selection to database
      saveSelectedTickers(checkedSymbols);

    } catch (err) {
      console.error('Failed to fetch stocks:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch stocks');
    } finally {
      setIsLoading(false);
    }
  }, [onStocksChange, saveSelectedTickers]);

  // Initial fetch on mount
  useEffect(() => {
    fetchStocks();
  }, [fetchStocks, onMarketRegimeChange]);

  // Auto-refresh at 8:00 AM ET (uses previous day's EOD data)
  useEffect(() => {
    const checkAndRefresh = () => {
      const et = getETTime();
      const hours = et.getHours();
      const minutes = et.getMinutes();
      const day = et.getDay();

      // Only on weekdays at exactly 8:00 AM ET
      if (day !== 0 && day !== 6 && hours === 8 && minutes === 0) {
        console.log('Auto-refreshing stock selection at 8:00 AM ET (using EOD data)');
        fetchStocks();
      }
    };

    // Check every minute
    const interval = setInterval(checkAndRefresh, 60000);
    
    return () => clearInterval(interval);
  }, [fetchStocks]);

  const toggleStock = async (symbol: string) => {
    if (disabled) return;

    setStocks(prev => {
      const updated = prev.map(s => 
        s.symbol === symbol ? { ...s, isChecked: !s.isChecked } : s
      );
      
      // Notify parent of change
      const checkedSymbols = updated
        .filter(s => s.isChecked)
        .map(s => s.symbol);
      onStocksChange(checkedSymbols);
      
      // Save to database
      saveSelectedTickers(checkedSymbols);
      
      return updated;
    });
  };

  const formatVolume = (vol: number) => {
    if (vol >= 1000000) return `${(vol / 1000000).toFixed(1)}M`;
    if (vol >= 1000) return `${(vol / 1000).toFixed(0)}K`;
    return vol.toString();
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      timeZone: 'America/New_York'
    }) + ' ET';
  };

  const checkedCount = stocks.filter(s => s.isChecked).length;

  return (
    <Card className="border-2 border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded-lg">
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold">
                TODAY'S ORB STOCKS
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                (auto-selected)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lastScanTime && (
              <span className="text-xs text-muted-foreground">
                Last scan: {formatTime(lastScanTime)}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStocks}
              disabled={isLoading}
            >
              <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} />
            </Button>
          </div>
        </div>
        
        {/* Market Regime Indicator */}
        {!isLoading && !error && (
          <div className={cn(
            "mt-4 p-3 rounded-lg border-2 flex items-center justify-between",
            marketRegime === 'bearish' 
              ? "bg-red-500/10 border-red-500/40" 
              : "bg-emerald-500/10 border-emerald-500/40"
          )}>
            <div className="flex items-center gap-3">
              {marketRegime === 'bearish' ? (
                <ShieldAlert className="h-6 w-6 text-red-500" />
              ) : (
                <Zap className="h-6 w-6 text-emerald-500" />
              )}
              <div>
                <div className={cn(
                  "font-bold text-lg",
                  marketRegime === 'bearish' ? "text-red-500" : "text-emerald-500"
                )}>
                  {marketRegime === 'bearish' ? '🐻 BEAR MARKET MODE' : '🐂 BULL MARKET MODE'}
                </div>
                <div className="text-sm text-muted-foreground">
                  {marketRegime === 'bearish' 
                    ? 'SPY below 200-SMA → Only SHORT breakouts allowed'
                    : 'SPY above 200-SMA → Long & Short breakouts allowed'
                  }
                </div>
              </div>
            </div>
            {spyPrice && spy200SMA && (
              <div className="text-right text-sm">
                <div className="text-muted-foreground">SPY: <span className="font-mono font-medium text-foreground">${spyPrice.toFixed(2)}</span></div>
                <div className="text-muted-foreground">200-SMA: <span className="font-mono font-medium text-foreground">${spy200SMA.toFixed(2)}</span></div>
              </div>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-3 text-muted-foreground">Scanning yesterday's EOD data...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-8 text-destructive">
            <AlertTriangle className="h-5 w-5 mr-2" />
            <span>{error}</span>
          </div>
        ) : message && stocks.length < 3 ? (
          <div className="flex items-center justify-center py-8 bg-amber-500/10 rounded-lg border border-amber-500/30">
            <AlertTriangle className="h-6 w-6 text-amber-500 mr-3" />
            <span className="text-amber-500 font-medium text-lg">{message}</span>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {stocks.map((stock) => (
                <div
                  key={stock.symbol}
                  onClick={() => toggleStock(stock.symbol)}
                  className={cn(
                    "relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
                    stock.isChecked
                      ? "bg-primary/10 border-primary shadow-lg shadow-primary/20"
                      : "bg-muted/30 border-border opacity-60 hover:opacity-80",
                    disabled && "cursor-not-allowed"
                  )}
                >
                  {/* Checkbox */}
                  <div className="absolute top-3 right-3">
                    <Checkbox
                      checked={stock.isChecked}
                      disabled={disabled}
                      className="h-5 w-5"
                    />
                  </div>

                  {/* Ticker Symbol - Big */}
                  <div className="mb-3">
                    <span className="text-3xl font-bold font-mono tracking-tight">
                      {stock.symbol}
                    </span>
                    <Badge 
                      variant="outline" 
                      className="ml-2 text-xs"
                    >
                      {stock.exchange}
                    </Badge>
                  </div>

                  {/* Yesterday's Price Change */}
                  <div className="flex items-center gap-2 mb-2">
                    {stock.priceChange >= 0 ? (
                      <TrendingUp className="h-5 w-5 text-emerald-500" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-red-500" />
                    )}
                    <span className={cn(
                      "text-2xl font-bold",
                      stock.priceChange >= 0 ? "text-emerald-500" : "text-red-500"
                    )}>
                      {stock.priceChange >= 0 ? '+' : ''}{stock.priceChange.toFixed(2)}%
                    </span>
                    <span className="text-xs text-muted-foreground">(yesterday)</span>
                  </div>

                  {/* RVOL */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">RVOL</span>
                    <span className={cn(
                      "font-bold text-lg",
                      stock.rvol >= 5 ? "text-amber-500" : 
                      stock.rvol >= 3.5 ? "text-primary" : "text-foreground"
                    )}>
                      {stock.rvol.toFixed(1)}x
                    </span>
                  </div>

                  {/* Price & Volume */}
                  <div className="flex items-center justify-between text-sm mt-1 text-muted-foreground">
                    <span>${stock.price.toFixed(2)}</span>
                    <span>Vol: {formatVolume(stock.avgVolume)}</span>
                  </div>

                  {/* Float */}
                  {stock.float && (
                    <div className="text-xs text-muted-foreground mt-1">
                      Float: {stock.float}M
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{checkedCount}</span> of {stocks.length} stocks selected for trading
              </div>
              <div className="flex gap-2 text-xs flex-wrap">
                <Badge variant="secondary">RVOL ≥ 2.5x</Badge>
                <Badge variant="secondary">Change ≥ ±3%</Badge>
                <Badge variant="secondary">AvgVol ≥ 800K</Badge>
                <Badge variant="secondary">Price ≥ $15</Badge>
                <Badge variant="secondary">Float ≤ 150M</Badge>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
