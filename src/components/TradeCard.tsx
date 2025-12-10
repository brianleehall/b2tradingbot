import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowUpCircle, ArrowDownCircle, Zap } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

const symbols = ['AAPL', 'TSLA', 'GOOGL', 'MSFT', 'BTC/USD', 'ETH/USD'];

interface TradeCardProps {
  isConnected: boolean;
}

export function TradeCard({ isConnected }: TradeCardProps) {
  const [symbol, setSymbol] = useState('AAPL');
  const [quantity, setQuantity] = useState('1');
  const [isLoading, setIsLoading] = useState(false);

  const handleTrade = async (side: 'buy' | 'sell') => {
    if (!isConnected) {
      toast({
        title: "Not Connected",
        description: "Please connect your Alpaca API keys in Settings first.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    toast({
      title: `${side === 'buy' ? 'Buy' : 'Sell'} Order Submitted`,
      description: `${side === 'buy' ? 'Bought' : 'Sold'} ${quantity} shares of ${symbol}`,
    });
    
    setIsLoading(false);
  };

  return (
    <Card className="glass">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Zap className="w-4 h-4" />
          Quick Trade
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Symbol</label>
              <Select value={symbol} onValueChange={setSymbol}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {symbols.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-xs text-muted-foreground">Quantity</label>
              <Input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                min="0.001"
                step="0.001"
                className="font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="success"
              className="gap-2"
              onClick={() => handleTrade('buy')}
              disabled={isLoading || !quantity || parseFloat(quantity) <= 0}
            >
              <ArrowUpCircle className="w-4 h-4" />
              Buy
            </Button>
            <Button
              variant="destructive"
              className="gap-2"
              onClick={() => handleTrade('sell')}
              disabled={isLoading || !quantity || parseFloat(quantity) <= 0}
            >
              <ArrowDownCircle className="w-4 h-4" />
              Sell
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
