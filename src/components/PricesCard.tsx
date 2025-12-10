import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PriceData } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Activity, TrendingUp, TrendingDown } from 'lucide-react';

interface PricesCardProps {
  prices: PriceData[];
}

export function PricesCard({ prices }: PricesCardProps) {
  return (
    <Card className="glass">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Market Prices
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {prices.map((price) => {
            const isPositive = price.change >= 0;
            return (
              <div
                key={price.symbol}
                className="p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-sm">{price.symbol}</span>
                  {isPositive ? (
                    <TrendingUp className="w-3 h-3 text-success" />
                  ) : (
                    <TrendingDown className="w-3 h-3 text-destructive" />
                  )}
                </div>
                <p className="font-mono font-bold text-lg">
                  ${price.price.toLocaleString('en-US', { 
                    minimumFractionDigits: price.price < 10 ? 2 : 0,
                    maximumFractionDigits: 2
                  })}
                </p>
                <p className={cn(
                  "font-mono text-xs",
                  isPositive ? "text-success" : "text-destructive"
                )}>
                  {isPositive ? '+' : ''}{price.changePercent.toFixed(2)}%
                </p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
