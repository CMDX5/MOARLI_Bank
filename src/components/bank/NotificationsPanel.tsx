'use client';

import React from 'react';
import type { NotificationItem } from '@/types/morali';
import { AppIcon } from '@/components/bank/Icons';

interface NotificationsPanelProps {
  notifications: NotificationItem[];
  open: boolean;
  unreadCount: number;
  onClose: () => void;
  onMarkAllRead: () => void;
  onMarkRead: (id: string) => void;
}

export default function NotificationsPanel({
  notifications,
  open,
  unreadCount,
  onClose,
  onMarkAllRead,
  onMarkRead,
}: NotificationsPanelProps) {
  if (!open) return null;

  return (
    <div className={`notif-overlay ${open ? "open" : ""}`} onClick={onClose}>
      <div className="notif-panel" onClick={(event) => event.stopPropagation()}>
        <div className="notif-panel-head">
          <h3 className="notif-panel-title">Notifications</h3>
          <button className="notif-panel-action" onClick={onMarkAllRead} disabled={unreadCount === 0}>
            Tout lire
          </button>
        </div>

        {notifications.length > 0 ? (
          <div className="notif-panel-list">
            {notifications.map((item) => (
              <button key={item.id} className={`notif-panel-item ${item.read ? "read" : "unread"}`} onClick={() => onMarkRead(item.id)}>
                <div className="notif-panel-ico" style={{ background: item.bg, color: item.icon === "morali" ? "#22c55e" : item.icon === "card" ? "#60a5fa" : item.icon === "shield" ? "#D4A437" : "#60a5fa" }}>
                  <AppIcon name={item.icon} size={18} stroke="currentColor" />
                </div>
                <div className="notif-panel-body">
                  <p className="notif-panel-item-title">{item.title}</p>
                  <p className="notif-panel-item-time">{item.time}</p>
                  <span className={`notif-panel-item-badge ${item.badgeClass}`}>{item.badge}</span>
                </div>
                {!item.read && <span className="notif-panel-unread" />}
              </button>
            ))}
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
