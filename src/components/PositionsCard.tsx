import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Position } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Briefcase, TrendingUp, TrendingDown, Loader2 } from 'lucide-react';

interface PositionsCardProps {
  positions: Position[];
  isLoading?: boolean;
}

export function PositionsCard({ positions, isLoading }: PositionsCardProps) {
  return (
    <Card className="glass">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Briefcase className="w-4 h-4" />
          Open Positions
          {isLoading && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {positions.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No open positions</p>
          ) : (
            positions.map((position) => {
              const isPositive = position.unrealizedPl >= 0;
              return (
                <div
                  key={position.symbol}
                  className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <span className="font-mono text-xs font-bold text-primary">
                        {position.symbol.slice(0, 3)}
                      </span>
                    </div>
                    <div>
                      <p className="font-semibold text-sm">{position.symbol}</p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {position.qty} @ ${position.avgEntryPrice.toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-mono font-semibold text-sm">
                      ${position.marketValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </p>
                    <div className={cn(
                      "flex items-center justify-end gap-1 text-xs",
                      isPositive ? "text-success" : "text-destructive"
                    )}>
                      {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      <span className="font-mono">
                        {isPositive ? '+' : ''}{position.unrealizedPlPercent.toFixed(2)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </CardContent>
    </Card>
  );
}
