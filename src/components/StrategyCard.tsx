import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Strategy } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Cpu, TrendingUp, Bitcoin, CheckCircle2 } from 'lucide-react';

interface StrategyCardProps {
  strategies: Strategy[];
  selectedStrategy: string | null;
  onSelectStrategy: (strategyId: string) => void;
}

export function StrategyCard({ strategies, selectedStrategy, onSelectStrategy }: StrategyCardProps) {
  return (
    <Card className="glass">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Cpu className="w-4 h-4" />
          Trading Strategies
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {strategies.map((strategy) => {
            const isSelected = selectedStrategy === strategy.id;
            const Icon = strategy.type === 'crypto' ? Bitcoin : TrendingUp;
            
            return (
              <button
                key={strategy.id}
                onClick={() => onSelectStrategy(strategy.id)}
                className={cn(
                  "w-full p-4 rounded-lg text-left transition-all duration-200",
                  "border-2",
                  isSelected
                    ? "border-primary bg-primary/10 glow-primary"
                    : "border-transparent bg-secondary/50 hover:bg-secondary hover:border-border"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex gap-3">
                    <div className={cn(
                      "p-2 rounded-lg",
                      isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{strategy.name}</p>
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase",
                          strategy.type === 'crypto' 
                            ? "bg-warning/20 text-warning" 
                            : "bg-primary/20 text-primary"
                        )}>
                          {strategy.type}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {strategy.description}
                      </p>
                    </div>
                  </div>
                  {isSelected && (
                    <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
