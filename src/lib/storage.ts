import { Strategy } from './types';

const TUTORIAL_KEY = 'tutorial_completed';
const THEME_KEY = 'theme';

export const storage = {
  // Credentials are now stored securely in the database, not localStorage
  // These methods are deprecated and will be removed
  getCredentials: (): null => {
    return null;
  },

  setCredentials: (): void => {
    // No-op: credentials are now stored in the database
    console.warn('storage.setCredentials is deprecated. Credentials are stored in the database.');
  },

  clearCredentials: (): void => {
    // Clear any legacy credentials from localStorage
    localStorage.removeItem('alpaca_credentials');
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

  // These are now managed via Supabase, but kept for backwards compatibility
  isAutoTradingEnabled: (): boolean => {
    return false; // Now managed via database
  },

  setAutoTrading: (): void => {
    // No-op: managed via database
  },

  getSelectedStrategy: (): string | null => {
    return null; // Now managed via database
  },

  setSelectedStrategy: (): void => {
    // No-op: managed via database
  },
};
