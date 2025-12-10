import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header } from '@/components/Header';
import { PortfolioCard } from '@/components/PortfolioCard';
import { PositionsCard } from '@/components/PositionsCard';
import { PricesCard } from '@/components/PricesCard';
import { DayTradingStrategyCard } from '@/components/DayTradingStrategyCard';
import { TradeCard } from '@/components/TradeCard';
import { AutoTradingControlCard } from '@/components/AutoTradingControlCard';
import { OrdersCard } from '@/components/OrdersCard';
import { SettingsModal } from '@/components/SettingsModal';
import { TutorialModal } from '@/components/TutorialModal';
import { AIAnalyzerCard } from '@/components/AIAnalyzerCard';
import { RealTimePnL } from '@/components/RealTimePnL';
import { AutoSelectedStocks } from '@/components/orb/AutoSelectedStocks';
import { RiskSettingsCard } from '@/components/RiskSettingsCard';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/hooks/useAuth';
import { useTradingConfig } from '@/hooks/useTradingConfig';
import { useAlpacaData } from '@/hooks/useAlpacaData';
import { storage } from '@/lib/storage';
import { AlpacaCredentials } from '@/lib/types';
import { mockPrices, strategies } from '@/lib/mockData';
import { dayTradingStrategies, defaultRiskSettings, RiskSettings } from '@/lib/dayTradingStrategies';
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
  } = useTradingConfig(user?.id);
  
  const [showSettings, setShowSettings] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [riskSettings, setRiskSettings] = useState<RiskSettings>(defaultRiskSettings);
  const [activeORBTickers, setActiveORBTickers] = useState<string[]>([]);
  const [marketRegime, setMarketRegime] = useState<'bullish' | 'bearish'>('bullish');

  // Handler for when auto-selected stocks change
  const handleORBStocksChange = useCallback((symbols: string[]) => {
    setActiveORBTickers(symbols);
    console.log('Active ORB tickers updated:', symbols);
  }, []);

  // Handler for market regime change
  const handleMarketRegimeChange = useCallback((regime: 'bullish' | 'bearish') => {
    setMarketRegime(regime);
    console.log('Market regime updated:', regime);
    if (regime === 'bearish') {
      toast({
        title: "🐻 Bear Market Mode Active",
        description: "SPY below 200-SMA. Only SHORT breakouts will be taken.",
        variant: "default",
      });
    }
  }, []);

  const credentials = config ? {
    apiKeyId: config.apiKeyId,
    secretKey: config.secretKey,
    isPaperTrading: config.isPaperTrading,
  } : null;

  // Credentials are now stored in the database, not localStorage
  // This effect is no longer needed

  const { account, positions, orders, isLoading: dataLoading, error, refetch } = useAlpacaData(isConnected);

  // Calculate daily P&L
  const dailyPnL = account?.dayChange || 0;
  const dailyPnLPercent = account?.dayChangePercent || 0;

  // Check if daily loss limit reached
  useEffect(() => {
    if (dailyPnLPercent < -riskSettings.dailyLossLimit) {
      setRiskSettings(prev => ({ ...prev, isLocked: true }));
      if (config?.autoTradingEnabled) {
        toggleAutoTrading(false);
        toast({
          title: "Trading Locked",
          description: `Daily loss limit of ${riskSettings.dailyLossLimit}% reached. Auto-trading stopped.`,
          variant: "destructive",
        });
      }
    }
  }, [dailyPnLPercent, riskSettings.dailyLossLimit]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/auth');
    }
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
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
      // Credentials are now stored in the database
      refetch();
    }
  };

  const handleDisconnect = async () => {
    await disconnect();
    storage.clearCredentials();
  };

  const handleSelectStrategy = async (strategyId: string) => {
    await updateStrategy(strategyId);
    // Strategy is now stored in the database
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

  const handleRiskSettingsChange = (newSettings: Partial<RiskSettings>) => {
    setRiskSettings(prev => ({ ...prev, ...newSettings }));
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
        {/* Real-time P&L Bar */}
        <RealTimePnL
          dailyPnL={dailyPnL}
          dailyPnLPercent={dailyPnLPercent}
          riskSettings={riskSettings}
          isAutoTrading={config?.autoTradingEnabled ?? false}
        />

        {/* Top Row - Portfolio & Prices */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <PortfolioCard account={account} isLoading={dataLoading} />
          <div className="lg:col-span-2">
            <PricesCard prices={mockPrices} />
          </div>
        </div>

        {/* Trading Controls Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AutoTradingControlCard
            isEnabled={config?.autoTradingEnabled ?? false}
            onToggle={handleToggleAutoTrading}
            selectedStrategy={config?.selectedStrategy ?? null}
            isConnected={isConnected}
            tradesToday={riskSettings.tradesToday}
            maxTrades={riskSettings.maxTradesPerDay}
            isLocked={riskSettings.isLocked}
          />
          <DayTradingStrategyCard
            strategies={dayTradingStrategies}
            selectedStrategy={config?.selectedStrategy ?? null}
            onSelectStrategy={handleSelectStrategy}
          />
          <RiskSettingsCard
            settings={riskSettings}
            onSettingsChange={handleRiskSettingsChange}
          />
        </div>

        {/* Auto-Selected ORB Stocks - The main feature */}
        {isAuthenticated && (
          <AutoSelectedStocks 
            onStocksChange={handleORBStocksChange}
            onMarketRegimeChange={handleMarketRegimeChange}
            disabled={config?.autoTradingEnabled}
          />
        )}

        {/* Quick Trade & AI Analysis */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <TradeCard isConnected={isConnected} />
          <AIAnalyzerCard 
            prices={mockPrices} 
            strategies={strategies}
            selectedStrategy={config?.selectedStrategy ?? null}
          />
        </div>

        {/* Positions & Orders */}
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