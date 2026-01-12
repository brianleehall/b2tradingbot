import { AlertTriangle, CheckCircle, TrendingUp, TrendingDown, Clock, Shield, Zap, Target } from 'lucide-react';
import { MAX_GROWTH_CONFIG } from '@/lib/orbConfig';
import { cn } from '@/lib/utils';

interface RulesCardProps {
  tradesToday: number;
  dailyPnLPercent: number;
  vixLevel?: number;
  isExtendedSession?: boolean;
  marketRegime?: 'bull' | 'elevated_vol' | 'bear';
  spyPrice?: number;
  spy200SMA?: number;
  isAggressiveBull?: boolean;
}

const regimeConfig = {
  bull: {
    label: 'Bull Regime',
    color: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    description: 'SPY > 200-SMA & VIX ≤25 → Longs + Shorts allowed',
  },
  elevated_vol: {
    label: 'Elevated Vol',
    color: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    description: 'SPY > 200-SMA but VIX >25 → Shorts only',
  },
  bear: {
    label: 'Bear Regime',
    color: 'bg-red-500/20 text-red-400 border-red-500/30',
    description: 'SPY < 200-SMA → Shorts only',
  },
};

export function RulesCard({ 
  tradesToday, 
  dailyPnLPercent, 
  vixLevel = 20, 
  isExtendedSession = false,
  marketRegime = 'bull',
  spyPrice = 0,
  spy200SMA = 0,
  isAggressiveBull = false,
}: RulesCardProps) {
  const maxTradesHit = tradesToday >= MAX_GROWTH_CONFIG.MAX_TRADES_PER_DAY;
  const dailyLossHit = dailyPnLPercent <= -(MAX_GROWTH_CONFIG.MAX_DAILY_LOSS_PERCENT * 100);
  const regime = regimeConfig[marketRegime] || regimeConfig.bull;
  const longsAllowed = marketRegime === 'bull';
  
  // Aggressive Bull Mode: SPY > 200-SMA AND VIX ≤ 18
  const showAggressiveBull = isAggressiveBull || (spyPrice > spy200SMA && vixLevel <= MAX_GROWTH_CONFIG.VIX_DOUBLE_SIZE);

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-4">
      <h3 className="text-lg font-semibold flex items-center gap-2">
        <Shield className="h-5 w-5 text-primary" />
        Max-Growth Rules
      </h3>

      {/* Regime Badge */}
      <div className={cn(
        "rounded-lg p-3 border",
        regime.color
      )}>
        <div className="flex items-center justify-between mb-2">
          <span className="font-bold text-sm">{regime.label}</span>
          {longsAllowed ? (
            <span className="text-xs px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400">
              LONGS + SHORTS
            </span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400">
              SHORTS ONLY
            </span>
          )}
        </div>
        <p className="text-xs opacity-80">{regime.description}</p>
        {spyPrice > 0 && spy200SMA > 0 && (
          <div className="flex items-center gap-3 mt-2 text-xs font-mono">
            <span>SPY: ${spyPrice.toFixed(2)}</span>
            <span className="opacity-60">200-SMA: ${spy200SMA.toFixed(2)}</span>
          </div>
        )}
      </div>
      
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
          <span className={cn(
            "font-mono font-bold",
            vixLevel > 25 ? 'text-red-400' : vixLevel <= 18 ? 'text-emerald-400' : 'text-muted-foreground'
          )}>
            {vixLevel.toFixed(1)}
          </span>
        </div>
        {showAggressiveBull && (
          <div className="flex items-center gap-2 text-xs text-amber-300 bg-amber-400/15 rounded px-2 py-1 border border-amber-500/30">
            <TrendingUp className="h-3 w-3" />
            <span className="font-semibold">Aggressive Bull Mode – 3% risk on #1</span>
          </div>
        )}
      </div>

      {/* Core Rules */}
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Risk: 1–3% tiered (2–3% #1 in bull)</span>
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
