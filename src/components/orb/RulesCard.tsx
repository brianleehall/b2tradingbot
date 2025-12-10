import { AlertTriangle, CheckCircle } from 'lucide-react';

interface RulesCardProps {
  tradesToday: number;
  dailyPnLPercent: number;
}

export function RulesCard({ tradesToday, dailyPnLPercent }: RulesCardProps) {
  const maxTradesHit = tradesToday >= 3;
  const dailyLossHit = dailyPnLPercent <= -3;

  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <h3 className="text-lg font-semibold mb-3">Hard Rules</h3>
      <div className="space-y-2 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Max 1% risk per trade</span>
          <CheckCircle className="h-4 w-4 text-emerald-400" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Max 3 trades/day</span>
          {maxTradesHit ? (
            <AlertTriangle className="h-4 w-4 text-amber-400" />
          ) : (
            <span className="text-muted-foreground">{tradesToday}/3</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Auto-stop at 3% loss</span>
          {dailyLossHit ? (
            <AlertTriangle className="h-4 w-4 text-red-400" />
          ) : (
            <span className="text-muted-foreground">{dailyPnLPercent.toFixed(1)}%</span>
          )}
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Trading ends 10:30 AM ET</span>
          <CheckCircle className="h-4 w-4 text-emerald-400" />
        </div>
      </div>
    </div>
  );
}
