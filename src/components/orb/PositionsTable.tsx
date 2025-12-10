import { ORBPosition } from '@/lib/orbConfig';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface PositionsTableProps {
  positions: ORBPosition[];
}

export function PositionsTable({ positions }: PositionsTableProps) {
  if (positions.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Open Positions</h3>
        <div className="text-center text-muted-foreground py-8">
          No open positions
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-4 overflow-x-auto">
      <h3 className="text-lg font-semibold mb-4">Open Positions</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ticker</TableHead>
            <TableHead>Side</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Entry</TableHead>
            <TableHead className="text-right">Stop</TableHead>
            <TableHead className="text-right">Target</TableHead>
            <TableHead className="text-right">P&L</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {positions.map((pos, idx) => (
            <TableRow key={idx}>
              <TableCell className="font-mono font-bold">{pos.ticker}</TableCell>
              <TableCell>
                <Badge variant={pos.side === 'long' ? 'default' : 'destructive'}>
                  {pos.side.toUpperCase()}
                </Badge>
              </TableCell>
              <TableCell className="text-right font-mono">{pos.qty}</TableCell>
              <TableCell className="text-right font-mono">${pos.entryPrice.toFixed(2)}</TableCell>
              <TableCell className="text-right font-mono text-red-400">${pos.stopLoss.toFixed(2)}</TableCell>
              <TableCell className="text-right font-mono text-emerald-400">
                ${pos.partialFilled ? pos.target2.toFixed(2) : pos.target1.toFixed(2)}
              </TableCell>
              <TableCell className={cn(
                "text-right font-mono font-bold",
                pos.unrealizedPnL >= 0 ? "text-emerald-400" : "text-red-400"
              )}>
                {pos.unrealizedPnL >= 0 ? '+' : ''}${pos.unrealizedPnL.toFixed(2)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
