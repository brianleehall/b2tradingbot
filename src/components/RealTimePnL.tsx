import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Activity, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RiskSettings } from '@/lib/dayTradingStrategies';

interface RealTimePnLProps {
  dailyPnL: number;
  dailyPnLPercent: number;
  riskSettings: RiskSettings;
  isAutoTrading: boolean;
}

export function RealTimePnL({ 
  dailyPnL, 
  dailyPnLPercent, 
  riskSettings,
  isAutoTrading 
}: RealTimePnLProps) {
  const [flash, setFlash] = useState<'up' | 'down' | null>(null);
  const [prevPnL, setPrevPnL] = useState(dailyPnL);

  useEffect(() => {
    if (dailyPnL !== prevPnL) {
      setFlash(dailyPnL > prevPnL ? 'up' : 'down');
      setPrevPnL(dailyPnL);
      const timer = setTimeout(() => setFlash(null), 500);
      return () => clearTimeout(timer);
    }
  }, [dailyPnL, prevPnL]);

  const isPositive = dailyPnL >= 0;
  const isNearLimit = Math.abs(dailyPnLPercent) > riskSettings.dailyLossLimit * 0.7;
  const isLocked = riskSettings.isLocked;

  return (
    <div className={cn(
      "flex items-center gap-4 px-4 py-3 rounded-lg transition-all duration-300",
      "bg-card/80 backdrop-blur-sm border",
      flash === 'up' && "animate-pulse bg-success/20 border-success",
      flash === 'down' && "animate-pulse bg-destructive/20 border-destructive",
      !flash && isPositive && "border-success/30",
      !flash && !isPositive && "border-destructive/30",
      isLocked && "border-destructive bg-destructive/10"
    )}>
      <div className="flex items-center gap-2">
        {isLocked ? (
          <AlertTriangle className="w-5 h-5 text-destructive animate-pulse" />
        ) : isAutoTrading ? (
          <Activity className="w-5 h-5 text-primary animate-pulse" />
        ) : isPositive ? (
          <TrendingUp className="w-5 h-5 text-success" />
        ) : (
          <TrendingDown className="w-5 h-5 text-destructive" />
        )}
        
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">Today's P&L</span>
          <div className="flex items-baseline gap-2">
            <span className={cn(
              "font-mono font-bold text-lg",
              isPositive ? "text-success" : "text-destructive"
            )}>
              {isPositive ? '+' : ''}{dailyPnL.toLocaleString('en-US', { 
                style: 'currency', 
                currency: 'USD',
                minimumFractionDigits: 2 
              })}
            </span>
            <span className={cn(
              "font-mono text-sm",
              isPositive ? "text-success/80" : "text-destructive/80"
            )}>
              ({isPositive ? '+' : ''}{dailyPnLPercent.toFixed(2)}%)
            </span>
          </div>
        </div>
      </div>

      <div className="h-8 w-px bg-border" />

      <div className="flex items-center gap-4 text-sm">
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground">Trades</span>
          <span className={cn(
            "font-mono font-semibold",
            riskSettings.tradesToday >= riskSettings.maxTradesPerDay && "text-warning"
          )}>
            {riskSettings.tradesToday}/{riskSettings.maxTradesPerDay}
          </span>
        </div>
        
        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground">Risk/Trade</span>
          <span className="font-mono font-semibold">{riskSettings.maxRiskPerTrade}%</span>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-xs text-muted-foreground">Daily Limit</span>
          <span className={cn(
            "font-mono font-semibold",
            isNearLimit && "text-warning",
            isLocked && "text-destructive"
          )}>
            {riskSettings.dailyLossLimit}%
          </span>
        </div>
      </div>

      {isLocked && (
        <div className="ml-auto px-3 py-1 rounded bg-destructive/20 border border-destructive/50">
          <span className="text-xs font-semibold text-destructive">LOCKED</span>
        </div>
      )}
    </div>
  );
}
