'use client';

import React from 'react';
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
}

export default function NotificationsPanel({
  notifications,
  transactions = [],
  open,
  unreadCount,
  onClose,
  onMarkAllRead,
  onMarkRead,
}: NotificationsPanelProps) {
  if (!open) return null;

  const hasTransactions = transactions.length > 0;
  const hasNotifications = notifications.length > 0;
  const totalItems = hasTransactions ? transactions.length + (hasNotifications ? notifications.length : 0) : hasNotifications ? notifications.length : 0;

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
            {hasTransactions && (
              <>
                <div style={{ padding: "6px 4px 8px", fontSize: 10, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--gold)" }}>
                  Historique des transactions
                </div>
                {transactions.map((tx, idx) => (
                  <div key={tx.receiptId || `tx-${tx.name}-${idx}`} className="notif-panel-item read" style={{ cursor: "default" }}>
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
                ))}
              </>
            )}

            {/* ── App Notifications Section ── */}
            {hasNotifications && (
              <>
                {hasTransactions && (
                  <div style={{ padding: "12px 4px 8px", fontSize: 10, fontWeight: 800, letterSpacing: ".14em", textTransform: "uppercase", color: "#64748b" }}>
                    Messages
                  </div>
                )}
                {notifications.map((item) => (
                  <button key={item.id} className={`notif-panel-item ${item.read ? "read" : "unread"}`} onClick={() => onMarkRead(item.id)}>
                    <div className="notif-panel-ico" style={{ background: item.bg, color: item.icon === "morali" ? "#22c55e" : item.icon === "card" ? "#60a5fa" : item.icon === "shield" ? "#D4A437" : "#60a5fa" }}>
                      <AppIcon name={item.icon} size={18} stroke="currentColor" />
                    </div>
                    <div className="notif-panel-body">
                      <p className="notif-panel-item-title">{item.title}</p>
                      <p className="notif-panel-time">{item.time}</p>
                      <span className={`notif-panel-item-badge ${item.badgeClass}`}>{item.badge}</span>
                    </div>
                    {!item.read && <span className="notif-panel-unread" />}
                  </button>
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
