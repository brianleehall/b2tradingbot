// Professional Day Trading Strategies for Alpaca Markets

export interface DayTradingStrategy {
  id: string;
  name: string;
  shortName: string;
  description: string;
  details: string[];
  defaultSymbols: string[];
  riskParams: {
    stopLossType: string;
    targets: string[];
  };
  timeWindow: string;
  icon: 'breakout' | 'vwap' | 'gap';
}

export interface RiskSettings {
  maxRiskPerTrade: number; // 1% default
  maxTradesPerDay: number; // 3 default
  dailyLossLimit: number;  // 3% default
  tradesToday: number;
  dailyPnL: number;
  isLocked: boolean;
}

export interface GapStock {
  symbol: string;
  gapPercent: number;
  rvol: number;
  preMarketHigh: number;
  preMarketVolume: number;
  catalyst: string;
  currentPrice: number;
  hasNews: boolean;
}

export interface TradeSignal {
  action: 'BUY' | 'SELL' | 'HOLD';
  symbol: string;
  qty: number;
  entryPrice: number;
  stopLoss: number;
  target1: number;
  target2: number;
  confidence: number;
  reason: string;
  strategy: string;
  timestamp: string;
}

export const dayTradingStrategies: DayTradingStrategy[] = [
  {
    id: 'orb-5min',
    name: '5-Minute Opening Range Breakout',
    shortName: 'ORB',
    description: 'Trade breakouts from the first 5-minute candle after market open with volume confirmation.',
    details: [
      'Auto-mark high/low of first 5-min candle at 9:30 ET',
      'Buy when price breaks high with volume > 150% average',
      'Sell short when price breaks low with volume confirmation',
      'Stop loss at opposite range extreme',
      'Targets: 2:1 and 3:1 risk/reward ratio'
    ],
    defaultSymbols: ['NVDA', 'TSLA', 'AMD', 'META', 'AAPL', 'SMCI', 'SPY', 'QQQ'],
    riskParams: {
      stopLossType: 'Range opposite',
      targets: ['2:1 R:R', '3:1 R:R']
    },
    timeWindow: '9:30 - 10:30 ET',
    icon: 'breakout'
  },
  {
    id: 'vwap-momentum',
    name: 'VWAP Momentum Bounce',
    shortName: 'VWAP',
    description: 'Enter on pullbacks to VWAP with EMA crossover and volume spike confirmation.',
    details: [
      'Wait for price pullback to VWAP from above',
      'Confirm 9 EMA crossing above 20 EMA',
      'Enter on volume spike (>150% average)',
      'Stop loss just below VWAP',
      'Target: Prior swing high or 3:1 R:R'
    ],
    defaultSymbols: ['SPY', 'QQQ', 'AAPL', 'MSFT'],
    riskParams: {
      stopLossType: 'Below VWAP',
      targets: ['Prior swing high', '3:1 R:R']
    },
    timeWindow: '9:45 - 3:30 ET',
    icon: 'vwap'
  },
  {
    id: 'gap-and-go',
    name: 'Gap & Go',
    shortName: 'GAP',
    description: 'Trade high-momentum gap stocks with catalyst confirmation in pre-market.',
    details: [
      'Pre-market scan: Gaps > 8%, RVOL > 10',
      'Must have news catalyst',
      'Buy first pullback or pre-market high break',
      'Partial profits: 20%, 40%, trail rest',
      'Risk: Below pre-market low'
    ],
    defaultSymbols: [], // Dynamic from scanner
    riskParams: {
      stopLossType: 'Below pre-market low',
      targets: ['20% partial', '40% partial', 'Trail remainder']
    },
    timeWindow: '8:00 - 10:00 ET',
    icon: 'gap'
  }
];

export const defaultRiskSettings: RiskSettings = {
  maxRiskPerTrade: 1.0, // 1%
  maxTradesPerDay: 3,
  dailyLossLimit: 3.0, // 3%
  tradesToday: 0,
  dailyPnL: 0,
  isLocked: false
};

export function calculatePositionSize(
  accountEquity: number,
  entryPrice: number,
  stopLoss: number,
  maxRiskPercent: number
): number {
  const riskAmount = accountEquity * (maxRiskPercent / 100);
  const riskPerShare = Math.abs(entryPrice - stopLoss);
  if (riskPerShare <= 0) return 0;
  return Math.floor(riskAmount / riskPerShare);
}

export function isMarketOpen(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const day = et.getDay();
  
  // Weekend check
  if (day === 0 || day === 6) return false;
  
  // Market hours: 9:30 AM - 4:00 PM ET
  const marketOpen = hours > 9 || (hours === 9 && minutes >= 30);
  const marketClose = hours < 16;
  
  return marketOpen && marketClose;
}

export function isPreMarket(): boolean {
  const now = new Date();
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const hours = et.getHours();
  const minutes = et.getMinutes();
  const day = et.getDay();
  
  // Weekend check
  if (day === 0 || day === 6) return false;
  
  // Pre-market: 8:00 AM - 9:30 AM ET
  const preMarketStart = hours >= 8;
  const preMarketEnd = hours < 9 || (hours === 9 && minutes < 30);
  
  return preMarketStart && preMarketEnd;
}

export function getMarketStatus(): 'pre-market' | 'open' | 'closed' {
  if (isMarketOpen()) return 'open';
  if (isPreMarket()) return 'pre-market';
  return 'closed';
}
