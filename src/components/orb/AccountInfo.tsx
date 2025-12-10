import { DollarSign, Wallet, ShoppingCart } from 'lucide-react';

interface AccountInfoProps {
  equity: number;
  cash: number;
  buyingPower: number;
}

export function AccountInfo({ equity, cash, buyingPower }: AccountInfoProps) {
  const formatCurrency = (value: number) => {
    return value.toLocaleString('en-US', { 
      style: 'currency', 
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    });
  };

  return (
    <div className="grid grid-cols-3 gap-4">
      <div className="bg-card border border-border rounded-xl p-4 text-center">
        <div className="flex items-center justify-center gap-2 text-muted-foreground mb-1">
          <DollarSign className="h-4 w-4" />
          <span className="text-sm">Equity</span>
        </div>
        <p className="text-2xl font-mono font-bold">{formatCurrency(equity)}</p>
      </div>
      
      <div className="bg-card border border-border rounded-xl p-4 text-center">
        <div className="flex items-center justify-center gap-2 text-muted-foreground mb-1">
          <Wallet className="h-4 w-4" />
          <span className="text-sm">Cash</span>
        </div>
        <p className="text-2xl font-mono font-bold">{formatCurrency(cash)}</p>
      </div>
      
      <div className="bg-card border border-border rounded-xl p-4 text-center">
        <div className="flex items-center justify-center gap-2 text-muted-foreground mb-1">
          <ShoppingCart className="h-4 w-4" />
          <span className="text-sm">Buying Power</span>
        </div>
        <p className="text-2xl font-mono font-bold">{formatCurrency(buyingPower)}</p>
      </div>
    </div>
  );
}
