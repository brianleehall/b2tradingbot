import { useState, useEffect } from 'react';
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
import { storage } from '@/lib/storage';
import { AlpacaCredentials } from '@/lib/types';
import { 
  mockAccount, 
  mockPositions, 
  mockOrders, 
  mockPrices, 
  strategies 
} from '@/lib/mockData';

const Index = () => {
  const { theme, toggleTheme } = useTheme();
  const [showSettings, setShowSettings] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState<string | null>(null);
  const [isAutoTrading, setIsAutoTrading] = useState(false);

  useEffect(() => {
    // Check if first visit
    if (!storage.isTutorialCompleted()) {
      setShowTutorial(true);
    }

    // Check for existing credentials
    const credentials = storage.getCredentials();
    if (credentials) {
      setIsConnected(true);
    }

    // Load saved strategy
    const savedStrategy = storage.getSelectedStrategy();
    if (savedStrategy) {
      setSelectedStrategy(savedStrategy);
    }

    // Load auto-trading state
    setIsAutoTrading(storage.isAutoTradingEnabled());
  }, []);

  const handleConnect = (credentials: AlpacaCredentials) => {
    setIsConnected(true);
  };

  const handleDisconnect = () => {
    storage.clearCredentials();
    setIsConnected(false);
    setIsAutoTrading(false);
    storage.setAutoTrading(false);
  };

  const handleSelectStrategy = (strategyId: string) => {
    setSelectedStrategy(strategyId);
    storage.setSelectedStrategy(strategyId);
  };

  const handleToggleAutoTrading = (enabled: boolean) => {
    setIsAutoTrading(enabled);
    storage.setAutoTrading(enabled);
  };

  const handleTutorialComplete = () => {
    storage.setTutorialCompleted();
    setShowTutorial(false);
  };

  return (
    <div className="min-h-screen bg-background">
      <Header
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSettings={() => setShowSettings(true)}
        isConnected={isConnected}
        onDisconnect={handleDisconnect}
      />

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Top Row - Portfolio Overview */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <PortfolioCard account={mockAccount} />
          <div className="lg:col-span-2">
            <PricesCard prices={mockPrices} />
          </div>
        </div>

        {/* Middle Row - Trading Controls */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <TradeCard isConnected={isConnected} />
          <AutoTradingCard
            isEnabled={isAutoTrading}
            onToggle={handleToggleAutoTrading}
            selectedStrategy={selectedStrategy}
            isConnected={isConnected}
          />
          <StrategyCard
            strategies={strategies}
            selectedStrategy={selectedStrategy}
            onSelectStrategy={handleSelectStrategy}
          />
        </div>

        {/* AI Analysis Row */}
        <AIAnalyzerCard 
          prices={mockPrices} 
          strategies={strategies}
          selectedStrategy={selectedStrategy}
        />

        {/* Bottom Row - Positions & Orders */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <PositionsCard positions={mockPositions} />
          <OrdersCard orders={mockOrders} />
        </div>
      </main>

      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        onConnect={handleConnect}
      />

      <TutorialModal
        open={showTutorial}
        onComplete={handleTutorialComplete}
      />
    </div>
  );
};

export default Index;
