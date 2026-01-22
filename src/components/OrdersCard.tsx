import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Order } from '@/lib/types';
import { cn } from '@/lib/utils';
import { History, ArrowUpCircle, ArrowDownCircle, Loader2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface OrdersCardProps {
  orders: Order[];
  isLoading?: boolean;
}

export function OrdersCard({ orders, isLoading }: OrdersCardProps) {
  // Sort orders by createdAt descending (newest first)
  const sortedOrders = [...orders].sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  return (
    <Card className="glass">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <History className="w-4 h-4" />
          Recent Orders
          {isLoading && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {sortedOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No recent orders</p>
          ) : (
            sortedOrders.map((order) => (
              <div
                key={order.id}
                className="flex items-center justify-between p-3 rounded-lg bg-secondary/50"
              >
                <div className="flex items-center gap-3">
                  <div className={cn(
                    "p-2 rounded-lg",
                    order.side === 'buy' ? "bg-success/10" : "bg-destructive/10"
                  )}>
                    {order.side === 'buy' ? (
                      <ArrowUpCircle className="w-4 h-4 text-success" />
                    ) : (
                      <ArrowDownCircle className="w-4 h-4 text-destructive" />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{order.symbol}</span>
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase",
                        order.side === 'buy' ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"
                      )}>
                        {order.side}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {order.qty} shares @ ${order.filledAvgPrice?.toLocaleString() || 'pending'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <span className={cn(
                    "text-xs px-2 py-1 rounded-full",
                    order.status === 'filled' ? "bg-success/10 text-success" : "bg-warning/10 text-warning"
                  )}>
                    {order.status}
                  </span>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatDistanceToNow(new Date(order.createdAt), { addSuffix: true })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
