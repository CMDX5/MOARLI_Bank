'use client';

import React, { useState, useMemo } from 'react';
import { type TransactionType } from '@/types/morali';
import { formatCurrency } from '@/lib/helpers';

/* ─────────────────────────────────────────────
   CONFIRMATION MODAL
   ───────────────────────────────────────────── */
function ConfirmationModal({
  type,
  amount,
  method,
  phone,
  fees,
  total,
  onConfirm,
  onCancel,
}: {
  type: TransactionType;
  amount: string;
  method: 'mtn' | 'airtel';
  phone: string;
  fees: number;
  total: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const parsedAmount = Number(amount) || 0;
  const operatorName = method === 'mtn' ? 'MTN MoMo' : 'Airtel Money';
  const operatorColor = method === 'mtn' ? '#ffcc00' : '#ff0000';

  return (
    <div
      className="card-modal-overlay"
      style={{ zIndex: 2500, alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 360,
          background: 'linear-gradient(180deg, #101a30 0%, #080f1e 100%)',
          border: '1px solid rgba(59,130,246,0.22)',
          borderRadius: 28,
          boxShadow: '0 30px 80px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.05)',
          padding: '26px 22px 22px',
          opacity: 1,
          transform: 'scale(1)',
          animation: 'panelSpringUp .3s cubic-bezier(.34,1.2,.64,1) forwards',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: '#fff',
              fontFamily: "'Montserrat', sans-serif",
              letterSpacing: '-0.02em',
              margin: 0,
            }}
          >
            Confirmer l'opération
          </h2>
          <button
            onClick={onCancel}
            style={{
              width: 36,
              height: 36,
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.04)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#cbd5e1',
              cursor: 'pointer',
              fontSize: 20,
            }}
          >
            ×
          </button>
        </div>

        {/* Operation type badge */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            borderRadius: 12,
            background: type === 'depot' ? 'rgba(34,197,94,0.12)' : 'rgba(59,130,246,0.12)',
            border: `1px solid ${type === 'depot' ? 'rgba(34,197,94,0.25)' : 'rgba(59,130,246,0.25)'}`,
            marginBottom: 18,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: type === 'depot' ? '#22c55e' : '#3b82f6',
            }}
          />
          <span
            style={{
              fontSize: 11,
              fontWeight: 800,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: type === 'depot' ? '#4ade80' : '#60a5fa',
            }}
          >
            {type === 'depot' ? 'Dépôt' : 'Retrait'}
          </span>
        </div>

        {/* Detail rows */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 0,
            borderRadius: 18,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.06)',
            overflow: 'hidden',
            marginBottom: 22,
          }}
        >
          <ConfirmationRow label="Montant" value={`${formatCurrency(parsedAmount)} XAF`} bold />
          <ConfirmationDivider />
          <ConfirmationRow label="Opérateur" value={operatorName} valueColor={operatorColor} />
          <ConfirmationDivider />
          <ConfirmationRow label="Numéro" value={`+242 ${phone}`} />
          <ConfirmationDivider />
          <ConfirmationRow label="Frais" value={type === 'depot' ? 'Gratuit (0%)' : `${formatCurrency(fees)} XAF`} />
          <ConfirmationDivider />
          <ConfirmationRow
            label={type === 'depot' ? 'Total' : 'Net reçu'}
            value={`${formatCurrency(total)} XAF`}
            bold
            valueColor={type === 'depot' ? '#fff' : '#22c55e'}
          />
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              height: 48,
              borderRadius: 14,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'rgba(255,255,255,0.04)',
              color: '#94a3b8',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all .2s',
            }}
          >
            Annuler
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1.5,
              height: 48,
              borderRadius: 14,
              border: 'none',
              background: 'var(--blue2, #2563eb)',
              color: '#fff',
              fontSize: 14,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 10px 30px rgba(37,99,235,.3)',
              transition: 'all .2s',
            }}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmationRow({
  label,
  value,
  bold,
  valueColor,
}: {
  label: string;
  value: string;
  bold?: boolean;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '14px 16px',
      }}
    >
      <span style={{ fontSize: 12, color: '#7c8ca8', fontWeight: 600 }}>{label}</span>
      <span
        style={{
          fontSize: bold ? 15 : 13,
          fontWeight: bold ? 800 : 600,
          color: valueColor || '#fff',
          fontFamily: bold ? "'Montserrat', sans-serif" : 'inherit',
        }}
      >
        {value}
      </span>
    </div>
  );
}

function ConfirmationDivider() {
  return <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', marginLeft: 16, marginRight: 16 }} />;
}

/* ─────────────────────────────────────────────
   PROCESSING OVERLAY
   ───────────────────────────────────────────── */
