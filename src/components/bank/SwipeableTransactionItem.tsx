'use client';

import React, { useRef, useCallback, useState } from 'react';
import { AppIcon } from '@/components/bank/Icons';
import { timeAgo } from '@/lib/helpers';

interface SwipeableTransactionItemProps {
  tx: {
    receiptId?: string;
    name: string;
    date?: string;
    dateTimestamp?: number;
    amount: string;
    type: string;
    category?: string;
    icon: string;
    bg: string;
  };
  onDelete?: (receiptId: string) => void;
  onPin?: (receiptId: string) => void;
}

const MAX_SWIPE = 80;
const SNAP_THRESHOLD = 40;
const FLICK_VELOCITY_THRESHOLD = 0.5;
const RUBBER_BAND_LIMIT = 20;

export default function SwipeableTransactionItem({ tx, onDelete, onPin }: SwipeableTransactionItemProps) {
  const [pinned, setPinned] = useState(false);
  const [deleted, setDeleted] = useState(false);

  const swipeRef = useRef<{
    startX: number;
    startY: number;
    currentX: number;
    lastX: number;
    lastTime: number;
    isSwiping: boolean;
    direction: 'none' | 'horizontal' | 'vertical';
    velocity: number;
  }>({
    startX: 0,
    startY: 0,
    currentX: 0,
    lastX: 0,
    lastTime: 0,
    isSwiping: false,
    direction: 'none',
    velocity: 0,
  });

  const id = tx.receiptId || tx.name;
  const elId = `dash-swipe-${id}`;

  const resetSwipe = useCallback(() => {
    const el = document.getElementById(elId);
    const wrap = el?.parentElement;
    if (el) {
      el.style.transition = 'transform .4s cubic-bezier(.32,1.4,.56,1)';
      el.style.transform = 'translateX(0)';
      wrap?.classList.remove('revealed');
      const actions = wrap?.querySelector('.notif-swipe-actions') as HTMLElement;
      if (actions) {
        actions.style.transition = 'opacity .3s ease';
        actions.style.opacity = '0';
      }
    }
  }, [elId]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    swipeRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      lastX: touch.clientX,
      lastTime: Date.now(),
      isSwiping: true,
      direction: 'none',
      velocity: 0,
    };
    const el = document.getElementById(elId);
    if (el) el.style.transition = 'none';
  }, [elId]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const s = swipeRef.current;
    if (!s.isSwiping) return;

    const touch = e.touches[0];
    const dx = s.startX - touch.clientX;
    const dy = Math.abs(touch.clientY - s.startY);

    if (s.direction === 'none') {
      if (Math.abs(dx) > 6 || dy > 6) {
        s.direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      }
      return;
    }

    if (s.direction === 'vertical') return;
    if (dx < 0) return;

    const now = Date.now();
    const dt = now - s.lastTime;
    if (dt > 0) {
      const instantV = (touch.clientX - s.lastX) / dt;
      s.velocity = s.velocity * 0.6 + instantV * 0.4;
    }
    s.lastX = touch.clientX;
    s.lastTime = now;
    s.currentX = touch.clientX;

    let clamped = dx;
    if (clamped > MAX_SWIPE) {
      const overshoot = clamped - MAX_SWIPE;
      clamped = MAX_SWIPE + overshoot * 0.25;
      clamped = Math.min(clamped, MAX_SWIPE + RUBBER_BAND_LIMIT);
    }

    const el = document.getElementById(elId);
    const wrap = el?.parentElement;
    if (el) {
      el.style.transform = `translateX(-${clamped}px)`;
      el.style.transition = 'none';
      const progress = Math.min(clamped / MAX_SWIPE, 1);
      const actions = wrap?.querySelector('.notif-swipe-actions') as HTMLElement;
      if (actions) {
        actions.style.opacity = String(progress * 1.2);
        actions.style.transition = 'none';
      }
    }
  }, [elId]);

  const handleTouchEnd = useCallback(() => {
    const s = swipeRef.current;
    if (!s.isSwiping) return;
    s.isSwiping = false;

    const diff = s.startX - s.currentX;
    const flickVelocity = -s.velocity;
    const shouldReveal = diff > SNAP_THRESHOLD || (diff > 15 && flickVelocity > FLICK_VELOCITY_THRESHOLD);

    const el = document.getElementById(elId);
    const wrap = el?.parentElement;
    if (el) {
      if (shouldReveal) {
        el.style.transition = 'transform .32s cubic-bezier(.22,1,.36,1)';
        el.style.transform = `translateX(-${MAX_SWIPE}px)`;
        wrap?.classList.add('revealed');
        const actions = wrap?.querySelector('.notif-swipe-actions') as HTMLElement;
        if (actions) {
          actions.style.transition = 'opacity .25s ease';
          actions.style.opacity = '1';
        }
      } else {
        el.style.transition = 'transform .4s cubic-bezier(.32,1.4,.56,1)';
        el.style.transform = 'translateX(0)';
        wrap?.classList.remove('revealed');
        const actions = wrap?.querySelector('.notif-swipe-actions') as HTMLElement;
        if (actions) {
          actions.style.transition = 'opacity .3s ease';
          actions.style.opacity = '0';
        }
      }
    }
  }, [elId]);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDeleted(true);
    if (onDelete) onDelete(id);
  };

  const handlePin = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPinned((p) => !p);
    resetSwipe();
    if (onPin) onPin(id);
  };

  if (deleted) return null;

  return (
    <div className="notif-swipe-wrap" style={{ marginBottom: 0 }}>
      <div className="notif-swipe-actions">
        <button
          className="notif-swipe-btn notif-swipe-pin"
          onClick={handlePin}
          aria-label="Épingler"
          style={{ opacity: pinned ? 1 : undefined }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill={pinned ? "#fff" : "none"} stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z" />
          </svg>
        </button>
        <button
          className="notif-swipe-btn notif-swipe-delete"
          onClick={handleDelete}
          aria-label="Supprimer"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><path d="M10 11v6" /><path d="M14 11v6" />
          </svg>
        </button>
      </div>
      <div
        id={elId}
        className="activity-item"
        style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", position: "relative", zIndex: 1, background: "var(--bg)" }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={resetSwipe}
      >
        {pinned && (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="#D4A437" stroke="none" style={{ position: "absolute", top: 8, right: 4 }}>
            <path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z" />
          </svg>
        )}
        <div style={{ width: 40, height: 40, borderRadius: 12, background: tx.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <AppIcon name={tx.icon} size={18} stroke={tx.type === "credit" ? "#60a5fa" : "rgba(255,255,255,0.82)"} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.name}</div>
          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{tx.dateTimestamp ? timeAgo(tx.dateTimestamp) : tx.date}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: tx.type === "credit" ? "#22c55e" : "var(--fg)" }}>{tx.type === "credit" ? "+" : "-"}{tx.amount}</div>
          <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>{tx.category}</div>
        </div>
      </div>
    </div>
  );
}
