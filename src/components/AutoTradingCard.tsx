import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Bot, Play, Square, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';

interface AutoTradingCardProps {
  isEnabled: boolean;
  onToggle: (enabled: boolean) => void;
  selectedStrategy: string | null;
  isConnected: boolean;
}

export function AutoTradingCard({ isEnabled, onToggle, selectedStrategy, isConnected }: AutoTradingCardProps) {
  const handleToggle = (enabled: boolean) => {
    if (!isConnected) {
      toast({
        title: "Not Connected",
        description: "Please connect your Alpaca API keys first.",
        variant: "destructive",
      });
      return;
    }

    if (!selectedStrategy && enabled) {
      toast({
        title: "No Strategy Selected",
        description: "Please select a trading strategy first.",
        variant: "destructive",
      });
      return;
    }

    onToggle(enabled);
    
    toast({
      title: enabled ? "Auto-Trading Started" : "Auto-Trading Stopped",
      description: enabled 
        ? "The bot will check for trade opportunities every 5 minutes."
        : "Auto-trading has been disabled.",
    });
  };

  return (
    <Card className={cn(
      "glass overflow-hidden transition-all duration-300",
      isEnabled && "border-primary glow-primary"
    )}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Bot className="w-4 h-4" />
          Auto-Trading
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={cn(
                "p-3 rounded-lg transition-colors",
                isEnabled ? "bg-primary text-primary-foreground" : "bg-muted"
              )}>
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <p className="font-semibold">Trading Bot</p>
                <p className="text-xs text-muted-foreground">
                  {isEnabled ? 'Running every 5 minutes' : 'Currently stopped'}
                </p>
              </div>
            </div>
            <Switch
              checked={isEnabled}
              onCheckedChange={handleToggle}
            />
          </div>

          {isEnabled && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10 border border-primary/20 animate-fade-in">
              <Clock className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary">Next check in 4:32</span>
            </div>
          )}

          {!selectedStrategy && !isEnabled && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-warning/10 border border-warning/20">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <span className="text-sm text-warning">Select a strategy to enable auto-trading</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant={isEnabled ? "secondary" : "default"}
              className="gap-2"
              onClick={() => handleToggle(true)}
              disabled={isEnabled || !isConnected}
            >
              <Play className="w-4 h-4" />
              Start
            </Button>
            <Button
              variant={isEnabled ? "destructive" : "secondary"}
              className="gap-2"
              onClick={() => handleToggle(false)}
              disabled={!isEnabled}
            >
              <Square className="w-4 h-4" />
              Stop
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
