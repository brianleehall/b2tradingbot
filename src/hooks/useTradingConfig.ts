import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { AlpacaCredentials } from '@/lib/types';
import { toast } from '@/hooks/use-toast';

interface TradingConfig {
  id: string;
  apiKeyId: string;
  secretKey: string;
  isPaperTrading: boolean;
  selectedStrategy: string | null;
  autoTradingEnabled: boolean;
}

export function useTradingConfig(userId: string | undefined) {
  const [config, setConfig] = useState<TradingConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchConfig = useCallback(async () => {
    if (!userId) {
      setConfig(null);
      setIsLoading(false);
      return;
    }

    try {
      // Use the decryption function to get decrypted credentials
      const { data, error } = await supabase
        .rpc('get_decrypted_trading_config', { p_user_id: userId });

      if (error) throw error;

      if (data && data.length > 0) {
        const configData = data[0];
        setConfig({
          id: configData.id,
          apiKeyId: configData.api_key_id,
          secretKey: configData.secret_key,
          isPaperTrading: configData.is_paper_trading,
          selectedStrategy: configData.selected_strategy,
          autoTradingEnabled: configData.auto_trading_enabled,
        });
      } else {
        setConfig(null);
      }
    } catch (error) {
      console.error('Error fetching trading config:', error);
      setConfig(null);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchConfig();
  }, [fetchConfig]);

  const saveCredentials = async (credentials: AlpacaCredentials) => {
    if (!userId) return false;

    try {
      const { error } = await supabase
        .from('trading_configurations')
        .upsert({
          user_id: userId,
          api_key_id: credentials.apiKeyId,
          secret_key: credentials.secretKey,
          is_paper_trading: credentials.isPaperTrading,
        }, {
          onConflict: 'user_id'
        });

      if (error) throw error;

      await fetchConfig();
      return true;
    } catch (error) {
      console.error('Error saving credentials:', error);
      toast({
        title: "Error",
        description: "Failed to save credentials",
        variant: "destructive",
      });
      return false;
    }
  };

  const updateStrategy = async (strategyId: string) => {
    if (!userId) return false;

    try {
      const { error } = await supabase
        .from('trading_configurations')
        .update({ selected_strategy: strategyId })
        .eq('user_id', userId);

      if (error) throw error;

      setConfig(prev => prev ? { ...prev, selectedStrategy: strategyId } : null);
      return true;
    } catch (error) {
      console.error('Error updating strategy:', error);
      return false;
    }
  };

  const toggleAutoTrading = async (enabled: boolean) => {
    if (!userId || !config) {
      toast({
        title: "Setup Required",
        description: "Please connect your Alpaca API first.",
        variant: "destructive",
      });
      return false;
    }

    if (!config.selectedStrategy && enabled) {
      toast({
        title: "Strategy Required",
        description: "Please select a trading strategy first.",
        variant: "destructive",
      });
      return false;
    }

    try {
      const { error } = await supabase
        .from('trading_configurations')
        .update({ auto_trading_enabled: enabled })
        .eq('user_id', userId);

      if (error) throw error;

      setConfig(prev => prev ? { ...prev, autoTradingEnabled: enabled } : null);
      
      toast({
        title: enabled ? "Auto-Trading Enabled" : "Auto-Trading Disabled",
        description: enabled 
          ? "The system will now trade automatically every 5 minutes."
          : "Automatic trading has been stopped.",
      });
      
      return true;
    } catch (error) {
      console.error('Error toggling auto-trading:', error);
      toast({
        title: "Error",
        description: "Failed to update auto-trading status",
        variant: "destructive",
      });
      return false;
    }
  };

  const disconnect = async () => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from('trading_configurations')
        .delete()
        .eq('user_id', userId);

      if (error) throw error;

      setConfig(null);
    } catch (error) {
      console.error('Error disconnecting:', error);
    }
  };

  return {
    config,
    isLoading,
    isConnected: !!config,
    saveCredentials,
    updateStrategy,
    toggleAutoTrading,
    disconnect,
    refetch: fetchConfig,
  };
}
