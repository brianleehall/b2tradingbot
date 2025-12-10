import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { storage } from '@/lib/storage';
import { AccountInfo, Position, Order } from '@/lib/types';
import { mockAccount, mockPositions, mockOrders } from '@/lib/mockData';

interface UseAlpacaDataResult {
  account: AccountInfo;
  positions: Position[];
  orders: Order[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useAlpacaData(isConnected: boolean): UseAlpacaDataResult {
  const [account, setAccount] = useState<AccountInfo>(mockAccount);
  const [positions, setPositions] = useState<Position[]>(mockPositions);
  const [orders, setOrders] = useState<Order[]>(mockOrders);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const credentials = storage.getCredentials();
    
    if (!isConnected || !credentials) {
      setAccount(mockAccount);
      setPositions(mockPositions);
      setOrders(mockOrders);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const [accountRes, positionsRes, ordersRes] = await Promise.all([
        supabase.functions.invoke('alpaca-account', {
          body: { ...credentials, endpoint: 'account' }
        }),
        supabase.functions.invoke('alpaca-account', {
          body: { ...credentials, endpoint: 'positions' }
        }),
        supabase.functions.invoke('alpaca-account', {
          body: { ...credentials, endpoint: 'orders' }
        })
      ]);

      if (accountRes.error) throw new Error(accountRes.error.message);
      if (positionsRes.error) throw new Error(positionsRes.error.message);
      if (ordersRes.error) throw new Error(ordersRes.error.message);

      if (accountRes.data?.error) throw new Error(accountRes.data.error);
      if (positionsRes.data?.error) throw new Error(positionsRes.data.error);
      if (ordersRes.data?.error) throw new Error(ordersRes.data.error);

      setAccount(accountRes.data);
      setPositions(positionsRes.data || []);
      setOrders(ordersRes.data || []);
    } catch (err) {
      console.error('Error fetching Alpaca data:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch data');
      // Keep showing mock data on error
      setAccount(mockAccount);
      setPositions(mockPositions);
      setOrders(mockOrders);
    } finally {
      setIsLoading(false);
    }
  }, [isConnected]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30 seconds when connected
  useEffect(() => {
    if (!isConnected) return;
    
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [isConnected, fetchData]);

  return {
    account,
    positions,
    orders,
    isLoading,
    error,
    refetch: fetchData,
  };
}
