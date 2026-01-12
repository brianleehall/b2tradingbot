// ORB Trading Configuration - Maximum Growth Version
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
  rank?: number;
  riskPercent?: number;
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
  rank?: number;
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
  // New max-growth state
  vixLevel: number;
  isExtendedSession: boolean;
  flattenedWinners: string[];
  sessionEndTime: string;
}

// =====================
// MAXIMUM GROWTH CONFIG
// =====================
export const MAX_GROWTH_CONFIG = {
  // Session timing (minutes from midnight ET)
  ORB_START: 9 * 60 + 30,      // 9:30 AM
  TRADING_START: 9 * 60 + 29,  // 9:29 AM
  FIRST_FLATTEN: 10 * 60 + 15, // 10:15 AM - Dynamic decision point
  EXTENDED_END: 11 * 60 + 30,  // 11:30 AM max
  REENTRY_START: 9 * 60 + 50,  // 9:50 AM
  REENTRY_END: 10 * 60 + 5,    // 10:05 AM
  
  // Risk management
  TIER1_RISK: 0.02,            // 2% for #1 ranked stock (default)
  TIER1_AGGRESSIVE_RISK: 0.03, // 3% for #1 in aggressive bull mode
  TIER2_RISK: 0.01,            // 1% for #2-4
  MAX_TRADES_PER_DAY: 3,
  MAX_DAILY_LOSS_PERCENT: 0.03,
  
  // Filters
  VIX_SHORTS_ONLY: 25,         // VIX > 25 = shorts only
  VIX_DOUBLE_SIZE: 18,         // VIX < 18 = 2x size on #1
  PREMARKET_COOLOFF: 8,        // Skip if >8% pre-market
  LOW_VOLUME_THRESHOLD: 0.8,   // 80% of 10-day avg
  PROFIT_EXTENSION_R: 1.5,     // +1.5R to extend session
  
  // Volume confirmation
  MIN_VOLUME_RATIO: 1.5,       // 150% of avg for signal
};

// Time utilities (ET timezone)
export function getETTime(): Date {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
}

export function isMarketOpen(): boolean {
  const et = getETTime();
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const time = hours * 60 + minutes;
  
  return time >= 9 * 60 + 30 && time < 16 * 60;
}

export function isORBTradingWindow(): boolean {
  const et = getETTime();
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const time = hours * 60 + minutes;
  
  // Trading window: 9:29 AM - 11:30 AM ET (extended session possible)
  return time >= MAX_GROWTH_CONFIG.TRADING_START && time <= MAX_GROWTH_CONFIG.EXTENDED_END;
}

export function getSecondsUntilORB(): number {
  const et = getETTime();
  const target = new Date(et);
  target.setHours(9, 30, 0, 0);
  
  if (et >= target) {
    target.setDate(target.getDate() + 1);
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

export function getETTimeMinutes(): number {
  const et = getETTime();
  return et.getHours() * 60 + et.getMinutes();
}

export function formatETTime(): string {
  const et = getETTime();
  return et.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
}

// Legacy exports for compatibility
export const MAX_RISK_PER_TRADE = MAX_GROWTH_CONFIG.TIER2_RISK;
export const MAX_TRADES_PER_DAY = MAX_GROWTH_CONFIG.MAX_TRADES_PER_DAY;
export const MAX_DAILY_LOSS_PERCENT = MAX_GROWTH_CONFIG.MAX_DAILY_LOSS_PERCENT;
export const ORB_END_TIME = MAX_GROWTH_CONFIG.FIRST_FLATTEN;
