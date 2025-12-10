import { ORBTrade } from '@/lib/orbConfig';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface TradeLogProps {
  trades: ORBTrade[];
}

export function TradeLog({ trades }: TradeLogProps) {
  if (trades.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Today's Trades</h3>
        <div className="text-center text-muted-foreground py-8">
          No trades today
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 overflow-x-auto">
      <h3 className="text-lg font-semibold mb-4">Today's Trades ({trades.length}/3)</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Time</TableHead>
            <TableHead>Ticker</TableHead>
            <TableHead>Side</TableHead>
            <TableHead className="text-right">Entry</TableHead>
            <TableHead className="text-right">Exit</TableHead>
            <TableHead className="text-right">P&L</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {trades.map((trade) => (
            <TableRow key={trade.id}>
              <TableCell className="text-muted-foreground text-sm">
                {new Date(trade.timestamp).toLocaleTimeString('en-US', { 
                  hour: '2-digit', 
                  minute: '2-digit'
                })}
              </TableCell>
              <TableCell className="font-mono font-bold">{trade.ticker}</TableCell>
              <TableCell>
                <Badge variant={trade.side === 'long' ? 'default' : 'destructive'}>
                  {trade.side.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono">${trade.entryPrice.toFixed(2)}</TableCell>
              <TableCell className="text-right font-mono">
                {trade.exitPrice ? `$${trade.exitPrice.toFixed(2)}` : '-'}
              </TableCell>
              <TableCell className={cn(
                "text-right font-mono font-bold",
                trade.pnl !== null 
                  ? trade.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                  : "text-muted-foreground"
              )}>
                {trade.pnl !== null 
                  ? `${trade.pnl >= 0 ? '+' : ''}$${trade.pnl.toFixed(2)}`
                  : '-'
                }
              </TableCell>
              <TableCell>
                <Badge variant={
                  trade.status === 'closed' ? 'secondary' :
                  trade.status === 'partial' ? 'outline' : 'default'
                }>
                  {trade.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
