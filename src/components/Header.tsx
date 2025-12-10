import { Bot, Settings, Sun, Moon, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  isConnected: boolean;
  onDisconnect: () => void;
}

export function Header({ theme, onToggleTheme, onOpenSettings, isConnected, onDisconnect }: HeaderProps) {
  return (
    <header className="glass sticky top-0 z-50 border-b border-border/50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10 glow-primary">
            <Bot className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-lg">TradingBot</h1>
            <p className="text-xs text-muted-foreground">Paper Trading Mode</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConnected && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 border border-success/20">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-medium text-success">Connected</span>
            </div>
          )}

          <Button variant="ghost" size="icon" onClick={onToggleTheme}>
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>

          <Button variant="ghost" size="icon" onClick={onOpenSettings}>
            <Settings className="w-5 h-5" />
          </Button>

          {isConnected && (
            <Button variant="ghost" size="icon" onClick={onDisconnect}>
              <LogOut className="w-5 h-5" />
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
