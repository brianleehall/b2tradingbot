import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DayTradingStrategy } from '@/lib/dayTradingStrategies';
import { cn } from '@/lib/utils';
import { TrendingUp, Activity, Zap, CheckCircle2, Clock, Target, Shield } from 'lucide-react';

interface DayTradingStrategyCardProps {
  strategies: DayTradingStrategy[];
  selectedStrategy: string | null;
  onSelectStrategy: (strategyId: string) => void;
}

const iconMap = {
  breakout: TrendingUp,
  vwap: Activity,
  gap: Zap,
};

export function DayTradingStrategyCard({ 
  strategies, 
  selectedStrategy, 
  onSelectStrategy 
}: DayTradingStrategyCardProps) {
  return (
    <Card className="glass">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Target className="w-4 h-4" />
          Day Trading Strategies
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3">
          {strategies.map((strategy) => {
            const isSelected = selectedStrategy === strategy.id;
            const Icon = iconMap[strategy.icon];
            
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
                  <div className="flex gap-3 flex-1">
                    <div className={cn(
                      "p-2 rounded-lg shrink-0",
                      isSelected ? "bg-primary text-primary-foreground" : "bg-muted"
                    )}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{strategy.shortName}</p>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-primary/20 text-primary">
                          DAY TRADE
                        </span>
                      </div>
                      <p className="text-xs font-medium text-foreground/80 mt-0.5">
                        {strategy.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {strategy.description}
                      </p>
                      
                      {isSelected && (
                        <div className="mt-3 space-y-2 animate-fade-in">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Clock className="w-3 h-3" />
                            <span>{strategy.timeWindow}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Shield className="w-3 h-3" />
                            <span>Stop: {strategy.riskParams.stopLossType}</span>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {strategy.defaultSymbols.length > 0 ? (
                              strategy.defaultSymbols.map(sym => (
                                <span 
                                  key={sym}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono"
                                >
                                  {sym}
                                </span>
                              ))
                            ) : (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning">
                                Dynamic from scanner
                              </span>
                            )}
                          </div>
                        </div>
                      )}
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
