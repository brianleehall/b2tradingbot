import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Shield, AlertTriangle, TrendingDown, Hash } from 'lucide-react';
import { RiskSettings } from '@/lib/dayTradingStrategies';
import { cn } from '@/lib/utils';

interface RiskSettingsCardProps {
  settings: RiskSettings;
  onSettingsChange: (settings: Partial<RiskSettings>) => void;
}

export function RiskSettingsCard({ settings, onSettingsChange }: RiskSettingsCardProps) {
  return (
    <Card className="glass">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Shield className="w-4 h-4" />
          Risk Management
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Max Risk Per Trade */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <span className="text-sm font-medium">Risk Per Trade</span>
            </div>
            <span className="font-mono font-semibold text-primary">
              {settings.maxRiskPerTrade}%
            </span>
          </div>
          <Slider
            value={[settings.maxRiskPerTrade]}
            onValueChange={([value]) => onSettingsChange({ maxRiskPerTrade: value })}
            max={3}
            min={0.5}
            step={0.5}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            Maximum % of account to risk on a single trade
          </p>
        </div>

        {/* Max Trades Per Day */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Hash className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">Max Trades/Day</span>
            </div>
            <span className="font-mono font-semibold text-primary">
              {settings.maxTradesPerDay}
            </span>
          </div>
          <Slider
            value={[settings.maxTradesPerDay]}
            onValueChange={([value]) => onSettingsChange({ maxTradesPerDay: value })}
            max={10}
            min={1}
            step={1}
            className="w-full"
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Daily trade limit (PDT rule aware)
            </p>
            <span className={cn(
              "text-xs font-mono",
              settings.tradesToday >= settings.maxTradesPerDay 
                ? "text-destructive" 
                : "text-muted-foreground"
            )}>
              {settings.tradesToday}/{settings.maxTradesPerDay} today
            </span>
          </div>
        </div>

        {/* Daily Loss Limit */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-destructive" />
              <span className="text-sm font-medium">Daily Loss Limit</span>
            </div>
            <span className={cn(
              "font-mono font-semibold",
              settings.isLocked ? "text-destructive" : "text-primary"
            )}>
              {settings.dailyLossLimit}%
            </span>
          </div>
          <Slider
            value={[settings.dailyLossLimit]}
            onValueChange={([value]) => onSettingsChange({ dailyLossLimit: value })}
            max={5}
            min={1}
            step={0.5}
            className="w-full"
          />
          <p className="text-xs text-muted-foreground">
            Auto-stop trading if daily loss exceeds this %
          </p>
        </div>

        {/* Warning if locked */}
        {settings.isLocked && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20 animate-pulse">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
            <span className="text-sm text-destructive font-medium">
              Trading locked - Daily loss limit reached
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
