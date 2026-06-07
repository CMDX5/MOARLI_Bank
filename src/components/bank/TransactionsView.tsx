'use client';

import React from 'react';
import { type TransactionType } from '@/types/morali';
import { formatCurrency } from '@/lib/helpers';

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
}: TransactionsViewProps) {
  return (
    <div className="app-screen active">
      <div className="content-scrollable service-scrollable transaction-safe">
        <div className="transaction-screen">
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
            <div className="transaction-group">
              <label className="transaction-label">{type === 'depot' ? 'Montant à déposer' : 'Montant à retirer'}</label>
              <div className="transaction-amount">
                <input
                  type="number"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => onAmountChange(e.target.value)}
                />
                <span>XAF</span>
              </div>
            </div>

            <div className="transaction-group">
              <label className="transaction-label">Opérateur local</label>
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

            <div className="transaction-group">
              <label className="transaction-label">Numéro du compte</label>
              <div className="phone-input-wrap">
                <span className="phone-prefix">+242</span>
                <input
                  type="tel"
                  placeholder=""
                  value={phone}
                  onChange={(e) => onPhoneChange(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="transaction-footer">
            <div className="transaction-recap">
              <div>
                <small>{type === 'depot' ? 'Frais' : `Frais (2% — ${formatCurrency(fees)} XAF)`}</small>
                <strong>{formatCurrency(total)} XAF</strong>
                <div style={{ fontSize: 10, color: type === 'depot' ? '#22c55e' : 'var(--dim)', fontWeight: 600, marginTop: 2 }}>{type === 'depot' ? 'Gratuit — 0% de frais' : `Net reçu: ${formatCurrency(Number(amount) - fees)} XAF`}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span>Estimation</span>
                <p>Instantané</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fixed Confirm Button - sits above the bottom nav bar */}
      <button
        className="transaction-confirm"
        onClick={onSubmit}
      >
        {type === 'depot' ? 'Confirmer le dépôt' : 'Valider le retrait'}
      </button>

      <style>{`
        .transaction-confirm {
          position: fixed;
          bottom: calc(70px + env(safe-area-inset-bottom, 0px) + 10px);
          left: 50%;
          transform: translateX(-50%);
          width: calc(100% - 32px);
          max-width: 398px;
          z-index: 25;
        }
        @media (max-width: 480px) {
          .transaction-confirm {
            max-width: calc(100% - 32px);
          }
        }
      `}</style>
    </div>
  );
}
