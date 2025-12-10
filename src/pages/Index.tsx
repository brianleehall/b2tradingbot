import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { PortfolioCard } from '@/components/PortfolioCard';
import { PositionsCard } from '@/components/PositionsCard';
import { PricesCard } from '@/components/PricesCard';
import { StrategyCard } from '@/components/StrategyCard';
import { TradeCard } from '@/components/TradeCard';
import { AutoTradingCard } from '@/components/AutoTradingCard';
import { OrdersCard } from '@/components/OrdersCard';
import { SettingsModal } from '@/components/SettingsModal';
import { TutorialModal } from '@/components/TutorialModal';
import { AIAnalyzerCard } from '@/components/AIAnalyzerCard';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useTradingConfig } from '@/hooks/useTradingConfig';
import { useAlpacaData } from '@/hooks/useAlpacaData';
import { storage } from '@/lib/storage';
import { AlpacaCredentials } from '@/lib/types';
import { mockPrices, strategies } from '@/lib/mockData';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { user, isLoading: authLoading, signOut, isAuthenticated } = useAuth();
  const { 
    config, 
    isLoading: configLoading, 
    isConnected, 
    saveCredentials, 
    updateStrategy, 
    toggleAutoTrading, 
    disconnect,
    refetch: refetchConfig
  } = useTradingConfig(user?.id);
  
  const [showSettings, setShowSettings] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);

  const credentials = config ? {
    apiKeyId: config.apiKeyId,
    secretKey: config.secretKey,
    isPaperTrading: config.isPaperTrading,
  } : null;

  // Store credentials in local storage for the useAlpacaData hook
  useEffect(() => {
    if (credentials) {
      storage.setCredentials(credentials);
    }
  }, [credentials]);

  const { account, positions, orders, isLoading: dataLoading, error, refetch } = useAlpacaData(isConnected);

  useEffect(() => {
    // Redirect to auth if not authenticated
    if (!authLoading && !isAuthenticated) {
      navigate('/auth');
    }
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    // Check if first visit
    if (!storage.isTutorialCompleted()) {
      setShowTutorial(true);
    }
  }, []);

  useEffect(() => {
    if (error) {
      toast({
        title: "Connection Error",
        description: error,
        variant: "destructive",
      });
    }
  }, [error]);

  const handleConnect = async (creds: AlpacaCredentials) => {
    const success = await saveCredentials(creds);
    if (success) {
      storage.setCredentials(creds);
      refetch();
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    storage.clearCredentials();
  };

  const handleSelectStrategy = async (strategyId: string) => {
    await updateStrategy(strategyId);
    storage.setSelectedStrategy(strategyId);
  };

  const handleToggleAutoTrading = async (enabled: boolean) => {
    await toggleAutoTrading(enabled);
  };

  const handleTutorialComplete = () => {
    storage.setTutorialCompleted();
    setShowTutorial(false);
  };

  const handleSignOut = async () => {
    await signOut();
    storage.clearCredentials();
    navigate('/auth');
  };

  if (authLoading || configLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setShowSettings(true)}
        isConnected={isConnected}
        onDisconnect={handleDisconnect}
        onSignOut={handleSignOut}
        userEmail={user?.email}
      />

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Top Row - Portfolio Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <PortfolioCard account={account} isLoading={dataLoading} />
          <div className="lg:col-span-2">
            <PricesCard prices={mockPrices} />
          </div>
        </div>

        {/* Middle Row - Trading Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <TradeCard isConnected={isConnected} />
          <AutoTradingCard
            isEnabled={config?.autoTradingEnabled ?? false}
            onToggle={handleToggleAutoTrading}
            selectedStrategy={config?.selectedStrategy ?? null}
            isConnected={isConnected}
          />
          <StrategyCard
            strategies={strategies}
            selectedStrategy={config?.selectedStrategy ?? null}
            onSelectStrategy={handleSelectStrategy}
          />
        </div>

        {/* AI Analysis Row */}
        <AIAnalyzerCard 
          prices={mockPrices} 
          strategies={strategies}
          selectedStrategy={config?.selectedStrategy ?? null}
        />

        {/* Bottom Row - Positions & Orders */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PositionsCard positions={positions} isLoading={dataLoading} />
          <OrdersCard orders={orders} isLoading={dataLoading} />
        </div>
      </main>

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onConnect={handleConnect}
        existingConfig={config}
      />

      <TutorialModal
        open={showTutorial}
        onComplete={handleTutorialComplete}
      />
    </div>
  );
};

export default Index;
