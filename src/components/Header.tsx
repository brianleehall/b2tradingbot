import { Settings, Sun, Moon, LogOut, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import logo from '@/assets/logo.png';
interface HeaderProps {
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  isConnected: boolean;
  onDisconnect: () => void;
  onSignOut?: () => void;
  userEmail?: string;
}
export function Header({
  theme,
  onToggleTheme,
  onOpenSettings,
  isConnected,
  onDisconnect,
  onSignOut,
  userEmail
}: HeaderProps) {
  return <header className="glass sticky top-0 z-50 border-b border-border/50">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src={logo} alt="TradingBot Logo" className="h-10 w-10 object-contain" />
          <div>
            <h1 className="font-semibold text-lg">ORB TradingBot</h1>
            <p className="text-xs text-muted-foreground">AI-Powered Auto Trading</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isConnected && <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-success/10 border border-success/20">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs font-medium text-success">Connected</span>
            </div>}

          <Button variant="ghost" size="icon" onClick={onToggleTheme}>
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </Button>

          <Button variant="ghost" size="icon" onClick={onOpenSettings}>
            <Settings className="w-5 h-5" />
          </Button>

          {userEmail && onSignOut && <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <User className="w-5 h-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-sm font-medium truncate">{userEmail}</p>
                </div>
                <DropdownMenuSeparator />
                {isConnected && <DropdownMenuItem onClick={onDisconnect}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Disconnect Alpaca
                  </DropdownMenuItem>}
                <DropdownMenuItem onClick={onSignOut} className="text-destructive">
                  <LogOut className="w-4 h-4 mr-2" />
                  Sign Out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>}
        </div>
      </div>
    </header>;
}