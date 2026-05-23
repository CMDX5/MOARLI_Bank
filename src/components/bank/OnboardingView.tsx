'use client';
import React, { useState, useCallback, useRef, useEffect } from 'react';

interface OnboardingViewProps {
  onComplete: () => void;
  onSkip: () => void;
}

const TOTAL_STEPS = 4;

const ONBOARDING_STEPS = [
  {
    title: 'Bienvenue sur MOARLI',
    description:
      'Votre banque digitale au Congo. Envoyez de l\'argent, payez vos factures et épargnez intelligemment — tout depuis votre téléphone.',
    gradient: 'linear-gradient(160deg, #050b1a 0%, #0a1628 40%, #0f2040 100%)',
    iconBg: 'rgba(212, 164, 55, 0.10)',
    iconBorder: 'rgba(212, 164, 55, 0.30)',
    iconGlow: 'rgba(212, 164, 55, 0.15)',
  },
  {
    title: 'Envoyez & Recevez',
    description:
      'Transférez de l\'argent instantanément à vos proches. Payez vos factures Canal+, eau, électricité. Scannez un QR code et payez en un clin d\'œil.',
    gradient: 'linear-gradient(160deg, #050b1a 0%, #071230 40%, #0d1f50 100%)',
    iconBg: 'rgba(59, 130, 246, 0.10)',
    iconBorder: 'rgba(59, 130, 246, 0.30)',
    iconGlow: 'rgba(59, 130, 246, 0.15)',
  },
  {
    title: 'Épargnez intelligemment',
    description:
      'Définissez vos objectifs d\'épargne, suivez votre budget mensuel et rejoignez une tontine digitale. Votre avenir financier commence ici.',
    gradient: 'linear-gradient(160deg, #050b1a 0%, #0b1a2e 40%, #132a1e 100%)',
    iconBg: 'rgba(34, 197, 94, 0.10)',
    iconBorder: 'rgba(34, 197, 94, 0.30)',
    iconGlow: 'rgba(34, 197, 94, 0.15)',
  },
  {
    title: 'Vous êtes prêt !',
    description:
      'Tout est en place pour commencer. Découvrez un univers de services financiers conçu pour vous.',
    gradient: 'linear-gradient(160deg, #050b1a 0%, #0f1530 40%, #1a1050 100%)',
    iconBg: 'rgba(168, 85, 247, 0.10)',
    iconBorder: 'rgba(168, 85, 247, 0.30)',
    iconGlow: 'rgba(168, 85, 247, 0.15)',
  },
];

