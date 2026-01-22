import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bot, Play, Square, Clock, AlertTriangle, Zap, Shield } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { getMarketStatus } from '@/lib/dayTradingStrategies';

interface AutoTradingControlCardProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  onManualStop?: () => void; // Called when user manually stops trading
  selectedStrategy: string | null;
  isConnected: boolean;
  tradesToday: number;
  maxTrades: number;
  isLocked: boolean;
}

export function AutoTradingControlCard({ 
  isEnabled, 
  onToggle,
  onManualStop,
  selectedStrategy, 
  isConnected,
  tradesToday,
  maxTrades,
  isLocked
}: AutoTradingControlCardProps) {
  const [countdown, setCountdown] = useState(30);
  const [marketStatus, setMarketStatus] = useState(getMarketStatus());

  useEffect(() => {
    const statusInterval = setInterval(() => {
      setMarketStatus(getMarketStatus());
    }, 60000);
    return () => clearInterval(statusInterval);
  }, []);

  useEffect(() => {
    if (!isEnabled) {
      setCountdown(30);
      return;
    }

    const interval = setInterval(() => {
      setCountdown(prev => (prev <= 1 ? 30 : prev - 1));
    }, 1000);

    return () => clearInterval(interval);
  }, [isEnabled]);

  const handleStart = () => {
    if (!isConnected) {
      toast({
        title: "Not Connected",
        description: "Please connect your Alpaca API keys first.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedStrategy) {
      toast({
        title: "No Strategy Selected",
        description: "Please select a day trading strategy first.",
        variant: "destructive",
      });
      return;
    }

    if (isLocked) {
      toast({
        title: "Trading Locked",
        description: "Daily loss limit reached. Trading is locked for today.",
        variant: "destructive",
      });
      return;
    }

    if (tradesToday >= maxTrades) {
      toast({
        title: "Max Trades Reached",
        description: `You've reached your daily limit of ${maxTrades} trades.`,
        variant: "destructive",
      });
      return;
    }

    onToggle(true);
    toast({
      title: "Auto-Trading Started",
      description: "Scanning for setups every 30 seconds during market hours.",
    });
  };

  const handleStop = () => {
    onToggle(false);
    onManualStop?.(); // Notify parent about manual stop
    toast({
      title: "Auto-Trading Stopped",
      description: "Bot has been manually stopped. Will remain stopped until you click START again.",
    });
  };

  const canStart = isConnected && selectedStrategy && !isLocked && tradesToday < maxTrades;

  return (
    <Card className={cn(
      "glass overflow-hidden transition-all duration-300",
      isEnabled && "border-success glow-success",
      isLocked && "border-destructive"
    )}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Bot className="w-4 h-4" />
          Auto-Trading Control
          <span className={cn(
            "ml-auto text-[10px] px-2 py-0.5 rounded-full font-medium",
            marketStatus === 'open' && "bg-success/20 text-success",
            marketStatus === 'pre-market' && "bg-warning/20 text-warning",
            marketStatus === 'closed' && "bg-muted text-muted-foreground"
          )}>
            {marketStatus === 'open' && 'MARKET OPEN'}
            {marketStatus === 'pre-market' && 'PRE-MARKET'}
            {marketStatus === 'closed' && 'MARKET CLOSED'}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Status Display */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/50">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-3 h-3 rounded-full",
              isEnabled ? "bg-success animate-pulse" : "bg-muted-foreground"
            )} />
            <div>
              <p className="font-semibold text-sm">
                {isEnabled ? 'Bot Active' : 'Bot Stopped'}
              </p>
              <p className="text-xs text-muted-foreground">
                {isEnabled ? 'Scanning every 30 seconds' : 'Click START to begin'}
              </p>
            </div>
          </div>
          {isEnabled && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded bg-primary/10 border border-primary/20">
              <Clock className="w-4 h-4 text-primary" />
              <span className="font-mono text-sm font-semibold text-primary">
                {countdown}s
              </span>
            </div>
          )}
        </div>

        {/* Warnings */}
        {isLocked && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
            <AlertTriangle className="w-4 h-4 text-destructive" />
            <span className="text-sm text-destructive font-medium">
              Daily loss limit reached - Trading locked
            </span>
          </div>
        )}

        {tradesToday >= maxTrades && !isLocked && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
            <Shield className="w-4 h-4 text-warning" />
            <span className="text-sm text-warning">
              Max trades reached ({tradesToday}/{maxTrades})
            </span>
          </div>
        )}

        {!selectedStrategy && !isEnabled && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
            <AlertTriangle className="w-4 h-4 text-warning" />
            <span className="text-sm text-warning">
              Select a strategy to enable auto-trading
            </span>
          </div>
        )}

        {/* Big Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            className={cn(
              "h-14 text-lg font-bold gap-2 transition-all",
              !isEnabled && canStart && "bg-success hover:bg-success/90 text-success-foreground glow-success"
            )}
            onClick={handleStart}
            disabled={isEnabled || !canStart}
          >
            <Play className="w-6 h-6" />
            START
          </Button>
          <Button
            size="lg"
            variant="destructive"
            className={cn(
              "h-14 text-lg font-bold gap-2 transition-all",
              isEnabled && "glow-destructive"
            )}
            onClick={handleStop}
            disabled={!isEnabled}
          >
            <Square className="w-6 h-6" />
            STOP
          </Button>
        </div>

        {/* Quick Stats */}
        <div className="flex items-center justify-center gap-4 pt-2 border-t border-border/50">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Zap className="w-3 h-3" />
            <span>30s scan interval</span>
          </div>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Shield className="w-3 h-3" />
            <span>1% risk per trade</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
