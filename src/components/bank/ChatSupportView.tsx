'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';

interface ChatSupportViewProps {
  authUid: string | null;
  onBack: () => void;
  showToast: (msg: string) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
}

interface ChatMessageItem {
  id: string;
  sender: 'user' | 'support';
  text: string;
  timestamp: unknown;
  read: boolean;
  synced?: boolean;
}

const QUICK_REPLY_OPTIONS = [
  'Problème de transaction',
  'Carte bloquée',
  'Question tarif',
];

function getTimeLabel(timestamp: unknown): string {
  if (!timestamp) return '';
  let ms: number;
  if (typeof timestamp === 'object' && timestamp !== null && 'seconds' in (timestamp as object)) {
    ms = (timestamp as { seconds: number }).seconds * 1000;
  } else if (typeof timestamp === 'string') {
    ms = new Date(timestamp).getTime();
  } else {
    ms = timestamp as number;
  }
  if (isNaN(ms)) return '';
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function getDateSeparator(timestamp: unknown): string | null {
  if (!timestamp) return null;
  let ms: number;
  if (typeof timestamp === 'object' && timestamp !== null && 'seconds' in (timestamp as object)) {
    ms = (timestamp as { seconds: number }).seconds * 1000;
  } else if (typeof timestamp === 'string') {
    ms = new Date(timestamp).getTime();
  } else {
    ms = timestamp as number;
  }
  if (isNaN(ms)) return null;
  const d = new Date(ms);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return null;
  if (d.toDateString() === new Date(today.getTime() - 86400000).toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function getDateKey(timestamp: unknown): string {
  if (!timestamp) return 'unknown';
  let ms: number;
  if (typeof timestamp === 'object' && timestamp !== null && 'seconds' in (timestamp as object)) {
    ms = (timestamp as { seconds: number }).seconds * 1000;
  } else if (typeof timestamp === 'string') {
    ms = new Date(timestamp).getTime();
  } else {
    ms = timestamp as number;
  }
  if (isNaN(ms)) return 'unknown';
  return new Date(ms).toDateString();
}

export default function ChatSupportView({ authUid, onBack, showToast, getAuthHeaders }: ChatSupportViewProps) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [lastFetchId, setLastFetchId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isMountedRef = useRef(true);

  // Keep mounted ref in sync
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, []);

  // Fetch messages from API
  const fetchMessages = useCallback(async (showLoading = false) => {
    if (!authUid) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/chat', { headers });
      if (!res.ok) {
        if (res.status === 401) {
          showToast('Session expirée — reconnectez-vous');
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (!isMountedRef.current) return;

      const items: ChatMessageItem[] = (data.messages || []).map((m: Record<string, unknown>) => ({
        id: m.id as string,
        sender: (m.sender as 'user' | 'support') || 'user',
        text: (m.text as string) || '',
        timestamp: m.timestamp || Date.now(),
        read: m.read !== false,
        synced: true,
      }));

      setMessages(items);
      if (items.length > 0) {
        setLastFetchId(items[items.length - 1].id);
      }
      setInitialLoad(false);
      scrollToBottom();
    } catch (err) {
      console.error('[ChatSupport] fetch error:', err);
      if (showLoading && isMountedRef.current) {
        setInitialLoad(false);
      }
    }
  }, [authUid, getAuthHeaders, showToast, scrollToBottom]);

  // Poll for new messages every 4 seconds
  useEffect(() => {
    if (!authUid) {
      setInitialLoad(false);
      return;
    }

    // Initial load
    fetchMessages(true);

    // Start polling
    pollingRef.current = setInterval(() => {
      fetchMessages(false);
    }, 4000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [authUid, fetchMessages]);

  // Send message via API
  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || !authUid || sending) return;

    const trimmed = text.trim();
    setSending(true);
    setNewMessage('');

    // Optimistic: add user message locally
    const tempId = `temp-${Date.now()}`;
    const userMsg: ChatMessageItem = {
      id: tempId,
      sender: 'user',
      text: trimmed,
      timestamp: Date.now(),
      read: true,
      synced: false,
    };
    setMessages((prev) => [...prev, userMsg]);
    scrollToBottom();

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: trimmed }),
      });

      if (!res.ok) {
        if (res.status === 401) {
          showToast('Session expirée — reconnectez-vous');
        } else if (res.status === 429) {
          showToast('Trop de messages — attendez un instant');
        } else {
          showToast('Envoi échoué — réessayez');
        }
        // Remove optimistic message on failure
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setSending(false);
        return;
      }

      // Message sent successfully — API schedules auto-reply
      // Mark as synced (will be replaced by fetched data on next poll)
      setMessages((prev) =>
        prev.map((m) => (m.id === tempId ? { ...m, synced: true } : m))
      );

      // Show typing indicator for auto-reply
      setIsTyping(true);

      // Poll after delay to get the auto-reply
      setTimeout(() => {
        fetchMessages(false);
        setIsTyping(false);
      }, 2000 + Math.random() * 1000);
    } catch (err) {
      console.error('[ChatSupport] send error:', err);
      showToast('Erreur réseau — vérifiez votre connexion');
      // Remove optimistic message on failure
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    } finally {
      setSending(false);
    }
  }, [authUid, sending, getAuthHeaders, showToast, scrollToBottom, fetchMessages]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!sending) {
      sendMessage(newMessage);
    }
  }, [newMessage, sendMessage, sending]);

  const handleQuickReply = useCallback((text: string) => {
    sendMessage(text);
  }, [sendMessage]);

  // Group messages by date
  const groupedMessages: { dateLabel: string | null; messages: ChatMessageItem[] }[] = [];
  let lastDate: string | null = null;
  messages.forEach((msg) => {
    const dateKey = getDateKey(msg.timestamp);
    if (dateKey !== lastDate) {
      const dateLabel = getDateSeparator(msg.timestamp);
      groupedMessages.push({ dateLabel, messages: [msg] });
      lastDate = dateKey;
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#050b1a' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: 'calc(env(safe-area-inset-top, 0px) + 12px) 18px 12px',
        background: '#050b1a', borderBottom: '1px solid rgba(59,130,246,0.1)',
        flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{
            width: 36, height: 36, borderRadius: 12, border: '1px solid rgba(59,130,246,0.18)',
            background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: '#fff',
          }}
          aria-label="Retour"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Support avatar */}
        <div style={{
          width: 40, height: 40, borderRadius: 14, flexShrink: 0,
          background: 'linear-gradient(135deg, rgba(59,130,246,0.2), rgba(26,62,120,0.2))',
          border: '1px solid rgba(59,130,246,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="1.8" strokeLinecap="round">
            <path d="M4 12a8 8 0 0 1 16 0" />
            <rect x="3" y="12" width="4" height="7" rx="2" />
            <rect x="17" y="12" width="4" height="7" rx="2" />
            <path d="M19 19a3 3 0 0 1-3 3h-2" />
          </svg>
          {/* Online indicator */}
          <div style={{
            position: 'absolute', bottom: -1, right: -1, width: 12, height: 12,
            borderRadius: '50%', background: '#22c55e', border: '2px solid #050b1a',
          }} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Support MORALI</div>
          <div style={{ fontSize: 11, color: isTyping ? '#60a5fa' : '#22c55e', fontWeight: 600 }}>
            {isTyping ? 'En train d\'écrire...' : 'En ligne'}
          </div>
        </div>
      </div>

      {/* Chat Messages */}
      <div
        style={{
          flex: 1, overflowY: 'auto', padding: '16px 16px 8px',
          display: 'flex', flexDirection: 'column', gap: 4,
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {initialLoad ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ width: 28, height: 28, border: '3px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
          </div>
        ) : messages.length === 0 ? (
          /* Empty state */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: 20, marginBottom: 16,
              background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Bienvenue !</div>
            <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5, maxWidth: 260, marginBottom: 24 }}>
              Comment pouvons-nous vous aider aujourd&apos;hui ?
            </div>

            {/* Quick replies for empty state */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              {QUICK_REPLY_OPTIONS.map((label) => (
                <button
                  key={label}
                  onClick={() => handleQuickReply(label)}
                  disabled={sending}
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: 14,
                    border: '1px solid rgba(59,130,246,0.18)',
                    background: 'rgba(59,130,246,0.06)', color: '#60a5fa',
                    fontSize: 13, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer', textAlign: 'left',
                    opacity: sending ? 0.5 : 1,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message bubbles */
          groupedMessages.map((group, gi) => (
            <div key={gi}>
              {group.dateLabel && (
                <div style={{
                  textAlign: 'center', padding: '12px 0 8px',
                  fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'capitalize',
                }}>
                  {group.dateLabel}
                </div>
              )}
              {group.messages.map((msg) => {
                const isUser = msg.sender === 'user';
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: 'flex',
                      justifyContent: isUser ? 'flex-end' : 'flex-start',
                      marginBottom: 4, padding: isUser ? '4px 0 4px 40px' : '4px 40px 4px 0',
                    }}
                  >
                    {!isUser && (
                      <div style={{
                        width: 28, height: 28, borderRadius: 10, flexShrink: 0,
                        background: 'rgba(59,130,246,0.15)', marginRight: 8, marginTop: 2,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="8" r="4" />
                        </svg>
                      </div>
                    )}
                    <div style={{ maxWidth: '80%' }}>
                      <div style={{
                        padding: '10px 14px',
                        borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                        background: isUser
                          ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
                          : 'rgba(255,255,255,0.06)',
                        border: isUser ? 'none' : '1px solid rgba(255,255,255,0.08)',
                        color: '#fff',
                        fontSize: 13,
                        lineHeight: 1.5,
                        wordBreak: 'break-word',
                        whiteSpace: 'pre-wrap',
                        boxShadow: isUser ? '0 4px 12px rgba(59,130,246,0.25)' : 'none',
                      }}>
                        {msg.text}
                      </div>
                      <div style={{
                        fontSize: 9, color: '#64748b', marginTop: 3,
                        textAlign: isUser ? 'right' : 'left', paddingLeft: 2,
                      }}>
                        {getTimeLabel(msg.timestamp)}
                        {isUser && (
                          <span style={{ marginLeft: 4, color: msg.synced ? '#22c55e' : '#fbbf24' }}>
                            {msg.synced ? '✓✓' : '••'}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ))
        )}

        {/* Typing indicator */}
        {isTyping && (
          <div style={{
            display: 'flex', alignItems: 'flex-start', padding: '4px 40px 4px 0', marginBottom: 4,
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: 10, flexShrink: 0,
              background: 'rgba(59,130,246,0.15)', marginRight: 8, marginTop: 2,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="8" r="4" />
              </svg>
            </div>
            <div style={{
              padding: '12px 18px',
              borderRadius: '16px 16px 16px 4px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <span style={{
                width: 7, height: 7, borderRadius: '50%', background: '#60a5fa',
                animation: 'typingBounce 1.2s ease-in-out infinite',
              }} />
              <span style={{
                width: 7, height: 7, borderRadius: '50%', background: '#60a5fa',
                animation: 'typingBounce 1.2s ease-in-out 0.2s infinite',
              }} />
              <span style={{
                width: 7, height: 7, borderRadius: '50%', background: '#60a5fa',
                animation: 'typingBounce 1.2s ease-in-out 0.4s infinite',
              }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Replies (shown when there are messages) */}
      {messages.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, padding: '8px 16px',
          overflowX: 'auto', flexShrink: 0, WebkitOverflowScrolling: 'touch',
        }}>
          {QUICK_REPLY_OPTIONS.map((label) => (
            <button
              key={label}
              onClick={() => handleQuickReply(label)}
              disabled={sending}
              style={{
                padding: '8px 14px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0,
                border: '1px solid rgba(59,130,246,0.18)',
                background: 'rgba(59,130,246,0.06)', color: '#60a5fa',
                fontSize: 11, fontWeight: 600, cursor: sending ? 'not-allowed' : 'pointer',
                opacity: sending ? 0.5 : 1,
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Message Input */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 16px calc(env(safe-area-inset-bottom, 0px) + 12px)',
        background: '#0a0f1e', borderTop: '1px solid rgba(59,130,246,0.08)',
        flexShrink: 0,
      }}>
        <form onSubmit={handleSubmit} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
          <input
            ref={inputRef}
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Écrire un message..."
            disabled={sending}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 16,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(59,130,246,0.12)',
              color: '#fff', fontSize: 14, outline: 'none', minHeight: 44,
            }}
          />
          <button
            type="submit"
            disabled={sending || !newMessage.trim()}
            style={{
              width: 44, height: 44, borderRadius: 14, border: 'none', flexShrink: 0,
              background: sending || !newMessage.trim()
                ? 'rgba(59,130,246,0.2)'
                : 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: '#fff', cursor: sending || !newMessage.trim() ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: sending || !newMessage.trim() ? 'none' : '0 4px 14px rgba(59,130,246,0.4)',
              transition: 'all 0.2s',
            }}
            aria-label="Envoyer"
          >
            {sending ? (
              <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            )}
          </button>
        </form>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes typingBounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-6px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
