import { AlpacaCredentials, Strategy } from './types';

const CREDENTIALS_KEY = 'alpaca_credentials';
const TUTORIAL_KEY = 'tutorial_completed';
const THEME_KEY = 'theme';
const AUTO_TRADING_KEY = 'auto_trading_enabled';
const SELECTED_STRATEGY_KEY = 'selected_strategy';

export const storage = {
  getCredentials: (): AlpacaCredentials | null => {
    const data = localStorage.getItem(CREDENTIALS_KEY);
    return data ? JSON.parse(data) : null;
  },

  setCredentials: (credentials: AlpacaCredentials): void => {
    localStorage.setItem(CREDENTIALS_KEY, JSON.stringify(credentials));
  },

  clearCredentials: (): void => {
    localStorage.removeItem(CREDENTIALS_KEY);
  },

  isTutorialCompleted: (): boolean => {
    return localStorage.getItem(TUTORIAL_KEY) === 'true';
  },

  setTutorialCompleted: (): void => {
    localStorage.setItem(TUTORIAL_KEY, 'true');
  },

  getTheme: (): 'light' | 'dark' => {
    return (localStorage.getItem(THEME_KEY) as 'light' | 'dark') || 'dark';
  },

  setTheme: (theme: 'light' | 'dark'): void => {
    localStorage.setItem(THEME_KEY, theme);
  },

  isAutoTradingEnabled: (): boolean => {
    return localStorage.getItem(AUTO_TRADING_KEY) === 'true';
  },

  setAutoTrading: (enabled: boolean): void => {
    localStorage.setItem(AUTO_TRADING_KEY, String(enabled));
  },

  getSelectedStrategy: (): string | null => {
    return localStorage.getItem(SELECTED_STRATEGY_KEY);
  },

  setSelectedStrategy: (strategyId: string): void => {
    localStorage.setItem(SELECTED_STRATEGY_KEY, strategyId);
  },
};
