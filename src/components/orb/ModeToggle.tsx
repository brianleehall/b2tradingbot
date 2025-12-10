import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ModeToggleProps {
  isPaperMode: boolean;
  onToggle: (isPaper: boolean) => void;
  disabled?: boolean;
}

export function ModeToggle({ isPaperMode, onToggle, disabled }: ModeToggleProps) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-semibold">Trading Mode</span>
          <Badge 
            variant={isPaperMode ? 'secondary' : 'destructive'}
            className={cn(
              "text-sm px-3 py-1",
              isPaperMode 
                ? "bg-blue-500/20 text-blue-400 border-blue-500/30" 
                : "bg-red-500/20 text-red-400 border-red-500/30"
            )}
          >
            {isPaperMode ? 'PAPER' : 'LIVE'}
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <span className={cn(
            "text-sm font-medium",
            isPaperMode ? "text-blue-400" : "text-muted-foreground"
          )}>
            Paper
          </span>
          <Switch
            checked={!isPaperMode}
            onCheckedChange={(checked) => onToggle(!checked)}
            disabled={disabled}
          />
          <span className={cn(
            "text-sm font-medium",
            !isPaperMode ? "text-red-400" : "text-muted-foreground"
          )}>
            Live
          </span>
        </div>
      </div>
      {!isPaperMode && (
        <p className="text-red-400 text-sm mt-2 font-medium">
          ⚠️ LIVE MODE - Real money at risk
        </p>
      )}
    </div>
  );
}
