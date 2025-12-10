import { Button } from '@/components/ui/button';
import { Play, Square, AlertTriangle } from 'lucide-react';
import { isORBTradingWindow } from '@/lib/orbConfig';
import { cn } from '@/lib/utils';

interface ControlButtonsProps {
  isTrading: boolean;
  isConnected: boolean;
  isTradingLocked: boolean;
  lockReason: string | null;
  onStart: () => void;
  onStop: () => void;
}

export function ControlButtons({ 
  isTrading, 
  isConnected, 
  isTradingLocked,
  lockReason,
  onStart, 
  onStop 
}: ControlButtonsProps) {
  const inTradingWindow = isORBTradingWindow();
  const canStart = isConnected && inTradingWindow && !isTradingLocked && !isTrading;

  return (
    <div className="space-y-4">
      {isTradingLocked && lockReason && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <span className="text-red-400 text-sm font-medium">{lockReason}</span>
        </div>
      )}
      
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Button
          size="lg"
          onClick={onStart}
          disabled={!canStart}
          className={cn(
            "h-20 text-xl font-bold transition-all",
            canStart 
              ? "bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/25" 
              : "bg-muted text-muted-foreground"
          )}
        >
          <Play className="h-8 w-8 mr-3" />
          START ORB TRADING
        </Button>
        
        <Button
          size="lg"
          onClick={onStop}
          disabled={!isTrading}
          className={cn(
            "h-20 text-xl font-bold transition-all",
            isTrading 
              ? "bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-500/25" 
              : "bg-muted text-muted-foreground"
          )}
        >
          <Square className="h-8 w-8 mr-3" />
          FLATTEN & STOP
        </Button>
      </div>
      
      {!isConnected && (
        <p className="text-center text-amber-400 text-sm">
          Connect your Alpaca API to start trading
        </p>
      )}
      
      {!inTradingWindow && isConnected && (
        <p className="text-center text-muted-foreground text-sm">
          START button active 9:29 AM - 10:30 AM ET only
        </p>
      )}
    </div>
  );
}