export default function OnboardingView({ onComplete, onSkip }: OnboardingViewProps) {
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<'left' | 'right'>('left');
  const [isAnimating, setIsAnimating] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Persist completion
  const markComplete = useCallback(() => {
    try {
      localStorage.setItem('morali-onboarding-done', 'true');
    } catch {
      // localStorage unavailable
    }
  }, []);

  const goNext = useCallback(() => {
    if (step >= TOTAL_STEPS - 1) {
      markComplete();
      onComplete();
      return;
    }
    setDirection('left');
    setIsAnimating(true);
    setTimeout(() => {
      setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
      setIsAnimating(false);
    }, 280);
  }, [step, onComplete, markComplete]);

  const goPrev = useCallback(() => {
    if (step <= 0) return;
    setDirection('right');
    setIsAnimating(true);
    setTimeout(() => {
      setStep((s) => Math.max(s - 1, 0));
      setIsAnimating(false);
    }, 280);
  }, [step]);

  const handleSkip = useCallback(() => {
    markComplete();
    onSkip();
  }, [onSkip, markComplete]);

  // Touch / swipe handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (touchStartX.current === null || touchStartY.current === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX.current;
      const dy = e.changedTouches[0].clientY - touchStartY.current;
      // Only horizontal swipes (with some tolerance for diagonal)
      if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
      if (dx < 0) goNext();
      else goPrev();
      touchStartX.current = null;
      touchStartY.current = null;
    },
    [goNext, goPrev],
  );

  // Keyboard support
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') goNext();
      else if (e.key === 'ArrowLeft') goPrev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [goNext, goPrev]);

  const current = ONBOARDING_STEPS[step];
  const isLast = step === TOTAL_STEPS - 1;

  // Slide animation class
  const slideClass = isAnimating
    ? direction === 'left'
      ? 'onb-slide-out-left'
      : 'onb-slide-out-right'
    : direction === 'left'
      ? 'onb-slide-in-right'
      : 'onb-slide-in-left';

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(3, 8, 16, 0.75)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 420,
          height: '100%',
          maxHeight: 860,
          margin: 'auto',
          background: current.gradient,
          borderRadius: 28,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          position: 'relative',
          border: '1px solid rgba(59, 130, 246, 0.12)',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6), 0 0 60px rgba(59,130,246,0.08)',
        }}
      >
        {/* ── Skip button ── */}
        <button
          onClick={handleSkip}
          style={{
            position: 'absolute',
            top: 16,
            right: 18,
            zIndex: 10,
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.10)',
            borderRadius: 12,
            padding: '8px 16px',
            color: 'rgba(255,255,255,0.55)',
            fontSize: 12,
            fontWeight: 700,
            cursor: 'pointer',
            fontFamily: 'system-ui, sans-serif',
            letterSpacing: '0.02em',
            transition: 'all 0.2s',
          }}
        >
          Passer
        </button>

        {/* ── Decorative orbs ── */}
        <div
          style={{
            position: 'absolute',
            top: -60,
            left: -40,
            width: 200,
            height: 200,
            borderRadius: '50%',
            background: current.iconGlow,
            filter: 'blur(60px)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -40,
            right: -30,
            width: 160,
            height: 160,
            borderRadius: '50%',
            background: current.iconGlow,
            filter: 'blur(50px)',
            pointerEvents: 'none',
          }}
        />

        {/* ── Content area ── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '70px 28px 32px',
            overflow: 'hidden',
          }}
        >
          <div
            className={slideClass}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              textAlign: 'center',
              width: '100%',
              animationFillMode: 'both',
              animationDuration: '0.35s',
            }}
            key={step}
          >
            {/* ── Icon area ── */}
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: 32,
                background: current.iconBg,
                border: `1.5px solid ${current.iconBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: 32,
                boxShadow: `0 0 40px ${current.iconGlow}, 0 8px 24px rgba(0,0,0,0.3)`,
                position: 'relative',
              }}
            >
              {step === 0 && <ShieldLogo />}
              {step === 1 && <TransferIcon />}
              {step === 2 && <SavingsIcon />}
              {step === 3 && <RocketIcon />}
            </div>

            {/* ── Title ── */}
            <h2
              style={{
                fontSize: 24,
                fontWeight: 800,
                color: '#f9fafb',
                letterSpacing: '-0.3px',
                fontFamily: "'Montserrat', system-ui, sans-serif",
                marginBottom: 12,
                lineHeight: 1.2,
              }}
            >
              {current.title}
            </h2>

            {/* ── Description ── */}
            <p
              style={{
                fontSize: 13.5,
                color: 'rgba(148, 163, 184, 0.9)',
                lineHeight: 1.7,
                maxWidth: 300,
                marginBottom: 36,
              }}
            >
              {current.description}
            </p>

            {/* ── Feature pills (step 2 & 3) ── */}
            {step === 1 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 24 }}>
                {['Transfert instantané', 'Paiement factures', 'QR Code', 'Multi-devises'].map((f) => (
                  <span
                    key={f}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 999,
                      background: 'rgba(59, 130, 246, 0.10)',
                      border: '1px solid rgba(59, 130, 246, 0.18)',
                      color: '#60a5fa',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.01em',
                    }}
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}
            {step === 2 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 24 }}>
                {['Objectifs d\'épargne', 'Budget mensuel', 'Tontine digitale'].map((f) => (
                  <span
                    key={f}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 999,
                      background: 'rgba(34, 197, 94, 0.10)',
                      border: '1px solid rgba(34, 197, 94, 0.18)',
                      color: '#4ade80',
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: '0.01em',
                    }}
                  >
                    {f}
                  </span>
                ))}
              </div>
            )}

            {/* ── CTA button ── */}
            <button
              onClick={goNext}
              style={{
                width: '100%',
                maxWidth: 280,
                padding: '15px 24px',
                borderRadius: 16,
                border: 'none',
                background: isLast
                  ? 'linear-gradient(135deg, #D4A437 0%, #f0d98a 100%)'
                  : 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                color: isLast ? '#050b1a' : '#fff',
                fontSize: 15,
                fontWeight: 800,
                cursor: 'pointer',
                fontFamily: 'system-ui, sans-serif',
                boxShadow: isLast
                  ? '0 8px 28px rgba(212, 164, 55, 0.35)'
                  : '0 8px 28px rgba(59, 130, 246, 0.35)',
                transition: 'all 0.2s',
                letterSpacing: '0.02em',
              }}
            >
              {isLast ? 'Commencer' : 'Suivant'}
            </button>

            {/* ── Back button (not on first step) ── */}
            {!isLast && step > 0 && (
              <button
                onClick={goPrev}
                style={{
                  marginTop: 14,
                  background: 'none',
                  border: 'none',
                  color: 'rgba(148, 163, 184, 0.7)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  fontFamily: 'system-ui, sans-serif',
                  padding: '8px 16px',
                }}
              >
                ← Retour
              </button>
            )}
          </div>
        </div>

        {/* ── Progress dots ── */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            justifyContent: 'center',
            paddingBottom: 'max(24px, env(safe-area-inset-bottom, 24px))',
            paddingTop: 8,
          }}
        >
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? 28 : 8,
                height: 8,
                borderRadius: 999,
                background: i === step ? '#3b82f6' : 'rgba(255,255,255,0.15)',
                transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                boxShadow: i === step ? '0 0 12px rgba(59, 130, 246, 0.5)' : 'none',
              }}
            />
          ))}
        </div>
      </div>

      {/* ── CSS Keyframe Animations ── */}
      <style>{`
        @keyframes onbSlideInRight {
          from { opacity: 0; transform: translateX(40px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes onbSlideInLeft {
          from { opacity: 0; transform: translateX(-40px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes onbSlideOutLeft {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(-40px); }
        }
        @keyframes onbSlideOutRight {
          from { opacity: 1; transform: translateX(0); }
          to   { opacity: 0; transform: translateX(40px); }
        }
        .onb-slide-in-right { animation-name: onbSlideInRight; }
        .onb-slide-in-left  { animation-name: onbSlideInLeft; }
        .onb-slide-out-left  { animation-name: onbSlideOutLeft; }
        .onb-slide-out-right { animation-name: onbSlideOutRight; }
        @keyframes onbPulseGlow {
          0%, 100% { filter: drop-shadow(0 0 8px rgba(212,164,55,0.3)); }
          50%      { filter: drop-shadow(0 0 20px rgba(212,164,55,0.6)); }
        }
        .onb-shield-glow { animation: onbPulseGlow 3s ease-in-out infinite; }
        @keyframes onbFloat {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-6px); }
        }
        .onb-float { animation: onbFloat 4s ease-in-out infinite; }
      `}</style>
    </div>
  );
}

/* ── Step Icons ── */

function ShieldLogo() {
  return (
    <svg
      width={64}
      height={72}
      viewBox="0 0 40 46"
      fill="none"
      className="onb-shield-glow"
    >
      <path d="M20 2L4 8V22C4 31.6 11.2 40.5 20 44C28.8 40.5 36 31.6 36 22V8L20 2Z" fill="#1A3E78" />
      <path d="M20 2L4 8V22C4 31.6 11.2 40.5 20 44C28.8 40.5 36 31.6 36 22V8L20 2Z" stroke="#D4A437" strokeWidth="2" fill="none" />
      <path d="M11 29V17L20 23L29 17V29" stroke="#D4A437" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M11 17L20 23L29 17" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function TransferIcon() {
  return (
    <svg width={52} height={52} viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="onb-float">
      <path d="M7 7h11" />
      <path d="m14 4 4 3-4 3" />
      <path d="M17 17H6" />
      <path d="m10 14-4 3 4 3" />
    </svg>
  );
}

function SavingsIcon() {
  return (
    <svg width={52} height={52} viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="onb-float">
      <path d="M7 10a6 6 0 0 1 6-4 7 7 0 0 1 5 2l2 1v4l-2 1v2h-2l-1-2H9l-1 2H6v-2l-2-1v-2a4 4 0 0 1 3-4Z" />
      <circle cx="13" cy="10" r="0.5" fill="#4ade80" />
      <path d="M9 17h6" />
    </svg>
  );
}

function RocketIcon() {
  return (
    <svg width={52} height={52} viewBox="0 0 24 24" fill="none" stroke="#c084fc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="onb-float">
      <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </svg>
  );
}
