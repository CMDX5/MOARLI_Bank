'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp, doc, updateDoc, writeBatch } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebase';

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
  local?: boolean;
}

const AUTO_REPLIES: Record<string, string> = {
  'Problème de transaction': 'Je comprends votre frustration. Pouvez-vous me préciser le numéro de transaction ou la date ? Je vais vérifier immédiatement le statut dans notre système.',
  'Carte bloquée': 'Votre carte semble être gelée. Rendez-vous dans la section "Cartes" de votre espace pour la réactiver. Si le problème persiste, je peux lancer une vérification manuelle.',
  'Question tarif': 'Voici nos tarifs actuels :\n• Transfert national : 0.5%\n• Retrait cash : 1%\n• Crédit téléphone : 0 FCFA\n• Change devises : Spread de 2%\n\nY a-t-il un service spécifique qui vous intéresse ?',
};

const SUPPORT_REPLIES = [
  'Merci pour votre message. Un de nos conseillers va vous répondre sous peu. En attendant, n\'hésitez pas à consulter notre FAQ dans les paramètres.',
  'Votre demande a bien été prise en compte. Notre équipe technique examine votre cas et reviendra vers vous rapidement.',
  'Je note votre préoccupation. Pour un traitement plus rapide, vous pouvez également nous contacter par email à support@morali-pay.com.',
  'Bien reçu ! Je transmets votre demande au service compétent. Le délai de réponse est généralement de 5 à 10 minutes.',
];

function getRandomSupportReply(): string {
  return SUPPORT_REPLIES[Math.floor(Math.random() * SUPPORT_REPLIES.length)];
}

