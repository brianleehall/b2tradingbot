import { AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Clock, Shield, Zap, Target } from 'lucide-react';
import { MAX_GROWTH_CONFIG } from '@/lib/orbConfig';

interface RulesCardProps {
  tradesToday: number;
  dailyPnLPercent: number;
  vixLevel?: number;
  isExtendedSession?: boolean;
}

export function RulesCard({ tradesToday, dailyPnLPercent, vixLevel = 20, isExtendedSession = false }: RulesCardProps) {
  const maxTradesHit = tradesToday >= MAX_GROWTH_CONFIG.MAX_TRADES_PER_DAY;
  const dailyLossHit = dailyPnLPercent <= -(MAX_GROWTH_CONFIG.MAX_DAILY_LOSS_PERCENT * 100);
  const vixShortsOnly = vixLevel > MAX_GROWTH_CONFIG.VIX_SHORTS_ONLY;
  const vixDoubleSize = vixLevel < MAX_GROWTH_CONFIG.VIX_DOUBLE_SIZE;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        Max-Growth Rules
      </h3>
      
      {/* Session Info */}
      <div className="bg-muted/30 rounded-lg p-3">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground flex items-center gap-2">
            <Clock className="h-4 w-4" />
            Session Mode
          </span>
          {isExtendedSession ? (
            <span className="text-emerald-400 font-medium">Extended → 11:30 AM</span>
          ) : (
            <span className="text-muted-foreground">Standard → 10:15 AM</span>
          )}
        </div>
      </div>

      {/* VIX Status */}
      <div className="bg-muted/30 rounded-lg p-3">
        <div className="flex items-center justify-between text-sm mb-2">
          <span className="text-muted-foreground flex items-center gap-2">
            <Zap className="h-4 w-4" />
            VIX Level
          </span>
          <span className={`font-mono font-bold ${vixShortsOnly ? 'text-red-400' : vixDoubleSize ? 'text-emerald-400' : 'text-muted-foreground'}`}>
            {vixLevel.toFixed(1)}
          </span>
        </div>
        {vixShortsOnly && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 rounded px-2 py-1">
            <TrendingDown className="h-3 w-3" />
            VIX &gt;25 → SHORTS ONLY
          </div>
        )}
        {vixDoubleSize && (
          <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-400/10 rounded px-2 py-1">
            <TrendingUp className="h-3 w-3" />
            VIX &lt;18 → 2x SIZE on #1
          </div>
        )}
      </div>

      {/* Core Rules */}
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Tiered sizing (#1=2%, #2-4=1%)</span>
          <CheckCircle className="h-4 w-4 text-emerald-400" />
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Max {MAX_GROWTH_CONFIG.MAX_TRADES_PER_DAY} trades/day</span>
          {maxTradesHit ? (
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          ) : (
            <span className="text-muted-foreground">{tradesToday}/{MAX_GROWTH_CONFIG.MAX_TRADES_PER_DAY}</span>
          )}
        </div>
        
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Auto-stop at 3% daily loss</span>
          {dailyLossHit ? (
            <AlertTriangle className="h-4 w-4 text-red-400" />
          ) : (
            <span className="text-muted-foreground">{dailyPnLPercent.toFixed(1)}%</span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Cool-off: skip &gt;8% pre-market</span>
          <CheckCircle className="h-4 w-4 text-emerald-400" />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">+1.5R profit → 9 EMA trail</span>
          <Target className="h-4 w-4 text-primary" />
        </div>

        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Re-entry window: 9:50-10:05 AM</span>
          <CheckCircle className="h-4 w-4 text-emerald-400" />
        </div>
      </div>

      {/* Dynamic Session Rule */}
      <div className="border-t border-border pt-3 mt-3">
        <div className="text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">Dynamic Session Stop:</p>
          <p>• At 10:15 AM: If any position is +1.5R → extend to 11:30 AM with 9 EMA trail</p>
          <p>• Otherwise → flatten everything at 10:15 AM sharp</p>
        </div>
      </div>
    </div>
  );
}
