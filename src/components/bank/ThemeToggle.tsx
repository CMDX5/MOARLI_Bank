'use client';
import React, { useState, useRef, useEffect } from 'react';
import type { ThemeMode } from '@/types/morali';
import { THEME_META } from '@/contexts/ThemeContext';

interface ThemeToggleProps {
  currentTheme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}

const THEME_OPTIONS: Array<{
  mode: ThemeMode;
  label: string;
  primaryColor: string;
  secondaryColor: string;
  bgHint: string;
}> = [
  {
    mode: 'base',
    label: 'Base',
    primaryColor: '#3b82f6',
    secondaryColor: '#2563eb',
    bgHint: '#050b1a',
  },
  {
    mode: 'dark',
    label: 'MOARLI Dark',
    primaryColor: '#059669',
    secondaryColor: '#D4A437',
    bgHint: '#050e0a',
  },
  {
    mode: 'light',
    label: 'MOARLI Light',
    primaryColor: '#D4A437',
    secondaryColor: '#059669',
    bgHint: '#f8fafc',
  },
];

export default function ThemeToggle({ currentTheme, onThemeChange }: ThemeToggleProps) {
  const [expanded, setExpanded] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close panel on outside click
  useEffect(() => {
    if (!expanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside as unknown as EventListener);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside as unknown as EventListener);
    };
  }, [expanded]);

  // Close on Escape key
  useEffect(() => {
    if (!expanded) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [expanded]);

  const handleToggle = () => setExpanded((prev) => !prev);

  const handleSelect = (mode: ThemeMode) => {
    onThemeChange(mode);
    setExpanded(false);
  };

  const currentOption = THEME_OPTIONS.find((o) => o.mode === currentTheme) || THEME_OPTIONS[0];

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        bottom: 90,
        right: 20,
        zIndex: 9998,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: 8,
      }}
    >
      {/* Expanded theme panel */}
      <div
        style={{
          display: expanded ? 'flex' : 'none',
          flexDirection: 'column',
          gap: 8,
          padding: 10,
          borderRadius: 20,
          background: currentTheme === 'light' ? 'rgba(255,255,255,0.95)' : 'rgba(13,21,37,0.96)',
          border: `1px solid ${currentTheme === 'light' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)'}`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          boxShadow: currentTheme === 'light'
            ? '0 8px 32px rgba(0,0,0,0.12)'
            : '0 8px 32px rgba(0,0,0,0.4)',
          animation: expanded ? 'themePanelIn 0.25s cubic-bezier(0.34,1.56,0.64,1) both' : 'none',
          transformOrigin: 'bottom right',
        }}
      >
        {THEME_OPTIONS.map((opt) => {
          const isActive = currentTheme === opt.mode;
          return (
            <button
              key={opt.mode}
              onClick={() => handleSelect(opt.mode)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 12px',
                borderRadius: 14,
                border: isActive
                  ? `1.5px solid ${opt.primaryColor}`
                  : '1px solid transparent',
                background: isActive
                  ? (currentTheme === 'light' ? 'rgba(212,164,55,0.08)' : 'rgba(255,255,255,0.04)')
                  : 'transparent',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
                minWidth: 140,
              }}
              title={opt.label}
              aria-label={`Changer le thème vers ${opt.label}`}
            >
              {/* Theme swatch circle */}
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg, ${opt.primaryColor}, ${opt.secondaryColor})`,
                  border: isActive ? '2.5px solid rgba(255,255,255,0.9)' : '2px solid rgba(255,255,255,0.15)',
                  boxShadow: isActive ? `0 0 12px ${opt.primaryColor}66, 0 0 4px ${opt.primaryColor}33` : 'none',
                  position: 'relative',
                  flexShrink: 0,
                  transition: 'all 0.2s ease',
                }}
              >
                {/* Checkmark for active */}
                {isActive && (
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%)',
                    }}
                  >
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                )}
              </span>
              {/* Theme name */}
              <span
                style={{
                  fontSize: 12,
                  fontWeight: isActive ? 700 : 500,
                  color: currentTheme === 'light' ? '#0f172a' : '#f9fafb',
                  opacity: isActive ? 1 : 0.6,
                  transition: 'all 0.2s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {opt.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main toggle button */}
      <button
        onClick={handleToggle}
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: `1.5px solid ${currentTheme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)'}`,
          background: currentTheme === 'light'
            ? 'rgba(255,255,255,0.9)'
            : 'rgba(13,21,37,0.9)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          boxShadow: currentTheme === 'light'
            ? '0 4px 16px rgba(0,0,0,0.08)'
            : '0 4px 16px rgba(0,0,0,0.3)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.2s ease',
          position: 'relative',
          overflow: 'hidden',
        }}
        aria-label="Changer le thème"
        title="Thème"
      >
        {/* Gradient background orb */}
        <span
          style={{
            position: 'absolute',
            inset: 3,
            borderRadius: '50%',
            background: `linear-gradient(135deg, ${currentOption.primaryColor}, ${currentOption.secondaryColor})`,
            transition: 'background 0.35s ease',
          }}
        />
        {/* Palette icon */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ position: 'relative', zIndex: 1 }}
        >
          <circle cx="13.5" cy="6.5" r="2.5" />
          <circle cx="17.5" cy="10.5" r="2.5" />
          <circle cx="8.5" cy="7.5" r="2.5" />
          <circle cx="6.5" cy="12" r="2.5" />
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
        </svg>
      </button>

      {/* Inline keyframes */}
      <style>{`
        @keyframes themePanelIn {
          from { opacity: 0; transform: translateY(8px) scale(0.92); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </div>
  );
}
