export interface AlpacaCredentials {
  apiKeyId: string;
  secretKey: string;
  isPaperTrading: boolean;
}

export interface Position {
  symbol: string;
  qty: number;
  avgEntryPrice: number;
  currentPrice: number;
  marketValue: number;
  unrealizedPl: number;
  unrealizedPlPercent: number;
}

export interface Order {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  qty: number;
  type: string;
  status: string;
  filledAvgPrice: number | null;
  createdAt: string;
}

export interface AccountInfo {
  equity: number;
  cash: number;
  buyingPower: number;
  portfolioValue: number;
  dayChange: number;
  dayChangePercent: number;
}

export interface Strategy {
  id: string;
  name: string;
  description: string;
  type: 'stock' | 'crypto';
  params: Record<string, number>;
}

export interface PriceData {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  high: number;
  low: number;
  volume: number;
}
