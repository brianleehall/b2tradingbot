import { AccountInfo, Position, Order, PriceData, Strategy } from './types';

export const mockAccount: AccountInfo = {
  equity: 125847.32,
  cash: 45230.15,
  buyingPower: 90460.30,
  portfolioValue: 125847.32,
  dayChange: 1523.45,
  dayChangePercent: 1.23,
};

export const mockPositions: Position[] = [
  {
    symbol: 'AAPL',
    qty: 50,
    avgEntryPrice: 178.50,
    currentPrice: 185.32,
    marketValue: 9266.00,
    unrealizedPl: 341.00,
    unrealizedPlPercent: 3.82,
  },
  {
    symbol: 'TSLA',
    qty: 25,
    avgEntryPrice: 245.00,
    currentPrice: 238.75,
    marketValue: 5968.75,
    unrealizedPl: -156.25,
    unrealizedPlPercent: -2.55,
  },
  {
    symbol: 'BTC/USD',
    qty: 0.5,
    avgEntryPrice: 42000.00,
    currentPrice: 43250.00,
    marketValue: 21625.00,
    unrealizedPl: 625.00,
    unrealizedPlPercent: 2.98,
  },
  {
    symbol: 'ETH/USD',
    qty: 5,
    avgEntryPrice: 2200.00,
    currentPrice: 2350.00,
    marketValue: 11750.00,
    unrealizedPl: 750.00,
    unrealizedPlPercent: 6.82,
  },
];

export const mockOrders: Order[] = [
  {
    id: '1',
    symbol: 'AAPL',
    side: 'buy',
    qty: 10,
    type: 'market',
    status: 'filled',
    filledAvgPrice: 184.50,
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: '2',
    symbol: 'BTC/USD',
    side: 'buy',
    qty: 0.1,
    type: 'limit',
    status: 'filled',
    filledAvgPrice: 42500.00,
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
  {
    id: '3',
    symbol: 'TSLA',
    side: 'sell',
    qty: 5,
    type: 'market',
    status: 'filled',
    filledAvgPrice: 240.25,
    createdAt: new Date(Date.now() - 86400000).toISOString(),
  },
];

export const mockPrices: PriceData[] = [
  { symbol: 'AAPL', price: 185.32, change: 2.45, changePercent: 1.34, high: 186.50, low: 182.10, volume: 52340000 },
  { symbol: 'TSLA', price: 238.75, change: -4.25, changePercent: -1.75, high: 244.00, low: 236.50, volume: 98760000 },
  { symbol: 'GOOGL', price: 141.80, change: 1.20, changePercent: 0.85, high: 142.50, low: 140.00, volume: 21500000 },
  { symbol: 'MSFT', price: 378.91, change: 5.67, changePercent: 1.52, high: 380.00, low: 373.00, volume: 18900000 },
  { symbol: 'BTC/USD', price: 43250.00, change: 850.00, changePercent: 2.01, high: 43800.00, low: 42100.00, volume: 28500000000 },
  { symbol: 'ETH/USD', price: 2350.00, change: 45.00, changePercent: 1.95, high: 2380.00, low: 2290.00, volume: 12800000000 },
];

export const strategies: Strategy[] = [
  {
    id: 'rsi-dip',
    name: 'RSI Dip Buy',
    description: 'Buy when RSI drops below 30 (oversold), sell when RSI rises above 70 (overbought)',
    type: 'stock',
    params: { rsiBuyThreshold: 30, rsiSellThreshold: 70, period: 14 },
  },
  {
    id: 'momentum',
    name: 'Momentum Crypto',
    description: 'Buy on positive momentum when price crosses above 20-period SMA with volume confirmation',
    type: 'crypto',
    params: { smaPeriod: 20, volumeMultiplier: 1.5 },
  },
  {
    id: 'mean-reversion',
    name: 'Mean Reversion',
    description: 'Buy when price deviates 2 standard deviations below 50-day moving average',
    type: 'stock',
    params: { maPeriod: 50, stdDevMultiplier: 2 },
  },
  {
    id: 'breakout',
    name: 'Breakout Trader',
    description: 'Buy on breakout above 20-day high with stop loss at 20-day low',
    type: 'crypto',
    params: { lookbackPeriod: 20 },
  },
];
