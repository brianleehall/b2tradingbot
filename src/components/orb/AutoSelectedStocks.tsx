import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, RefreshCw, TrendingUp, TrendingDown, AlertTriangle, Sparkles, ShieldAlert, Zap, Mail } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { getETTime } from '@/lib/orbConfig';
import { toast } from 'sonner';

export interface SelectedStock {
  symbol: string;
  priceChange: number;      // Day's % change when qualified
  rvol: number;
  price: number;
  avgVolume: number;
  volume?: number;
  float?: number;
  exchange: string;
  isChecked: boolean;
  isFallback?: boolean;
  daysAgo?: number;         // How many days ago stock qualified
  qualifyingDate?: string;  // The date stock qualified
  isCrypto?: boolean;       // Is this a crypto pair
}

interface AutoSelectedStocksProps {
  onStocksChange: (symbols: string[]) => void;
  onMarketRegimeChange?: (regime: 'bullish' | 'bearish') => void;
  disabled?: boolean;
}

export function AutoSelectedStocks({ onStocksChange, onMarketRegimeChange, disabled }: AutoSelectedStocksProps) {
  const [stocks, setStocks] = useState<SelectedStock[]>([]);
  const [cryptoStocks, setCryptoStocks] = useState<SelectedStock[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastScanTime, setLastScanTime] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [marketRegime, setMarketRegime] = useState<'bullish' | 'bearish'>('bullish');
  const [spyPrice, setSpyPrice] = useState<number | null>(null);
  const [spy200SMA, setSpy200SMA] = useState<number | null>(null);
  const [isSendingEmail, setIsSendingEmail] = useState(false);

  const sendDailyEmail = async () => {
    setIsSendingEmail(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Not authenticated');
        return;
      }

      // Send the current stock data with the email request to ensure consistency
      const stockDataForEmail = {
        stocks: stocks.map(s => ({
          symbol: s.symbol,
          priceChange: s.priceChange,
          rvol: s.rvol,
          price: s.price,
          avgVolume: s.avgVolume,
          exchange: s.exchange,
          isFallback: s.isFallback,
        })),
        marketRegime,
        spyPrice: spyPrice || 0,
        spy200SMA: spy200SMA || 0,
        message,
      };

      const { data, error: fnError } = await supabase.functions.invoke('send-orb-email', {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: stockDataForEmail,
      });

      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);

      toast.success(`Email sent to ${session.user.email}`);
    } catch (err) {
      console.error('Error sending email:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to send email');
    } finally {
      setIsSendingEmail(false);
    }
  };

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
        priceChange: stock.priceChange ?? (stock as any).preMarketChange ?? 0,
        isChecked: true, // All checked by default
        isFallback: stock.isFallback ?? false,
        daysAgo: stock.daysAgo,
        qualifyingDate: stock.qualifyingDate,
        isCrypto: false,
      }));

      // Handle crypto stocks
      const cryptoWithChecked = (data.cryptoStocks || []).map((stock: Omit<SelectedStock, 'isChecked'>) => ({
        ...stock,
        priceChange: stock.priceChange ?? 0,
        isChecked: true,
        isFallback: false,
        daysAgo: stock.daysAgo,
        qualifyingDate: stock.qualifyingDate,
        isCrypto: true,
      }));

      setStocks(stocksWithChecked);
      setCryptoStocks(cryptoWithChecked);
      setLastScanTime(data.scannedAt);
      setMessage(data.message || null);
      
      // Set market regime from scan
      const regime = data.marketRegime || 'bullish';
      setMarketRegime(regime);
      setSpyPrice(data.spyPrice || null);
      setSpy200SMA(data.spy200SMA || null);
      onMarketRegimeChange?.(regime);

      // Notify parent of selected symbols (stocks + crypto)
      const allCheckedSymbols = [
        ...stocksWithChecked.filter((s: SelectedStock) => s.isChecked).map((s: SelectedStock) => s.symbol),
        ...cryptoWithChecked.filter((s: SelectedStock) => s.isChecked).map((s: SelectedStock) => s.symbol),
      ];
      onStocksChange(allCheckedSymbols);
      
      // Save initial selection to database
      saveSelectedTickers(allCheckedSymbols);

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

  const toggleStock = async (symbol: string, isCrypto: boolean = false) => {
    if (disabled) return;

    if (isCrypto) {
      setCryptoStocks(prev => {
        const updated = prev.map(s => 
          s.symbol === symbol ? { ...s, isChecked: !s.isChecked } : s
        );
        
        // Combine with stocks for parent notification
        const allChecked = [
          ...stocks.filter(s => s.isChecked).map(s => s.symbol),
          ...updated.filter(s => s.isChecked).map(s => s.symbol),
        ];
        onStocksChange(allChecked);
        saveSelectedTickers(allChecked);
        
        return updated;
      });
    } else {
      setStocks(prev => {
        const updated = prev.map(s => 
          s.symbol === symbol ? { ...s, isChecked: !s.isChecked } : s
        );
        
        // Combine with crypto for parent notification
        const allChecked = [
          ...updated.filter(s => s.isChecked).map(s => s.symbol),
          ...cryptoStocks.filter(s => s.isChecked).map(s => s.symbol),
        ];
        onStocksChange(allChecked);
        saveSelectedTickers(allChecked);
        
        return updated;
      });
    }
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
  const checkedCryptoCount = cryptoStocks.filter(s => s.isChecked).length;

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
              onClick={sendDailyEmail}
              disabled={isSendingEmail || isLoading}
              title="Send Today's ORB Stocks email now"
              className="gap-2"
            >
              {isSendingEmail ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Mail className="h-4 w-4" />
              )}
              <span className="hidden sm:inline">Send Email</span>
            </Button>
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
            <span className="ml-3 text-muted-foreground">Scanning the last 5 trading day's EOD data...</span>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center py-8 text-destructive">
            <AlertTriangle className="h-5 w-5 mr-2" />
            <span>{error}</span>
          </div>
        ) : (
          <>
            {/* Fallback Warning Banner */}
            {message && stocks.some(s => s.isFallback) && (
              <div className="flex items-center gap-3 mb-4 p-4 bg-amber-500/10 rounded-lg border border-amber-500/30">
                <AlertTriangle className="h-6 w-6 text-amber-500 shrink-0" />
                <div>
                  <span className="text-amber-500 font-semibold">{message}</span>
                  <p className="text-sm text-amber-500/80 mt-1">
                    Fallback stocks: {stocks.filter(s => s.isFallback).map(s => s.symbol).join(', ')}
                  </p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {stocks.map((stock) => (
                <div
                  key={stock.symbol}
                  onClick={() => toggleStock(stock.symbol)}
                  className={cn(
                    "relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
                    stock.isFallback && "border-amber-500/50",
                    stock.isChecked && !stock.isFallback
                      ? "bg-primary/10 border-primary shadow-lg shadow-primary/20"
                      : stock.isChecked && stock.isFallback
                      ? "bg-amber-500/10 border-amber-500/50 shadow-lg shadow-amber-500/20"
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
                    {stock.isFallback ? (
                      <Badge variant="secondary" className="ml-2 text-xs bg-amber-500/20 text-amber-500 border-amber-500/30">
                        Fallback – Proven ORB Leader
                      </Badge>
                    ) : stock.daysAgo !== undefined && (
                      <Badge variant="secondary" className="ml-2 text-xs bg-emerald-500/20 text-emerald-500 border-emerald-500/30">
                        {stock.daysAgo === 0 ? 'Qualified Yesterday' : `Qualified ${stock.daysAgo + 1} days ago`}
                      </Badge>
                    )}
                  </div>

                  {/* Price Change - when stock qualified */}
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
                    <span className="text-xs text-muted-foreground">
                      {stock.isFallback ? '(yesterday)' : stock.daysAgo === 0 ? '(yesterday)' : `(${stock.daysAgo + 1}d ago)`}
                    </span>
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

            {/* Crypto Section */}
            {cryptoStocks.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant="outline" className="bg-orange-500/10 text-orange-500 border-orange-500/30">
                    🪙 Crypto Pairs
                  </Badge>
                  <span className="text-sm text-muted-foreground">Max 20% portfolio • 0.5% risk/trade</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {cryptoStocks.map((stock) => (
                    <div
                      key={stock.symbol}
                      onClick={() => toggleStock(stock.symbol, true)}
                      className={cn(
                        "relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200",
                        "border-orange-500/50",
                        stock.isChecked
                          ? "bg-orange-500/10 shadow-lg shadow-orange-500/20"
                          : "bg-muted/30 border-border opacity-60 hover:opacity-80",
                        disabled && "cursor-not-allowed"
                      )}
                    >
                      <div className="absolute top-3 right-3">
                        <Checkbox
                          checked={stock.isChecked}
                          disabled={disabled}
                          className="h-5 w-5"
                        />
                      </div>
                      <div className="mb-3">
                        <span className="text-3xl font-bold font-mono tracking-tight">
                          {stock.symbol}
                        </span>
                        <Badge variant="outline" className="ml-2 text-xs bg-orange-500/20 text-orange-500 border-orange-500/30">
                          CRYPTO
                        </Badge>
                        {stock.daysAgo !== undefined && (
                          <Badge variant="secondary" className="ml-2 text-xs bg-emerald-500/20 text-emerald-500 border-emerald-500/30">
                            {stock.daysAgo === 0 ? 'Qualified Yesterday' : `Qualified ${stock.daysAgo + 1} days ago`}
                          </Badge>
                        )}
                      </div>
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
                      </div>
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
                      <div className="flex items-center justify-between text-sm mt-1 text-muted-foreground">
                        <span>${stock.price.toLocaleString()}</span>
                        <span>Vol: ${formatVolume(stock.avgVolume)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{checkedCount}</span> of {stocks.length} stocks selected
                {cryptoStocks.length > 0 && (
                  <span className="text-orange-500 ml-2">
                    + {checkedCryptoCount} crypto
                  </span>
                )}
                {stocks.some(s => s.isFallback) && (
                  <span className="text-amber-500 ml-2">
                    ({stocks.filter(s => s.isFallback).length} fallback{stocks.filter(s => s.isFallback).length > 1 ? 's' : ''})
                  </span>
                )}
              </div>
              <div className="flex gap-2 text-xs flex-wrap">
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                  Current focus: Tech/AI
                </Badge>
                <Badge variant="secondary">5-Day Lookback</Badge>
                <Badge variant="secondary">RVOL ≥ 2.25x</Badge>
                <Badge variant="secondary">Change ≥ ±3.5%</Badge>
                <Badge variant="secondary">Price ≥ $20</Badge>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
