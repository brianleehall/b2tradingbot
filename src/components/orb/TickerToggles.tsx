import { ORB_TICKERS, ORBTicker, ORBRange } from '@/lib/orbConfig';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface TickerTogglesProps {
  activeTickers: ORBTicker[];
  orbRanges: Record<string, ORBRange>;
  onToggle: (ticker: ORBTicker) => void;
  disabled?: boolean;
}

export function TickerToggles({ activeTickers, orbRanges, onToggle, disabled }: TickerTogglesProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-lg font-semibold mb-4">Active Tickers</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {ORB_TICKERS.map((ticker) => {
          const isActive = activeTickers.includes(ticker);
          const range = orbRanges[ticker];
          
          return (
            <div 
              key={ticker}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg border transition-colors",
                isActive 
                  ? "bg-primary/10 border-primary/30" 
                  : "bg-muted/30 border-border"
              )}
            >
              <div className="flex flex-col">
                <span className={cn(
                  "font-mono font-bold",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}>
                  {ticker}
                </span>
                {range?.isSet && (
                  <span className="text-xs text-muted-foreground">
                    {range.high.toFixed(2)} / {range.low.toFixed(2)}
                  </span>
                )}
              </div>
              <Switch
                checked={isActive}
                onCheckedChange={() => onToggle(ticker)}
                disabled={disabled}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
