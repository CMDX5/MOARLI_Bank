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

const SWIPE_THRESHOLD = 50;
const MAX_SWIPE = 90;

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
  const swipeRefs = useRef<Map<string, { startX: number; currentX: number; isSwiping: boolean }>>(new Map());

  const handleTouchStart = useCallback((id: string, e: React.TouchEvent) => {
    const swipeState = swipeRefs.current.get(id);
    if (swipeState) {
      swipeState.startX = e.touches[0].clientX;
      swipeState.currentX = e.touches[0].clientX;
      swipeState.isSwiping = true;
    } else {
      swipeRefs.current.set(id, {
        startX: e.touches[0].clientX,
        currentX: e.touches[0].clientX,
        isSwiping: true,
      });
    }
  }, []);

  const handleTouchMove = useCallback((id: string, e: React.TouchEvent) => {
    const swipeState = swipeRefs.current.get(id);
    if (!swipeState || !swipeState.isSwiping) return;
    swipeState.currentX = e.touches[0].clientX;
    const diff = swipeState.startX - swipeState.currentX;
    const clamped = Math.min(Math.max(diff, 0), MAX_SWIPE);
    const el = document.getElementById(`notif-swipe-${id}`);
    if (el) {
      el.style.transform = `translateX(-${clamped}px)`;
      el.style.transition = 'none';
    }
  }, []);

  const handleTouchEnd = useCallback((id: string) => {
    const swipeState = swipeRefs.current.get(id);
    if (!swipeState || !swipeState.isSwiping) return;
    swipeState.isSwiping = false;
    const diff = swipeState.startX - swipeState.currentX;
    const el = document.getElementById(`notif-swipe-${id}`);
    const wrap = el?.parentElement;
    if (el) {
      if (diff > SWIPE_THRESHOLD) {
        el.style.transition = 'transform .25s cubic-bezier(.4,0,.2,1)';
        el.style.transform = `translateX(-${MAX_SWIPE}px)`;
        wrap?.classList.add('revealed');
      } else {
        el.style.transition = 'transform .25s cubic-bezier(.4,0,.2,1)';
        el.style.transform = 'translateX(0)';
        wrap?.classList.remove('revealed');
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
      el.style.transition = 'transform .25s cubic-bezier(.4,0,.2,1)';
      el.style.transform = 'translateX(0)';
      wrap?.classList.remove('revealed');
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
        <AppIcon name={pinnedIds.has(id) ? "pin" : "pin"} size={18} stroke="#3b82f6" />
      </button>
      <button
        className="notif-swipe-btn notif-swipe-delete"
        onClick={(e) => { e.stopPropagation(); handleDelete(id); }}
        aria-label="Supprimer"
      >
        <AppIcon name="shield" size={18} stroke="#ef4444" />
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