function getTimeLabel(timestamp: unknown): string {
  if (!timestamp) return '';
  const ms = typeof timestamp === 'object' && 'seconds' in (timestamp as object)
    ? (timestamp as { seconds: number }).seconds * 1000
    : timestamp as number;
  return new Date(ms).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

function getDateSeparator(timestamp: unknown): string | null {
  if (!timestamp) return null;
  const ms = typeof timestamp === 'object' && 'seconds' in (timestamp as object)
    ? (timestamp as { seconds: number }).seconds * 1000
    : timestamp as number;
  const d = new Date(ms);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return null;
  if (d.toDateString() === new Date(today.getTime() - 86400000).toDateString()) return 'Hier';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

export default function ChatSupportView({ authUid, onBack, showToast, getAuthHeaders }: ChatSupportViewProps) {
  const [messages, setMessages] = useState<ChatMessageItem[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [initialLoad, setInitialLoad] = useState(true);
  const [firestoreReady, setFirestoreReady] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const lastAutoReplyRef = useRef<string>('');
  const unreadCountRef = useRef(0);
  const localIdCounter = useRef(0);

  // Real-time chat listener
  useEffect(() => {
    if (!authUid || !firebaseDb) {
      setInitialLoad(false);
      setFirestoreReady(false);
      return;
    }

    const q = query(
      collection(firebaseDb, 'chats', authUid, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsub = onSnapshot(q, (snap) => {
      const items: ChatMessageItem[] = [];
      let unread = 0;

      snap.forEach((d) => {
        const data = d.data();
        items.push({
          id: d.id,
          sender: data.sender || 'user',
          text: data.text || '',
          timestamp: data.timestamp,
          read: data.read !== false,
        });
        if (data.sender === 'support' && !data.read) {
          unread++;
        }
      });

      // Merge: keep local messages that haven't synced yet
      setMessages((prev) => {
        const localOnly = prev.filter((m) => m.local && !items.some((i) => i.text === m.text));
        return [...items, ...localOnly];
      });
      setUnreadCount(unread);
      unreadCountRef.current = unread;
      setInitialLoad(false);
      setFirestoreReady(true);

      // Auto-scroll to bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }, (err) => {
      console.error('[ChatSupport] onSnapshot error:', err);
      setInitialLoad(false);
      // Firestore rules may block — fall back to local-only mode
      if (String(err).includes('permission') || String(err).includes('PERMISSION_DENIED')) {
        setFirestoreReady(false);
      }
    });

    return () => unsub();
  }, [authUid]);

  // Mark messages as read when chat is visible
  useEffect(() => {
    if (!authUid || !firebaseDb || unreadCount === 0) return;
    (async () => {
      try {
        const batch = writeBatch(firebaseDb);
        messages.forEach((msg) => {
          if (msg.sender === 'support' && !msg.read && !msg.local) {
            batch.update(doc(firebaseDb, 'chats', authUid!, 'messages', msg.id), { read: true });
          }
        });
        await batch.commit();
        setUnreadCount(0);
        unreadCountRef.current = 0;
      } catch (err) {
        console.error('[ChatSupport] markAsRead error:', err);
      }
    })();
  }, [authUid, messages, unreadCount]);

  const sendToFirestore = useCallback(async (msgData: { sender: string; text: string }) => {
    if (!authUid || !firebaseDb) return false;
    try {
      await addDoc(collection(firebaseDb, 'chats', authUid, 'messages'), {
        sender: msgData.sender,
        text: msgData.text,
        timestamp: serverTimestamp(),
        read: msgData.sender === 'user',
      });
      return true;
    } catch (err) {
      console.error('[ChatSupport] firestore write error:', err);
      return false;
    }
  }, [authUid]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim()) return;
    setSending(true);

    const trimmed = text.trim();

    // Optimistic: add user message locally immediately
    const localId = `local-${Date.now()}-${localIdCounter.current++}`;
    const userMsg: ChatMessageItem = {
      id: localId,
      sender: 'user',
      text: trimmed,
      timestamp: Date.now(),
      read: true,
      local: true,
    };

    setMessages((prev) => [...prev, userMsg]);
    setNewMessage('');

    // Try Firestore write
    const sent = await sendToFirestore({ sender: 'user', text: trimmed });

    if (!sent) {
      // Remove local flag — message stays visible but marked as local-only
      console.warn('[ChatSupport] Message saved locally only');
    }

    // Remove the optimistic local message once Firestore syncs (handled by onSnapshot merge)

    // Auto-reply
    setIsTyping(true);
    const replyText = AUTO_REPLIES[trimmed] || getRandomSupportReply();
    lastAutoReplyRef.current = replyText;

    const delay = 1200 + Math.random() * 1500;
    setTimeout(async () => {
      setIsTyping(false);

      // Add support reply locally
      const replyId = `local-${Date.now()}-${localIdCounter.current++}`;
      const supportMsg: ChatMessageItem = {
        id: replyId,
        sender: 'support',
        text: replyText,
        timestamp: Date.now(),
        read: false,
        local: true,
      };
      setMessages((prev) => [...prev, supportMsg]);

      // Try to persist to Firestore
      await sendToFirestore({ sender: 'support', text: replyText });
    }, delay);

    setSending(false);
  }, [sendToFirestore]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    sendMessage(newMessage);
  }, [newMessage, sendMessage]);

  const handleQuickReply = useCallback((text: string) => {
    sendMessage(text);
  }, [sendMessage]);

  const handleFocusInput = useCallback(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, []);

  // Group messages by date
  const groupedMessages: { dateLabel: string | null; messages: ChatMessageItem[] }[] = [];
  let lastDate: string | null = null;
  messages.forEach((msg) => {
    const dateLabel = getDateSeparator(msg.timestamp);
    const dateKey = msg.timestamp
      ? new Date(
          typeof msg.timestamp === 'object' && 'seconds' in (msg.timestamp as object)
            ? (msg.timestamp as { seconds: number }).seconds * 1000
            : msg.timestamp as number
        ).toDateString()
      : 'unknown';

    if (dateKey !== lastDate) {
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
          <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 600 }}>
            {isTyping ? 'En train d\'écrire...' : 'En ligne'}
          </div>
        </div>

        {/* Unread badge */}
        {unreadCount > 0 && (
          <div style={{
            minWidth: 22, height: 22, borderRadius: 11, padding: '0 6px',
            background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 800, color: '#fff',
          }}>
            {unreadCount}
          </div>
        )}
      </div>

      {/* Chat Messages */}
      <div
        ref={chatContainerRef}
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
              {Object.keys(AUTO_REPLIES).map((label) => (
                <button
                  key={label}
                  onClick={() => handleQuickReply(label)}
                  style={{
                    width: '100%', padding: '12px 16px', borderRadius: 14,
                    border: '1px solid rgba(59,130,246,0.18)',
                    background: 'rgba(59,130,246,0.06)', color: '#60a5fa',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer', textAlign: 'left',
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
                          <span style={{ marginLeft: 4, color: msg.local ? '#fbbf24' : '#22c55e' }}>
                            {msg.local ? '••' : '✓✓'}
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

      {/* Quick Replies */}
      {messages.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, padding: '8px 16px',
          overflowX: 'auto', flexShrink: 0, WebkitOverflowScrolling: 'touch',
        }}>
          {Object.keys(AUTO_REPLIES).map((label) => (
            <button
              key={label}
              onClick={() => handleQuickReply(label)}
              style={{
                padding: '8px 14px', borderRadius: 20, whiteSpace: 'nowrap', flexShrink: 0,
                border: '1px solid rgba(59,130,246,0.18)',
                background: 'rgba(59,130,246,0.06)', color: '#60a5fa',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
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
