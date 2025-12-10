import { TrendingUp, TrendingDown, Wallet, DollarSign, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AccountInfo } from '@/lib/types';
import { cn } from '@/lib/utils';

interface PortfolioCardProps {
  account: AccountInfo;
  isLoading?: boolean;
}

export function PortfolioCard({ account, isLoading }: PortfolioCardProps) {
  const isPositive = account.dayChange >= 0;

  return (
    <Card className="glass overflow-hidden">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Wallet className="w-4 h-4" />
          Portfolio Value
          {isLoading && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div>
            <p className="text-3xl font-bold font-mono">
              ${account.portfolioValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </p>
            <div className={cn(
              "flex items-center gap-1 mt-1",
              isPositive ? "text-success" : "text-destructive"
            )}>
              {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span className="font-mono text-sm font-medium">
                {isPositive ? '+' : ''}${account.dayChange.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
              <span className="font-mono text-sm">
                ({isPositive ? '+' : ''}{account.dayChangePercent.toFixed(2)}%)
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
            <div>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <DollarSign className="w-3 h-3" /> Cash
              </p>
              <p className="font-mono font-semibold">
                ${account.cash.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Buying Power</p>
              <p className="font-mono font-semibold">
                ${account.buyingPower.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
