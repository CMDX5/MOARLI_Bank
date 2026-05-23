'use client';
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import type { ThemeMode } from '@/types/morali';

// ── Theme Color Definitions ──

type ThemeColors = {
  '--bg-primary': string;
  '--bg-secondary': string;
  '--bg-card': string;
  '--text-primary': string;
  '--text-secondary': string;
  '--accent': string;
  '--accent-secondary': string;
  '--border': string;
  '--gradient-start': string;
  '--gradient-end': string;
};

const BASE_COLORS: ThemeColors = {
  '--bg-primary': '#050b1a',
  '--bg-secondary': '#101a30',
  '--bg-card': '#0d1525',
  '--text-primary': '#ffffff',
  '--text-secondary': '#94a3b8',
  '--accent': '#3b82f6',
  '--accent-secondary': '#60a5fa',
  '--border': 'rgba(255,255,255,0.08)',
  '--gradient-start': '#3b82f6',
  '--gradient-end': '#2563eb',
};

const DARK_COLORS: ThemeColors = {
  '--bg-primary': '#050e0a',
  '--bg-secondary': '#0a1f15',
  '--bg-card': '#071a10',
  '--text-primary': '#ffffff',
  '--text-secondary': '#94a3b8',
  '--accent': '#059669',
  '--accent-secondary': '#D4A437',
  '--border': 'rgba(5,150,105,0.15)',
  '--gradient-start': '#059669',
  '--gradient-end': '#047857',
};

const LIGHT_COLORS: ThemeColors = {
  '--bg-primary': '#f8fafc',
  '--bg-secondary': '#ffffff',
  '--bg-card': '#ffffff',
  '--text-primary': '#0f172a',
  '--text-secondary': '#64748b',
  '--accent': '#D4A437',
  '--accent-secondary': '#059669',
  '--border': 'rgba(0,0,0,0.08)',
  '--gradient-start': '#D4A437',
  '--gradient-end': '#b8912e',
};

const THEME_COLORS: Record<ThemeMode, ThemeColors> = {
  base: BASE_COLORS,
  dark: DARK_COLORS,
  light: LIGHT_COLORS,
};

// ── Metadata per theme for labels & accent swatches ──

export const THEME_META: Record<ThemeMode, { label: string; accentColor: string; accentSecondary: string }> = {
  base: { label: 'Base', accentColor: '#3b82f6', accentSecondary: '#60a5fa' },
  dark: { label: 'MOARLI Dark', accentColor: '#059669', accentSecondary: '#D4A437' },
  light: { label: 'MOARLI Light', accentColor: '#D4A437', accentSecondary: '#059669' },
};

// ── Context shape ──

interface ThemeContextValue {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  isDark: boolean;
  colors: ThemeColors;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'morali-theme';

// ── Read stored preference (client-only) ──

function readStoredTheme(): ThemeMode | null {
  if (typeof window === 'undefined') return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'base' || stored === 'dark' || stored === 'light') return stored;
  } catch { /* localStorage not available */ }
  return null;
}

// ── Apply CSS variables to <html> (side-effect only, no state changes) ──

function applyThemeToDOM(mode: ThemeMode) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const colors = THEME_COLORS[mode];

  // Smooth transition on <html>
  root.style.setProperty('transition', 'background-color 0.35s ease, color 0.25s ease, border-color 0.25s ease');

  // Set new theme CSS variables
  for (const [key, value] of Object.entries(colors)) {
    root.style.setProperty(key, value);
  }

  // Bridge to the existing app CSS variables so legacy components continue working
  if (mode === 'light') {
    root.style.setProperty('--bg', colors['--bg-primary']);
    root.style.setProperty('--surface', colors['--bg-secondary']);
    root.style.setProperty('--surface2', '#f1f5f9');
    root.style.setProperty('--blue', colors['--accent-secondary']);
    root.style.setProperty('--blue2', '#047857');
    root.style.setProperty('--blue3', '#059669');
    root.style.setProperty('--border', colors['--border']);
    root.style.setProperty('--text', colors['--text-primary']);
    root.style.setProperty('--muted', colors['--text-secondary']);
    root.style.setProperty('--dim', '#94a3b8');
    root.style.setProperty('--w05', 'rgba(0,0,0,0.04)');
    root.style.setProperty('color-scheme', 'light');
  } else if (mode === 'dark') {
    root.style.setProperty('--bg', colors['--bg-primary']);
    root.style.setProperty('--surface', colors['--bg-secondary']);
    root.style.setProperty('--surface2', '#0d2a1a');
    root.style.setProperty('--blue', colors['--accent']);
    root.style.setProperty('--blue2', colors['--gradient-end']);
    root.style.setProperty('--blue3', colors['--accent-secondary']);
    root.style.setProperty('--border', colors['--border']);
    root.style.setProperty('--text', colors['--text-primary']);
    root.style.setProperty('--muted', colors['--text-secondary']);
    root.style.setProperty('--dim', '#64748b');
    root.style.setProperty('--w05', 'rgba(5,150,105,0.05)');
    root.style.setProperty('color-scheme', 'dark');
  } else {
    // base
    root.style.setProperty('--bg', colors['--bg-primary']);
    root.style.setProperty('--surface', colors['--bg-secondary']);
    root.style.setProperty('--surface2', '#111d38');
    root.style.setProperty('--blue', colors['--accent']);
    root.style.setProperty('--blue2', colors['--gradient-end']);
    root.style.setProperty('--blue3', colors['--accent-secondary']);
    root.style.setProperty('--border', colors['--border']);
    root.style.setProperty('--text', colors['--text-primary']);
    root.style.setProperty('--muted', colors['--text-secondary']);
    root.style.setProperty('--dim', '#64748b');
    root.style.setProperty('--w05', 'rgba(255,255,255,0.05)');
    root.style.setProperty('color-scheme', 'dark');
  }
}

// ── Provider ──

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializer: reads localStorage on client, falls back to 'base' on server
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const stored = readStoredTheme();
    if (stored) return stored;
    // Auto-detect system preference (dark→base, light→base by default)
    if (typeof window !== 'undefined') {
      const mq = window.matchMedia('(prefers-color-scheme: light)');
      return mq.matches ? 'light' : 'base';
    }
    return 'base';
  });

  // Apply CSS variables to DOM whenever theme changes (side-effect only)
  useEffect(() => {
    applyThemeToDOM(theme);
  }, [theme]);

  // Persist to localStorage + update DOM when user selects a theme
  const setTheme = useCallback((newTheme: ThemeMode) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch { /* silent */ }
  }, []);

  const isDark = theme !== 'light';
  const colors = THEME_COLORS[theme];

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark, colors }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── Hook ──

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Return safe defaults when used outside provider (SSR, tests)
    return {
      theme: 'base',
      setTheme: () => {},
      isDark: true,
      colors: BASE_COLORS,
    };
  }
  return ctx;
}

export default ThemeContext;
