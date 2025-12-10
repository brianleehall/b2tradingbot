import { Settings, Moon, Sun, Zap, ZapOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface HeaderProps {
  isDark: boolean;
  onThemeToggle: () => void;
  isConnected: boolean;
  isPaperMode: boolean;
  onSettingsClick: () => void;
  onSignOut: () => void;
}

export function Header({ 
  isDark, 
  onThemeToggle, 
  isConnected, 
  isPaperMode,
  onSettingsClick,
  onSignOut
}: HeaderProps) {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-primary/20 rounded-lg flex items-center justify-center">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold">ORB Trading Bot</h1>
            <p className="text-xs text-muted-foreground">5-Minute Opening Range Breakout</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Badge 
            variant={isConnected ? 'default' : 'secondary'}
            className={isConnected 
              ? isPaperMode 
                ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              : "bg-muted text-muted-foreground"
            }
          >
            {isConnected ? (
              <>
                <Zap className="h-3 w-3 mr-1" />
                {isPaperMode ? 'Paper' : 'Live'}
              </>
            ) : (
              <>
                <ZapOff className="h-3 w-3 mr-1" />
                Disconnected
              </>
            )}
          </Badge>
          
          <Button variant="ghost" size="icon" onClick={onThemeToggle}>
            {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </Button>
          
          <Button variant="ghost" size="icon" onClick={onSettingsClick}>
            <Settings className="h-5 w-5" />
          </Button>
          
          <Button variant="ghost" size="sm" onClick={onSignOut}>
            Sign Out
          </Button>
        </div>
      </div>
    </header>
  );
}
