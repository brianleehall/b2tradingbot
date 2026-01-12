import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { 
  TrendingUp, 
  Clock, 
  Shield, 
  AlertTriangle, 
  TrendingDown, 
  Hash,
  Target
} from 'lucide-react';
import { RiskSettings } from '@/lib/dayTradingStrategies';
import { cn } from '@/lib/utils';

interface ORBStrategyCardProps {
  activeORBTickers?: string[];
  riskSettings: RiskSettings;
  onRiskSettingsChange: (settings: Partial<RiskSettings>) => void;
}

export function ORBStrategyCard({ 
  activeORBTickers = [],
  riskSettings,
  onRiskSettingsChange
}: ORBStrategyCardProps) {
  return (
    <Card className="glass">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Target className="w-4 h-4" />
          ORB Strategy & Risk
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ORB Strategy Info */}
        <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-primary text-primary-foreground shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-semibold text-sm">ORB</p>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-primary/20 text-primary">
                  ACTIVE
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                5-Minute Opening Range Breakout
              </p>
              <div className="flex flex-col gap-1.5 mt-2 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>9:30 – 11:30 ET (dynamic: flatten 10:15 unless +1.5R, then trail to 11:30)</span>
                </div>
                <div className="flex items-center gap-1">
                  <Shield className="w-3 h-3" />
                  <span>Stop: Range opposite</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-1 mt-2">
                {activeORBTickers.length > 0 ? (
                  activeORBTickers.map(sym => (
                    <span 
                      key={sym}
                      className="text-[10px] px-1.5 py-0.5 rounded bg-primary/20 text-primary font-mono"
                    >
                      {sym}
                    </span>
                  ))
                ) : (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-warning/20 text-warning">
                    Waiting for auto-selection...
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Risk Settings */}
        <div className="space-y-4 pt-2 border-t border-border">
          {/* Max Risk Per Trade */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-3 h-3 text-warning" />
                <span className="text-xs font-medium">Risk/Trade</span>
              </div>
              <span className="font-mono text-xs font-semibold text-primary">
                1–3% tiered
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">
              2–3% on #1 stock in bull regime • 1% on #2-4
            </p>
          </div>

          {/* Max Trades Per Day */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Hash className="w-3 h-3 text-primary" />
                <span className="text-xs font-medium">Max Trades</span>
              </div>
              <span className="font-mono text-xs font-semibold text-primary">
                {riskSettings.tradesToday}/{riskSettings.maxTradesPerDay}
              </span>
            </div>
            <Slider
              value={[riskSettings.maxTradesPerDay]}
              onValueChange={([value]) => onRiskSettingsChange({ maxTradesPerDay: value })}
              max={10}
              min={1}
              step={1}
              className="w-full"
            />
          </div>

          {/* Daily Loss Limit */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingDown className="w-3 h-3 text-destructive" />
                <span className="text-xs font-medium">Daily Loss Limit</span>
              </div>
              <span className={cn(
                "font-mono text-xs font-semibold",
                riskSettings.isLocked ? "text-destructive" : "text-primary"
              )}>
                {riskSettings.dailyLossLimit}%
              </span>
            </div>
            <Slider
              value={[riskSettings.dailyLossLimit]}
              onValueChange={([value]) => onRiskSettingsChange({ dailyLossLimit: value })}
              max={5}
              min={1}
              step={0.5}
              className="w-full"
            />
          </div>

          {/* Warning if locked */}
          {riskSettings.isLocked && (
            <div className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20 animate-pulse">
              <AlertTriangle className="w-3 h-3 text-destructive shrink-0" />
              <span className="text-xs text-destructive font-medium">
                Trading locked - Daily loss limit reached
              </span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
