import { useState, useEffect } from 'react';
import { getSecondsUntilORB, formatCountdown, isORBTradingWindow, getETTime } from '@/lib/orbConfig';
import { Clock } from 'lucide-react';

export function CountdownTimer() {
  const [seconds, setSeconds] = useState(getSecondsUntilORB());
  const [currentTime, setCurrentTime] = useState(getETTime());
  const isTradingWindow = isORBTradingWindow();

  useEffect(() => {
    const interval = setInterval(() => {
      setSeconds(getSecondsUntilORB());
      setCurrentTime(getETTime());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit',
      hour12: true 
    });
  };

  return (
    <div className="bg-card border border-border rounded-xl p-6 text-center">
      <div className="flex items-center justify-center gap-2 text-muted-foreground mb-2">
        <Clock className="h-4 w-4" />
        <span className="text-sm font-medium">ET Time: {formatTime(currentTime)}</span>
      </div>
      
      {isTradingWindow ? (
        <div className="space-y-2">
          <p className="text-emerald-400 text-lg font-semibold animate-pulse">
            ORB TRADING WINDOW ACTIVE
          </p>
          <p className="text-muted-foreground text-sm">9:30 AM - 10:30 AM ET</p>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-muted-foreground text-sm">Next ORB Session</p>
          <p className="text-5xl font-mono font-bold text-primary tracking-wider">
            {formatCountdown(seconds)}
          </p>
          <p className="text-muted-foreground text-sm">until 9:30 AM ET</p>
        </div>
      )}
    </div>
  );
}
