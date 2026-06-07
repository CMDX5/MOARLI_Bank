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

const LIGHT_COLORS: ThemeColors = {
  '--bg-primary': '#f4f2ee',
  '--bg-secondary': '#faf9f6',
  '--bg-card': '#ffffff',
  '--text-primary': '#1e293b',
  '--text-secondary': '#64748b',
  '--accent': '#3b72d4',
  '--accent-secondary': '#5b8def',
  '--border': 'rgba(0,0,0,0.06)',
  '--gradient-start': '#3b72d4',
  '--gradient-end': '#2a5ab8',
};

const THEME_COLORS: Record<ThemeMode, ThemeColors> = {
  base: BASE_COLORS,
  light: LIGHT_COLORS,
};

// ── Metadata per theme for labels & accent swatches ──

export const THEME_META: Record<ThemeMode, { label: string; accentColor: string; accentSecondary: string }> = {
  base: { label: 'Base', accentColor: '#3b82f6', accentSecondary: '#60a5fa' },
  light: { label: 'MOARLI Light', accentColor: '#3b72d4', accentSecondary: '#5b8def' },
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
    if (stored === 'base' || stored === 'light') return stored;
    // If stored was 'dark', migrate to 'base'
    if (stored === 'dark') {
      localStorage.setItem(STORAGE_KEY, 'base');
      return 'base';
    }
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
    root.style.setProperty('--surface2', '#eeece8');
    root.style.setProperty('--blue', '#3b72d4');
    root.style.setProperty('--blue2', '#2a5ab8');
    root.style.setProperty('--blue3', '#5b8def');
    root.style.setProperty('--border', colors['--border']);
    root.style.setProperty('--text', colors['--text-primary']);
    root.style.setProperty('--muted', colors['--text-secondary']);
    root.style.setProperty('--dim', '#94a3b8');
    root.style.setProperty('--w05', 'rgba(0,0,0,0.03)');
    root.style.setProperty('--royal', '#2a5ab8');
    root.style.setProperty('--gold', '#b8942e');
    root.style.setProperty('--gold2', '#d4b95a');
    root.style.setProperty('--success', '#1a9a4a');
    root.style.setProperty('--danger', '#d64545');
    root.style.setProperty('color-scheme', 'light');
    document.body.style.background = '#f4f2ee';
    document.body.style.color = '#1e293b';
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
    // Reset body for dark theme
    document.body.style.background = '';
    document.body.style.color = '';
  }
}

// ── Provider ──

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializer: reads localStorage on client, falls back to 'base' on server
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const stored = readStoredTheme();
    if (stored) return stored;
    // Always default to dark 'base' theme for MOARLI Bank
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
