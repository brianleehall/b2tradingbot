// ORB Trading Configuration
export const ORB_TICKERS = ['NVDA', 'TSLA', 'AMD', 'META', 'AAPL', 'SMCI', 'SPY', 'QQQ'] as const;

export type ORBTicker = typeof ORB_TICKERS[number];

export interface ORBRange {
  ticker: string;
  high: number;
  low: number;
  timestamp: string;
  isSet: boolean;
}

export interface ORBPosition {
  ticker: string;
  side: 'long' | 'short';
  entryPrice: number;
  qty: number;
  stopLoss: number;
  target1: number; // 2R
  target2: number; // 4R
  partialFilled: boolean;
  unrealizedPnL: number;
}

export interface ORBTrade {
  id: string;
  ticker: string;
  side: 'long' | 'short';
  entryPrice: number;
  exitPrice: number | null;
  qty: number;
  pnl: number | null;
  status: 'open' | 'partial' | 'closed';
  timestamp: string;
}

export interface ORBState {
  activeTickers: ORBTicker[];
  orbRanges: Record<string, ORBRange>;
  positions: ORBPosition[];
  trades: ORBTrade[];
  dailyPnL: number;
  tradesToday: number;
  isTrading: boolean;
  isPaperMode: boolean;
  isTradingLocked: boolean;
  lockReason: string | null;
}

// Time utilities (ET timezone)
export function getETTime(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

export function isMarketOpen(): boolean {
  const et = getETTime();
  const day = et.getDay();
  if (day === 0 || day === 6) return false; // Weekend
  
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const time = hours * 60 + minutes;
  
  return time >= 9 * 60 + 30 && time < 16 * 60; // 9:30 AM - 4:00 PM ET
}

export function isORBTradingWindow(): boolean {
  const et = getETTime();
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const time = hours * 60 + minutes;
  
  // Trading window: 9:29 AM - 10:30 AM ET
  return time >= 9 * 60 + 29 && time <= 10 * 60 + 30;
}

export function getSecondsUntilORB(): number {
  const et = getETTime();
  const target = new Date(et);
  target.setHours(9, 30, 0, 0);
  
  // If already past 9:30, calculate for next trading day
  if (et >= target) {
    target.setDate(target.getDate() + 1);
    // Skip weekends
    while (target.getDay() === 0 || target.getDay() === 6) {
      target.setDate(target.getDate() + 1);
    }
  }
  
  return Math.max(0, Math.floor((target.getTime() - et.getTime()) / 1000));
}

export function formatCountdown(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// Risk calculations
export const MAX_RISK_PER_TRADE = 0.01; // 1%
export const MAX_TRADES_PER_DAY = 3;
export const MAX_DAILY_LOSS_PERCENT = 0.03; // 3%
export const ORB_END_TIME = 10 * 60 + 30; // 10:30 AM in minutes
