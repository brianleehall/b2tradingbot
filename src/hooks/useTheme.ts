import { useEffect, useState } from 'react';
import { storage } from '@/lib/storage';

export function useTheme() {
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => storage.getTheme());

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    storage.setTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    setThemeState(prev => prev === 'dark' ? 'light' : 'dark');
  };

  const setTheme = (newTheme: 'light' | 'dark') => {
    setThemeState(newTheme);
  };

  return { theme, toggleTheme, setTheme };
}
