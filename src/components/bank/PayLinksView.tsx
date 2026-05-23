'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { collection, onSnapshot, query, orderBy, addDoc, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebase';
import { formatCurrency } from '@/lib/helpers';

interface PayLinksViewProps {
  authUid: string | null;
  onBack: () => void;
  showToast: (msg: string) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
}

interface PayLinkItem {
  id: string;
  amount: number;
  currency: string;
  description: string;
  shortCode: string;
  active: boolean;
  createdAt: unknown;
  totalPaid: number;
  payerCount: number;
}

function generateShortCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'MR-';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export default function PayLinksView({ authUid, onBack, showToast, getAuthHeaders }: PayLinksViewProps) {
  const [links, setLinks] = useState<PayLinkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newAmount, setNewAmount] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newCurrency] = useState('XAF');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  // Real-time listener for pay links
  useEffect(() => {
    if (!authUid || !firebaseDb) {
      setLoading(false);
      return;
    }
    const q = query(collection(firebaseDb, 'users', authUid, 'paylinks'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snap) => {
      const items: PayLinkItem[] = [];
      snap.forEach((d) => {
        const data = d.data();
        items.push({
          id: d.id,
          amount: data.amount || 0,
          currency: data.currency || 'XAF',
          description: data.description || '',
          shortCode: data.shortCode || '',
          active: data.active !== false,
          createdAt: data.createdAt,
          totalPaid: data.totalPaid || 0,
          payerCount: data.payerCount || 0,
        });
      });
      setLinks(items);
      setLoading(false);
    }, (err) => {
      console.error('[PayLinks] onSnapshot error:', err);
      setLoading(false);
    });
    return () => unsub();
  }, [authUid]);

  const handleCreate = useCallback(async () => {
    if (!authUid || !firebaseDb) return;
    const amount = parseFloat(newAmount.replace(/[^\d.]/g, ''));
    if (!amount || amount <= 0) {
      showToast('Montant invalide');
      return;
    }
    if (!newDescription.trim()) {
      showToast('Description requise');
      return;
    }
    setCreating(true);
    try {
      await addDoc(collection(firebaseDb, 'users', authUid, 'paylinks'), {
        amount: Math.round(amount),
        currency: newCurrency,
        description: newDescription.trim(),
        shortCode: generateShortCode(),
        active: true,
        totalPaid: 0,
        payerCount: 0,
        createdAt: serverTimestamp(),
      });
      setNewAmount('');
      setNewDescription('');
      setShowCreate(false);
      showToast('Lien de paiement créé');
    } catch (err) {
      console.error('[PayLinks] create error:', err);
      showToast('Erreur lors de la création');
    } finally {
      setCreating(false);
    }
  }, [authUid, newAmount, newDescription, newCurrency, showToast]);

  const handleToggle = useCallback(async (link: PayLinkItem) => {
    if (!authUid || !firebaseDb) return;
    setTogglingId(link.id);
    try {
      await updateDoc(doc(firebaseDb, 'users', authUid, 'paylinks', link.id), {
        active: !link.active,
      });
      showToast(link.active ? 'Lien désactivé' : 'Lien activé');
    } catch (err) {
      console.error('[PayLinks] toggle error:', err);
      showToast('Erreur');
    } finally {
      setTogglingId(null);
    }
  }, [authUid, showToast]);

  const handleDelete = useCallback(async (linkId: string) => {
    if (!authUid || !firebaseDb) return;
    try {
      await deleteDoc(doc(firebaseDb, 'users', authUid, 'paylinks', linkId));
      showToast('Lien supprimé');
    } catch (err) {
      console.error('[PayLinks] delete error:', err);
      showToast('Erreur');
    }
  }, [authUid, showToast]);

  const copyLink = useCallback((shortCode: string) => {
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/pay/${shortCode}`;
    navigator.clipboard.writeText(url).then(() => {
      showToast('Lien copié !');
    }).catch(() => {
      showToast('Erreur de copie');
    });
  }, [showToast]);

  const activeLinks = links.filter((l) => l.active);
  const totalRevenue = links.reduce((s, l) => s + l.totalPaid, 0);
  const totalPayers = links.reduce((s, l) => s + l.payerCount, 0);

  return (
    <div className="content-scrollable" style={{ padding: '24px 18px 140px', minHeight: '100%', background: '#050b1a' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
        <button
          onClick={onBack}
          style={{
            width: 38, height: 38, borderRadius: 12, border: '1px solid rgba(59,130,246,0.18)',
            background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: '#fff',
          }}
          aria-label="Retour"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Montserrat, sans-serif', color: '#fff', letterSpacing: -0.3 }}>
            Liens de Paiement
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Créez et partagez des liens de paiement</div>
        </div>
      </div>

      {/* Stats Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 24 }}>
        <div style={{
          padding: '14px 12px', borderRadius: 18, background: 'rgba(59,130,246,0.08)',
          border: '1px solid rgba(59,130,246,0.15)', textAlign: 'center',
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Liens actifs
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, fontFamily: 'Montserrat, sans-serif', color: '#60a5fa' }}>
            {activeLinks.length}
          </div>
        </div>
        <div style={{
          padding: '14px 12px', borderRadius: 18, background: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(34,197,94,0.15)', textAlign: 'center',
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Revenus
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, fontFamily: 'Montserrat, sans-serif', color: '#22c55e' }}>
            {formatCurrency(totalRevenue)}
          </div>
        </div>
        <div style={{
          padding: '14px 12px', borderRadius: 18, background: 'rgba(212,164,55,0.08)',
          border: '1px solid rgba(212,164,55,0.15)', textAlign: 'center',
        }}>
          <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
            Payeurs
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, fontFamily: 'Montserrat, sans-serif', color: '#D4A437' }}>
            {totalPayers}
          </div>
        </div>
      </div>

      {/* Create Button */}
      <button
        onClick={() => setShowCreate(!showCreate)}
        style={{
          width: '100%', padding: '14px 18px', borderRadius: 16, border: 'none',
          background: showCreate ? 'rgba(255,255,255,0.04)' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
          color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          boxShadow: showCreate ? 'none' : '0 8px 24px rgba(59,130,246,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          marginBottom: showCreate ? 16 : 24, transition: 'all 0.2s',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        {showCreate ? 'Annuler' : 'Créer un lien de paiement'}
      </button>

      {/* Create Form */}
      {showCreate && (
        <div style={{
          padding: 20, borderRadius: 22, background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(59,130,246,0.18)', marginBottom: 24,
          animation: 'fadeIn 0.3s ease',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#60a5fa', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>
            Nouveau lien de paiement
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              Montant ({newCurrency})
            </label>
            <input
              type="text"
              inputMode="numeric"
              value={newAmount}
              onChange={(e) => setNewAmount(e.target.value)}
              placeholder="Ex: 50 000"
              style={{
                width: '100%', padding: '13px 16px', borderRadius: 14,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(59,130,246,0.18)',
                color: '#fff', fontSize: 16, fontWeight: 700, fontFamily: 'Montserrat, sans-serif',
                outline: 'none',
              }}
            />
          </div>

          <div style={{ marginBottom: 18 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: 1, textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
              Description
            </label>
            <input
              type="text"
              value={newDescription}
              onChange={(e) => setNewDescription(e.target.value)}
              placeholder="Ex: Facture #2024-001"
              maxLength={80}
              style={{
                width: '100%', padding: '13px 16px', borderRadius: 14,
                background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(59,130,246,0.18)',
                color: '#fff', fontSize: 14, outline: 'none',
              }}
            />
          </div>

          <button
            onClick={handleCreate}
            disabled={creating}
            style={{
              width: '100%', padding: '14px', borderRadius: 14, border: 'none',
              background: creating ? 'rgba(59,130,246,0.4)' : 'linear-gradient(135deg, #3b82f6, #2563eb)',
              color: '#fff', fontSize: 14, fontWeight: 700, cursor: creating ? 'not-allowed' : 'pointer',
              boxShadow: '0 6px 20px rgba(59,130,246,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {creating && (
              <span style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
            )}
            {creating ? 'Création...' : 'Générer le lien'}
          </button>
        </div>
      )}

      {/* Links List */}
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
        {links.length} lien{links.length !== 1 ? 's' : ''} créé{links.length !== 1 ? 's' : ''}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <span style={{ width: 28, height: 28, border: '3px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 12 }}>Chargement des liens...</div>
        </div>
      ) : links.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 20px' }}>
          <div style={{
            width: 64, height: 64, borderRadius: 20, margin: '0 auto 16px',
            background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="1.8" strokeLinecap="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#fff', marginBottom: 6 }}>Aucun lien de paiement</div>
          <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
            Créez votre premier lien pour commencer à recevoir des paiements
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {links.map((link) => {
            const isExpanded = expandedId === link.id;
            const createdDate = link.createdAt
              ? new Date(typeof link.createdAt === 'object' && 'seconds' in (link.createdAt as object) ? (link.createdAt as { seconds: number }).seconds * 1000 : link.createdAt as number)
              : null;

            return (
              <div
                key={link.id}
                style={{
                  borderRadius: 20, background: 'rgba(255,255,255,0.03)',
                  border: `1px solid ${link.active ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.06)'}`,
                  overflow: 'hidden', transition: 'all 0.2s',
                }}
              >
                {/* Link Card */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : link.id)}
                  style={{
                    padding: '16px 18px', cursor: 'pointer', display: 'flex',
                    alignItems: 'center', gap: 14,
                  }}
                >
                  {/* Status indicator */}
                  <div style={{
                    width: 42, height: 42, borderRadius: 14, flexShrink: 0,
                    background: link.active ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.08)',
                    border: `1px solid ${link.active ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.15)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={link.active ? '#22c55e' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </div>

                  {/* Link info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {link.description || 'Sans description'}
                      </span>
                      <span style={{
                        fontSize: 8, fontWeight: 900, letterSpacing: 0.5, textTransform: 'uppercase',
                        padding: '2px 7px', borderRadius: 6, flexShrink: 0,
                        background: link.active ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.1)',
                        color: link.active ? '#22c55e' : '#ef4444',
                        border: `1px solid ${link.active ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.15)'}`,
                      }}>
                        {link.active ? 'Actif' : 'Inactif'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, color: '#64748b' }}>
                      <span style={{ fontFamily: 'Montserrat, sans-serif', fontWeight: 800, color: '#60a5fa', fontSize: 13 }}>
                        {formatCurrency(link.amount)} {link.currency}
                      </span>
                      <span>•</span>
                      <span>{link.shortCode}</span>
                      {createdDate && (
                        <>
                          <span>•</span>
                          <span>{createdDate.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Chevron */}
                  <svg
                    width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round"
                    style={{ flexShrink: 0, transform: isExpanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>

                {/* Expanded Detail */}
                {isExpanded && (
                  <div style={{
                    padding: '0 18px 18px', borderTop: '1px solid rgba(255,255,255,0.05)',
                    animation: 'fadeIn 0.2s ease',
                  }}>
                    {/* QR Code */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      padding: 20, marginTop: 16, marginBottom: 16,
                      background: 'rgba(255,255,255,0.95)', borderRadius: 18,
                    }}>
                      <QRCodeSVG
                        value={`${typeof window !== 'undefined' ? window.location.origin : ''}/pay/${link.shortCode}`}
                        size={160}
                        bgColor="#ffffff"
                        fgColor="#050b1a"
                        level="M"
                        includeMargin={false}
                      />
                    </div>

                    {/* Payment stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
                      <div style={{
                        padding: '12px 14px', borderRadius: 14, background: 'rgba(34,197,94,0.06)',
                        border: '1px solid rgba(34,197,94,0.12)', textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                          Total reçu
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 900, fontFamily: 'Montserrat, sans-serif', color: '#22c55e' }}>
                          {formatCurrency(link.totalPaid)} {link.currency}
                        </div>
                      </div>
                      <div style={{
                        padding: '12px 14px', borderRadius: 14, background: 'rgba(212,164,55,0.06)',
                        border: '1px solid rgba(212,164,55,0.12)', textAlign: 'center',
                      }}>
                        <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                          Payeurs
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 900, fontFamily: 'Montserrat, sans-serif', color: '#D4A437' }}>
                          {link.payerCount}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); copyLink(link.shortCode); }}
                        style={{
                          flex: 1, padding: '12px 8px', borderRadius: 14, border: '1px solid rgba(59,130,246,0.2)',
                          background: 'rgba(59,130,246,0.08)', color: '#60a5fa', fontSize: 12,
                          fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center',
                          justifyContent: 'center', gap: 6,
                        }}
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                        Copier
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleToggle(link); }}
                        disabled={togglingId === link.id}
                        style={{
                          flex: 1, padding: '12px 8px', borderRadius: 14,
                          border: `1px solid ${link.active ? 'rgba(245,158,11,0.2)' : 'rgba(34,197,94,0.2)'}`,
                          background: link.active ? 'rgba(245,158,11,0.08)' : 'rgba(34,197,94,0.08)',
                          color: link.active ? '#f59e0b' : '#22c55e', fontSize: 12,
                          fontWeight: 700, cursor: togglingId === link.id ? 'wait' : 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                        }}
                      >
                        {togglingId === link.id ? (
                          <span style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.2)', borderTopColor: 'currentColor', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
                        ) : (
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            {link.active ? (
                              <><path d="M18.36 6.64a9 9 0 1 1-12.73 0" /><line x1="12" y1="2" x2="12" y2="12" /></>
                            ) : (
                              <><polygon points="5 3 19 12 5 21 5 3" /></>
                            )}
                          </svg>
                        )}
                        {link.active ? 'Désactiver' : 'Activer'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(link.id); }}
                        style={{
                          width: 44, padding: '12px 0', borderRadius: 14, flexShrink: 0,
                          border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.08)',
                          color: '#ef4444', cursor: 'pointer', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                        }}
                        aria-label="Supprimer"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Inline animation keyframes */}
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
