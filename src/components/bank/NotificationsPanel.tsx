'use client';

import React, { useState, useRef, useCallback } from 'react';
import type { NotificationItem, Transaction } from '@/types/morali';
import { AppIcon } from '@/components/bank/Icons';

interface NotificationsPanelProps {
  notifications: NotificationItem[];
  transactions?: Transaction[];
  open: boolean;
  unreadCount: number;
  onClose: () => void;
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
  onDelete?: (id: string) => void;
  onPin?: (id: string) => void;
}

const SWIPE_THRESHOLD = 25;
const MAX_SWIPE = 88;
const VELOCITY_THRESHOLD = 0.35; // px/ms — fast flick triggers reveal

export default function NotificationsPanel({
  notifications,
  transactions = [],
  open,
  unreadCount,
  onClose,
  onMarkAllRead,
  onMarkRead,
  onDelete,
  onPin,
}: NotificationsPanelProps) {
  const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const swipeRefs = useRef<Map<string, {
    startX: number;
    startY: number;
    currentX: number;
    startTime: number;
    isSwiping: boolean;
    direction: 'none' | 'horizontal' | 'vertical';
  }>>(new Map());

  const handleTouchStart = useCallback((id: string, e: React.TouchEvent) => {
    const touch = e.touches[0];
    swipeRefs.current.set(id, {
      startX: touch.clientX,
      startY: touch.clientY,
      currentX: touch.clientX,
      startTime: Date.now(),
      isSwiping: true,
      direction: 'none',
    });
  }, []);

  const handleTouchMove = useCallback((id: string, e: React.TouchEvent) => {
    const swipeState = swipeRefs.current.get(id);
    if (!swipeState || !swipeState.isSwiping) return;

    const touch = e.touches[0];
    const dx = swipeState.startX - touch.clientX;
    const dy = Math.abs(touch.clientY - swipeState.startY);

    // Lock direction after 8px of movement
    if (swipeState.direction === 'none') {
      if (Math.abs(dx) > 8 || dy > 8) {
        swipeState.direction = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
      }
      return;
    }

    // Only handle horizontal swipes (left direction only)
    if (swipeState.direction === 'vertical') return;
    if (dx < 0) return; // only left swipe

    swipeState.currentX = touch.clientX;
    const clamped = Math.min(dx, MAX_SWIPE);

    const el = document.getElementById(`notif-swipe-${id}`);
    const wrap = el?.parentElement;
    if (el) {
      el.style.transform = `translateX(-${clamped}px)`;
      el.style.transition = 'none';
      // Progressive action reveal: actions opacity follows swipe progress
      const progress = clamped / MAX_SWIPE;
      const actions = wrap?.querySelector('.notif-swipe-actions') as HTMLElement;
      if (actions) {
        actions.style.opacity = String(Math.min(progress * 2, 1));
      }
    }
  }, []);

  const handleTouchEnd = useCallback((id: string) => {
    const swipeState = swipeRefs.current.get(id);
    if (!swipeState || !swipeState.isSwiping) return;
    swipeState.isSwiping = false;

    const diff = swipeState.startX - swipeState.currentX;
    const elapsed = Date.now() - swipeState.startTime;
    const velocity = diff / (elapsed || 1); // px/ms

    const shouldReveal = diff > SWIPE_THRESHOLD || (diff > 10 && velocity > VELOCITY_THRESHOLD);

    const el = document.getElementById(`notif-swipe-${id}`);
    const wrap = el?.parentElement;
    if (el) {
      if (shouldReveal) {
        el.style.transition = 'transform .28s cubic-bezier(.32,.72,.27,1.01)';
        el.style.transform = `translateX(-${MAX_SWIPE}px)`;
        wrap?.classList.add('revealed');
        const actions = wrap?.querySelector('.notif-swipe-actions') as HTMLElement;
        if (actions) actions.style.opacity = '1';
      } else {
        el.style.transition = 'transform .3s cubic-bezier(.32,.72,.27,1)';
        el.style.transform = 'translateX(0)';
        wrap?.classList.remove('revealed');
        const actions = wrap?.querySelector('.notif-swipe-actions') as HTMLElement;
        if (actions) actions.style.opacity = '0';
      }
    }
  }, []);

  if (!open) return null;

  const hasTransactions = transactions.length > 0;
  const hasNotifications = notifications.length > 0;

  const sortedNotifications = [...notifications].sort((a, b) => {
    const aPinned = pinnedIds.has(a.id);
    const bPinned = pinnedIds.has(b.id);
    if (aPinned && !bPinned) return -1;
    if (!aPinned && bPinned) return 1;
    return 0;
  });

  const filteredTransactions = transactions.filter(
    (tx) => !deletedIds.has(`tx-${tx.receiptId || tx.name}`)
  );
  const filteredNotifications = sortedNotifications.filter(
    (item) => !deletedIds.has(item.id)
  );

  const totalItems = filteredTransactions.length + filteredNotifications.length;

  const resetSwipe = (id: string) => {
    const el = document.getElementById(`notif-swipe-${id}`);
    const wrap = el?.parentElement;
    if (el) {
      el.style.transition = 'transform .3s cubic-bezier(.32,.72,.27,1)';
      el.style.transform = 'translateX(0)';
      wrap?.classList.remove('revealed');
      const actions = wrap?.querySelector('.notif-swipe-actions') as HTMLElement;
      if (actions) actions.style.opacity = '0';
    }
  };

  const handleDelete = (id: string) => {
    setDeletedIds((prev) => new Set(prev).add(id));
    if (onDelete) onDelete(id);
  };

  const handlePin = (id: string) => {
    setPinnedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    resetSwipe(id);
    if (onPin) onPin(id);
  };

  const renderSwipeActions = (id: string) => (
    <div className="notif-swipe-actions">
      <button
        className="notif-swipe-btn notif-swipe-pin"
        onClick={(e) => { e.stopPropagation(); handlePin(id); }}
        aria-label="Épingler"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1Z" />
        </svg>
      </button>
      <button
        className="notif-swipe-btn notif-swipe-delete"
        onClick={(e) => { e.stopPropagation(); handleDelete(id); }}
        aria-label="Supprimer"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><path d="M10 11v6" /><path d="M14 11v6" />
        </svg>
      </button>
    </div>
  );

  return (
    <div className={`notif-overlay ${open ? "open" : ""}`} onClick={onClose}>
      <div className="notif-panel" onClick={(event) => event.stopPropagation()}>
        <div className="notif-panel-head">
          <h3 className="notif-panel-title">Notifications</h3>
          <button className="notif-panel-action" onClick={onMarkAllRead} disabled={unreadCount === 0}>
            Tout lire
          </button>
        </div>

        {totalItems > 0 ? (
          <div className="notif-panel-list">
            {/* ── Transaction History Section ── */}
            {filteredTransactions.length > 0 && (
              <>
                <div style={{ padding: "6px 4px 8px", fontSize: 10, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--gold)" }}>
                  Historique des transactions
                </div>
                {filteredTransactions.map((tx, idx) => {
                  const txId = `tx-${tx.receiptId || tx.name}-${idx}`;
                  return (
                    <div key={txId} className="notif-swipe-wrap">
                      {renderSwipeActions(txId)}
                      <div
                        id={`notif-swipe-${txId}`}
                        className="notif-panel-item read"
                        style={{ cursor: "default" }}
                        onTouchStart={(e) => handleTouchStart(txId, e)}
                        onTouchMove={(e) => handleTouchMove(txId, e)}
                        onTouchEnd={() => handleTouchEnd(txId)}
                        onClick={() => resetSwipe(txId)}
                      >
                        <div className="notif-panel-ico" style={{ background: tx.bg, color: tx.type === "credit" ? "#60a5fa" : tx.icon === "bolt" ? "#D4A437" : "rgba(255,255,255,0.82)" }}>
                          <AppIcon name={tx.icon} size={18} stroke="currentColor" />
                        </div>
                        <div className="notif-panel-body">
                          <p className="notif-panel-item-title">{tx.name}</p>
                          <p className="notif-panel-time">{tx.dateTimestamp ? new Date(tx.dateTimestamp).toLocaleDateString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : tx.date}</p>
                          <span className={`notif-panel-item-badge ${tx.type === "credit" ? "nb-green" : "nb-blue"}`}>
                            {tx.type === "credit" ? "+" : "-"}{tx.amount}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}

            {/* ── App Notifications Section ── */}
            {filteredNotifications.length > 0 && (
              <>
                {filteredTransactions.length > 0 && (
                  <div style={{ padding: "12px 4px 8px", fontSize: 10, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: "#64748b" }}>
                    Messages
                  </div>
                )}
                {filteredNotifications.map((item) => (
                  <div key={item.id} className="notif-swipe-wrap">
                    {renderSwipeActions(item.id)}
                    <button
                      id={`notif-swipe-${item.id}`}
                      className={`notif-panel-item ${item.read ? "read" : "unread"}`}
                      onClick={() => { onMarkRead(item.id); resetSwipe(item.id); }}
                      onTouchStart={(e) => handleTouchStart(item.id, e)}
                      onTouchMove={(e) => handleTouchMove(item.id, e)}
                      onTouchEnd={() => handleTouchEnd(item.id)}
                    >
                      <div className="notif-panel-ico" style={{ background: item.bg, color: item.icon === "morali" ? "#22c55e" : item.icon === "card" ? "#60a5fa" : item.icon === "shield" ? "#D4A437" : "#60a5fa" }}>
                        <AppIcon name={item.icon} size={18} stroke="currentColor" />
                      </div>
                      <div className="notif-panel-body">
                        <p className="notif-panel-item-title">
                          {pinnedIds.has(item.id) && <span style={{ color: "#3b82f6", marginRight: 6, fontSize: 10 }}>📌</span>}
                          {item.title}
                        </p>
                        <p className="notif-panel-time">{item.time}</p>
                        <span className={`notif-panel-item-badge ${item.badgeClass}`}>{item.badge}</span>
                      </div>
                      {!item.read && <span className="notif-panel-unread" />}
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        ) : (
          <div className="notif-panel-empty">Aucun message reçu.</div>
        )}

        <button className="notif-panel-close" onClick={onClose}>
          Fermer
        </button>
      </div>
    </div>
  );
}