function ProcessingOverlay() {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        background: 'rgba(7,13,30,0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Animated spinner */}
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: '50%',
          border: '3px solid rgba(59,130,246,0.18)',
          borderTopColor: '#3b82f6',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <span
          style={{
            fontSize: 16,
            fontWeight: 800,
            color: '#fff',
            fontFamily: "'Montserrat', sans-serif",
          }}
        >
          Traitement en cours...
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#60a5fa',
                opacity: 0.3,
                animation: `dotPulse 1.2s ease-in-out ${i * 0.2}s infinite`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SUCCESS SCREEN
   ───────────────────────────────────────────── */
function SuccessScreen({
  successData,
  type,
  method,
  fees,
  onClose,
}: {
  successData: { type: string; amount: string; date: string; receiptId: string };
  type: TransactionType;
  method: 'mtn' | 'airtel';
  fees: number;
  onClose: () => void;
}) {
  const [checkAnimComplete, setCheckAnimComplete] = useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setCheckAnimComplete(true), 600);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="transaction-screen">
      {/* Inner content centered */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 24,
          padding: '40px 22px',
        }}
      >
        {/* Animated checkmark circle */}
        <div
          style={{
            width: 88,
            height: 88,
            borderRadius: '50%',
            background: 'linear-gradient(145deg, rgba(34,197,94,0.25), rgba(34,197,94,0.08))',
            border: '2px solid rgba(34,197,94,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 40px rgba(34,197,94,0.15)',
            animation: 'successPulse 2s ease-in-out infinite',
          }}
        >
          {/* SVG checkmark */}
          <svg
            width="42"
            height="42"
            viewBox="0 0 42 42"
            fill="none"
            style={{
              transition: 'stroke-dashoffset 0.5s cubic-bezier(0.65,0,0.35,1)',
            }}
          >
            <circle cx="21" cy="21" r="20" fill="none" stroke="#22c55e" strokeWidth="2" opacity="0.2" />
            <path
              d="M12 21.5L18.5 28L30 14"
              fill="none"
              stroke="#4ade80"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="28"
              strokeDashoffset={checkAnimComplete ? 0 : 28}
              style={{
                transition: 'stroke-dashoffset 0.5s cubic-bezier(0.65,0,0.35,1) 0.2s',
              }}
            />
          </svg>
        </div>

        {/* Success text */}
        <div style={{ textAlign: 'center' }}>
          <h2
            style={{
              fontSize: 22,
              fontWeight: 900,
              color: '#fff',
              fontFamily: "'Montserrat', sans-serif",
              margin: '0 0 6px',
            }}
          >
            Opération réussie
          </h2>
          <p style={{ fontSize: 13, color: '#7c8ca8', margin: 0, lineHeight: 1.5 }}>
            Votre {successData.type === 'depot' ? 'dépôt' : 'retrait'} a été traité avec succès.
          </p>
        </div>

        {/* Receipt card */}
        <div
          style={{
            width: '100%',
            borderRadius: 20,
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderStyle: 'dashed',
            padding: '18px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {/* Amount */}
          <div style={{ textAlign: 'center', marginBottom: 4 }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: '#64748b',
                display: 'block',
                marginBottom: 6,
              }}
            >
              {successData.type === 'depot' ? 'Montant déposé' : 'Montant retiré'}
            </span>
            <span
              style={{
                fontSize: 30,
                fontWeight: 900,
                color: '#fff',
                fontFamily: "'Montserrat', sans-serif",
                lineHeight: 1,
              }}
            >
              {successData.amount}
            </span>
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: '#60a5fa',
                marginLeft: 6,
              }}
            >
              XAF
            </span>
          </div>

          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

          {/* Details */}
          <SuccessDetailRow label="Opérateur" value={method === 'mtn' ? 'MTN MoMo' : 'Airtel Money'} />
          <SuccessDetailRow label="Type" value={successData.type === 'depot' ? 'Dépôt' : 'Retrait'} />
          <SuccessDetailRow label="Frais" value={successData.type === 'depot' ? 'Gratuit' : `${formatCurrency(fees)} XAF`} />
          <SuccessDetailRow label="Date" value={successData.date} />

          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />

          {/* Receipt ID */}
          <div style={{ textAlign: 'center' }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color: '#64748b',
                display: 'block',
                marginBottom: 4,
              }}
            >
              Reçu N°
            </span>
            <span
              style={{
                fontFamily: "'Courier New', monospace",
                fontSize: 13,
                fontWeight: 700,
                color: '#60a5fa',
                letterSpacing: '0.04em',
              }}
            >
              {successData.receiptId}
            </span>
          </div>
        </div>

        {/* Terminé button */}
        <button
          onClick={onClose}
          style={{
            width: '100%',
            height: 52,
            borderRadius: 18,
            border: '1.5px solid rgba(255,255,255,0.18)',
            background: 'transparent',
            color: '#cbd5e1',
            fontSize: 15,
            fontWeight: 800,
            fontFamily: "'Montserrat', sans-serif",
            letterSpacing: '0.02em',
            cursor: 'pointer',
            transition: 'all .2s',
            marginTop: 4,
          }}
        >
          Terminé
        </button>
      </div>
    </div>
  );
}

function SuccessDetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <span style={{ fontSize: 12, color: '#7c8ca8', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 700, color: '#cbd5e1' }}>{value}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────
   KEYFRAMES INJECTION (one-time)
   ───────────────────────────────────────────── */
const KEYFRAMES_ID = 'tx-view-keyframes';

function injectKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    @keyframes dotPulse {
      0%, 80%, 100% { opacity: 0.25; transform: scale(0.8); }
      40% { opacity: 1; transform: scale(1.2); }
    }
    @keyframes successPulse {
      0%, 100% { box-shadow: 0 0 40px rgba(34,197,94,0.15); }
      50% { box-shadow: 0 0 60px rgba(34,197,94,0.3); }
    }
  `;
  document.head.appendChild(style);
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */
export interface TransactionsViewProps {
  type: TransactionType;
  amount: string;
  onAmountChange: (val: string) => void;
  method: 'mtn' | 'airtel';
  onMethodChange: (method: 'mtn' | 'airtel') => void;
  phone: string;
  onPhoneChange: (val: string) => void;
  balance: number;
  total: number;
  fees: number;
  onClose: () => void;
  onSubmit: () => void;
  processing?: boolean;
  success?: boolean;
  successData?: { type: string; amount: string; date: string; receiptId: string } | null;
}

export default function TransactionsView({
  type,
  amount,
  onAmountChange,
  method,
  onMethodChange,
  phone,
  onPhoneChange,
  balance,
  total,
  fees,
  onClose,
  onSubmit,
  processing = false,
  success = false,
  successData = null,
}: TransactionsViewProps) {
  const [confirming, setConfirming] = useState(false);

  // Inject keyframes on mount
  React.useEffect(() => {
    injectKeyframes();
  }, []);

  /* ── Derived states ── */
  const parsedAmount = Number(amount) || 0;

  const phoneValid = useMemo(() => {
    // Phone is valid if it has at least 9 digits
    const digits = phone.replace(/\D/g, '');
    return digits.length >= 9;
  }, [phone]);

  const phoneTooShort = useMemo(() => {
    if (!phone || phone.length === 0) return false;
    const digits = phone.replace(/\D/g, '');
    return digits.length > 0 && digits.length < 9;
  }, [phone]);

  const balanceExceeded = useMemo(() => {
    if (type !== 'retrait') return false;
    if (!parsedAmount) return false;
    return parsedAmount > balance;
  }, [type, parsedAmount, balance]);

  /* ── Handlers ── */
  const handleSubmit = () => {
    setConfirming(true);
  };

  const handleConfirm = () => {
    setConfirming(false);
    onSubmit();
  };

  const handleCancelConfirm = () => {
    setConfirming(false);
  };

  /* ── SUCCESS SCREEN ── */
  if (success && successData) {
    return (
      <div className="app-screen active">
        <div className="content-scrollable service-scrollable transaction-safe">
          <SuccessScreen
            successData={successData}
            type={type}
            method={method}
            fees={fees}
            onClose={onClose}
          />
        </div>
      </div>
    );
  }

  /* ── NORMAL FORM VIEW ── */
  return (
    <div className="app-screen active">
      <div className="content-scrollable service-scrollable transaction-safe">
        <div className="transaction-screen" style={{ position: 'relative' }}>
          {/* Processing overlay */}
          {processing && <ProcessingOverlay />}

          <div className="transaction-header">
            <div className="transaction-topbar">
              <h1 className="transaction-headline">{type === 'depot' ? 'Recharger' : 'Retirer'}</h1>
              <button className="transaction-back" onClick={onClose} aria-label="Fermer">
                <span className="close-x">×</span>
              </button>
            </div>

            <div className="transaction-balance">
              <div className="transaction-balance-label">Disponible</div>
              <div className="transaction-balance-value">
                <strong>{formatCurrency(balance)}</strong>
                <span>XAF</span>
              </div>
            </div>
          </div>

          <div className="transaction-body">
            {/* ── Amount input ── */}
            <div className="transaction-group">
              <label className="transaction-label" style={{ color: '#D4A437' }}>
                {type === 'depot' ? 'Montant à déposer' : 'Montant à retirer'}
              </label>
              <div className="transaction-amount">
                <input
                  type="number"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => onAmountChange(e.target.value)}
                />
                <span>XAF</span>
              </div>
              {/* Balance exceeded warning (retrait) */}
              {balanceExceeded && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 8,
                    padding: '8px 12px',
                    borderRadius: 12,
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M7 1L13 12H1L7 1Z"
                      fill="#ef4444"
                      opacity="0.8"
                    />
                    <text x="7" y="10" textAnchor="middle" fill="#fff" fontSize="7" fontWeight="800">!</text>
                  </svg>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#f87171', lineHeight: 1.4 }}>
                    Solde insuffisant. Max: {formatCurrency(balance)} XAF
                  </span>
                </div>
              )}
            </div>

            {/* ── Operator selector ── */}
            <div className="transaction-group">
              <label className="transaction-label" style={{ color: '#D4A437' }}>Opérateur local</label>
              <div className="operator-grid">
                <button
                  className={`operator-card ${method === 'mtn' ? 'active-mtn' : ''}`}
                  onClick={() => onMethodChange('mtn')}
                >
                  <div className="operator-badge" style={{ background: '#ffcc00', color: '#000' }}>MTN</div>
                  <span style={{ color: method === 'mtn' ? '#fff' : '#64748b' }}>MTN MoMo</span>
                  {method === 'mtn' && <div className="dot mtn" />}
                </button>

                <button
                  className={`operator-card ${method === 'airtel' ? 'active-airtel' : ''}`}
                  onClick={() => onMethodChange('airtel')}
                >
                  <div className="operator-badge" style={{ background: '#ff0000', color: '#fff' }}>airtel</div>
                  <span style={{ color: method === 'airtel' ? '#fff' : '#64748b' }}>Airtel Money</span>
                  {method === 'airtel' && <div className="dot airtel" />}
                </button>
              </div>
            </div>

            {/* ── Phone input ── */}
            <div className="transaction-group">
              <label className="transaction-label" style={{ color: '#D4A437' }}>Numéro du compte</label>
              <div
                className="phone-input-wrap"
                style={{
                  borderColor: phoneValid
                    ? 'rgba(34,197,94,0.45)'
                    : phoneTooShort
                    ? 'rgba(239,68,68,0.45)'
                    : undefined,
                }}
              >
                <span className="phone-prefix">+242</span>
                <input
                  type="tel"
                  placeholder=""
                  value={phone}
                  onChange={(e) => onPhoneChange(e.target.value)}
                  maxLength={9}
                />
                {/* Validation indicator */}
                {phone.length > 0 && (
                  <div style={{ flexShrink: 0 }}>
                    {phoneValid ? (
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <circle cx="9" cy="9" r="8.5" stroke="#22c55e" strokeWidth="1.5" opacity="0.3" />
                        <path
                          d="M5.5 9.5L7.8 11.8L12.5 6.5"
                          stroke="#4ade80"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                        <circle cx="9" cy="9" r="8.5" stroke="#ef4444" strokeWidth="1.5" opacity="0.3" />
                        <line x1="6.5" y1="6.5" x2="11.5" y2="11.5" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
                        <line x1="11.5" y1="6.5" x2="6.5" y2="11.5" stroke="#f87171" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    )}
                  </div>
                )}
              </div>
              {/* Phone validation warning */}
              {phoneTooShort && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 4,
                    padding: '6px 10px',
                    borderRadius: 10,
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.15)',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#f87171' }}>
                    Numéro trop court — minimum 9 chiffres requis
                  </span>
                </div>
              )}
              {/* Phone valid indicator text */}
              {phoneValid && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginTop: 4,
                    padding: '6px 10px',
                    borderRadius: 10,
                    background: 'rgba(34,197,94,0.06)',
                    border: '1px solid rgba(34,197,94,0.15)',
                  }}
                >
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#4ade80' }}>
                    Numéro valide
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="transaction-footer">
            <div className="transaction-recap">
              <div>
                <small>{type === 'depot' ? 'Frais' : `Frais (2% — ${formatCurrency(fees)} XAF)`}</small>
                <strong>{formatCurrency(total)} XAF</strong>
                <div style={{ fontSize: 10, color: type === 'depot' ? '#22c55e' : 'var(--dim)', fontWeight: 600, marginTop: 2 }}>
                  {type === 'depot' ? 'Gratuit — 0% de frais' : `Net reçu: ${formatCurrency(total)} XAF`}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span>Estimation</span>
                <p>Instantané</p>
              </div>
            </div>
            <button className="transaction-confirm" onClick={handleSubmit}>
              {type === 'depot' ? 'Confirmer le dépôt' : 'Valider le retrait'}
            </button>
          </div>

          {/* ── Confirmation modal ── */}
          {confirming && (
            <ConfirmationModal
              type={type}
              amount={amount}
              method={method}
              phone={phone}
              fees={fees}
              total={total}
              onConfirm={handleConfirm}
              onCancel={handleCancelConfirm}
            />
          )}
        </div>
      </div>
    </div>
  );
}
