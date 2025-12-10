import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface PnLDisplayProps {
  dailyPnL: number;
  accountEquity: number;
}

export function PnLDisplay({ dailyPnL, accountEquity }: PnLDisplayProps) {
  const [flash, setFlash] = useState(false);
  const [prevPnL, setPrevPnL] = useState(dailyPnL);

  const isPositive = dailyPnL >= 0;
  const percentChange = accountEquity > 0 ? (dailyPnL / accountEquity) * 100 : 0;

  useEffect(() => {
    if (dailyPnL !== prevPnL) {
      setFlash(true);
      setPrevPnL(dailyPnL);
      const timer = setTimeout(() => setFlash(false), 500);
      return () => clearTimeout(timer);
    }
  }, [dailyPnL, prevPnL]);

  return (
    <div 
      className={cn(
        "bg-card border rounded-xl p-6 text-center transition-all duration-200",
        isPositive ? "border-emerald-500/50" : "border-red-500/50",
        flash && (isPositive ? "bg-emerald-500/20" : "bg-red-500/20")
      )}
    >
      <p className="text-muted-foreground text-sm mb-1">Daily P&L</p>
      <div className="flex items-center justify-center gap-2">
        {isPositive ? (
          <TrendingUp className="h-8 w-8 text-emerald-400" />
        ) : (
          <TrendingDown className="h-8 w-8 text-red-400" />
        )}
        <span 
          className={cn(
            "text-4xl font-mono font-bold",
            isPositive ? "text-emerald-400" : "text-red-400"
          )}
        >
          {isPositive ? '+' : ''}{dailyPnL.toLocaleString('en-US', { 
            style: 'currency', 
            currency: 'USD',
            minimumFractionDigits: 2
          })}
        </span>
      </div>
      <p className={cn(
        "text-lg font-semibold mt-1",
        isPositive ? "text-emerald-400/70" : "text-red-400/70"
      )}>
        {isPositive ? '+' : ''}{percentChange.toFixed(2)}%
      </p>
    </div>
  );
}
