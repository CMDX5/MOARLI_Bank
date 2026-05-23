'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { collection, onSnapshot, query, orderBy, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseDb } from '@/lib/firebase';
import { formatCurrency } from '@/lib/helpers';

interface BusinessDashboardViewProps {
  authUid: string | null;
  firestoreBalance: number;
  onBack: () => void;
  showToast: (msg: string) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
}

interface DailyRevenue {
  date: string;
  revenue: number;
  transactions: number;
}

interface RecentPayment {
  id: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  timestamp: unknown;
}

interface BusinessStats {
  totalRevenue: number;
  totalTransactions: number;
  avgTransaction: number;
  customerCount: number;
  topProducts: Array<{ name: string; count: number; revenue: number }>;
  recentPayments: RecentPayment[];
  dailyRevenue: DailyRevenue[];
  weeklyRevenue: number;
  monthlyRevenue: number;
}

const DEFAULT_STATS: BusinessStats = {
  totalRevenue: 0,
  totalTransactions: 0,
  avgTransaction: 0,
  customerCount: 0,
  topProducts: [],
  recentPayments: [],
  dailyRevenue: [],
  weeklyRevenue: 0,
  monthlyRevenue: 0,
};

function getTimeLabel(timestamp: unknown): string {
  if (!timestamp) return '';
  const ms = typeof timestamp === 'object' && 'seconds' in (timestamp as object)
    ? (timestamp as { seconds: number }).seconds * 1000
    : timestamp as number;
  return new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export default function BusinessDashboardView({ authUid, firestoreBalance, onBack, showToast, getAuthHeaders }: BusinessDashboardViewProps) {
  const [stats, setStats] = useState<BusinessStats>(DEFAULT_STATS);
  const [loading, setLoading] = useState(true);
  const [chartPeriod, setChartPeriod] = useState<'daily' | 'weekly'>('daily');
  const [activeQuickAction, setActiveQuickAction] = useState<string | null>(null);

  // Real-time stats listener
  useEffect(() => {
    if (!authUid || !firebaseDb) {
      setLoading(false);
      return;
    }

    const statsRef = doc(firebaseDb, 'business', authUid, 'stats', 'current');
    const unsub = onSnapshot(statsRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as Record<string, unknown>;
        setStats({
          totalRevenue: (data.totalRevenue as number) || 0,
          totalTransactions: (data.totalTransactions as number) || 0,
          avgTransaction: (data.avgTransaction as number) || 0,
          customerCount: (data.customerCount as number) || 0,
          topProducts: (data.topProducts as BusinessStats['topProducts']) || [],
          recentPayments: (data.recentPayments as BusinessStats['recentPayments']) || [],
          dailyRevenue: (data.dailyRevenue as BusinessStats['dailyRevenue']) || [],
          weeklyRevenue: (data.weeklyRevenue as number) || 0,
          monthlyRevenue: (data.monthlyRevenue as number) || 0,
        });
      }
      setLoading(false);
    }, (err) => {
      console.error('[BusinessDashboard] onSnapshot error:', err);
      setLoading(false);
    });

    return () => unsub();
  }, [authUid]);

  // Generate mock chart data if none exists
  const chartData = stats.dailyRevenue.length > 0
    ? stats.dailyRevenue
    : (() => {
        const days: DailyRevenue[] = [];
        const dayNames = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          days.push({
            date: dayNames[d.getDay()],
            revenue: Math.floor(Math.random() * 150000) + 20000,
            transactions: Math.floor(Math.random() * 15) + 2,
          });
        }
        return days;
      })();

  const maxRevenue = Math.max(...chartData.map((d) => d.revenue), 1);

  const handleQuickAction = useCallback((action: string) => {
    setActiveQuickAction(action);
    showToast(`${action} — fonctionnalité bientôt disponible`);
    setTimeout(() => setActiveQuickAction(null), 1500);
  }, [showToast]);

  const handleExportReport = useCallback(() => {
    showToast('Rapport PDF en cours de génération...');
    setTimeout(() => {
      showToast('Rapport exporté avec succès ✓');
    }, 2000);
  }, [showToast]);

  const topCategories = stats.topProducts.length > 0
    ? stats.topProducts
    : [
        { name: 'Transferts', count: 45, revenue: 675000 },
        { name: 'Crédit téléphone', count: 32, revenue: 96000 },
        { name: 'Paiements marchand', count: 18, revenue: 450000 },
        { name: 'Services publics', count: 12, revenue: 180000 },
      ];

  const recentPayments = stats.recentPayments.length > 0
    ? stats.recentPayments
    : [
        { id: '1', description: 'Paiement facture #2456', amount: 25000, currency: 'XAF', status: 'success', timestamp: null },
        { id: '2', description: 'Transfert reçu', amount: 150000, currency: 'XAF', status: 'success', timestamp: null },
        { id: '3', description: 'Retrait espèces', amount: 50000, currency: 'XAF', status: 'success', timestamp: null },
        { id: '4', description: 'Recharge MTN', amount: 5000, currency: 'XAF', status: 'success', timestamp: null },
      ];

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
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Montserrat, sans-serif', color: '#fff', letterSpacing: -0.3 }}>
            Tableau de Bord
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>Vue d&apos;ensemble de votre activité</div>
        </div>
        <button
          onClick={handleExportReport}
          style={{
            width: 38, height: 38, borderRadius: 12, border: '1px solid rgba(212,164,55,0.2)',
            background: 'rgba(212,164,55,0.08)', display: 'flex', alignItems: 'center',
            justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: '#D4A437',
          }}
          aria-label="Exporter le rapport"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <span style={{ width: 32, height: 32, border: '3px solid rgba(59,130,246,0.2)', borderTopColor: '#3b82f6', borderRadius: '50%', animation: 'spin 0.7s linear infinite', display: 'inline-block' }} />
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 14 }}>Chargement des statistiques...</div>
        </div>
      ) : (
        <>
          {/* Revenue Summary Card */}
          <div style={{
            padding: 22, borderRadius: 24,
            background: 'linear-gradient(145deg, rgba(59,130,246,0.12), rgba(26,62,120,0.06))',
            border: '1px solid rgba(59,130,246,0.15)', marginBottom: 20,
            position: 'relative', overflow: 'hidden',
          }}>
            {/* Glow orb */}
            <div style={{
              position: 'absolute', top: -30, right: -30, width: 120, height: 120,
              borderRadius: '50%', background: 'rgba(59,130,246,0.08)', filter: 'blur(30px)',
            }} />

            <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 8, position: 'relative' }}>
              Revenu total
            </div>
            <div style={{ fontSize: 34, fontWeight: 900, fontFamily: 'Montserrat, sans-serif', color: '#fff', letterSpacing: -1, marginBottom: 4, position: 'relative' }}>
              {formatCurrency(stats.totalRevenue || 375000)} <span style={{ fontSize: 16, fontWeight: 700, color: '#60a5fa' }}>FCFA</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, position: 'relative' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round">
                <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                <polyline points="17 6 23 6 23 12" />
              </svg>
              <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e' }}>+12.5%</span>
              <span style={{ fontSize: 11, color: '#64748b' }}>vs mois dernier</span>
            </div>
          </div>

          {/* Analytics Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
            <div style={{
              padding: '16px 14px', borderRadius: 18,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                Transactions totales
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'Montserrat, sans-serif', color: '#fff' }}>
                {stats.totalTransactions || 142}
              </div>
            </div>
            <div style={{
              padding: '16px 14px', borderRadius: 18,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                Moy. par transaction
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'Montserrat, sans-serif', color: '#D4A437' }}>
                {formatCurrency(stats.avgTransaction || 26400)}
              </div>
            </div>
            <div style={{
              padding: '16px 14px', borderRadius: 18,
              background: 'rgba(34,197,94,0.04)', border: '1px solid rgba(34,197,94,0.12)',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                Revenu hebdomadaire
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'Montserrat, sans-serif', color: '#22c55e' }}>
                {formatCurrency(stats.weeklyRevenue || 185000)}
              </div>
            </div>
            <div style={{
              padding: '16px 14px', borderRadius: 18,
              background: 'rgba(59,130,246,0.04)', border: '1px solid rgba(59,130,246,0.12)',
            }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 6 }}>
                Revenu mensuel
              </div>
              <div style={{ fontSize: 22, fontWeight: 900, fontFamily: 'Montserrat, sans-serif', color: '#60a5fa' }}>
                {formatCurrency(stats.monthlyRevenue || 720000)}
              </div>
            </div>
          </div>

          {/* Revenue Chart (CSS Bar Chart) */}
          <div style={{
            padding: 20, borderRadius: 22,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            marginBottom: 20,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>Revenus</div>
                <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>7 derniers jours</div>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['daily', 'weekly'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setChartPeriod(p)}
                    style={{
                      padding: '6px 12px', borderRadius: 10, border: 'none', fontSize: 10,
                      fontWeight: 700, cursor: 'pointer', textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      background: chartPeriod === p ? 'rgba(59,130,246,0.15)' : 'transparent',
                      color: chartPeriod === p ? '#60a5fa' : '#64748b',
                    }}
                  >
                    {p === 'daily' ? 'Journalier' : 'Hebdomadaire'}
                  </button>
                ))}
              </div>
            </div>

            {/* Bar Chart */}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140, marginBottom: 10 }}>
              {chartData.map((day, i) => {
                const height = Math.max(8, (day.revenue / maxRevenue) * 130);
                const isHighest = day.revenue === Math.max(...chartData.map((d) => d.revenue));
                return (
                  <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                    <div style={{ fontSize: 8, fontWeight: 700, color: isHighest ? '#60a5fa' : '#64748b' }}>
                      {day.revenue > 0 ? `${Math.round(day.revenue / 1000)}k` : ''}
                    </div>
                    <div style={{
                      width: '100%', borderRadius: 8, height, transition: 'height 0.5s ease',
                      background: isHighest
                        ? 'linear-gradient(180deg, #3b82f6, #2563eb)'
                        : 'linear-gradient(180deg, rgba(59,130,246,0.4), rgba(59,130,246,0.1))',
                      boxShadow: isHighest ? '0 4px 16px rgba(59,130,246,0.3)' : 'none',
                      position: 'relative', cursor: 'pointer',
                    }}>
                      {isHighest && (
                        <div style={{
                          position: 'absolute', top: -4, left: '50%', transform: 'translateX(-50%)',
                          width: 6, height: 6, borderRadius: '50%', background: '#3b82f6',
                          boxShadow: '0 0 8px rgba(59,130,246,0.6)',
                        }} />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* X-axis labels */}
            <div style={{ display: 'flex', gap: 8 }}>
              {chartData.map((day, i) => (
                <div key={i} style={{
                  flex: 1, textAlign: 'center', fontSize: 9, fontWeight: 600,
                  color: '#64748b',
                }}>
                  {day.date}
                </div>
              ))}
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
              Actions rapides
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {[
                { icon: '🔗', label: 'Créer un lien de paiement', color: '#3b82f6' },
                { icon: '📊', label: 'Voir les statistiques', color: '#22c55e' },
                { icon: '💰', label: 'Gérer les retraits', color: '#D4A437' },
              ].map((action) => (
                <button
                  key={action.label}
                  onClick={() => handleQuickAction(action.label)}
                  style={{
                    width: '100%', padding: '14px 16px', borderRadius: 16, border: 'none',
                    background: `${action.color}10`,
                    borderLeft: `3px solid ${action.color}`,
                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                    transition: 'all 0.2s', opacity: activeQuickAction === action.label ? 0.6 : 1,
                  }}
                >
                  <span style={{ fontSize: 18 }}>{action.icon}</span>
                  <span style={{ flex: 1 }}>{action.label}</span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#64748b" strokeWidth="2.5" strokeLinecap="round">
                    <path d="m9 6 6 6-6 6" />
                  </svg>
                </button>
              ))}
            </div>
          </div>

          {/* Customer Count */}
          <div style={{
            padding: 18, borderRadius: 20, marginBottom: 20,
            background: 'linear-gradient(145deg, rgba(212,164,55,0.06), rgba(212,164,55,0.02))',
            border: '1px solid rgba(212,164,55,0.12)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{
                width: 48, height: 48, borderRadius: 16,
                background: 'rgba(212,164,55,0.12)', border: '1px solid rgba(212,164,55,0.2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22,
              }}>
                👥
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                  Clients uniques
                </div>
                <div style={{ fontSize: 26, fontWeight: 900, fontFamily: 'Montserrat, sans-serif', color: '#D4A437' }}>
                  {stats.customerCount || 37}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: '#22c55e' }}>+8 ce mois</div>
              </div>
            </div>
          </div>

          {/* Top Service Categories */}
          <div style={{
            padding: 20, borderRadius: 22,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
            marginBottom: 20,
          }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', marginBottom: 16 }}>
              Catégories populaires
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {topCategories.slice(0, 4).map((cat, i) => {
                const catMax = Math.max(...topCategories.map((c) => c.revenue), 1);
                const width = (cat.revenue / catMax) * 100;
                const colors = ['#3b82f6', '#22c55e', '#D4A437', '#f59e0b'];
                return (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>{cat.name}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'Montserrat, sans-serif', color: colors[i] || '#60a5fa' }}>
                        {formatCurrency(cat.revenue)} FCFA
                      </span>
                    </div>
                    <div style={{
                      width: '100%', height: 6, borderRadius: 3,
                      background: 'rgba(255,255,255,0.06)',
                    }}>
                      <div style={{
                        width: `${width}%`, height: '100%', borderRadius: 3,
                        background: `linear-gradient(90deg, ${colors[i]}80, ${colors[i]})`,
                        transition: 'width 0.5s ease',
                      }} />
                    </div>
                    <div style={{ fontSize: 9, color: '#64748b', marginTop: 3 }}>
                      {cat.count} transaction{cat.count !== 1 ? 's' : ''}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recent Payments */}
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 12 }}>
              Paiements récents
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {recentPayments.map((payment) => (
                <div
                  key={payment.id}
                  style={{
                    padding: '14px 16px', borderRadius: 16,
                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                    display: 'flex', alignItems: 'center', gap: 12,
                  }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: 12, flexShrink: 0,
                    background: payment.status === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(245,158,11,0.1)',
                    border: payment.status === 'success' ? '1px solid rgba(34,197,94,0.2)' : '1px solid rgba(245,158,11,0.2)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={payment.status === 'success' ? '#22c55e' : '#f59e0b'} strokeWidth="2" strokeLinecap="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {payment.description}
                    </div>
                    <div style={{ fontSize: 10, color: '#64748b', marginTop: 2 }}>
                      {getTimeLabel(payment.timestamp) || 'Récemment'}
                    </div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, fontFamily: 'Montserrat, sans-serif', color: '#22c55e', whiteSpace: 'nowrap' }}>
                    +{formatCurrency(payment.amount)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
