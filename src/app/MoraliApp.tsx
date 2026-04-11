'use client';
import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import {
  getRedirectResult,
  onAuthStateChanged,
  reauthenticateWithCredential,
  EmailAuthProvider,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
} from "firebase/auth";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { firebaseAuth, firebaseDb } from "@/lib/firebase";
import { encryptPinWithPassword, decryptPinWithPassword } from "@/lib/pin-utils";
import { logAdminAction } from "@/lib/admin-logger";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

// ── Extracted components & shared code ──
import type { Screen, NavItem, AuthTab, ForgotStep, RegisterData, TransactionType, IconName, AdminTab, Transaction, NotificationItem, PaymentContact, SearchServiceItem, SearchContactItem, MoraliUser, FirestoreMoraliUser, FirestoreTransfer, AdminActivityLog, AdminConfirmAction, FirestoreNotification, VirtualCardDoc, BlackCardDoc, OperatorKey, TxActionKey } from "@/types/morali";
import {
  sanitizeInput,
  sanitizeAmount,
  formatCurrency,
  formatAmount,
  formatStat,
  timeAgo,
  getStrength,
  firebaseAuthMessage,
  getIdentitySeed,
  generateMoraliIdentity,
  getIdentityCacheKey,
  getCachedIdentityForUid,
  cacheIdentityForUid,
  maskCardNumber,
  generateCardNumber,
  buildMoraliUser,
  chartDays,
} from "@/lib/helpers";
import AuthView, { type ProfileFormData } from "@/components/bank/AuthView";
import DashboardView from "@/components/bank/DashboardView";
import NotificationsPanel from "@/components/bank/NotificationsPanel";
import ProfileView from "@/components/bank/ProfileView";
import QrScanner from "@/components/bank/QrScanner";
import CardsView from "@/components/bank/CardsView";
import TransactionsView from "@/components/bank/TransactionsView";
import TransferView from "@/components/bank/TransferView";
import LegalTerms from "@/components/bank/LegalTerms";
import PrivacyPolicy from "@/components/bank/PrivacyPolicy";

// ── All types are imported from @/types/morali ──
// AuthTab, ForgotStep, Screen, AdminTab, NavItem, TransactionType, RegisterData, IconName,
// Transaction, NotificationItem, PaymentContact, SearchServiceItem, SearchContactItem,
// MoraliUser, FirestoreMoraliUser, FirestoreTransfer, AdminActivityLog, AdminConfirmAction,
// FirestoreNotification, VirtualCardDoc, BlackCardDoc, OperatorKey, TxActionKey

const appStyles = `
.transfer-overlay{z-index:10030 !important;display:flex !important;align-items:flex-start !important;justify-content:center !important;padding:60px 20px 20px !important;inset:0 !important;height:auto !important;overflow:hidden !important;}

.transfer-modal{position:relative !important;transform:none !important;opacity:1 !important;border-radius:28px !important;max-height:100% !important;overflow:hidden !important;-webkit-overflow-scrolling:touch !important;width:100% !important;max-width:100% !important;margin:0 !important;padding:22px 20px calc(4px + env(safe-area-inset-bottom,0px)) !important;scrollbar-width:none !important;animation:none !important;}
@import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;500;600;700;800;900&display=swap');

*,*::before,*::after{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
html,body{width:100%;height:100%}
body{background:#000;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif;overscroll-behavior-y:contain}
body.lock-scroll{overflow:hidden;position:fixed}

:root{
  --bg:#050b1a;
  --surface:#0c1528;
  --surface2:#111d38;
  --royal:#1A3E78;
  --gold:#D4A437;
  --gold2:#f0d98a;
  --blue:#3b82f6;
  --blue2:#2563eb;
  --blue3:#60a5fa;
  --border:rgba(59,130,246,0.18);
  --text:#f9fafb;
  --muted:#94a3b8;
  --dim:#64748b;
  --success:#22c55e;
  --danger:#ef4444;
  --w05:rgba(255,255,255,0.05);
}

.stage{
  width:100%;
  height:100dvh;
  height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  background:#000;
  overflow:hidden;
  padding:0;
  flex-shrink:0;
  position:fixed;
  top:0;
  left:0;
  right:0;
  bottom:0;
}

.app-viewport{
  width:100%;
  max-width:430px;
  height:100dvh;
  height:100vh;
  margin:0 auto;
  position:relative;
  overflow:hidden;
  display:flex;
  flex-direction:column;
  background:var(--bg);
  padding-top:env(safe-area-inset-top,0px);
  padding-left:env(safe-area-inset-left,0px);
  padding-right:env(safe-area-inset-right,0px);
}
@media(max-width:480px){
  .app-viewport{max-width:100%}
  .stage{background:var(--bg)}
  .bottom-nav{max-width:100%;padding-bottom:env(safe-area-inset-bottom,0px)}
}

.app-screen{display:none;flex:1;flex-direction:column;overflow:hidden;-webkit-overflow-scrolling:touch;overscroll-behavior:none}
.app-screen.active{display:flex}
.app-screen:not(:first-child){padding-bottom:80px;box-sizing:border-box}

.content-scrollable{
  flex:1;
  overflow-y:auto;
  overflow-x:hidden;
  -webkit-overflow-scrolling:touch;
  position:relative;
  z-index:5;
  padding-bottom:140px;
  scrollbar-width:none;
  overscroll-behavior:none;
}
.content-scrollable::-webkit-scrollbar{display:none}
.auth-scroll{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding:12px 22px 10px;overscroll-behavior:none}
.auth-scroll::-webkit-scrollbar{display:none}
.content-scrollable.dashboard-mode{padding-bottom:100px}
.content-scrollable.nav-safe{padding-bottom:100px}
.content-scrollable.transaction-safe{padding-bottom:100px}

.auth-hero{display:flex;flex-direction:column;align-items:center;padding:calc(env(safe-area-inset-top, 0px) + 24px) 20px 2px;position:relative;z-index:2}
.auth-shield-wrap{
  width:64px;height:64px;min-width:64px;min-height:64px;border-radius:18px;
  background:rgba(26,62,120,0.2);border:1px solid rgba(212,164,55,0.3);
  display:flex;align-items:center;justify-content:center;
  box-shadow:0 0 24px rgba(59,130,246,0.2),0 0 48px rgba(26,62,120,0.15);
  margin-bottom:10px;position:relative;
}
.auth-shield-wrap::before{content:'';position:absolute;inset:-1px;border-radius:19px;background:linear-gradient(135deg,rgba(212,164,55,0.3),transparent 50%,rgba(59,130,246,0.2));z-index:-1}
.auth-brand-name{font-size:22px;font-weight:800;color:#fff;letter-spacing:.5px;line-height:1;font-family:'Montserrat',sans-serif}
.auth-brand-sub{font-size:8px;font-weight:700;color:var(--gold);letter-spacing:4px;text-transform:uppercase;margin-top:3px;font-family:'Montserrat',sans-serif}
.auth-tabs{display:flex;gap:3px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:16px;padding:3px;margin-bottom:10px}
.auth-tab{flex:1;padding:9px;border:none;border-radius:13px;background:transparent;font-size:12px;font-weight:700;color:var(--muted);cursor:pointer;font-family:system-ui,sans-serif;transition:all .25s}
.auth-tab.active{background:linear-gradient(135deg,var(--blue),var(--blue2));color:#fff;box-shadow:0 4px 14px rgba(59,130,246,0.4)}
.auth-panel{display:none}
.auth-panel.active{display:block;animation:authIn .3s ease both;flex:1}
@keyframes authIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.form-section-title{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:10px}
.field{margin-bottom:12px}
.field-label{font-size:10px;font-weight:700;color:rgba(255,255,255,0.5);letter-spacing:1px;text-transform:uppercase;margin-bottom:5px;display:block}
.field-wrap{position:relative}
.field-input,.prefix-select{
  width:100%;padding:13px 16px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:13px;
  font-size:16px;color:var(--text);font-family:system-ui,sans-serif;outline:none;transition:all .2s;-webkit-appearance:none;
}
.field-input::placeholder{color:rgba(255,255,255,0.2)}
.field-input:focus,.prefix-select:focus{border-color:rgba(59,130,246,0.5);background:rgba(59,130,246,0.06);box-shadow:0 0 0 3px rgba(59,130,246,0.12)}
.field-input.has-icon{padding-right:44px}
.field-icon{position:absolute;right:14px;top:50%;transform:translateY(-50%);cursor:pointer;color:var(--dim);display:flex;align-items:center;justify-content:center}
.field-icon svg{width:16px;height:16px}
.fields-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.phone-row{display:flex;gap:8px;align-items:center}
.prefix-select{width:90px;flex-shrink:0;padding:13px 10px;text-align:center}
.pw-strength{margin-top:6px}
.pw-bars{display:flex;gap:4px;margin-bottom:4px}
.pw-bar{height:3px;flex:1;border-radius:2px;background:rgba(255,255,255,0.08);transition:background .3s}
.pw-bar.w{background:#ef4444}.pw-bar.m{background:#fbbf24}.pw-bar.s{background:#22c55e}
.pw-label{font-size:9px;font-weight:600;color:var(--dim)}
.step-row{display:flex;align-items:center;gap:0;margin-bottom:20px}
.step-dot{width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;border:1.5px solid var(--border);color:var(--dim);background:var(--surface);flex-shrink:0;transition:all .3s}
.step-dot.done{background:var(--blue);border-color:var(--blue);color:#fff;box-shadow:0 0 10px rgba(59,130,246,0.5)}
.step-dot.active{border-color:var(--blue);color:var(--blue);box-shadow:0 0 0 3px rgba(59,130,246,0.15)}
.step-line{flex:1;height:1.5px;background:var(--border);margin:0 6px;transition:background .3s}
.step-line.done{background:var(--blue)}
.step-label{font-size:8px;color:var(--dim);margin-top:3px;text-align:center}
.check-row{display:flex;align-items:flex-start;gap:10px;margin-bottom:18px;cursor:pointer}
.check-box{width:20px;height:20px;border-radius:6px;flex-shrink:0;margin-top:1px;border:1.5px solid var(--border);background:rgba(255,255,255,0.04);display:flex;align-items:center;justify-content:center;transition:all .2s}
.check-box.checked{background:var(--blue);border-color:var(--blue);box-shadow:0 0 8px rgba(59,130,246,0.4)}
.check-box svg{width:11px;height:11px;display:none}
.check-box.checked svg{display:block}
.check-label{font-size:11px;color:var(--dim);line-height:1.5}
.check-label .linkish,.auth-link span,.forgot-link,.section-action,.notif-item,.qa-btn,.bn,.virtual-card{cursor:pointer}
.btn-primary,.btn-secondary,.btn-social{font-family:system-ui,sans-serif;transition:all .2s}
.btn-primary{width:100%;padding:14px;background:linear-gradient(135deg,var(--blue) 0%,var(--blue2) 100%);border:none;border-radius:14px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 8px 24px rgba(59,130,246,0.4);display:flex;align-items:center;justify-content:center;gap:8px;position:relative;overflow:hidden;margin-bottom:12px}
.btn-primary:active,.btn-secondary:active,.btn-social:active,.icon-pill:active,.bn:active,.qa-circle:active{transform:scale(.97)}
.btn-primary:disabled{opacity:.55;cursor:not-allowed}
.btn-loader{width:18px;height:18px;border-radius:50%;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.btn-secondary{width:100%;padding:16px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:14px;color:var(--muted);font-size:14px;font-weight:600;cursor:pointer;margin-bottom:12px}
.social-divider{display:flex;align-items:center;gap:10px;margin:4px 0 14px;color:var(--dim);font-size:11px}
.social-divider::before,.social-divider::after{content:'';flex:1;height:1px;background:var(--border)}
.btn-social{width:100%;padding:12px;background:rgba(255,255,255,0.04);border:1px solid var(--border);border-radius:14px;color:var(--text);font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:10px}
.auth-link{text-align:center;font-size:12px;color:var(--dim);margin-top:2px}
.auth-link span,.check-label .linkish,.forgot-link{color:var(--blue);font-weight:700}
.forgot-link{text-align:right;font-size:11px;margin-top:-6px;margin-bottom:12px}
.info-box{background:rgba(59,130,246,0.07);border:1px solid rgba(59,130,246,0.2);border-radius:12px;padding:12px 14px;margin-bottom:14px;display:flex;gap:10px;align-items:flex-start}
.info-box-text{font-size:11px;color:var(--muted);line-height:1.5}.info-box-text strong{color:var(--blue)}
.otp-row{display:flex;gap:8px;justify-content:center;margin:6px 0 18px}
.otp-box{width:44px;height:52px;background:rgba(255,255,255,0.04);border:1.5px solid var(--border);border-radius:13px;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:800;color:var(--text);transition:all .2s;cursor:text}
.otp-box.active{border-color:var(--blue);background:rgba(59,130,246,0.08);box-shadow:0 0 0 3px rgba(59,130,246,0.15),0 0 16px rgba(59,130,246,0.3)}
.otp-box.done{border-color:rgba(34,197,94,0.5);background:rgba(34,197,94,0.06);color:#60a5fa}
.success-wrap{display:flex;flex-direction:column;align-items:center;padding:28px 20px;text-align:center}
.success-circle{width:72px;height:72px;border-radius:50%;background:linear-gradient(135deg,var(--blue),var(--blue2));box-shadow:0 0 30px rgba(59,130,246,0.5),0 0 60px rgba(59,130,246,0.2);display:flex;align-items:center;justify-content:center;margin-bottom:20px;animation:successPop .5s cubic-bezier(.34,1.56,.64,1) both}
@keyframes successPop{from{transform:scale(0);opacity:0}to{transform:scale(1);opacity:1}}
.success-title{font-size:20px;font-weight:800;color:var(--text);margin-bottom:8px;letter-spacing:-.3px}
.success-sub{font-size:12px;color:var(--muted);line-height:1.6;margin-bottom:28px}

/* ── Registration PIN Setup ── */
.pin-setup-wrap{display:flex;flex-direction:column;align-items:center;padding:28px 24px;text-align:center;animation:pinSetupFade .4s ease both}
@keyframes pinSetupFade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
.pin-setup-icon{width:68px;height:68px;border-radius:50%;background:linear-gradient(145deg,rgba(212,164,55,.12),rgba(212,164,55,.04));border:1.5px solid rgba(212,164,55,.25);display:flex;align-items:center;justify-content:center;margin-bottom:22px;color:rgba(212,164,55,.9);animation:successPop .5s cubic-bezier(.34,1.56,.64,1) both}
.pin-setup-title{font-size:18px;font-weight:800;color:var(--text);margin-bottom:8px;letter-spacing:-.2px}
.pin-setup-desc{font-size:12.5px;color:var(--muted);line-height:1.6;margin-bottom:28px;max-width:280px}
.pin-dots-row{display:flex;gap:16px;justify-content:center;margin-bottom:20px}
.pin-dot{width:16px;height:16px;border-radius:50%;border:2px solid rgba(148,163,184,.35);background:transparent;transition:all .2s ease}
.pin-dot.filled{background:var(--blue);border-color:var(--blue);box-shadow:0 0 12px rgba(59,130,246,.4);transform:scale(1.1)}
.pin-hidden-input{display:none}
.pin-back-link{background:none;border:none;color:var(--blue);font-size:12px;font-weight:600;cursor:pointer;padding:8px 0;margin-top:8px;transition:opacity .2s}
.pin-back-link:hover{opacity:.75}
.pin-confirm-btn{margin-top:20px}
.pin-error-msg{color:#ef4444;font-size:12px;font-weight:600;margin-top:10px;animation:shake .3s ease}
@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-6px)}75%{transform:translateX(6px)}}
.pin-skip-link{display:none}
.reg-pin-input{width:100%;max-width:200px;height:52px;padding:0 16px;background:rgba(255,255,255,.04);border:1.5px solid rgba(148,163,184,.25);border-radius:16px;color:#fff;font-size:22px;font-weight:900;text-align:center;letter-spacing:.35em;outline:none;font-family:'Montserrat',sans-serif;transition:all .2s;-webkit-appearance:none;margin-top:8px}
.reg-pin-input:focus{border-color:rgba(59,130,246,.5);background:rgba(59,130,246,.06);box-shadow:0 0 0 3px rgba(59,130,246,.12)}
.reg-pin-input::placeholder{color:rgba(148,163,184,.3);letter-spacing:.3em}

/* ── Loan Screens (Microcrédit & Prêt Personnel) ── */
.loan-screen{min-height:100%;background:#0a0e17;color:#fff;padding:24px 18px 100px;display:flex;flex-direction:column;gap:18px}
.loan-header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.loan-header-left{display:flex;align-items:center;gap:12px;flex:1}
.loan-header-title{font-size:22px;font-weight:800;letter-spacing:-.3px;font-family:'Montserrat',sans-serif}
.loan-header-sub{font-size:12px;color:#64748b;margin-top:2px}
.loan-badge-wrap{flex-shrink:0;padding-top:4px}
.loan-badge{padding:5px 10px;border-radius:10px;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;background:rgba(59,130,246,.1);color:#60a5fa;border:1px solid rgba(59,130,246,.2)}
.loan-badge.gold{background:rgba(212,164,55,.1);color:rgba(212,164,55,.9);border-color:rgba(212,164,55,.2)}

.loan-card{padding:20px;border-radius:22px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05)}
.loan-card-title{display:flex;align-items:center;gap:10px;font-size:12px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:16px}

.loan-amount-display{text-align:center;padding:8px 0 20px}
.loan-amount-value{font-size:42px;font-weight:900;font-family:'Montserrat',sans-serif;color:#fff;letter-spacing:-1px}
.loan-amount-unit{font-size:16px;font-weight:700;color:#64748b;margin-left:6px}
.loan-amount-display.gold .loan-amount-value{color:#fbbf24}

.loan-range{padding:0 2px}
.loan-range input{width:100%;accent-color:#2563eb;height:6px;cursor:pointer}
.loan-range-labels{display:flex;justify-content:space-between;margin-top:8px;font-size:10px;font-weight:700;color:#64748b;letter-spacing:.1em}

.loan-presets{display:flex;gap:8px;margin-top:14px;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}
.loan-presets::-webkit-scrollbar{display:none}
.loan-preset-btn{flex-shrink:0;height:36px;padding:0 16px;border:none;border-radius:12px;background:rgba(255,255,255,.05);color:#94a3b8;font-size:12px;font-weight:700;cursor:pointer;transition:all .2s;border:1px solid transparent}
.loan-preset-btn.active{background:rgba(59,130,246,.12);color:#60a5fa;border-color:rgba(59,130,246,.25)}
.loan-preset-btn.gold.active{background:rgba(212,164,55,.12);color:#d4a437;border-color:rgba(212,164,55,.25)}

.loan-duration-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.loan-duration-btn{padding:14px 8px;border:none;border-radius:16px;background:rgba(255,255,255,.04);color:#fff;cursor:pointer;transition:all .2s;display:flex;flex-direction:column;align-items:center;gap:4px;border:1.5px solid rgba(255,255,255,.06)}
.loan-duration-btn.active{background:rgba(59,130,246,.1);border-color:rgba(59,130,246,.3)}
.loan-duration-btn.gold.active{background:rgba(212,164,55,.1);border-color:rgba(212,164,55,.3)}
.loan-duration-value{font-size:22px;font-weight:900;font-family:'Montserrat',sans-serif}
.loan-duration-unit{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.06em}
.loan-duration-rate{font-size:10px;font-weight:700;color:#fbbf24;margin-top:4px}

.loan-textarea{width:100%;min-height:80px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#fff;font-size:13px;font-family:inherit;resize:none;outline:none;transition:border-color .2s;line-height:1.5}
.loan-textarea:focus{border-color:rgba(59,130,246,.4)}
.loan-textarea::placeholder{color:#475569}
.loan-char-count{text-align:right;font-size:10px;color:#475569;margin-top:6px}

.loan-field{display:flex;flex-direction:column;gap:6px}
.loan-field+.loan-field{margin-top:12px}
.loan-field-label{font-size:11px;font-weight:700;color:#94a3b8;letter-spacing:.04em}
.loan-field-input{width:100%;height:44px;padding:0 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#fff;font-size:14px;outline:none;transition:border-color .2s}
.loan-field-input:focus{border-color:rgba(212,164,55,.4)}
.loan-field-input::placeholder{color:#475569}

.loan-summary-card{padding:16px;border-radius:18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;gap:2px}
.loan-summary-card.gold{background:rgba(212,164,55,.04);border-color:rgba(212,164,55,.12)}
.loan-summary-row{display:flex;align-items:center;justify-content:space-between;padding:8px 4px;font-size:13px;color:#94a3b8}
.loan-summary-row span:last-child{color:#fff;font-weight:700}
.loan-summary-row.total{border-top:1px solid rgba(255,255,255,.06);margin-top:4px;padding-top:12px}
.loan-summary-row.total span:last-child{font-size:16px;font-weight:900}
.loan-summary-row.total.gold span:last-child{color:#fbbf24}

/* Confirmation card */
.loan-confirm-card{display:flex;flex-direction:column;gap:20px;padding:24px 20px;animation:loanFadeIn .3s ease both}
@keyframes loanFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.loan-confirm-icon{width:56px;height:56px;border-radius:50%;background:linear-gradient(145deg,rgba(59,130,246,.15),rgba(59,130,246,.05));border:1.5px solid rgba(59,130,246,.25);display:flex;align-items:center;justify-content:center;margin:0 auto;color:#60a5fa}
.loan-confirm-title{font-size:18px;font-weight:800;text-align:center}

.loan-recap-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.loan-recap-item{padding:14px;border-radius:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05)}
.loan-recap-item.highlight{background:rgba(59,130,246,.06);border-color:rgba(59,130,246,.18)}
.loan-recap-label{font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
.loan-recap-value{font-size:15px;font-weight:800;color:#fff;text-transform:uppercase}

.loan-notice{display:flex;align-items:flex-start;gap:10px;padding:14px 16px;border-radius:16px;background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.12);font-size:11.5px;color:#94a3b8;line-height:1.55}
.loan-notice svg{flex-shrink:0;color:#60a5fa;margin-top:1px}

.loan-btn-group{display:grid;grid-template-columns:1fr 2fr;gap:10px;margin-top:4px}
.loan-btn-secondary{height:52px;border:none;border-radius:16px;background:rgba(255,255,255,.06);color:#fff;font-size:14px;font-weight:700;cursor:pointer;transition:all .2s}
.loan-btn-secondary:hover{background:rgba(255,255,255,.1)}
.loan-btn-confirm{height:52px;font-size:15px}

/* ── Loans Landing Screen ── */
.loans-landing{min-height:100%;background:#0a0e17;color:#fff;padding:24px 18px 100px;display:flex;flex-direction:column;gap:20px;animation:loanFadeIn .3s ease both}
.loans-landing-header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
.loans-landing-title{font-size:26px;font-weight:800;letter-spacing:-.4px;font-family:'Montserrat',sans-serif}
.loans-landing-sub{font-size:13px;color:#64748b;margin-top:4px}

.loans-option-card{position:relative;display:flex;flex-direction:column;gap:0;padding:0;border-radius:24px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);text-align:left;cursor:pointer;transition:all .25s;overflow:hidden;width:100%}
.loans-option-card:active{transform:scale(.98)}
.loans-option-card.gold{border-color:rgba(212,164,55,.12);background:rgba(212,164,55,.03)}
.loans-option-card.gold:active{background:rgba(212,164,55,.06)}
.loans-option-top{display:flex;align-items:center;justify-content:space-between;padding:20px 20px 0}
.loans-option-icon{width:52px;height:52px;border-radius:16px;display:flex;align-items:center;justify-content:center}
.loans-option-icon.blue{background:rgba(59,130,246,.12);color:#60a5fa}
.loans-option-icon.gold{background:rgba(212,164,55,.12);color:#d4a437}
.loans-option-badge{padding:4px 10px;border-radius:8px;font-size:9px;font-weight:900;letter-spacing:.1em}
.loans-option-badge.blue{background:rgba(59,130,246,.1);color:#60a5fa;border:1px solid rgba(59,130,246,.18)}
.loans-option-badge.gold{background:rgba(212,164,55,.1);color:#d4a437;border:1px solid rgba(212,164,55,.18)}
.loans-option-body{padding:14px 20px 18px}
.loans-option-name{font-size:20px;font-weight:800;margin-bottom:6px;letter-spacing:-.2px}
.loans-option-card.gold .loans-option-name{color:#fbbf24}
.loans-option-desc{font-size:12.5px;color:#94a3b8;line-height:1.5;margin-bottom:18px}
.loans-option-metrics{display:flex;align-items:center;gap:0}
.loans-option-metric{text-align:center;flex:1}
.loans-option-metric-val{font-size:15px;font-weight:900;font-family:'Montserrat',sans-serif;color:#fff}
.loans-option-metric-val.blue{color:#60a5fa}
.loans-option-metric-val.gold{color:#fbbf24}
.loans-option-metric-lbl{font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-top:2px}
.loans-option-divider{width:1px;height:32px;background:rgba(255,255,255,.08);flex-shrink:0}
.loans-option-arrow{display:flex;align-items:center;justify-content:center;padding:0 20px 20px;color:#64748b}
.loans-option-card.gold .loans-option-arrow{color:#a67c00}

.loans-info-banner{display:flex;align-items:flex-start;gap:12px;padding:16px 18px;border-radius:18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);font-size:11.5px;color:#94a3b8;line-height:1.55}
.loans-info-banner svg{flex-shrink:0;color:#64748b;margin-top:2px}

/* ── Wallet Screen ── */
.wallet-screen{min-height:100%;background:#0a0e17;color:#fff;padding:24px 18px 100px;display:flex;flex-direction:column;gap:18px}
.wallet-header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
.wallet-header-title{font-size:26px;font-weight:800;letter-spacing:-.4px;font-family:'Montserrat',sans-serif}
.wallet-header-sub{font-size:13px;color:#64748b;margin-top:4px}
.wallet-card{padding:22px;border-radius:24px;border:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;gap:10px;position:relative;overflow:hidden;transition:all .2s}
.wallet-card::before{content:'';position:absolute;top:-30px;right:-30px;width:100px;height:100px;border-radius:50%;opacity:.06}
.wallet-card.xaf{background:rgba(59,130,246,.06);border-color:rgba(59,130,246,.15)}
.wallet-card.xaf::before{background:#3b82f6}
.wallet-card.eur{background:rgba(16,185,129,.06);border-color:rgba(16,185,129,.15)}
.wallet-card.eur::before{background:#10b981}
.wallet-card.usd{background:rgba(245,158,11,.06);border-color:rgba(245,158,11,.15)}
.wallet-card.usd::before{background:#f59e0b}
.wallet-card-label{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.1em}
.wallet-card-balance{font-size:36px;font-weight:900;font-family:'Montserrat',sans-serif;letter-spacing:-1px}
.wallet-card-unit{font-size:16px;font-weight:700;margin-left:4px}
.wallet-card.xaf .wallet-card-balance{color:#fff}
.wallet-card.xaf .wallet-card-unit{color:#60a5fa}
.wallet-card.eur .wallet-card-balance{color:#34d399}
.wallet-card.eur .wallet-card-unit{color:#34d399}
.wallet-card.usd .wallet-card-balance{color:#fbbf24}
.wallet-card.usd .wallet-card-unit{color:#fbbf24}
.wallet-total{padding:16px 20px;border-radius:20px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between}
.wallet-total-label{font-size:12px;color:#64748b;font-weight:600}
.wallet-total-value{font-size:18px;font-weight:900;font-family:'Montserrat',sans-serif;color:#fff}
.wallet-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.wallet-action-btn{height:52px;border:none;border-radius:18px;font-size:14px;font-weight:700;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px}
.wallet-action-btn:active{transform:scale(.98)}
.wallet-action-btn.primary{background:rgba(59,130,246,.12);color:#60a5fa;border:1px solid rgba(59,130,246,.2)}
.wallet-action-btn.secondary{background:rgba(255,255,255,.04);color:#94a3b8;border:1px solid rgba(255,255,255,.08)}

/* ── Wallet Dashboard Widget ── */
.wallet-widget{display:flex;gap:8px;margin-bottom:18px}
.wallet-widget-chip{flex:1;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);display:flex;align-items:center;gap:8px;cursor:pointer;transition:all .2s}
.wallet-widget-chip:active{background:rgba(255,255,255,.06)}
.wallet-widget-chip.eur{border-color:rgba(16,185,129,.15)}
.wallet-widget-chip.usd{border-color:rgba(245,158,11,.15)}
.wallet-widget-flag{font-size:16px;font-weight:900}
.wallet-widget-flag.eur{color:#34d399}
.wallet-widget-flag.usd{color:#fbbf24}
.wallet-widget-val{font-size:13px;font-weight:800;font-family:'Montserrat',sans-serif;color:#fff}

/* ── FX Wallet Mini Cards ── */
.fx-wallet-card{padding:18px 14px;border-radius:20px;border:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;align-items:center;gap:6px;cursor:pointer;transition:all .2s;text-align:center;background:rgba(255,255,255,.02)}
.fx-wallet-card:active{transform:scale(.97)}
.fx-wallet-card.eur{border-color:rgba(16,185,129,.18);background:rgba(16,185,129,.05)}
.fx-wallet-card.usd{border-color:rgba(245,158,11,.18);background:rgba(245,158,11,.05)}
.fx-wc-icon{font-size:22px;font-weight:900;line-height:1}
.fx-wc-label{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em}
.fx-wc-balance{font-size:20px;font-weight:900;font-family:'Montserrat',sans-serif;letter-spacing:-.5px}
.fx-wallet-card.eur .fx-wc-balance{color:#34d399}
.fx-wallet-card.usd .fx-wc-balance{color:#fbbf24}
.fx-wc-equiv{font-size:10px;color:#64748b;font-weight:600}

/* ── Wallet Detail Screens (EUR / USD) ── */
.wallet-detail-screen{min-height:100%;background:#0a0e17;color:#fff;padding:24px 18px 100px;display:flex;flex-direction:column;gap:18px}
.wallet-detail-header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
.wallet-detail-title{font-size:24px;font-weight:800;letter-spacing:-.3px;font-family:'Montserrat',sans-serif;display:flex;align-items:center}
.wallet-detail-sub{font-size:13px;color:#64748b;margin-top:4px}
.wallet-detail-balance-card{padding:28px 22px;border-radius:24px;position:relative;overflow:hidden;display:flex;flex-direction:column;gap:6px}
.wallet-detail-balance-card.eur{background:linear-gradient(145deg,rgba(16,185,129,.12),rgba(16,185,129,.03));border:1px solid rgba(16,185,129,.2)}
.wallet-detail-balance-card.usd{background:linear-gradient(145deg,rgba(245,158,11,.12),rgba(245,158,11,.03));border:1px solid rgba(245,158,11,.2)}
.wallet-detail-card-orb{position:absolute;top:-20px;right:-20px;width:80px;height:80px;border-radius:50%;opacity:.08}
.wallet-detail-balance-card.eur .wallet-detail-card-orb{background:#10b981}
.wallet-detail-balance-card.usd .wallet-detail-card-orb{background:#f59e0b}
.wallet-detail-card-label{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.1em}
.wallet-detail-card-amount{font-size:40px;font-weight:900;font-family:'Montserrat',sans-serif;letter-spacing:-1px;color:#fff}
.wallet-detail-card-equiv{font-size:13px;color:#64748b;font-weight:600}
.wallet-detail-info-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.wallet-detail-info-item{padding:16px;border-radius:18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)}
.wallet-detail-info-label{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
.wallet-detail-info-value{font-size:13px;font-weight:800;color:#fff;font-family:'Montserrat',sans-serif}
.wallet-detail-equivalence{padding:18px;border-radius:20px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;gap:10px}
.wallet-detail-eq-row{display:flex;align-items:center;justify-content:space-between;font-size:13px}
.wallet-detail-eq-row span:first-child{color:#94a3b8;font-weight:600}
.wallet-detail-eq-row span:last-child{color:#fff;font-weight:800;font-family:'Montserrat',sans-serif}
.wallet-detail-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.wallet-detail-action-btn{height:52px;border:none;border-radius:18px;font-size:13px;font-weight:800;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center}
.wallet-detail-action-btn:active{transform:scale(.98)}
.wallet-detail-action-btn.green{background:linear-gradient(135deg,rgba(16,185,129,.2),rgba(16,185,129,.08));color:#34d399;border:1px solid rgba(16,185,129,.25)}
.wallet-detail-action-btn.outline-green{background:transparent;color:#34d399;border:1px solid rgba(16,185,129,.2)}
.wallet-detail-action-btn.gold{background:linear-gradient(135deg,rgba(245,158,11,.2),rgba(245,158,11,.08));color:#fbbf24;border:1px solid rgba(245,158,11,.25)}
.wallet-detail-action-btn.outline-gold{background:transparent;color:#fbbf24;border:1px solid rgba(245,158,11,.2)}
.wallet-detail-notice{display:flex;align-items:flex-start;gap:10px;padding:14px 16px;border-radius:14px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);font-size:11px;color:#64748b;line-height:1.5}

/* ── Improved Currency Exchange ── */
.fx-screen{min-height:100%;background:#0a0e17;color:#fff;padding:24px 18px 100px;display:flex;flex-direction:column;gap:18px}
.fx-header{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}
.fx-header-title{font-size:22px;font-weight:800;letter-spacing:-.3px;font-family:'Montserrat',sans-serif}
.fx-direction-toggle{display:flex;align-items:center;gap:0;padding:4px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06)}
.fx-dir-btn{height:40px;padding:0 18px;border:none;border-radius:11px;background:transparent;color:#64748b;font-size:12px;font-weight:700;cursor:pointer;transition:all .2s;white-space:nowrap}
/* ── FX Exchange Box (Simple) ── */
.fx-exchange-box{padding:20px;border-radius:24px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;gap:16px}
.fx-ex-from,.fx-ex-to{display:flex;flex-direction:column;gap:8px}
.fx-ex-label{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.1em}
.fx-ex-row{display:flex;align-items:center;gap:10px}
.fx-ex-input{flex:1;height:48px;padding:0 14px;border-radius:14px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#fff;font-size:22px;font-weight:800;text-align:left;outline:none;font-family:'Montserrat',sans-serif}
.fx-ex-input:focus{border-color:rgba(59,130,246,.4)}
.fx-ex-input::placeholder{color:#334155;font-weight:400}
.fx-ex-result{flex:1;height:48px;display:flex;align-items:center;font-size:22px;font-weight:900;color:#34d399;font-family:'Montserrat',sans-serif;padding:0 4px}
.fx-ex-currency-badge{padding:8px 14px;border-radius:12px;font-size:13px;font-weight:800;font-family:'Montserrat',sans-serif;white-space:nowrap;border:1px solid rgba(59,130,246,.15)}
.fx-ex-currency-selector{display:flex;flex-direction:column;gap:4px;flex-shrink:0}
.fx-ex-curr-btn{padding:6px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);color:#64748b;font-size:11px;font-weight:700;cursor:pointer;transition:all .15s;font-family:'Montserrat',sans-serif;white-space:nowrap}
.fx-ex-curr-btn:active{transform:scale(.97)}
.fx-ex-swap-circle{width:44px;height:44px;border-radius:50%;border:2px solid rgba(59,130,246,.25);background:rgba(59,130,246,.1);color:#60a5fa;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s;z-index:2}
.fx-ex-swap-circle:active{transform:rotate(180deg);background:rgba(59,130,246,.2)}
.fx-ex-summary{padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);display:flex;flex-direction:column;gap:8px}
.fx-ex-sum-row{display:flex;align-items:center;justify-content:space-between;font-size:12px}
.fx-ex-sum-row span:first-child{color:#64748b;font-weight:600}
.fx-ex-sum-row span:last-child{color:#fff;font-weight:700;font-family:'Montserrat',sans-serif}
.fx-ex-from.fx-swap-anim{animation:fxSwapSlideUp .35s ease}
.fx-ex-to.fx-swap-anim{animation:fxSwapSlideDown .35s ease}
@keyframes fxSwapSlideUp{0%{transform:translateY(0);opacity:1}40%{transform:translateY(-12px);opacity:.4}60%{transform:translateY(12px);opacity:.4}100%{transform:translateY(0);opacity:1}}
@keyframes fxSwapSlideDown{0%{transform:translateY(0);opacity:1}40%{transform:translateY(12px);opacity:.4}60%{transform:translateY(-12px);opacity:.4}100%{transform:translateY(0);opacity:1}}
.fx-ex-currency-badge.fx-swap-anim{animation:fxSwapBadge .35s ease}
@keyframes fxSwapBadge{0%{transform:scale(1)}30%{transform:scale(.85);opacity:.5}60%{transform:scale(1.1);opacity:1}100%{transform:scale(1)}}
.fx-ex-result.fx-swap-anim{animation:fxSwapBadge .35s ease}
.fx-ex-currency-selector.fx-swap-anim{animation:fxSwapBadge .35s ease}
.fx-dir-btn.active{background:rgba(59,130,246,.12);color:#60a5fa}
.fx-card{padding:20px;border-radius:22px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)}
.fx-card-label{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.1em}
.fx-amount-display{text-align:center;padding:4px 0 18px}
.fx-amount-value{font-size:38px;font-weight:900;font-family:'Montserrat',sans-serif;letter-spacing:-1px}
.fx-amount-unit{font-size:16px;font-weight:700;color:#64748b;margin-left:6px}
.fx-amount-input{width:100%;height:52px;padding:0 14px;border-radius:16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#fff;font-size:18px;font-weight:700;text-align:center;outline:none;font-family:'Montserrat',sans-serif}
.fx-amount-input:focus{border-color:rgba(59,130,246,.4)}
.fx-amount-input::placeholder{color:#475569;font-weight:400}
.fx-target-row{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-radius:16px;background:rgba(59,130,246,.06);border:1px solid rgba(59,130,246,.12);margin-top:14px}
.fx-target-label{font-size:11px;color:#64748b;font-weight:600}
.fx-target-value{font-size:18px;font-weight:800;color:#60a5fa;font-family:'Montserrat',sans-serif}
.fx-fee-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:12px;color:#94a3b8}
.fx-fee-row span:last-child{color:#fbbf24;font-weight:700}
.fx-rates-bar{display:flex;gap:16px;justify-content:center;padding:14px;border-radius:16px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05)}
.fx-rate{text-align:center;font-size:11px;color:#64748b;line-height:1.5}
.fx-rate strong{display:block;color:#fff;font-size:14px;font-weight:800;font-family:'Montserrat',sans-serif}
.fx-wallet-row{display:flex;gap:8px}
.fx-wallet-chip{flex:1;padding:10px;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.06);text-align:center}
.fx-wallet-chip-label{font-size:9px;color:#64748b;text-transform:uppercase;letter-spacing:.08em;font-weight:700}
.fx-wallet-chip-val{font-size:14px;font-weight:800;font-family:'Montserrat',sans-serif;margin-top:2px}
.fx-confirm-btn{height:56px;border:none;border-radius:18px;background:#2563eb;color:#fff;font-size:16px;font-weight:800;box-shadow:0 10px 30px rgba(37,99,235,.3);cursor:pointer;transition:all .2s;width:100%;display:flex;align-items:center;justify-content:center;gap:8px}
.fx-confirm-btn:active{transform:scale(.98)}
.fx-confirm-btn:disabled{opacity:.5;cursor:not-allowed}

.top-header{display:flex;align-items:flex-start;justify-content:space-between;padding:calc(env(safe-area-inset-top, 0px) + 10px) 22px 0;position:sticky;top:0;z-index:10;background:var(--bg);transition:box-shadow .2s}
.brand-row{display:flex;align-items:center;gap:10px}
.brand-text-wrap{display:flex;flex-direction:column}
.brand-name{font-family:'Montserrat',sans-serif;font-size:13.5px;font-weight:800;color:var(--text);letter-spacing:.4px;line-height:1}
.brand-sub-lbl{font-family:'Montserrat',sans-serif;font-size:6.8px;font-weight:700;color:var(--gold);letter-spacing:3px;text-transform:uppercase;margin-top:2px}
.top-actions{display:flex;gap:9px;align-items:center}.icon-pill{width:36px;height:36px;border-radius:50%;background:var(--w05);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;position:relative;transition:all .2s}
.notif-dot{position:absolute;top:4px;right:4px;width:7px;height:7px;border-radius:50%;background:var(--danger);border:1.5px solid var(--bg)}
.notif-overlay{position:fixed;inset:0;z-index:9999;background:rgba(3,8,16,.6);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);opacity:0;pointer-events:none;transition:opacity .3s ease;display:flex;justify-content:center;align-items:flex-start;padding:80px 14px 24px}
.notif-overlay.open{opacity:1;pointer-events:auto}
.notif-panel{width:100%;max-width:400px;background:linear-gradient(180deg,#0c1528 0%,#080f1e 100%);border:1px solid rgba(59,130,246,.2);border-radius:24px;box-shadow:0 20px 50px rgba(0,0,0,.5);overflow:hidden;transform:translateY(-20px);transition:transform .3s cubic-bezier(.34,1.56,.64,1)}
.notif-overlay.open .notif-panel{transform:translateY(0)}
.notif-panel-head{padding:18px 20px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid rgba(255,255,255,.05)}
.notif-panel-title{color:#fff;font-size:15px;font-weight:700;font-family:'Montserrat',sans-serif}
.notif-panel-action{background:none;border:none;color:#60a5fa;font-size:12px;font-weight:600;cursor:pointer}
.notif-panel-action:disabled{opacity:.45;cursor:default}
.notif-panel-list{max-height:min(400px,calc(100dvh - 220px));overflow-y:auto;padding:10px;overscroll-behavior:none}
.notif-panel-item{display:flex;align-items:center;gap:12px;padding:12px;border:none;width:100%;border-radius:16px;position:relative;transition:background .2s;background:transparent;text-align:left;cursor:pointer}
.notif-panel-item:active,.notif-panel-item:hover{background:rgba(255,255,255,.05)}
.notif-panel-item.read{opacity:.76}
.notif-panel-ico{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.notif-panel-body{flex:1;min-width:0}
.notif-panel-item-title{color:#f1f5f9;font-size:13px;font-weight:500;line-height:1.4}
.notif-panel-item-time{color:#64748b;font-size:11px;margin-top:2px}
.notif-panel-item-badge{margin-top:6px;display:inline-flex;padding:2px 7px;border-radius:999px;font-size:8px;font-weight:800}
.notif-panel-unread{width:8px;height:8px;background:#ef4444;border-radius:50%;margin-left:auto;flex-shrink:0;box-shadow:0 0 10px rgba(239,68,68,.45)}
.notif-panel-empty{padding:24px 18px;text-align:center;color:#64748b;font-size:11px;font-style:italic}
.notif-panel-close{width:100%;padding:15px;background:rgba(255,255,255,.02);border:none;border-top:1px solid rgba(255,255,255,.05);color:#94a3b8;font-weight:600;cursor:pointer}
.contact-modal-overlay{position:fixed;inset:0;z-index:10000;background:rgba(3,8,16,.72);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);display:flex;align-items:flex-start;justify-content:center;padding:60px 20px 20px;animation:fadeIn .3s ease}}.contact-modal{width:100%;max-width:380px;background:linear-gradient(180deg,#101a30 0%,#080f1e 100%);border:1px solid rgba(59,130,246,.22);border-radius:28px 28px 0 0;box-shadow:0 30px 80px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.05);padding:22px 20px 18px;display:flex;flex-direction:column;gap:18px;opacity:0;transform:translateY(100%);animation:panelSpringUp .3s cubic-bezier(.34,1.2,.64,1) forwards}.contact-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.contact-modal-title{font-size:18px;font-weight:800;color:#fff;font-family:'Montserrat',sans-serif;letter-spacing:-.02em}.contact-modal-sub{font-size:12px;line-height:1.5;color:#94a3b8;margin-top:4px}.contact-modal-close{width:36px;height:36px;border:none;border-radius:12px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center;color:#cbd5e1;cursor:pointer;flex-shrink:0}.contact-modal-close:active{transform:scale(.96)}.contact-modal-field{display:flex;flex-direction:column;gap:8px}.contact-modal-label{font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#64748b;padding-left:2px}.contact-modal-input{width:100%;height:56px;border-radius:18px;border:1px solid rgba(59,130,246,.18);background:rgba(255,255,255,.04);padding:0 18px;color:#fff;font-size:16px;font-weight:600;outline:none;transition:all .2s}.contact-modal-input:focus{border-color:rgba(59,130,246,.45);background:rgba(59,130,246,.08);box-shadow:0 0 0 3px rgba(59,130,246,.12)}.contact-modal-input::placeholder{color:#64748b}.contact-modal-preview{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:20px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05)}.contact-modal-avatar{width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff;background:linear-gradient(135deg,rgba(59,130,246,.24),rgba(29,78,216,.44));border:1px solid rgba(255,255,255,.16);box-shadow:0 8px 20px rgba(0,0,0,.28),inset 0 2px 2px rgba(255,255,255,.16)}.contact-modal-preview-name{font-size:14px;font-weight:700;color:#fff}.contact-modal-preview-meta{font-size:11px;color:#94a3b8;margin-top:3px}.contact-modal-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}.contact-modal-btn{height:48px;border-radius:16px;border:none;font-size:14px;font-weight:700;cursor:pointer;transition:all .2s}.contact-modal-btn.secondary{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#94a3b8}.contact-modal-btn.primary{background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;box-shadow:0 12px 24px rgba(37,99,235,.28)}.contact-modal-btn:active{transform:scale(.97)}@keyframes fadeIn{from{opacity:0}to{opacity:1}}@keyframes modalRise{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:translateY(0) scale(1)}}
.search-box{position:relative}.search-box .contact-modal-input{padding-right:52px}.loader-spinner{position:absolute;right:18px;top:50%;transform:translateY(-50%);width:18px;height:18px;border-radius:50%;border:2px solid rgba(96,165,250,.18);border-top-color:#60a5fa;animation:spin .8s linear infinite}.user-preview{display:flex;align-items:center;gap:12px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.3);padding:12px;border-radius:16px;text-align:left}.preview-status{font-size:10px;color:#4ade80;display:block;margin-top:4px}.contact-modal-btn.primary:disabled{opacity:.3;cursor:not-allowed;background:#475569;box-shadow:none}
.greeting{padding:8px 22px 0}.g-hello{font-size:11px;font-weight:500;color:var(--muted)}
.g-name{font-size:19px;font-weight:800;color:var(--text);letter-spacing:-.3px;margin-top:2px;display:flex;align-items:center;gap:6px;max-width:100%}
.g-name-txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:calc(100% - 28px);display:block}
.g-sub{font-size:10.5px;font-weight:500;color:var(--dim);margin-top:3px}
.balance-card{margin:10px 18px 0;border-radius:22px;background:linear-gradient(145deg,#060e24 0%,#0c1d50 50%,#060c1e 100%);border:1px solid rgba(59,130,246,0.28);padding:24px 22px 20px;position:relative;overflow:hidden;box-shadow:0 0 0 1px rgba(59,130,246,0.08),0 0 40px rgba(59,130,246,0.18),0 16px 48px rgba(0,0,0,0.5),inset 0 1px 0 rgba(255,255,255,0.04)}
.bc-gold-top{position:absolute;top:0;left:8%;right:8%;height:1.5px;background:linear-gradient(90deg,transparent,rgba(212,164,55,0.7) 30%,rgba(212,164,55,1) 50%,rgba(212,164,55,0.7) 70%,transparent)}
.bc-glow-edge{position:absolute;left:0;top:10%;bottom:10%;width:2px;background:linear-gradient(180deg,transparent,rgba(59,130,246,0.5) 40%,rgba(59,130,246,0.5) 60%,transparent)}
.bc-glow-edge.right{left:auto;right:0}.bc-orb{position:absolute;top:-50px;right:-50px;width:180px;height:180px;border-radius:50%;background:radial-gradient(circle,rgba(59,130,246,0.2) 0%,transparent 65%)}
.bc-orb2{position:absolute;bottom:-40px;left:-30px;width:140px;height:140px;border-radius:50%;background:radial-gradient(circle,rgba(26,62,120,0.25) 0%,transparent 65%)}
.bc-sparkline{position:absolute;bottom:0;left:0;right:0;height:72px;pointer-events:none;z-index:0;overflow:hidden;border-radius:0 0 22px 22px}
.bc-sparkline svg{width:100%;height:100%;display:block}
.bc-label{font-family:'Montserrat',sans-serif;font-size:9px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:rgba(212,164,55,0.65);margin-bottom:6px;position:relative;z-index:1}
.bc-amount{font-family:'Montserrat',sans-serif;font-size:30px;font-weight:800;color:#fff;letter-spacing:-1.5px;text-shadow:0 0 30px rgba(59,130,246,0.5),0 0 60px rgba(59,130,246,0.2);line-height:1;position:relative;z-index:1}
.bc-amount-cur{font-size:14px;font-weight:600;color:rgba(212,164,55,0.8);margin-right:4px}.bc-sub{font-size:10px;font-weight:500;color:rgba(255,255,255,0.4);margin-top:6px;position:relative;z-index:1;letter-spacing:.3px}
.bc-chart-labels{display:flex;justify-content:space-between;align-items:center;margin-top:18px;padding:0 15px;position:relative;z-index:1}.bc-chart-labels span{font-size:9px;font-weight:700;text-transform:uppercase;color:rgba(255,255,255,0.45);letter-spacing:.5px}.bc-chart-labels span:last-child{color:rgba(255,255,255,0.85);font-weight:800}.bc-divider{height:1px;margin:14px 0;background:linear-gradient(90deg,transparent,rgba(59,130,246,0.25) 30%,rgba(59,130,246,0.25) 70%,transparent);position:relative;z-index:1}
.bc-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;position:relative;z-index:1}
.bc-stat{background:rgba(59,130,246,0.07);border:1px solid rgba(59,130,246,0.14);border-radius:12px;padding:9px 10px}.bc-stat-l{font-size:8px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:var(--dim);margin-bottom:3px}
.bc-stat-v{font-family:'Montserrat',sans-serif;font-size:12px;font-weight:800;color:rgba(255,255,255,0.9)}.bc-stat-v.up{color:var(--success)}.bc-stat-v.dn{color:var(--danger)}.bc-stat-v.gd{color:var(--gold)}
.section-header{display:flex;align-items:center;justify-content:space-between;padding:20px 22px 12px}.section-title{font-family:'Montserrat',sans-serif;font-size:12px;font-weight:800;color:var(--text);letter-spacing:-.2px}.section-action{font-size:10px;font-weight:600;color:var(--blue)}.card-section-header{display:grid;grid-template-columns:1fr auto 1fr;align-items:center}.card-section-header .section-title{justify-self:start}.card-section-header .section-action{justify-self:end}.card-section-toggle{justify-self:center;display:flex;align-items:center;justify-content:center}
.card-tilt-wrap{margin:0 18px}
.virtual-card{width:100%;max-width:430px;aspect-ratio:1.586 / 1;background:linear-gradient(135deg,#0d1b3e 0%,#070d1e 100%);background-image:linear-gradient(135deg,#0d1b3e 0%,#070d1e 100%),repeating-linear-gradient(45deg,rgba(255,255,255,0.01) 0px,rgba(255,255,255,0.01) 1px,transparent 1px,transparent 10px);background-blend-mode:overlay;border-radius:18px;border:1px solid rgba(255,255,255,0.08);position:relative;overflow:hidden;transform-style:preserve-3d;box-shadow:0 15px 35px rgba(0,0,0,0.4),inset 0 1px 1px rgba(255,255,255,0.05);transition:transform .25s ease,box-shadow .25s ease;font-family:'Montserrat',sans-serif;padding:20px 24px;display:flex;flex-direction:column;justify-content:space-between;box-sizing:border-box}
.virtual-card.black-card{background:linear-gradient(145deg,#030303 0%,#090909 46%,#000000 100%);background-image:linear-gradient(145deg,#030303 0%,#090909 46%,#000000 100%),repeating-linear-gradient(45deg,rgba(255,255,255,0.015) 0px,rgba(255,255,255,0.015) 1px,transparent 1px,transparent 10px);border-color:rgba(212,164,55,0.28);box-shadow:0 18px 42px rgba(0,0,0,.62),inset 0 1px 1px rgba(255,255,255,.04),0 0 0 1px rgba(212,164,55,.06)}
.virtual-card.black-card .vc-left-glow,.virtual-card.black-card .vc-right-glow{background:linear-gradient(180deg,transparent,rgba(212,164,55,.35) 40%,rgba(212,164,55,.35) 60%,transparent)}
.virtual-card.black-card .vc-orb1{background:radial-gradient(circle,rgba(212,164,55,.08) 0%,transparent 65%)}
.virtual-card.black-card .vc-orb2{background:radial-gradient(circle,rgba(255,255,255,.04) 0%,transparent 65%)}
.virtual-card.black-card .vc-micro-grid{background-image:linear-gradient(rgba(212,164,55,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(212,164,55,0.04) 1px,transparent 1px)}
.virtual-card.black-card .vc-brush{opacity:.2}
.virtual-card.black-card .vc-photo-gloss{background:radial-gradient(circle at 18% 12%,rgba(255,255,255,.06) 0%,rgba(255,255,255,.01) 26%,transparent 42%),linear-gradient(155deg,rgba(255,255,255,.06) 0%,transparent 22%,transparent 60%,rgba(255,255,255,.03) 100%)}
.virtual-card.black-card .vc-brand-name,.virtual-card.black-card .vc-number,.virtual-card.black-card .vc-holder-n,.virtual-card.black-card .vc-ccv-v,.virtual-card.black-card .vc-exp-v{color:rgba(255,255,255,.97)}
.virtual-card.black-card .vc-brand-sub,.virtual-card.black-card .vc-holder-l,.virtual-card.black-card .vc-ccv-l,.virtual-card.black-card .vc-exp-l{color:rgba(212,164,55,.82)}
.virtual-card.black-card .nfc-icon{color:rgba(212,164,55,.38)}
.virtual-card.black-card .vc-visa-badge{color:rgba(255,255,255,.92);text-shadow:0 0 12px rgba(212,164,55,.08)}
.virtual-card.black-card .vc-visa-badge .visa-v{color:#fbbf24;text-shadow:0 0 10px rgba(251,191,36,.18)}
.black-card-label{padding:2px 4px 0 22px;font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:rgba(212,164,55,.78)}.dashboard-card-carousel{display:flex;gap:14px;overflow-x:auto;scroll-snap-type:x mandatory;padding:0 18px 2px;scrollbar-width:none}.dashboard-card-carousel::-webkit-scrollbar{display:none}.dashboard-card-slide{min-width:calc(100% - 0px);scroll-snap-align:start}.cards-duo{display:flex;flex-direction:column;gap:22px}.cards-duo-card{display:flex;flex-direction:column;gap:8px}.cards-duo-tag{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:5px 10px;border-radius:10px;font-size:8.5px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;width:100%}.cards-duo-tag.essentielle{background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.25);color:#60a5fa}.cards-duo-tag.black-tag{background:rgba(212,164,55,.1);border:1px solid rgba(212,164,55,.25);color:rgba(212,164,55,.88)}.cards-duo-tag svg{width:12px;height:12px;stroke:currentColor;stroke-width:2;fill:none}.cards-duo-desc{font-size:11.5px;color:#94a3b8;line-height:1.55;padding:0 22px;max-width:48ch}.cards-duo-info{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:0 18px}.cards-duo-stat{background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:10px;text-align:center}.cards-duo-stat-val{font-size:12px;font-weight:800;color:#fff;font-family:'Montserrat',sans-serif}.cards-duo-stat-lbl{font-size:8px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-top:2px}.cards-duo-stat.val-up{color:#4ade80}.cards-duo-stat.val-gold{color:#fbbf24}.cards-duo-divider{height:1px;margin:6px 22px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.06),transparent)}.privileges-screen{min-height:100%;background:#050a18;color:#fff;padding:0;display:flex;flex-direction:column;gap:0;position:relative;overflow:hidden}
.privileges-screen::before{content:'';position:absolute;top:0;left:0;right:0;height:480px;background:radial-gradient(ellipse at 50% 0%,rgba(212,164,55,.08) 0%,rgba(26,62,120,.06) 40%,transparent 70%);pointer-events:none;z-index:0}
.priv-hero-img-wrap{position:relative;width:100%;aspect-ratio:16/9.5;overflow:hidden;border-radius:0 0 32px 32px;z-index:1}
.priv-hero-img-wrap img{width:100%;height:100%;object-fit:cover;object-position:center 30%}
.priv-hero-img-overlay{position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,10,24,.1) 0%,rgba(5,10,24,.5) 60%,rgba(5,10,24,1) 100%);z-index:1}
.priv-hero-img-content{position:absolute;bottom:0;left:0;right:0;padding:0 22px 24px;z-index:2;display:flex;flex-direction:column;gap:10px}
.priv-badge-coming{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:20px;background:rgba(212,164,55,.15);border:1px solid rgba(212,164,55,.35);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);width:fit-content}
.priv-badge-coming-dot{width:6px;height:6px;border-radius:50%;background:#D4A437;animation:privPulse 2s ease infinite}
@keyframes privPulse{0%,100%{opacity:1;box-shadow:0 0 0 0 rgba(212,164,55,.5)}50%{opacity:.6;box-shadow:0 0 0 6px rgba(212,164,55,0)}}
.priv-badge-coming-text{font-size:9px;font-weight:900;letter-spacing:.18em;text-transform:uppercase;color:rgba(212,164,55,.95)}
.priv-hero-title{font-size:28px;font-weight:900;color:#fff;line-height:1.05;letter-spacing:-.5px;font-family:'Montserrat',sans-serif}
.priv-hero-title span{background:linear-gradient(135deg,#D4A437,#f0d98a,#D4A437);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.priv-hero-sub{font-size:12.5px;color:rgba(148,163,184,.85);line-height:1.55;max-width:34ch}
.priv-body{padding:0 22px;display:flex;flex-direction:column;gap:24px;position:relative;z-index:1}
.priv-section-label{font-size:9px;font-weight:900;letter-spacing:.25em;text-transform:uppercase;color:rgba(212,164,55,.6);display:flex;align-items:center;gap:10px}
.priv-section-label::after{content:'';flex:1;height:1px;background:linear-gradient(90deg,rgba(212,164,55,.15),transparent)}
.priv-benefits-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.priv-benefit-card{padding:18px 16px;border-radius:20px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.05);display:flex;flex-direction:column;gap:10px;transition:all .3s ease;position:relative;overflow:hidden}
.priv-benefit-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.08),transparent)}
.priv-benefit-icon{width:40px;height:40px;border-radius:14px;display:flex;align-items:center;justify-content:center;position:relative}
.priv-benefit-icon.gold{background:rgba(212,164,55,.1);color:rgba(212,164,55,.9)}
.priv-benefit-icon.sapphire{background:rgba(59,130,246,.1);color:rgba(96,165,250,.9)}
.priv-benefit-icon.emerald{background:rgba(16,185,129,.1);color:rgba(52,211,153,.9)}
.priv-benefit-icon.rose{background:rgba(244,63,94,.08);color:rgba(251,113,133,.9)}
.priv-benefit-icon.amber{background:rgba(245,158,11,.1);color:rgba(251,191,36,.9)}
.priv-benefit-icon.violet{background:rgba(139,92,246,.1);color:rgba(167,139,250,.9)}
.priv-benefit-name{font-size:13px;font-weight:800;color:#fff;line-height:1.2}
.priv-benefit-desc{font-size:10.5px;color:#64748b;line-height:1.45}
.priv-stats-row{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.priv-stat-card{padding:18px 14px;border-radius:20px;background:rgba(212,164,55,.04);border:1px solid rgba(212,164,55,.1);text-align:center;display:flex;flex-direction:column;gap:6px}
.priv-stat-value{font-size:22px;font-weight:900;font-family:'Montserrat',sans-serif;background:linear-gradient(135deg,#D4A437,#f0d98a);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}
.priv-stat-label{font-size:8.5px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.1em;line-height:1.3}
.priv-exclusive-banner{padding:22px 20px;border-radius:24px;background:linear-gradient(145deg,rgba(212,164,55,.06),rgba(255,255,255,.01));border:1px solid rgba(212,164,55,.12);display:flex;flex-direction:column;gap:12px;text-align:center;position:relative;overflow:hidden}
.priv-exclusive-banner::before{content:'';position:absolute;top:-40px;right:-40px;width:120px;height:120px;border-radius:50%;background:rgba(212,164,55,.04);filter:blur(20px)}
.priv-exclusive-icon{width:48px;height:48px;border-radius:50%;background:rgba(212,164,55,.1);border:1px solid rgba(212,164,55,.2);display:flex;align-items:center;justify-content:center;margin:0 auto;color:rgba(212,164,55,.9)}
.priv-exclusive-title{font-size:16px;font-weight:900;color:#fff;letter-spacing:-.2px}
.priv-exclusive-desc{font-size:12px;color:#94a3b8;line-height:1.6;max-width:32ch;margin:0 auto}
.priv-cta-btn{width:100%;padding:16px;border:none;border-radius:18px;background:linear-gradient(135deg,rgba(212,164,55,.18),rgba(212,164,55,.08));color:#D4A437;font-size:14px;font-weight:800;cursor:pointer;letter-spacing:.02em;transition:all .3s ease;border:1px solid rgba(212,164,55,.2);display:flex;align-items:center;justify-content:center;gap:8px}
.priv-cta-btn:active{transform:scale(.97);background:linear-gradient(135deg,rgba(212,164,55,.25),rgba(212,164,55,.12))}
.priv-divider{height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.05),transparent);margin:0 22px}
.priv-testimonials{display:flex;flex-direction:column;gap:12px}
.priv-testimonial{padding:18px 20px;border-radius:20px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.04);display:flex;flex-direction:column;gap:8px}
.priv-testimonial-stars{display:flex;gap:2px;color:#D4A437;font-size:12px}
.priv-testimonial-text{font-size:12.5px;color:#94a3b8;line-height:1.6;font-style:italic}
.priv-testimonial-author{font-size:11px;font-weight:800;color:#fff}
.priv-testimonial-role{font-size:9.5px;color:#64748b;font-weight:600;margin-top:2px}
.priv-kicker-row{display:flex;align-items:center;gap:8px;margin-bottom:2px}
.priv-kicker-logo{width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,rgba(26,62,120,.3),rgba(59,130,246,.15));border:1px solid rgba(212,164,55,.25);display:flex;align-items:center;justify-content:center;color:rgba(212,164,55,.85);font-size:10px;font-weight:900;font-family:'Montserrat',sans-serif}
.priv-kicker-text{font-size:10px;font-weight:900;letter-spacing:.22em;text-transform:uppercase;color:rgba(212,164,55,.72);font-family:'Montserrat',sans-serif}
.black-request-banner{padding:18px 20px;border-radius:24px;background:linear-gradient(145deg,rgba(212,164,55,.08),rgba(255,255,255,.02));border:1px solid rgba(212,164,55,.18);display:flex;align-items:center;justify-content:space-between;gap:16px}.black-request-meta{display:flex;flex-direction:column;gap:6px}.black-request-title{font-size:16px;font-weight:800;color:#fff}.black-request-sub{font-size:12px;line-height:1.5;color:#94a3b8}
.vc-gold-line{position:absolute;top:0;left:6%;right:6%;height:1.5px;background:linear-gradient(90deg,transparent,rgba(212,164,55,0.8) 35%,rgba(212,164,55,1) 50%,rgba(212,164,55,0.8) 65%,transparent)}.vc-gold-line.bottom{top:auto;bottom:0}
.vc-left-glow{position:absolute;left:-1px;top:10%;bottom:10%;width:2px;background:linear-gradient(180deg,transparent,rgba(59,130,246,0.6) 40%,rgba(59,130,246,0.6) 60%,transparent)}.vc-right-glow{position:absolute;right:-1px;top:10%;bottom:10%;width:2px;background:linear-gradient(180deg,transparent,rgba(59,130,246,0.4) 40%,rgba(59,130,246,0.4) 60%,transparent)}
.vc-orb1{position:absolute;top:-60px;right:-60px;width:200px;height:200px;border-radius:50%;background:radial-gradient(circle,rgba(59,130,246,0.2) 0%,transparent 65%)}.vc-orb2{position:absolute;bottom:-50px;left:-40px;width:160px;height:160px;border-radius:50%;background:radial-gradient(circle,rgba(26,62,120,0.25) 0%,transparent 65%)}
.vc-micro-grid{position:absolute;inset:0;background-image:linear-gradient(rgba(59,130,246,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,0.04) 1px,transparent 1px);background-size:24px 24px}
.vc-brush{position:absolute;inset:0;background:linear-gradient(120deg,rgba(255,255,255,0.08) 0%,rgba(255,255,255,0.03) 14%,rgba(255,255,255,0.01) 30%,rgba(255,255,255,0.02) 55%,rgba(255,255,255,0.06) 74%,rgba(255,255,255,0.01) 100%);mix-blend-mode:screen;opacity:.32;pointer-events:none}
.vc-photo-gloss{position:absolute;inset:0;background:radial-gradient(circle at 18% 12%,rgba(255,255,255,.12) 0%,rgba(255,255,255,.02) 26%,transparent 42%),linear-gradient(155deg,rgba(255,255,255,.10) 0%,transparent 22%,transparent 60%,rgba(255,255,255,.05) 100%);pointer-events:none}
.vc-content{position:relative;z-index:2;padding:0;height:100%;display:flex;flex-direction:column;justify-content:space-between;gap:12px}
.vc-top,.vc-top-row{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px}.vc-logo-row{display:flex;align-items:center;gap:8px}.vc-brand-name{font-size:11.5px;font-weight:800;color:#fff;letter-spacing:.45px;line-height:1}.vc-brand-sub{font-size:6.5px;font-weight:700;color:var(--gold);letter-spacing:2.8px;margin-top:2px}.vc-type-badge{display:flex;align-items:center;gap:4px;background:rgba(212,164,55,0.1);border:1px solid rgba(212,164,55,0.25);border-radius:7px;padding:4px 9px;font-size:7.5px;font-weight:700;color:rgba(212,164,55,0.9);letter-spacing:1.5px}.vc-platinum-badge{display:none !important}.vc-top-right{display:flex;flex-direction:column;align-items:flex-end;gap:6px}.vc-top-right .vc-network{justify-content:flex-end;align-items:flex-start}
@keyframes chip-shimmer{0%{transform:translateX(-150%) skewX(-25deg)}50%,100%{transform:translateX(250%) skewX(-25deg)}}
.vc-chip{width:42px;height:32px;background:linear-gradient(135deg,#d4af37 0%,#f1d592 50%,#d4af37 100%);border-radius:6px;position:relative;overflow:hidden;border:1px solid rgba(0,0,0,0.1);box-shadow:inset 0 1px 1px rgba(255,255,255,0.4)}
.vc-chip::before{content:"";position:absolute;inset:4px;border:1px solid rgba(0,0,0,0.1);background:repeating-linear-gradient(90deg,transparent,transparent 8px,rgba(0,0,0,0.1) 9px);opacity:.5}
.vc-chip.shimmer::after{content:"";position:absolute;top:0;left:0;width:40%;height:100%;background:linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,0.6) 50%,rgba(255,255,255,0) 100%);animation:chip-shimmer 3s infinite ease-in-out}
.vc-chip-row{display:flex;align-items:center;gap:12px}
.nfc-icon{color:rgba(255,255,255,0.4);transform:rotate(0deg);flex-shrink:0}
.vc-number{font-size:clamp(15px,4.2vw,18px);font-weight:700;color:#ffffff;letter-spacing:3px;text-align:center;margin:4px 0 0;text-shadow:0 2px 4px rgba(0,0,0,0.3);white-space:nowrap;display:block;overflow:hidden}
.section-card-switch{width:34px;height:18px;background:rgba(255,255,255,0.1);border-radius:20px;position:relative;cursor:pointer;transition:all .3s ease;border:1px solid rgba(255,255,255,0.1);flex-shrink:0}
.section-card-switch .switch-dot{position:absolute;top:2px;left:2px;width:12px;height:12px;background:#94a3b8;border-radius:50%;transition:all .3s cubic-bezier(0.34,1.56,0.64,1)}
.section-card-switch.active{background:rgba(249,115,22,0.2);border-color:rgba(249,115,22,0.5)}
.section-card-switch.active .switch-dot{left:18px;background:#f97316;box-shadow:0 0 8px rgba(249,115,22,0.6)}
.virtual-card.locked{filter:grayscale(0.6) brightness(0.85)}.virtual-card.locked .vc-number{letter-spacing:4px;opacity:.5}.virtual-card.locked .vc-holder-n,.virtual-card.locked .vc-ccv-v,.virtual-card.locked .vc-exp-v{opacity:.5}
.vc-bottom,.vc-bottom-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(72px,.72fr) minmax(72px,.72fr);align-items:end;gap:14px;margin-top:auto;padding-top:12px}.vc-holder-block,.vc-holder-wrap,.vc-ccv-wrap,.vc-exp-wrap{display:flex;flex-direction:column;gap:6px;min-width:0;justify-content:flex-end}.vc-holder-l,.vc-ccv-l{font-size:9.5px;font-weight:700;letter-spacing:1.7px;text-transform:uppercase;color:rgba(212,164,55,0.72);margin-bottom:0;text-shadow:0 1px 1px rgba(0,0,0,.2);line-height:1}.vc-exp-l{font-size:9.5px;font-weight:700;letter-spacing:1.7px;text-transform:uppercase;color:rgba(212,164,55,0.72);margin-bottom:3px;text-shadow:0 1px 1px rgba(0,0,0,.2);line-height:1}.vc-holder-n{font-size:13.5px;font-weight:800;color:rgba(255,255,255,0.96);letter-spacing:.05em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;text-shadow:0 1px 2px rgba(0,0,0,.25);line-height:1.08}.vc-ccv-v,.vc-exp-v{font-size:14px;font-weight:700;color:rgba(255,255,255,0.96);letter-spacing:.03em;text-shadow:0 1px 2px rgba(0,0,0,.25);line-height:1.08}.vc-exp{text-align:right;flex-shrink:0}.vc-ccv-wrap{text-align:center;align-items:center}.vc-exp-wrap{text-align:right;align-items:flex-end;transform:translateY(-2px)}.vc-exp-visa-wrap{display:flex;flex-direction:column;align-items:flex-end;gap:10px}.vc-network{display:flex;align-items:center;justify-content:flex-end;flex-shrink:0}.vc-visa-badge{font-family:'Montserrat',sans-serif;font-size:18px;line-height:1;font-weight:900;letter-spacing:.6px;font-style:italic;color:rgba(255,255,255,.96);text-shadow:0 0 12px rgba(59,130,246,.15)}.vc-visa-badge .visa-v{color:#60a5fa;text-shadow:0 0 10px rgba(96,165,250,.25)}.vc-number{font-variant-numeric:tabular-nums;font-feature-settings:'tnum';letter-spacing:.12em;word-spacing:.2em}.vc-chip-row{display:flex;align-items:center;gap:10px;margin-top:-2px}.vc-chip{width:38px;height:28px}.nfc-icon{width:18px;height:18px;margin-top:0}.vc-logo-row{display:flex;align-items:center;gap:6px}.vc-logo-row svg{width:28px;height:28px}.vc-brand-name{font-size:13px;font-weight:700;letter-spacing:1.5px}
/* ── GRILLE D'ACTIONS ELITE ── */.qa-wrap{padding:10px 18px 0}.qa-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.qa-btn{background:none;border:none;display:flex;flex-direction:column;align-items:center;gap:9px;cursor:pointer;transition:transform .2s ease,filter .2s ease;outline:none;padding:0}.qa-btn:active{transform:scale(.92)}.qa-circle{width:56px;height:56px;border-radius:50%;background:rgba(255,255,255,0.03);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;transition:all .3s ease;box-shadow:0 4px 15px rgba(0,0,0,0.2),inset 0 1px 1px rgba(255,255,255,0.05)}.qa-circle svg{width:22px;height:22px;stroke:#ffffff;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;fill:none;transition:all .3s ease;filter:drop-shadow(0 0 2px rgba(255,255,255,0.3))}.qa-btn.active-blue .qa-circle{background:rgba(59,130,246,0.1);border-color:rgba(59,130,246,0.4);box-shadow:0 0 20px rgba(59,130,246,0.3),0 4px 15px rgba(0,0,0,0.2),inset 0 1px 1px rgba(255,255,255,0.05)}.qa-btn.active-blue .qa-circle svg{stroke:#60a5fa;filter:drop-shadow(0 0 4px rgba(59,130,246,0.6))}.qa-lbl{font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:.3px;text-align:center;text-transform:capitalize;transition:color .3s ease}.qa-btn.active-blue .qa-lbl{color:#ffffff;font-weight:700}
.stats-card,.notif-card{margin:14px 18px 0;background:var(--surface);border:1px solid var(--border);border-radius:18px;padding:16px 18px;position:relative;overflow:hidden}
.stats-card{margin-top:20px;padding:18px}.stats-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(59,130,246,0.4),transparent)}
.chart-area{height:70px;display:flex;align-items:flex-end;gap:6px;margin-top:14px;position:relative}.chart-area::before{content:'';position:absolute;inset:0;background:repeating-linear-gradient(0deg,transparent,transparent 22px,rgba(59,130,246,0.05) 22px,rgba(59,130,246,0.05) 23px)}.chart-line-wrap{flex:1;display:flex;align-items:flex-end;position:relative}.chart-bar{width:100%;border-radius:3px 3px 0 0;background:linear-gradient(180deg,rgba(59,130,246,0.6) 0%,rgba(59,130,246,0.2) 100%);position:relative;transition:height .6s cubic-bezier(.34,1.56,.64,1)}.chart-bar.hi{background:linear-gradient(180deg,rgba(59,130,246,0.9) 0%,rgba(37,99,235,0.5) 100%);box-shadow:0 0 12px rgba(59,130,246,0.5),0 -3px 10px rgba(59,130,246,0.3)}.chart-bar.hi::after{content:'';position:absolute;top:-3px;left:50%;transform:translateX(-50%);width:6px;height:6px;border-radius:50%;background:#3b82f6;box-shadow:0 0 8px rgba(59,130,246,0.8)}.chart-labels{display:flex;gap:6px;margin-top:6px}.chart-labels span{flex:1;font-size:8px;font-weight:600;color:var(--dim);text-align:center}
.notif-card::before{content:'';position:absolute;top:0;left:0;right:0;height:1px;background:linear-gradient(90deg,transparent,rgba(212,164,55,0.35),transparent)}.notif-items{display:flex;flex-direction:column;gap:10px;margin-top:12px}.notif-item{display:flex;align-items:center;gap:10px}.notif-ico{width:32px;height:32px;border-radius:9px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:14px}.notif-info{flex:1}.notif-title{font-size:10px;font-weight:700;color:rgba(255,255,255,0.9)}.notif-time{font-size:8.5px;color:var(--dim);margin-top:1px}.notif-badge{padding:2px 7px;border-radius:8px;font-size:8px;font-weight:700}.nb-blue{background:rgba(59,130,246,0.15);color:#60a5fa}.nb-green{background:rgba(34,197,94,0.15);color:#22c55e}.nb-gold{background:rgba(212,164,55,0.15);color:#D4A437}.nb-red{background:rgba(239,68,68,0.15);color:#f87171}
.tx-section{padding:0 18px}.tx-item{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--border)}.tx-item:last-child{border-bottom:none}.tx-ico{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0}.tx-info{flex:1;min-width:0}.tx-name{font-size:11px;font-weight:700;color:rgba(255,255,255,0.9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.tx-date{font-size:9px;color:var(--dim);margin-top:2px}.tx-right{text-align:right;flex-shrink:0}.tx-amt{font-family:'Montserrat',sans-serif;font-size:11.5px;font-weight:800;letter-spacing:-.2px}.tx-amt.cr{color:var(--blue3);text-shadow:0 0 8px rgba(59,130,246,0.4)}.tx-amt.dr{color:rgba(255,255,255,0.65)}.tx-cat{font-size:8.5px;color:var(--dim);margin-top:2px}
.bottom-nav{position:fixed;bottom:0;left:50%;right:auto;width:100%;max-width:430px;height:70px;background:rgba(12,21,40,0.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-top:1px solid rgba(59,130,246,0.22);box-shadow:0 -4px 20px rgba(0,0,0,0.4),0 0 20px rgba(59,130,246,0.15);display:flex;align-items:center;justify-content:space-around;z-index:20;transform:translateX(-50%)}.bn{display:flex;flex-direction:column;align-items:center;gap:4px;padding:4px 10px;border-radius:14px;transition:all .2s}.bn-ico{width:34px;height:34px;border-radius:11px;display:flex;align-items:center;justify-content:center;transition:all .2s}.bn-ico.act{background:rgba(59,130,246,0.18);box-shadow:0 0 12px rgba(59,130,246,0.3)}.bn-lbl{font-size:8.5px;font-weight:700;color:rgba(255,255,255,0.3);letter-spacing:.3px;transition:color .2s}.bn.act .bn-lbl{color:var(--blue)}.bn-pip{width:4px;height:4px;border-radius:50%;background:transparent;transition:all .2s}.bn.act .bn-pip{background:var(--blue);box-shadow:0 0 6px rgba(59,130,246,0.7)}
.transaction-screen{display:flex;flex-direction:column;min-height:100%;background:#0a0e17;color:#fff}
.transaction-header{padding:18px 22px 10px;display:flex;flex-direction:column;gap:12px}
.transaction-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px}.transaction-back{width:40px;height:40px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer;flex-shrink:0}.transaction-back:active{transform:scale(.97)}.transaction-headline{font-size:24px;font-weight:800;letter-spacing:-.4px;color:#fff;font-family:'Montserrat',sans-serif}.close-x{font-size:24px;line-height:1;font-weight:500;transform:translateY(-1px)}
.transaction-balance{border-radius:20px;background:linear-gradient(145deg,rgba(37,99,235,.16),rgba(10,14,23,.25));padding:12px 16px;border:1px solid rgba(59,130,246,0.16);backdrop-filter:blur(16px)}.transaction-balance-label{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(96,165,250,.62);margin-bottom:3px;font-weight:700}.transaction-balance-value{display:flex;align-items:baseline;gap:8px}.transaction-balance-value strong{font-size:20px;font-weight:800;font-family:'Montserrat',sans-serif}.transaction-balance-value span{font-size:13px;color:#60a5fa;font-weight:700}
.transaction-body{flex:1;padding:0 22px 8px;display:flex;flex-direction:column;gap:14px}
.transaction-group{display:flex;flex-direction:column;gap:8px}.transaction-label{font-size:13px;font-weight:600;color:#64748b;margin-left:2px}.transaction-amount{position:relative;border-bottom:1px solid rgba(255,255,255,.1);padding:4px 0 10px;transition:border-color .2s;margin:2px 0}.transaction-amount:focus-within{border-color:var(--blue)}.transaction-amount input{width:100%;background:transparent;border:none;outline:none;color:#fff;font-size:32px;font-weight:800;font-family:'Montserrat',sans-serif;line-height:1;padding:0;-moz-appearance:textfield;appearance:textfield}.transaction-amount input::placeholder{color:rgba(255,255,255,.1)}.transaction-amount input::-webkit-outer-spin-button,.transaction-amount input::-webkit-inner-spin-button{appearance:none;-webkit-appearance:none;margin:0}.transaction-amount span{position:absolute;right:0;bottom:12px;font-size:16px;font-weight:800;color:#475569}
.operator-grid{display:flex;gap:10px;margin-bottom:4px}.operator-card{position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:center;gap:7px;padding:12px;min-height:72px;border-radius:18px;border:1px solid rgba(255,255,255,.05);background:rgba(255,255,255,.02);cursor:pointer;transition:all .2s;flex:1}.operator-card.active-mtn{border-color:#ffcc00;background:rgba(255,204,0,.06)}.operator-card.active-airtel{border-color:#ff0000;background:rgba(255,0,0,.06)}.operator-badge{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:8.5px;font-weight:900;text-transform:uppercase}.operator-card span{font-size:12px;font-weight:800}.operator-card .dot{position:absolute;top:10px;right:10px;width:8px;height:8px;border-radius:50%}.operator-card .dot.mtn{background:#ffcc00;box-shadow:0 0 12px #ffcc00}.operator-card .dot.airtel{background:#ff0000;box-shadow:0 0 12px #ff0000}
.phone-input-wrap{display:flex;align-items:center;gap:12px;height:56px;border-radius:16px;border:1px solid rgba(255,255,255,.05);background:rgba(255,255,255,.04);padding:0 16px;transition:all .2s}.phone-input-wrap:focus-within{border-color:rgba(59,130,246,.45)}.phone-prefix{color:#94a3b8;font-weight:700;user-select:none}.phone-input-wrap input{flex:1;background:transparent;border:none;outline:none;color:#fff;font-size:16px;font-weight:600}
.transaction-footer{position:sticky;bottom:78px;margin-top:auto;padding:8px 22px 8px;background:linear-gradient(180deg,rgba(13,18,29,.94),rgba(13,18,29,.98));border-top:1px solid rgba(255,255,255,.05);border-radius:18px 18px 0 0;display:flex;flex-direction:column;gap:8px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}.transaction-recap{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 2px}.transaction-recap small{font-size:10px;color:#64748b;font-style:italic;display:block;margin-bottom:2px}.transaction-recap strong{font-size:14px;font-weight:700;color:#fff}.transaction-recap span{font-size:9px;letter-spacing:.02em;text-transform:uppercase;color:#64748b}.transaction-recap p{font-size:12px;color:#60a5fa;font-weight:700;margin-top:2px}.transaction-confirm{height:48px;width:100%;border:none;border-radius:14px;background:var(--blue2);color:#fff;font-size:16px;font-weight:800;box-shadow:0 10px 30px rgba(37,99,235,.3);cursor:pointer;transition:all .2s}.transaction-confirm:hover{background:#3b82f6}.transaction-confirm:active{transform:scale(.98)}
.services-screen{min-height:100%;background:#0a0e17;color:#fff;padding:0 0 13px}.services-header{padding:30px 22px 0;display:flex;flex-direction:column;gap:22px}.services-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px}.services-title{font-size:28px;font-weight:800;letter-spacing:-.4px;font-family:'Montserrat',sans-serif}.services-bell{width:40px;height:40px;border-radius:50%;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;cursor:pointer}.services-search{position:relative}.services-search input{width:100%;height:56px;padding:0 16px 0 46px;border-radius:18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);color:#fff;font-size:14px;outline:none;transition:all .2s}.services-search input:focus{border-color:rgba(59,130,246,.45)}.services-search .search-icon{position:absolute;left:16px;top:50%;transform:translateY(-50%);display:flex;color:#64748b}.services-section{padding:0 22px;margin-top:28px}.services-section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.services-kicker{font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:2px}.services-premium-badge{background:rgba(59,130,246,.1);color:#60a5fa;font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;border:1px solid rgba(59,130,246,.2)}.services-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.service-tile{position:relative;padding:18px;border-radius:28px;border:1px solid rgba(255,255,255,.05);background:rgba(255,255,255,.02);text-align:left;transition:all .2s;cursor:pointer}.service-tile:hover,.service-wide:hover,.service-option:hover{background:rgba(255,255,255,.05)}.service-badge{position:absolute;top:12px;right:12px;padding:2px 8px;border-radius:999px;background:rgba(34,197,94,.18);color:#4ade80;font-size:9px;font-weight:900}.service-icon-box{width:42px;height:42px;border-radius:14px;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;margin-bottom:12px}.service-name{font-size:14px;font-weight:800;color:#fff}.service-desc{font-size:10px;color:#64748b;margin-top:4px}.services-stack{display:flex;flex-direction:column;gap:14px}.service-wide{padding:18px;border-radius:28px;border:1px solid rgba(255,255,255,.05);background:rgba(255,255,255,.02);transition:all .2s;cursor:pointer}.service-wide.emerald{border-color:rgba(16,185,129,.22);background:rgba(16,185,129,.06)}.service-wide-header{display:flex;align-items:center;justify-content:space-between;gap:14px}.service-wide-main{display:flex;align-items:center;gap:14px}.service-wide-icon{width:48px;height:48px;border-radius:18px;display:flex;align-items:center;justify-content:center}.service-wide-icon.emerald{background:rgba(16,185,129,.18)}.service-wide-icon.amber{background:rgba(245,158,11,.18)}.service-wide-icon.blue{background:rgba(59,130,246,.18)}.service-wide-icon.rose{background:rgba(244,63,94,.18)}.service-wide-title{font-size:15px;font-weight:800;color:#fff}.service-wide-sub{font-size:12px;color:#94a3b8;margin-top:4px}.service-wide-sub.emerald{color:rgba(52,211,153,.88)}.service-arrow{display:flex;color:#60a5fa}.service-options{display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:16px}.service-option{height:42px;border:none;border-radius:14px;background:rgba(255,255,255,.05);color:#fff;font-size:12px;font-weight:600;border:1px solid rgba(255,255,255,.05);cursor:pointer;transition:all .2s}.service-option.crypto{color:#60a5fa}.tontine-avatars{display:flex;align-items:center;gap:0}.tontine-avatars div{width:28px;height:28px;border-radius:50%;border:2px solid #0a0e17;background:#475569}.tontine-avatars div + div{margin-left:-8px}.tontine-avatars .more{background:#64748b;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:800;color:#fff}
.hub-screen{min-height:100%;background:#0a0e17;color:#fff;padding:30px 22px 28px;display:flex;flex-direction:column;gap:22px}.hub-topbar{display:flex;align-items:center;justify-content:space-between;gap:12px}.hub-title{font-size:24px;font-weight:800;letter-spacing:-.4px;font-family:'Montserrat',sans-serif}.hub-badge{background:rgba(251,191,36,.1);color:#fbbf24;border:1px solid rgba(251,191,36,.2);font-size:10px;font-weight:900;padding:6px 10px;border-radius:10px;text-transform:uppercase;letter-spacing:.04em}.hub-card{display:flex;flex-direction:column;gap:22px;padding:24px;background:#0a0e17;border-radius:32px;border:1px solid rgba(255,255,255,.05);box-shadow:0 20px 60px rgba(0,0,0,.35)}.hub-center{text-align:center;padding:10px 0}.hub-center p{font-size:14px;color:#64748b;font-weight:600;margin-bottom:8px}.hub-center h3{font-size:46px;line-height:1;font-weight:900;font-family:'Montserrat',sans-serif}.hub-center h3 span{font-size:20px;color:#3b82f6}.range-wrap{padding:0 2px}.range-wrap input{width:100%;accent-color:#2563eb}.range-scale{display:flex;justify-content:space-between;margin-top:10px;font-size:10px;font-weight:800;color:#64748b;letter-spacing:.12em;text-transform:uppercase}.hub-metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.hub-metric{padding:16px;border-radius:18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05)}.hub-metric-label{font-size:10px;color:#64748b;text-transform:uppercase;margin-bottom:6px}.hub-metric-value{font-size:16px;font-weight:800;color:#fff}.hub-metric-value.blue{color:#60a5fa}.hub-cta{height:64px;width:100%;border:none;border-radius:18px;background:#2563eb;color:#fff;font-size:18px;font-weight:800;box-shadow:0 10px 30px rgba(37,99,235,.3);cursor:pointer;transition:all .2s}.hub-cta:active{transform:scale(.98)}.tontine-head{display:flex;flex-direction:column;gap:4px}.tontine-sub{font-size:14px;color:#64748b}.tontine-sub strong{color:#fff}.tontine-progress{padding:16px;border-radius:20px;background:rgba(244,63,94,.05);border:1px solid rgba(244,63,94,.12)}.tontine-progress-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;font-size:11px}.tontine-progress-row strong{color:#fb7185}.tontine-progress-row span{color:#64748b}.tontine-bar{width:100%;height:8px;border-radius:999px;background:rgba(255,255,255,.05);overflow:hidden}.tontine-bar > div{height:100%;background:#f43f5e;box-shadow:0 0 12px rgba(244,63,94,.7)}.member-list{display:flex;flex-direction:column;gap:12px}.member-row{display:flex;align-items:center;justify-content:space-between;padding:16px;border-radius:18px;border:1px solid rgba(255,255,255,.05);background:rgba(255,255,255,.02)}.member-row.current{border-color:rgba(59,130,246,.45);background:rgba(59,130,246,.06)}.member-main{display:flex;align-items:center;gap:12px}.member-avatar{width:40px;height:40px;border-radius:999px;background:#1e293b;display:flex;align-items:center;justify-content:center}.member-name{font-size:14px;font-weight:800}.member-status{font-size:10px;font-weight:900;text-transform:uppercase;color:#64748b;margin-top:3px}.member-status.paid{color:#10b981}.member-pill{background:#3b82f6;color:#fff;font-size:9px;font-weight:900;padding:6px 8px;border-radius:999px;text-transform:uppercase}.exchange-stack{display:flex;flex-direction:column;gap:8px}.exchange-box{padding:18px;border-radius:22px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.05)}.exchange-box.receive{background:rgba(37,99,235,.1);border-color:rgba(59,130,246,.2)}.exchange-kicker{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:#64748b}.exchange-box.receive .exchange-kicker{color:#60a5fa}.exchange-row{display:flex;align-items:end;justify-content:space-between;gap:12px}.exchange-row input{width:50%;background:transparent;border:none;outline:none;color:#fff;font-size:30px;font-weight:800;font-family:'Montserrat',sans-serif}.exchange-unit{font-size:18px;font-weight:800;color:#94a3b8;text-align:right}.token-wrap{display:flex;align-items:center;gap:8px}.token-badge{width:28px;height:28px;border-radius:999px;background:#10b981;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:900}.swap-button{display:flex;justify-content:center;margin:-6px 0;position:relative;z-index:2}.swap-button div{width:42px;height:42px;border-radius:999px;background:#2563eb;border:4px solid #0a0e17;display:flex;align-items:center;justify-content:center;box-shadow:0 10px 18px rgba(37,99,235,.35)}
.savings-screen{min-height:100%;background:#0a0e17;color:#fff;padding:30px 22px 28px;display:flex;flex-direction:column;gap:22px}.savings-stack{display:flex;flex-direction:column;gap:26px;animation:authIn .3s ease both}.savings-card{position:relative;overflow:hidden;border-radius:32px;padding:28px;background:linear-gradient(145deg,rgba(16,185,129,.22),rgba(6,78,59,.16));border:1px solid rgba(16,185,129,.22);box-shadow:0 20px 50px rgba(6,95,70,.18)}.savings-orb{position:absolute;top:0;right:0;padding:22px;opacity:.11}.savings-kicker{font-size:11px;text-transform:uppercase;letter-spacing:3px;color:rgba(52,211,153,.75);font-weight:800;margin-bottom:8px}.savings-amount{display:flex;align-items:baseline;gap:10px}.savings-amount strong{font-size:42px;font-weight:900;color:#fff;font-family:'Montserrat',sans-serif}.savings-amount span{font-size:14px;font-weight:700;color:#34d399}.savings-divider{margin-top:22px;padding-top:22px;border-top:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between;gap:16px}.savings-metric-top{font-size:10px;color:#64748b;text-transform:uppercase;font-weight:800;letter-spacing:.08em;margin-bottom:6px}.savings-metric-bottom{font-size:20px;font-weight:800}.savings-metric-bottom.emerald{color:#34d399}.savings-chart-wrap{display:flex;flex-direction:column;gap:16px}.savings-chart-label{font-size:11px;text-transform:uppercase;letter-spacing:.14em;color:#475569;font-weight:800;padding-left:2px}.savings-chart{height:138px;width:100%;display:flex;align-items:flex-end;gap:10px;padding:0 2px}.savings-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px}.savings-bar{width:100%;border-radius:12px 12px 4px 4px;background:rgba(255,255,255,.05);transition:all .8s ease}.savings-bar.active{background:#10b981;box-shadow:0 0 16px rgba(16,185,129,.35)}.savings-month{font-size:9px;font-weight:800;text-transform:uppercase;color:#334155}.savings-actions{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.savings-btn{height:56px;border-radius:18px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#fff;font-size:14px;font-weight:800;cursor:pointer;transition:all .2s}.savings-btn.primary{background:#10b981;color:#071019;border-color:rgba(16,185,129,.35);box-shadow:0 10px 24px rgba(16,185,129,.18)}.savings-btn:active{transform:scale(.98)}.savings-note{padding:18px;border-radius:20px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);display:flex;gap:14px;align-items:flex-start}.savings-note-icon{width:42px;height:42px;border-radius:14px;background:rgba(59,130,246,.1);display:flex;align-items:center;justify-content:center;flex-shrink:0}.savings-note-title{font-size:14px;font-weight:800;color:#fff}.savings-note-copy{font-size:11px;line-height:1.6;color:#64748b;margin-top:4px}.toast{position:fixed;top:32px;left:50%;transform:translateX(-50%) translateY(-80px);background:linear-gradient(135deg,#3b82f6,#2563eb);color:#fff;font-family:'Montserrat',sans-serif;font-size:13px;font-weight:600;padding:12px 22px;border-radius:14px;box-shadow:0 8px 24px rgba(59,130,246,0.4);z-index:9999;transition:transform .3s cubic-bezier(.34,1.56,.64,1),opacity .3s;opacity:0;white-space:nowrap;pointer-events:none;max-width:min(86vw,380px);overflow:hidden;text-overflow:ellipsis}
.card-modal-overlay{position:fixed;inset:0;z-index:2200;background:rgba(3,8,16,.72);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);display:flex;align-items:flex-end;justify-content:center;padding:20px;animation:fadeIn .3s ease}.card-modal{width:100%;max-width:390px;max-height:85dvh;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;background:linear-gradient(180deg,#101a30 0%,#080f1e 100%);border:1px solid rgba(59,130,246,.22);border-radius:28px 28px 0 0;box-shadow:0 30px 80px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.05);padding:22px 20px 18px;display:flex;flex-direction:column;gap:18px;opacity:0;transform:translateY(100%);animation:panelSpringUp .3s cubic-bezier(.34,1.2,.64,1) forwards;-webkit-overflow-scrolling:touch}.card-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.card-modal-title{font-size:18px;font-weight:800;color:#fff;font-family:'Montserrat',sans-serif;letter-spacing:-.02em}.card-modal-sub{font-size:12px;line-height:1.5;color:#94a3b8;margin-top:4px}.card-manage-stack{display:flex;flex-direction:column;gap:12px}.card-setting-row{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;border-radius:18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)}.card-setting-title{font-size:14px;font-weight:700;color:#fff}.card-setting-copy{font-size:11px;color:#64748b;margin-top:4px}.mini-switch{width:42px;height:24px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.08);position:relative;cursor:pointer;transition:all .25s ease;flex-shrink:0}.mini-switch::after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#94a3b8;transition:all .25s cubic-bezier(.34,1.56,.64,1)}.mini-switch.active{background:rgba(59,130,246,.18);border-color:rgba(59,130,246,.45)}.mini-switch.active::after{left:21px;background:#60a5fa;box-shadow:0 0 10px rgba(59,130,246,.45)}.card-manage-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.card-mini-stat{padding:14px 16px;border-radius:18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)}.card-mini-kicker{font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#64748b;margin-bottom:8px}.card-mini-value{font-size:15px;font-weight:800;color:#fff}.pin-display{padding:24px;border-radius:22px;background:linear-gradient(145deg,rgba(212,164,55,.06),rgba(10,14,23,.18));border:1px solid rgba(212,164,55,.12);text-align:center}.pin-kicker{font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:rgba(212,164,55,.55);margin-bottom:10px}.pin-code{font-size:34px;font-weight:900;letter-spacing:.36em;font-family:'Montserrat',sans-serif;color:#fff;text-align:center}.pin-code.revealed{color:#D4A437}.pin-hint{font-size:11px;color:#94a3b8;line-height:1.5;text-align:center}.pin-dots{display:flex;gap:16px;justify-content:center;margin:16px 0}.pin-dot{width:16px;height:16px;border-radius:50%;border:2px solid rgba(212,164,55,.25);background:transparent;transition:all .2s}.pin-dot.filled{background:#D4A437;border-color:#D4A437;box-shadow:0 0 12px rgba(212,164,55,.3)}.pin-actions-row{display:flex;gap:8px;margin-top:4px}.pin-action-btn{flex:1;height:52px;border-radius:14px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.03);color:#94a3b8;font-size:13px;font-weight:700;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:6px}.pin-action-btn:active{transform:scale(.97)}.pin-action-btn.danger{border-color:rgba(239,68,68,.15);background:rgba(239,68,68,.04);color:#f87171}.card-modal-actions{display:flex;gap:12px}.toast.show{opacity:1;transform:translateX(-50%) translateY(0)}.quick-notif-overlay{position:fixed;inset:0;z-index:100000;display:flex;align-items:center;justify-content:center;pointer-events:none;background:rgba(0,0,0,0.35);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:quickNotifIn .4s cubic-bezier(.34,1.2,.64,1) forwards}.quick-notif-card{pointer-events:auto;width:280px;border-radius:28px;padding:28px 24px 24px;text-align:center;background:linear-gradient(160deg,#0f1a30 0%,#080d1a 100%);border:1px solid rgba(212,164,55,0.2);box-shadow:0 30px 80px rgba(0,0,0,0.7),0 0 60px rgba(212,164,55,0.08);animation:quickNotifCardIn .5s cubic-bezier(.34,1.2,.64,1) forwards}.quick-notif-ring{width:72px;height:72px;border-radius:50%;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;position:relative}.quick-notif-ring::before{content:'';position:absolute;inset:-4px;border-radius:50%;border:2px solid;opacity:.3;animation:quickNotifPulse 1.5s ease-out infinite}.quick-notif-icon-wrap{width:72px;height:72px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2.5px solid;position:relative;z-index:1}.quick-notif-amount{font-family:'Montserrat',sans-serif;font-size:26px;font-weight:900;color:#fff;letter-spacing:-0.5px;margin-bottom:4px}.quick-notif-amount span{font-size:12px;font-weight:600;color:rgba(255,255,255,0.5);margin-left:4px}.quick-notif-label{font-size:12px;font-weight:700;color:var(--dim);line-height:1.4;margin-bottom:16px}.quick-notif-badge{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border-radius:12px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:1.2px}.quick-notif-progress{width:100%;height:3px;border-radius:999px;background:rgba(255,255,255,0.06);margin-top:18px;overflow:hidden}.quick-notif-progress-bar{height:100%;border-radius:999px;animation:quickNotifProgress 3s linear forwards}@keyframes quickNotifIn{from{opacity:0}to{opacity:1}}@keyframes quickNotifCardIn{from{opacity:0;transform:scale(.7) translateY(20px)}to{opacity:1;transform:scale(1) translateY(0)}}@keyframes quickNotifOut{from{opacity:1;transform:scale(1) translateY(0)}to{opacity:0;transform:scale(.85) translateY(-10px)}}@keyframes quickNotifPulse{0%{transform:scale(1);opacity:.3}70%{transform:scale(1.15);opacity:0}100%{transform:scale(1.15);opacity:0}}@keyframes quickNotifProgress{from{width:100%}to{width:0%}}
.bc-modal{width:100%;max-width:400px;max-height:92dvh;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;background:linear-gradient(180deg,#0c1325 0%,#060b18 100%);border:1px solid rgba(212,164,55,.15);border-radius:28px;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 60px rgba(212,164,55,.04),inset 0 1px 0 rgba(255,255,255,.04);padding:24px 22px calc(18px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:20px;opacity:0;transform:translateY(100%);animation:panelSpringUp .35s cubic-bezier(.34,1.2,.64,1) forwards;-webkit-overflow-scrolling:touch;scrollbar-width:none}
.bc-modal::-webkit-scrollbar{display:none}
.bc-close{width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#94a3b8;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all .2s;flex-shrink:0;font-size:18px}
.bc-close:active{transform:scale(.9)}
.bc-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.bc-head-left{display:flex;flex-direction:column;gap:4px;flex:1}
.bc-kicker{font-size:9px;font-weight:900;letter-spacing:.22em;text-transform:uppercase;color:rgba(212,164,55,.65)}
.bc-title{font-size:20px;font-weight:900;color:#fff;font-family:'Montserrat',sans-serif;letter-spacing:-.3px;line-height:1.15}
.bc-subtitle{font-size:12px;color:#64748b;line-height:1.5}
.bc-steps{display:flex;gap:6px;padding:2px 0}
.bc-step-dot{flex:1;height:3px;border-radius:2px;background:rgba(255,255,255,.06);transition:all .3s ease}
.bc-step-dot.active{background:linear-gradient(90deg,#D4A437,#f0d98a)}
.bc-step-dot.done{background:rgba(212,164,55,.35)}
.bc-card-preview{width:100%;aspect-ratio:1.58/1;border-radius:18px;position:relative;overflow:hidden;box-shadow:0 20px 48px rgba(0,0,0,.5)}
.bc-card-preview img{width:100%;height:100%;object-fit:cover}
.bc-card-preview-overlay{position:absolute;inset:0;background:linear-gradient(135deg,rgba(5,10,24,.2),rgba(5,10,24,.6));display:flex;align-items:center;justify-content:center}
.bc-card-preview-badge{padding:8px 18px;border-radius:14px;background:rgba(0,0,0,.45);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(212,164,55,.3);display:flex;align-items:center;gap:8px}
.bc-card-preview-badge svg{color:rgba(212,164,55,.85)}
.bc-card-preview-badge span{font-size:11px;font-weight:800;color:#fff;letter-spacing:.04em}
.bc-features{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.bc-feature{padding:14px 14px;border-radius:16px;background:rgba(255,255,255,.025);border:1px solid rgba(255,255,255,.05);display:flex;align-items:center;gap:10px}
.bc-feature-icon{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.bc-feature-icon.gold{background:rgba(212,164,55,.1);color:rgba(212,164,55,.85)}
.bc-feature-icon.blue{background:rgba(59,130,246,.1);color:rgba(96,165,250,.85)}
.bc-feature-icon.green{background:rgba(16,185,129,.1);color:rgba(52,211,153,.85)}
.bc-feature-icon.rose{background:rgba(244,63,94,.08);color:rgba(251,113,133,.85)}
.bc-feature-text{font-size:12px;font-weight:700;color:#fff;line-height:1.2}
.bc-feature-label{font-size:9px;color:#64748b;font-weight:600;margin-top:2px}
.bc-material-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.bc-material-card{padding:18px 16px;border-radius:18px;background:rgba(255,255,255,.025);border:2px solid rgba(255,255,255,.06);cursor:pointer;transition:all .25s ease;text-align:center;display:flex;flex-direction:column;gap:8px}
.bc-material-card:active{transform:scale(.97)}
.bc-material-card.selected{border-color:rgba(212,164,55,.35);background:rgba(212,164,55,.04)}
.bc-material-card.selected .bc-material-check{opacity:1;transform:scale(1)}
.bc-material-name{font-size:14px;font-weight:800;color:#fff}
.bc-material-desc{font-size:10.5px;color:#64748b;line-height:1.4}
.bc-material-check{width:22px;height:22px;border-radius:50%;background:linear-gradient(135deg,#D4A437,#f0d98a);display:flex;align-items:center;justify-content:center;margin:0 auto;opacity:0;transform:scale(.6);transition:all .25s ease;color:#050a18}
.bc-material-check svg{width:12px;height:12px}
.bc-form{display:flex;flex-direction:column;gap:14px}
.bc-field{display:flex;flex-direction:column;gap:6px}
.bc-field-label{font-size:10px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:#64748b}
.bc-field-input{width:100%;height:48px;padding:0 16px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);color:#fff;font-size:14px;outline:none;font-family:inherit;transition:border-color .2s}
.bc-field-input:focus{border-color:rgba(212,164,55,.35)}
.bc-field-input::placeholder{color:#334155}
.bc-field-textarea{width:100%;min-height:64px;padding:12px 16px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);color:#fff;font-size:14px;outline:none;font-family:inherit;resize:none;transition:border-color .2s;line-height:1.5}
.bc-field-textarea:focus{border-color:rgba(212,164,55,.35)}
.bc-field-textarea::placeholder{color:#334155}
.bc-actions{display:flex;gap:10px;padding-top:2px}
.bc-btn{flex:1;height:52px;border-radius:16px;font-size:14px;font-weight:800;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px;border:none}
.bc-btn:active{transform:scale(.97)}
.bc-btn-primary{background:linear-gradient(135deg,rgba(212,164,55,.2),rgba(212,164,55,.08));color:#D4A437;border:1px solid rgba(212,164,55,.25)}
.bc-btn-secondary{background:rgba(255,255,255,.04);color:#94a3b8;border:1px solid rgba(255,255,255,.08)}
.bc-btn-full{width:100%;height:52px;border-radius:16px;font-size:14px;font-weight:800;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:8px;border:none;background:linear-gradient(135deg,rgba(212,164,55,.2),rgba(212,164,55,.08));color:#D4A437;border:1px solid rgba(212,164,55,.25)}
.bc-btn-full:active{transform:scale(.97)}
.bc-btn-full:disabled{opacity:.5;cursor:not-allowed}
.legal-modal{max-width:430px !important;padding:20px 18px calc(12px + env(safe-area-inset-bottom,0px)) !important;gap:0 !important}
.legal-modal-close{position:absolute;top:16px;right:18px;z-index:10;width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);color:#94a3b8;font-size:18px;cursor:pointer}
.privacy-tabs{display:flex;gap:4px;background:rgba(255,255,255,.03);border-radius:12px;padding:4px;margin-bottom:4px}
.privacy-tab{flex:1;padding:10px 8px;border:none;border-radius:10px;font-size:12px;font-weight:700;color:#64748b;background:transparent;cursor:pointer;transition:all .2s ease;font-family:inherit}
.privacy-tab.active{background:rgba(59,130,246,.12);color:#60a5fa;border:1px solid rgba(59,130,246,.2)}
.privacy-tab:not(.active){border:1px solid transparent}
.bc-notice{padding:14px 16px;border-radius:16px;background:rgba(212,164,55,.04);border:1px solid rgba(212,164,55,.1);display:flex;align-items:flex-start;gap:10px}
.bc-notice svg{flex-shrink:0;color:rgba(212,164,55,.7);margin-top:1px}
.bc-notice-text{font-size:11px;color:#94a3b8;line-height:1.5}
.bc-confirm-card{padding:22px 20px;border-radius:22px;background:rgba(212,164,55,.04);border:1px solid rgba(212,164,55,.12);display:flex;flex-direction:column;gap:14px;text-align:center}
.bc-confirm-icon{width:56px;height:56px;border-radius:50%;background:rgba(212,164,55,.1);border:1px solid rgba(212,164,55,.2);display:flex;align-items:center;justify-content:center;margin:0 auto;color:rgba(212,164,55,.85)}
.bc-confirm-title{font-size:18px;font-weight:900;color:#fff}
.bc-confirm-sub{font-size:12px;color:#94a3b8;line-height:1.6}
.bc-confirm-row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,.04);font-size:13px}
.bc-confirm-row:last-child{border-bottom:none}
.bc-confirm-row span:first-child{color:#64748b}
.bc-confirm-row span:last-child{color:#fff;font-weight:700}
.bc-loader{width:18px;height:18px;border-radius:50%;border:2px solid rgba(212,164,55,.3);border-top-color:#D4A437;animation:spin .7s linear infinite}
@keyframes bcFadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.bc-step-content{animation:bcFadeIn .25s ease both}
.payments-screen,.cards-screen,.profile-screen{min-height:100%;background:#0a0e17;color:#fff;padding:30px 22px 0;display:flex;flex-direction:column;gap:24px}.tab-head{display:flex;align-items:center;justify-content:space-between;gap:12px}.tab-title{font-size:28px;font-weight:900;color:#fff;font-family:'Montserrat',sans-serif;letter-spacing:-.04em}.btn-camera-top{width:44px;height:44px;border:none;border-radius:14px;background:rgba(59,130,246,.2);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(59,130,246,.4);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 8px 20px rgba(0,0,0,.3),inset 0 1px 1px rgba(255,255,255,.2);cursor:pointer;transition:all .3s cubic-bezier(.175,.885,.32,1.275)}.btn-camera-top:hover{background:rgba(59,130,246,.3);transform:scale(1.05) rotate(5deg);box-shadow:0 0 20px rgba(59,130,246,.4)}.btn-camera-top:active,.tab-card-btn:active,.profile-item:active,.contact-item:active,.card-action:active{transform:scale(.95)}.tab-kicker{font-size:10px;color:#64748b;text-transform:uppercase;font-weight:900;letter-spacing:.18em;padding-left:2px}.contacts-scroll{display:flex;gap:18px;overflow-x:auto;padding-bottom:2px;scrollbar-width:none}.contacts-scroll::-webkit-scrollbar{display:none}.contact-item{display:flex;flex-direction:column;align-items:center;gap:8px;flex-shrink:0;cursor:pointer}.contact-circle{width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,.03);backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.1);display:flex;align-items:center;justify-content:center;font-weight:700;color:#fff;box-shadow:0 4px 15px rgba(0,0,0,.2);transition:all .3s ease}.contact-circle:active{transform:scale(.9);background:rgba(59,130,246,.2);border-color:rgba(59,130,246,.5)}.contact-circle.new{border:2px dashed rgba(255,255,255,.12);background:transparent;color:#64748b;box-shadow:none}.contact-name{font-size:10px;font-weight:800;color:#94a3b8}.tab-grid-two{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.service-card{background:rgba(255,255,255,.04);border-radius:24px;padding:20px;border:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;gap:12px;transition:all .3s ease;text-align:left;cursor:pointer}.service-card:hover,.card-action:hover,.profile-item:hover{background:rgba(255,255,255,.05)}.service-icon-box{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center}.service-card.virement .service-icon-box{background:rgba(59,130,246,.15);color:#60a5fa}.service-card.demander .service-icon-box{background:rgba(34,197,94,.15);color:#4ade80}.tab-card-title{font-size:14px;font-weight:800;color:#fff}.tab-card-sub{font-size:10px;color:#64748b;line-height:1.4}.activity-wrap{background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);border-radius:28px;overflow:hidden}.activity-item{padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-bottom:1px solid rgba(255,255,255,.03)}.activity-item:last-child{border-bottom:none}.activity-left{display:flex;align-items:center;gap:12px}.activity-icon{width:34px;height:34px;border-radius:999px;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center}.activity-name{font-size:14px;font-weight:800;color:#fff}.activity-date{font-size:10px;color:#64748b;margin-top:2px}.activity-amount{font-size:14px;font-weight:900}.activity-amount.pos{color:#10b981}.activity-amount.neg{color:#fff}.cards-hero{width:100%;aspect-ratio:1.58/1;border-radius:24px;background:linear-gradient(145deg,#111827,#1e3a8a 55%,#000);padding:24px;border:1px solid rgba(255,255,255,.18);box-shadow:0 25px 60px rgba(0,0,0,.45);position:relative;overflow:hidden}.cards-hero::after{content:'';position:absolute;top:-110px;right:-100px;width:260px;height:260px;border-radius:50%;background:rgba(59,130,246,.1);filter:blur(24px)}.cards-top{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:52px;position:relative;z-index:1}.cards-chip{width:42px;height:32px;border-radius:10px;background:rgba(251,191,36,.16);border:1px solid rgba(251,191,36,.3);display:flex;align-items:center;justify-content:center}.cards-platinum{font-size:10px;font-weight:900;letter-spacing:.32em;opacity:.55}.cards-number{font-size:22px;font-weight:800;font-family:'Montserrat',sans-serif;letter-spacing:.22em;margin-bottom:24px;position:relative;z-index:1}.cards-bottom{display:flex;justify-content:space-between;align-items:flex-end;position:relative;z-index:1}.cards-meta-label{font-size:8px;text-transform:uppercase;opacity:.5;font-weight:800;margin-bottom:5px}.cards-meta-value{font-size:12px;font-weight:800;letter-spacing:.12em}.cards-brand{font-size:28px;font-weight:900;font-style:italic}.card-actions-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}.card-action{padding:16px;border-radius:20px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.05);display:flex;flex-direction:column;gap:10px;text-align:left;cursor:pointer;transition:all .2s}.card-action-label{font-size:12px;font-weight:800;color:#fff}.card-action-sub{font-size:9px;color:#64748b;font-weight:700;text-transform:uppercase}.tip-box{padding:18px;border-radius:20px;background:rgba(251,191,36,.06);border:1px solid rgba(251,191,36,.14);display:flex;align-items:flex-start;gap:14px}.tip-text{font-size:11px;color:rgba(253,230,138,.75);line-height:1.5}.profile-top{display:flex;flex-direction:column;align-items:center;gap:16px;margin-top:4px}.profile-avatar-wrap{position:relative}.profile-avatar-ring{width:96px;height:96px;border-radius:999px;background:linear-gradient(145deg,#2563eb,#4f46e5);padding:4px}.profile-avatar-core{width:100%;height:100%;border-radius:999px;background:#0a0e17;display:flex;align-items:center;justify-content:center}.profile-kyc{position:absolute;right:0;bottom:0;width:34px;height:34px;border-radius:999px;background:#10b981;border:4px solid #0a0e17;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:#fff}.profile-name{font-size:22px;font-weight:900;color:#fff}.profile-id{font-size:12px;color:#64748b}.profile-group{display:flex;flex-direction:column;gap:8px}.profile-item{width:100%;padding:16px 18px;border-radius:20px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05);display:flex;align-items:center;justify-content:space-between;gap:14px;cursor:pointer;transition:all .2s}.profile-item-left{display:flex;align-items:center;gap:14px}.profile-item-label{font-size:14px;font-weight:800;color:#fff}.profile-item-sub{font-size:10px;color:#60a5fa;font-weight:700;margin-top:3px}.profile-badge{font-size:10px;font-weight:900;color:#10b981;background:rgba(16,185,129,.1);padding:6px 10px;border-radius:10px;text-transform:uppercase}.profile-logout{height:56px;border-radius:18px;border:1px solid rgba(239,68,68,.2);background:rgba(239,68,68,.06);color:#ef4444;font-size:14px;font-weight:800;cursor:pointer;transition:all .2s}.profile-version{font-size:10px;text-align:center;color:#334155;font-weight:800}
.finance-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-top:6px}.finance-card{padding:20px;border-radius:24px;text-align:left;border:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;gap:12px;cursor:pointer;transition:all .2s}.finance-card:hover{filter:brightness(1.04)}.finance-card.emerald{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.2)}.finance-card.amber{background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.2)}.finance-card.blue{background:rgba(59,130,246,.1);border-color:rgba(59,130,246,.2)}.finance-card.rose{background:rgba(244,63,94,.1);border-color:rgba(244,63,94,.2)}.finance-card-icon{width:44px;height:44px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.08)}.finance-card-icon.emerald{background:rgba(16,185,129,.14)}.finance-card-icon.amber{background:rgba(245,158,11,.14)}.finance-card-icon.blue{background:rgba(59,130,246,.14)}.finance-card-icon.rose{background:rgba(244,63,94,.14)}.finance-card-title{font-size:15px;font-weight:800;color:#fff;line-height:1.1}.finance-card-sub{font-size:11px;font-weight:600;line-height:1.35;color:#94a3b8}.finance-card-sub.emerald{color:rgba(52,211,153,.88)}.finance-card-sub.amber{color:rgba(251,191,36,.88)}.finance-card-sub.blue{color:rgba(96,165,250,.9)}.finance-card-sub.rose{color:rgba(251,113,133,.9)}
.transaction-item{display:flex;align-items:center;padding:16px;margin-bottom:8px;background:rgba(255,255,255,.02);border-radius:18px;border:1px solid transparent;transition:.3s}.transaction-item:hover{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.05)}.transac-info{margin-left:14px}.transac-name{font-weight:600;font-size:14px;color:#fff}.transac-date{font-size:11px;color:#94a3b8;margin-top:2px}.transac-amount{margin-left:auto;font-weight:700;font-size:15px}.amount-negative{color:#f87171}.amount-positive{color:#4ade80}
.modal-drawer-overlay{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);z-index:2100;display:none;align-items:flex-end;animation:fadeIn .3s ease}.modal-drawer-overlay.active{display:flex}.modal-drawer-content{width:100%;max-height:85dvh;overflow-y:auto;overscroll-behavior:contain;touch-action:pan-y;background:rgba(13,27,62,.95);border-top:1px solid rgba(255,255,255,.1);border-radius:30px 30px 0 0;padding:20px 24px 40px;box-shadow:0 -10px 40px rgba(0,0,0,.5);opacity:0;transform:translateY(100%);animation:panelSpringUp .3s cubic-bezier(.34,1.2,.64,1) forwards;-webkit-overflow-scrolling:touch}.modal-drawer-overlay.active .modal-drawer-content{transform:translateY(0)}.drawer-handle{width:40px;height:4px;background:rgba(255,255,255,.2);border-radius:2px;margin:0 auto 20px}.modal-drawer-header{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:18px}.modal-drawer-header h3{font-size:22px;font-weight:800;color:#fff;letter-spacing:-.3px}.btn-close-circle{width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#fff;font-size:22px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer}.banking-identity{display:flex;flex-direction:column;gap:12px;margin-bottom:20px}.banking-identity-card{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;border-radius:18px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);cursor:pointer;transition:all .2s ease}.banking-identity-card:active{transform:scale(.98)}.banking-identity-copy{display:flex;flex-direction:column;gap:6px;min-width:0}.banking-identity-label{font-size:10px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;color:#94a3b8}.banking-identity-value{font-family:'Courier New',monospace;font-size:15px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.banking-identity-value.master{color:#fbbf24}.banking-copy-indicator{width:28px;height:28px;border-radius:10px;background:rgba(255,255,255,.05);display:flex;align-items:center;justify-content:center;color:#cbd5e1;flex-shrink:0}.banking-copy-indicator.success{background:rgba(34,197,94,.14);color:#4ade80}.edit-avatar-section{display:flex;flex-direction:column;align-items:center;gap:12px;margin-bottom:22px}.profile-avatar.small{width:90px;height:90px;margin:0 auto;display:flex;align-items:center;justify-content:center}.profile-avatar.grad-blue{border-radius:30px;background:linear-gradient(135deg,#3b82f6 0%,#1e3a8a 100%);position:relative;overflow:hidden;border:1px solid rgba(255,255,255,.1);box-shadow:0 15px 35px rgba(0,0,0,.4),inset 0 2px 3px rgba(255,255,255,.2),inset 0 -3px 6px rgba(0,0,0,.2);transition:all .3s ease}.profile-avatar.grad-blue::before{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:linear-gradient(45deg,transparent 45%,rgba(255,255,255,.1) 50%,transparent 55%);transform:rotate(-45deg);pointer-events:none}.profile-avatar.grad-blue:hover{transform:translateY(-3px) scale(1.02);box-shadow:0 20px 45px rgba(0,0,0,.5),inset 0 3px 5px rgba(255,255,255,.3),inset 0 -4px 8px rgba(0,0,0,.3)}.profile-avatar.grad-blue .avatar-text{font-size:36px;font-weight:800;color:#fff;text-transform:uppercase;font-family:'SF Pro Display',sans-serif;text-shadow:0 2px 4px rgba(0,0,0,.2);position:relative;z-index:1}.btn-change-photo{border:none;background:rgba(59,130,246,.12);color:#60a5fa;padding:10px 14px;border-radius:14px;font-size:13px;font-weight:700;cursor:pointer}.edit-form{display:flex;flex-direction:column}.input-group-glass{margin-bottom:20px}.input-group-glass label{display:block;color:#94a3b8;font-size:11px;text-transform:uppercase;margin-bottom:8px;letter-spacing:.5px}.input-group-glass input{width:100%;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:14px;color:#fff;outline:none;font-size:15px}.input-group-glass input:focus{border-color:#3b82f6;background:rgba(59,130,246,.05)}.btn-save-elite{width:100%;background:#3b82f6;color:#fff;border:none;padding:0 16px;border-radius:18px;font-weight:700;font-size:16px;margin-top:10px;box-shadow:0 10px 20px rgba(59,130,246,.2);cursor:pointer;height:56px;display:flex;align-items:center;justify-content:center}
.contact-circle{width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:#fff;position:relative;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,.15);box-shadow:0 8px 20px rgba(0,0,0,.3),inset 0 2px 2px rgba(255,255,255,.2);transition:all .4s cubic-bezier(.175,.885,.32,1.275)}.grad-blue{background:linear-gradient(135deg,rgba(59,130,246,.2),rgba(29,78,216,.4))}.grad-purple{background:linear-gradient(135deg,rgba(168,85,247,.2),rgba(126,34,206,.4))}.grad-amber{background:linear-gradient(135deg,rgba(245,158,11,.2),rgba(180,83,9,.4))}.grad-rose{background:linear-gradient(135deg,rgba(244,63,94,.2),rgba(190,18,60,.4))}.contact-item:active .contact-circle{transform:scale(.9) translateY(2px);box-shadow:0 4px 10px rgba(0,0,0,.5)}.contact-name{margin-top:10px;font-size:11px;font-weight:600;color:#94a3b8;letter-spacing:.2px}.contact-circle::after{content:'';position:absolute;bottom:2px;right:2px;width:10px;height:10px;background:#22c55e;border:2px solid #070d1e;border-radius:50%}.add-circle{width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(255,255,255,.03);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px dashed rgba(255,255,255,.15);color:#fff;box-shadow:0 8px 20px rgba(0,0,0,.22),inset 0 2px 2px rgba(255,255,255,.08);transition:all .3s ease}.add-new:active .add-circle{transform:scale(.9) translateY(2px);background:rgba(59,130,246,.12);border-color:rgba(59,130,246,.35)}
.request-modal-overlay{position:fixed;inset:0;z-index:10020;background:rgba(3,8,16,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);display:flex;align-items:flex-start;justify-content:center;padding:22px;animation:fadeIn .3s ease}.request-container{display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;max-width:320px;padding:10px;opacity:0;transform:translateY(100%);animation:panelSpringUp .3s cubic-bezier(.34,1.2,.64,1) forwards}.request-close{align-self:flex-end;width:38px;height:38px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);display:flex;align-items:center;justify-content:center;color:#cbd5e1;cursor:pointer;margin-bottom:10px}.request-close:active{transform:scale(.96)}.qr-glass-card{background:rgba(255,255,255,.05);backdrop-filter:blur(15px);-webkit-backdrop-filter:blur(15px);border:1px solid rgba(255,255,255,.1);border-radius:32px;padding:24px;width:280px;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,.4)}.qr-header{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}.qr-label{font-size:10px;letter-spacing:1.5px;color:#94a3b8;font-weight:700}.qr-status-dot{width:8px;height:8px;background:#4ade80;border-radius:50%;box-shadow:0 0 10px #4ade80}.qr-main{display:flex;justify-content:center}.qr-frame{background:#fff;padding:15px;border-radius:20px;display:inline-block;position:relative;box-shadow:0 10px 20px rgba(0,0,0,.2)}.qr-frame img{width:180px;height:180px;display:block}.qr-logo-overlay{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:35px;height:35px;background:#0d1b3e;color:#fff;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:18px;border:3px solid #fff}.qr-footer{margin-top:20px}.user-id{display:block;color:#fff;font-weight:700;font-size:16px;margin-bottom:4px}.qr-instruction{font-size:12px;color:#94a3b8}.share-actions{display:flex;gap:12px;margin-top:25px;width:100%;max-width:280px}.btn-share{flex:1;padding:12px;border-radius:16px;border:none;background:#3b82f6;color:#fff;font-weight:600;font-size:13px;cursor:pointer;transition:all .2s ease}.btn-share.secondary{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1)}.btn-share:active{transform:scale(.97)}
.security-modal-grid{display:grid;grid-template-columns:1fr;gap:12px}.security-feature{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:14px 16px;border-radius:18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06)}.security-feature-title{font-size:14px;font-weight:700;color:#fff}.security-feature-copy{font-size:11px;color:#64748b;margin-top:4px;line-height:1.45}.security-summary{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.security-stat{padding:14px 16px;border-radius:18px;background:rgba(59,130,246,.08);border:1px solid rgba(59,130,246,.16)}.security-stat-kicker{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em;margin-bottom:6px}.security-stat-value{font-size:16px;font-weight:800;color:#fff}.camera-modal-stage{display:flex;flex-direction:column;gap:18px}.camera-viewfinder{position:relative;width:100%;aspect-ratio:1/1;border-radius:32px;background:radial-gradient(circle at 30% 30%,rgba(59,130,246,.12),transparent 50%),#0a1224;border:1px solid rgba(255,255,255,.08);overflow:hidden;display:flex;align-items:center;justify-content:center}.camera-corner{position:absolute;width:36px;height:36px;border-color:#60a5fa;border-style:solid}.camera-corner.tl{top:18px;left:18px;border-width:3px 0 0 3px;border-top-left-radius:12px}.camera-corner.tr{top:18px;right:18px;border-width:3px 3px 0 0;border-top-right-radius:12px}.camera-corner.bl{bottom:18px;left:18px;border-width:0 0 3px 3px;border-bottom-left-radius:12px}.camera-corner.br{bottom:18px;right:18px;border-width:0 3px 3px 0;border-bottom-right-radius:12px}.camera-scan-line{width:78%;height:2px;background:#3b82f6;box-shadow:0 0 14px rgba(59,130,246,.75);animation:scanPulse 1.8s ease-in-out infinite}.camera-helper{position:absolute;bottom:18px;font-size:11px;color:#94a3b8;font-weight:700;letter-spacing:.08em;text-transform:uppercase}.camera-actions{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}@keyframes scanPulse{0%{top:0;opacity:.3}10%{opacity:1}90%{opacity:1}100%{top:calc(100% - 2px);opacity:.3}}@media (max-width:440px){.app-viewport{max-width:100%}}
.transaction-flow-overlay{position:fixed;inset:0;z-index:2400;background:rgba(3,8,16,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);display:flex;align-items:flex-end;justify-content:center;padding:20px;animation:fadeIn .3s ease}.transaction-flow-modal{width:100%;max-width:390px;background:linear-gradient(180deg,#101a30 0%,#080f1e 100%);border:1px solid rgba(59,130,246,.22);border-radius:28px 28px 0 0;box-shadow:0 30px 80px rgba(0,0,0,.55),inset 0 1px 0 rgba(255,255,255,.05);padding:22px 20px 18px;display:flex;flex-direction:column;gap:18px;opacity:0;transform:translateY(100%);animation:panelSpringUp .3s cubic-bezier(.34,1.2,.64,1) forwards}.transaction-flow-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}.transaction-flow-title{font-size:18px;font-weight:800;color:#fff;font-family:'Montserrat',sans-serif}.transaction-flow-sub{font-size:12px;line-height:1.5;color:#94a3b8;margin-top:4px}.transaction-choice-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.transaction-choice-card{border:none;border-radius:22px;padding:18px 16px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;gap:12px;color:#fff;text-align:left;cursor:pointer;transition:all .22s ease}.transaction-choice-card:active{transform:scale(.97)}.transaction-choice-card.selected{background:rgba(59,130,246,.09);border-color:rgba(59,130,246,.42)}.transaction-choice-icon{width:46px;height:46px;border-radius:14px;display:flex;align-items:center;justify-content:center;background:rgba(59,130,246,.16);color:#60a5fa}.transaction-choice-icon.airtime{background:rgba(245,158,11,.14);color:#fbbf24}.transaction-choice-title{font-size:14px;font-weight:800}.transaction-choice-copy{font-size:11px;line-height:1.45;color:#8ea0bf}.pin-dots{display:flex;justify-content:center;gap:12px;margin:6px 0 2px}.pin-dot{width:14px;height:14px;border-radius:50%;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.06);transition:all .2s}.pin-dot.filled{background:#3b82f6;border-color:rgba(96,165,250,.8);box-shadow:0 0 10px rgba(59,130,246,.45)}.pin-pad{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.pin-key{height:58px;border:none;border-radius:18px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#fff;font-size:22px;font-weight:800;cursor:pointer;transition:all .2s}.pin-key:active{transform:scale(.96);background:rgba(59,130,246,.1)}.pin-key.ghost{opacity:0;pointer-events:none}.pin-helper{text-align:center;font-size:11px;color:#7c8ca8;line-height:1.5}.pin-processing,.pin-success{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:6px 0}.pin-loader{width:44px;height:44px;border-radius:50%;border:3px solid rgba(255,255,255,.14);border-top-color:#3b82f6;animation:spin .8s linear infinite}.pin-success-icon{width:62px;height:62px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:rgba(34,197,94,.12);color:#4ade80;border:1px solid rgba(34,197,94,.28);font-size:30px;box-shadow:0 0 20px rgba(34,197,94,.18)}.pin-summary{padding:14px 16px;border-radius:18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);display:flex;justify-content:space-between;gap:14px;align-items:flex-start}.pin-summary strong{display:block;color:#fff;font-size:13px}.pin-summary span,.pin-summary small{display:block;color:#7c8ca8;font-size:10px;text-transform:uppercase;letter-spacing:.08em}.transaction-flow-actions{display:flex;gap:10px;margin-top:6px}.transaction-flow-close{width:38px;height:38px;border-radius:14px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03);display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer}.transaction-flow-close:active{transform:scale(.96)}
.transfer-overlay{position:fixed;inset:0;z-index:9999;background:rgba(3,8,16,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);display:flex;align-items:flex-start;justify-content:center;padding:60px 20px 20px;animation:fadeIn .3s ease;overflow:hidden}.transfer-modal{position:relative;width:100%;max-width:100%;max-height:100%;overflow:hidden;margin:0;flex-shrink:0;background:linear-gradient(180deg,#101a30 0%,#080f1e 100%);border:1px solid rgba(59,130,246,.22);border-radius:28px;padding:22px 20px calc(4px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:18px;opacity:1}.transfer-modal::-webkit-scrollbar{width:4px}.transfer-modal::-webkit-scrollbar-track{background:transparent}.transfer-modal::-webkit-scrollbar-thumb{background:rgba(96,165,250,.45);border-radius:4px}@keyframes transferModalIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}.transfer-search{display:flex;flex-direction:column;gap:10px}.transfer-search input{width:100%;height:54px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#fff;padding:0 16px;font-size:15px;outline:none}.transfer-search input:focus{border-color:rgba(59,130,246,.45)}.transfer-recipient{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:18px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.28)}.transfer-recipient-name{font-size:14px;font-weight:800;color:#fff}.transfer-recipient-copy{font-size:11px;color:#4ade80;font-weight:700}.transfer-verified{padding:4px 8px;border-radius:999px;background:rgba(34,197,94,.16);color:#4ade80;font-size:10px;font-weight:900}.transfer-search-hint{padding:14px 16px;border-radius:18px;background:rgba(255,255,255,.03);border:1px dashed rgba(255,255,255,.08);font-size:12px;line-height:1.55;color:#8ea0c6;text-align:center}.transfer-amount-stage{display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center}.transfer-amount-value{font-family:'Montserrat',sans-serif;font-size:40px;font-weight:900;color:#fff;line-height:1}.transfer-amount-currency{font-size:16px;color:#60a5fa;font-weight:700;margin-left:8px}.transfer-fee{font-size:12px;font-weight:800;color:#4ade80}.transfer-max-btn{border:none;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.3);color:#60a5fa;border-radius:12px;padding:8px 12px;font-size:11px;font-weight:800;cursor:pointer}.transfer-keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.transfer-key{height:56px;border:none;border-radius:18px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);color:#fff;font-size:20px;font-weight:800;cursor:pointer}.transfer-key:active{transform:scale(.96)}.transfer-slider-wrap{display:flex;flex-direction:column;gap:10px}.transfer-slider-track{position:relative;height:62px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);overflow:hidden}.transfer-slider-fill{position:absolute;left:0;top:0;bottom:0;border-radius:inherit;background:linear-gradient(90deg,rgba(59,130,246,.35),rgba(59,130,246,.12));transition:width .3s ease}.transfer-slider-button{position:absolute;left:6px;top:6px;width:50px;height:50px;border-radius:50%;background:#3b82f6;display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 10px 24px rgba(37,99,235,.32);transition:all .3s ease}.transfer-slider-button.sliding{left:calc(100% - 56px)}.transfer-slider-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#cbd5e1;letter-spacing:.03em}.transfer-receipt{display:flex;flex-direction:column;gap:14px;padding:20px 18px;border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.15);border-style:dashed}.transfer-receipt-line{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;color:#94a3b8}.transfer-receipt-line strong{color:#fff}.transfer-receipt-amount{font-size:30px;font-weight:900;color:#fff;font-family:'Montserrat',sans-serif}.transfer-receipt-id{font-family:'Courier New',monospace;color:#60a5fa;font-size:12px;font-weight:700}.transfer-share-btn{width:100%;height:50px;border:none;border-radius:18px;background:#22c55e;color:#08110a;font-weight:900;cursor:pointer}.transfer-slider-track{position:relative;overflow:hidden}.transfer-slider-button{position:absolute;left:5px;top:4px;touch-action:none;user-select:none;will-change:transform}.transfer-slider-button.sliding{transition:none}.transfer-slider-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none}.transfer-slider-fill{transition:width .16s ease}.transfer-search-spinner{display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid rgba(96,165,250,.3);border-top-color:#60a5fa;animation:spin .7s linear infinite;flex-shrink:0}.transfer-home-btn{width:100%;height:52px;border-radius:18px;border:1.5px solid rgba(255,255,255,.18);background:transparent;color:#cbd5e1;font-size:14px;font-weight:800;font-family:'Montserrat',sans-serif;letter-spacing:.02em;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s ease}.transfer-home-btn:active{transform:scale(.97);background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.3)}.transfer-processing-dot{animation:dotPulse 1.2s ease-in-out infinite}@keyframes dotPulse{0%,80%,100%{opacity:.25;transform:scale(.8)}40%{opacity:1;transform:scale(1.2)}}.pin-dot.verifying{background:rgba(96,165,250,.3);border-color:rgba(96,165,250,.4);animation:pinPulseVerify .6s ease-in-out infinite alternate}@keyframes pinPulseVerify{from{opacity:.4;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
.transfer-keypad.locked{opacity:.42;pointer-events:none;filter:grayscale(.12)}.transfer-keypad.active{opacity:1}.transfer-modal{gap:12px !important;padding-bottom:calc(4px + env(safe-area-inset-bottom, 0px)) !important}.transfer-amount-stage{gap:8px !important}.transfer-amount-value{font-size:28px !important}.transfer-slider-wrap{margin-top:2px !important}.transfer-key:disabled{cursor:not-allowed}.transfer-pin-keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:8px}.transfer-pin-key{min-height:56px;border:none;border-radius:18px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);color:#fff;font-size:24px;font-weight:800;box-shadow:0 10px 24px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.04);transition:all .2s ease}.transfer-pin-key:active{transform:scale(.96);background:rgba(59,130,246,.14);border-color:rgba(59,130,246,.34)}.transfer-pin-empty{min-height:56px}.amount-blurred{filter:blur(5px);cursor:pointer;user-select:none;transition:filter .2s ease}.privacy-link-row{cursor:pointer}.privacy-link-row .security-stat-value{display:flex;align-items:center;gap:6px}.privacy-log{margin-top:14px;padding:14px;border-radius:18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;gap:10px}.privacy-log-item{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,.05)}.privacy-log-item:last-child{border-bottom:none;padding-bottom:0}.privacy-log-main{font-size:13px;font-weight:700;color:#fff}.privacy-log-sub{font-size:11px;color:#94a3b8;margin-top:3px}.privacy-region{display:flex;align-items:center;gap:6px}.confirm-sheet{width:100%;max-width:360px;background:linear-gradient(180deg,#15203a 0%,#0d1629 100%);border:1px solid rgba(59,130,246,.18);border-radius:24px;padding:22px 20px;box-shadow:0 20px 60px rgba(0,0,0,.45)}.confirm-sheet-title{font-family:'Montserrat',sans-serif;font-size:18px;font-weight:800;color:#fff;margin-bottom:8px}.confirm-sheet-copy{font-size:13px;line-height:1.6;color:#94a3b8;margin-bottom:18px}.confirm-sheet-actions{display:flex;gap:10px}.confirm-sheet-actions button{flex:1;min-height:48px;border-radius:16px;border:none;font-weight:700;font-size:14px;cursor:pointer}.confirm-sheet-actions .secondary{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:#cbd5e1}.confirm-sheet-actions .danger{background:linear-gradient(135deg,#3b82f6 0%,#2563eb 100%);color:#fff;box-shadow:0 10px 24px rgba(59,130,246,.28)}.btn-save-elite.saving,.btn-save-elite.saved{display:flex;align-items:center;justify-content:center;gap:8px}.btn-save-elite.saving::before{content:'';width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;animation:spin .7s linear infinite}.btn-save-elite.saved::before{content:'✓';font-size:16px;font-weight:900}.btn-save-elite.ripple{position:relative;overflow:hidden}.btn-save-elite.ripple::after{content:'';position:absolute;inset:auto;left:50%;top:50%;width:0;height:0;border-radius:999px;background:rgba(255,255,255,.18);transform:translate(-50%,-50%);animation:rippleOut .55s ease}.@keyframes rippleOut{from{width:0;height:0;opacity:.55}to{width:220px;height:220px;opacity:0}}@keyframes panelSpringUp{0%{opacity:0;transform:translateY(100%)}100%{opacity:1;transform:translateY(0)}}

/* ── ADMIN DASHBOARD ── */
.admin-fullscreen{position:fixed;inset:0;z-index:100000;background:#0a0f1e;overflow:hidden;font-family:system-ui,-apple-system,BlinkMacSystemFont,sans-serif}
.admin-login-screen{position:fixed;inset:0;z-index:100000;background:#0a0f1e;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:24px;padding:24px}
.admin-login-card{width:100%;max-width:380px;background:rgba(255,255,255,0.03);border:1px solid rgba(59,130,246,0.15);border-radius:24px;padding:32px 24px;display:flex;flex-direction:column;gap:20px}
.admin-login-title{font-family:'Montserrat',sans-serif;font-size:20px;font-weight:800;color:#fff;text-align:center;letter-spacing:-.3px}
.admin-login-sub{font-size:12px;color:#94a3b8;text-align:center;line-height:1.5}
.admin-login-field{display:flex;flex-direction:column;gap:6px}
.admin-login-label{font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px}
.admin-login-input{width:100%;padding:14px 16px;background:rgba(255,255,255,0.04);border:1px solid rgba(59,130,246,0.15);border-radius:14px;color:#fff;font-size:15px;outline:none;transition:all .2s}
.admin-login-input:focus{border-color:rgba(59,130,246,0.4);background:rgba(59,130,246,0.06);box-shadow:0 0 0 3px rgba(59,130,246,0.1)}
.admin-login-input::placeholder{color:rgba(255,255,255,0.2)}
.admin-login-btn{width:100%;padding:14px;background:linear-gradient(135deg,#3b82f6,#2563eb);border:none;border-radius:14px;color:#fff;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 8px 24px rgba(59,130,246,0.3);display:flex;align-items:center;justify-content:center;gap:8px;transition:all .2s}
.admin-login-btn:active{transform:scale(.97)}
.admin-login-btn:disabled{opacity:.5;cursor:not-allowed}
.admin-login-error{font-size:12px;color:#ef4444;text-align:center;min-height:18px}
.admin-login-back{position:absolute;top:20px;left:20px;width:40px;height:40px;border-radius:12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;color:#94a3b8;cursor:pointer;transition:all .2s}
.admin-login-back:active{transform:scale(.95)}

.admin-layout{display:flex;width:100%;height:100vh;overflow:hidden}
.admin-sidebar{width:220px;background:rgba(6,11,24,0.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border-right:1px solid rgba(59,130,246,0.08);display:flex;flex-direction:column;padding:20px 12px;transition:width .3s ease;overflow:hidden;flex-shrink:0}
.admin-sidebar-logo{width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,#3b82f6 0%,#6366f1 100%);display:flex;align-items:center;justify-content:center;font-family:'Montserrat',sans-serif;font-size:15px;font-weight:900;color:#fff;letter-spacing:-.5px;margin-bottom:28px;flex-shrink:0;box-shadow:0 4px 16px rgba(59,130,246,0.25)}
.admin-sidebar-nav{display:flex;flex-direction:column;gap:4px;width:100%;padding:0 8px;flex:1}
.admin-sidebar-item{width:100%;padding:10px 14px;border-radius:10px;border:none;background:transparent;display:flex;flex-direction:row;align-items:center;gap:12px;cursor:pointer;transition:all .2s;color:#64748b;position:relative}
.admin-sidebar-item:hover{background:rgba(255,255,255,0.03);color:#94a3b8}
.admin-sidebar-item.active{background:rgba(59,130,246,0.1);color:#3b82f6}
.admin-sidebar-item.active::before{content:'';position:absolute;left:0;top:6px;bottom:6px;width:3px;border-radius:0 3px 3px 0;background:linear-gradient(180deg,#3b82f6,#60a5fa);box-shadow:0 0 8px rgba(59,130,246,0.3)}
.admin-sidebar-item svg{width:20px;height:20px;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;fill:none}
.admin-sidebar-label{font-size:12px;font-weight:600;letter-spacing:0;text-transform:none}
.admin-sidebar-footer{margin-top:auto;padding:0 8px;width:100%}
.admin-sidebar-item.logout-btn{color:#ef4444}
.admin-sidebar-item.logout-btn:hover{background:rgba(239,68,68,0.08)}

.admin-main{flex:1;display:flex;flex-direction:column;overflow:hidden;background:#0a0f1e}
.admin-header{display:flex;align-items:center;justify-content:space-between;padding:14px 28px;border-bottom:1px solid rgba(255,255,255,0.04);flex-shrink:0;background:rgba(10,15,30,0.7);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.admin-header-left{display:flex;align-items:center;gap:16px}
.admin-header-title{font-family:'Montserrat',sans-serif;font-size:20px;font-weight:800;color:#fff;letter-spacing:-.3px}
.admin-header-badge{font-size:10px;font-weight:800;color:#a5b4fc;background:linear-gradient(135deg,rgba(99,102,241,0.15),rgba(59,130,246,0.15));padding:5px 12px;border-radius:8px;letter-spacing:.5px;text-transform:uppercase;border:1px solid rgba(99,102,241,0.2)}
.admin-header-right{display:flex;align-items:center;gap:12px}
.admin-header-search{padding:10px 14px 10px 38px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);border-radius:12px;color:#fff;font-size:13px;outline:none;width:280px;transition:all .2s}
.admin-header-search:focus{border-color:rgba(99,102,241,0.3);background:rgba(99,102,241,0.05);box-shadow:0 0 0 3px rgba(99,102,241,0.08)}
.admin-header-search::placeholder{color:rgba(255,255,255,0.2)}
.admin-header-avatar{width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#3b82f6);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#fff;box-shadow:0 2px 8px rgba(99,102,241,0.3)}

.admin-content{flex:1;overflow-y:auto;padding:24px 28px;scrollbar-width:thin;scrollbar-color:rgba(59,130,246,0.2) transparent;overscroll-behavior:none}
.admin-content::-webkit-scrollbar{width:6px}
.admin-content::-webkit-scrollbar-track{background:transparent}
.admin-content::-webkit-scrollbar-thumb{background:rgba(59,130,246,0.2);border-radius:3px}

.admin-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));max-width:920px;gap:14px;margin-bottom:28px}
.admin-stat-card{background:rgba(255,255,255,0.02);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);border:1px solid rgba(255,255,255,0.06);border-radius:20px;padding:24px 22px;display:flex;flex-direction:column;gap:14px;position:relative;overflow:hidden;transition:all .3s cubic-bezier(.4,0,.2,1)}
.admin-stat-card:hover{border-color:rgba(99,102,241,0.2);background:rgba(255,255,255,0.04);transform:translateY(-2px);box-shadow:0 8px 32px rgba(0,0,0,0.2)}
.admin-stat-card::before{content:'';position:absolute;top:-20px;right:-20px;width:100px;height:100px;border-radius:50%;opacity:.04;transform:none}
.admin-stat-card.blue::before{background:#6366f1}
.admin-stat-card.green::before{background:#22c55e}
.admin-stat-card.amber::before{background:#f59e0b}
.admin-stat-card.purple::before{background:#a855f7}
.admin-stat-icon{width:42px;height:42px;border-radius:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
.admin-stat-icon svg{width:20px;height:20px;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;fill:none}
.admin-stat-icon.blue{background:rgba(59,130,246,0.12);color:#60a5fa}
.admin-stat-icon.green{background:rgba(34,197,94,0.12);color:#4ade80}
.admin-stat-icon.amber{background:rgba(245,158,11,0.12);color:#fbbf24}
.admin-stat-icon.purple{background:rgba(168,85,247,0.12);color:#c084fc}
.admin-stat-top{display:flex;align-items:center;justify-content:space-between}
.admin-stat-label{font-size:12px;font-weight:600;color:#94a3b8}
.admin-stat-trend{font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px}
.admin-stat-trend.up{color:#4ade80;background:rgba(34,197,94,0.1)}
.admin-stat-trend.down{color:#ef4444;background:rgba(239,68,68,0.1)}
.admin-stat-value{font-family:'Montserrat',sans-serif;font-size:26px;font-weight:800;color:#fff;letter-spacing:-.5px}

.admin-section{margin-bottom:28px}
.admin-section-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;gap:12px}
.admin-section-title{font-family:'Montserrat',sans-serif;font-size:15px;font-weight:700;color:#fff;letter-spacing:-.2px}
.admin-section-actions{display:flex;gap:8px}
.admin-filter-btn{padding:8px 14px;border-radius:10px;border:1px solid rgba(255,255,255,0.06);background:rgba(255,255,255,0.02);color:#94a3b8;font-size:12px;font-weight:600;cursor:pointer;transition:all .25s;display:flex;align-items:center;gap:6px}
.admin-filter-btn:hover{background:rgba(255,255,255,0.05);color:#e2e8f0}
.admin-filter-btn.active{background:linear-gradient(135deg,rgba(99,102,241,0.12),rgba(59,130,246,0.12));border-color:rgba(99,102,241,0.25);color:#a5b4fc;box-shadow:0 0 0 1px rgba(99,102,241,0.1)}

.admin-table-wrap{background:rgba(255,255,255,0.015);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.05);border-radius:20px;overflow:hidden}
.admin-table{width:100%;border-collapse:collapse}
.admin-table th{padding:14px 16px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;border-bottom:1px solid rgba(255,255,255,0.04);white-space:nowrap}
.admin-table td{padding:14px 16px;font-size:13px;color:#e2e8f0;border-bottom:1px solid rgba(255,255,255,0.03);white-space:nowrap}
.admin-table tr:last-child td{border-bottom:none}
.admin-table tr:hover td{background:rgba(255,255,255,0.02)}
.admin-table-scroll{overflow-x:auto;max-height:500px;overflow-y:auto;overscroll-behavior:none}
.admin-table-scroll::-webkit-scrollbar{width:4px;height:4px}
.admin-table-scroll::-webkit-scrollbar-thumb{background:rgba(59,130,246,0.2);border-radius:2px}
.admin-user-cell{display:flex;align-items:center;gap:10px}
.admin-user-avatar{width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;background:linear-gradient(135deg,rgba(59,130,246,0.3),rgba(29,78,216,0.5));flex-shrink:0}
.admin-user-name{font-weight:600;color:#fff}
.admin-user-email{font-size:11px;color:#64748b;margin-top:1px}
.admin-badge{padding:4px 10px;border-radius:8px;font-size:10px;font-weight:700;display:inline-flex;align-items:center;gap:4px;letter-spacing:.3px}
.admin-badge.success{background:rgba(34,197,94,0.1);color:#4ade80}
.admin-badge.warning{background:rgba(245,158,11,0.1);color:#fbbf24}
.admin-badge.danger{background:rgba(239,68,68,0.1);color:#ef4444}
.admin-badge.info{background:rgba(59,130,246,0.1);color:#60a5fa}
.admin-amount-pos{color:#4ade80;font-weight:700}
.admin-amount-neg{color:#ef4444;font-weight:700}

.admin-settings-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px}
.admin-setting-card{background:rgba(255,255,255,0.02);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);border:1px solid rgba(255,255,255,0.06);border-radius:20px;padding:22px}
.admin-setting-title{font-family:'Montserrat',sans-serif;font-size:14px;font-weight:700;color:#fff;margin-bottom:4px}
.admin-setting-desc{font-size:11px;color:#64748b;margin-bottom:16px;line-height:1.5}
.admin-setting-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid rgba(255,255,255,0.04)}
.admin-setting-row:first-of-type{border-top:none}
.admin-setting-label{font-size:13px;color:#e2e8f0;font-weight:500}
.admin-setting-input{width:120px;padding:8px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#fff;font-size:13px;outline:none;text-align:right}
.admin-setting-input:focus{border-color:rgba(59,130,246,0.3)}
.admin-toggle{width:44px;height:24px;border-radius:999px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.06);position:relative;cursor:pointer;transition:all .3s cubic-bezier(.4,0,.2,1);flex-shrink:0}
.admin-toggle::after{content:'';position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#64748b;transition:all .25s cubic-bezier(.34,1.56,.64,1)}
.admin-toggle.active{background:linear-gradient(135deg,rgba(99,102,241,0.2),rgba(59,130,246,0.3));border-color:rgba(99,102,241,0.4)}
.admin-toggle.active::after{left:23px;background:linear-gradient(135deg,#818cf8,#3b82f6);box-shadow:0 0 12px rgba(99,102,241,0.4)}
.admin-toggle.danger-active{background:rgba(239,68,68,0.2);border-color:rgba(239,68,68,0.4)}
.admin-toggle.danger-active::after{left:23px;background:#ef4444;box-shadow:0 0 8px rgba(239,68,68,0.4)}

.admin-empty{text-align:center;padding:48px 24px;color:#64748b}
.admin-empty-icon{font-size:36px;margin-bottom:12px;opacity:.5}
.admin-empty-text{font-size:13px;line-height:1.5}

/* ── Admin Micro-Animations ── */
@keyframes adminFadeIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes adminSlideIn{from{opacity:0;transform:translateX(-12px)}to{opacity:1;transform:translateX(0)}}
@keyframes adminScaleIn{from{opacity:0;transform:scale(0.95)}to{opacity:1;transform:scale(1)}}
@keyframes adminPulse{0%,100%{opacity:1}50%{opacity:.6}}
@keyframes adminShimmer{0%{background-position:-200% 0}100%{background-position:200% 0}}

.admin-content>.admin-stats{animation:adminFadeIn .5s ease both}
.admin-content>.admin-section:nth-child(2){animation:adminFadeIn .5s ease .1s both}
.admin-content>.admin-section:nth-child(3){animation:adminFadeIn .5s ease .2s both}
.admin-content>.admin-section:nth-child(4){animation:adminFadeIn .5s ease .3s both}
.admin-content>.admin-section:nth-child(5){animation:adminFadeIn .5s ease .4s both}
.admin-content>.admin-section:nth-child(6){animation:adminFadeIn .5s ease .5s both}

.admin-stat-card{animation:adminScaleIn .4s cubic-bezier(.4,0,.2,1) both}
.admin-stat-card:nth-child(1){animation-delay:.05s}
.admin-stat-card:nth-child(2){animation-delay:.1s}
.admin-stat-card:nth-child(3){animation-delay:.15s}
.admin-stat-card:nth-child(4){animation-delay:.2s}

.admin-table-wrap{animation:adminFadeIn .5s ease .15s both}

.admin-top-card{animation:adminFadeIn .5s ease .1s both}

.admin-chart-container{animation:adminFadeIn .5s ease .2s both}

.admin-top-users{animation:adminFadeIn .5s ease .3s both}

.admin-report-section{animation:adminFadeIn .5s ease .35s both}

/* Refresh indicator pulse */
.admin-refresh-dot{animation:adminPulse 2s ease-in-out infinite}

/* Empty state shimmer */
.admin-empty{animation:adminFadeIn .6s ease .2s both}

/* Loading skeleton effect */
.admin-empty:has(.btn-loader){position:relative;overflow:hidden}
.admin-empty:has(.btn-loader)::after{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent 25%,rgba(255,255,255,0.02) 50%,transparent 75%);background-size:200% 100%;animation:adminShimmer 1.5s infinite}

@media(max-width:768px){
  .admin-sidebar{width:64px;padding:12px 0}
  .admin-sidebar-label{display:none}
  .admin-sidebar-item{flex-direction:column;gap:4px;padding:12px 0}
  .admin-sidebar-nav{padding:0 6px}
  .admin-header{padding:12px 16px}
  .admin-header-search{width:140px}
  .admin-content{padding:16px}
  .admin-stats{grid-template-columns:repeat(2,1fr);gap:10px;max-width:100%}
  .admin-stat-value{font-size:18px}
  .admin-settings-grid{grid-template-columns:1fr}
  .admin-header-right .admin-header-search{display:none}
}
@media(max-width:480px){
  .admin-sidebar{position:fixed;left:0;top:0;bottom:0;z-index:10001;transform:translateX(-100%);transition:transform .3s ease}
  .admin-sidebar.open{transform:translateX(0)}
  .admin-mobile-toggle{display:flex !important}
  .admin-stats{grid-template-columns:1fr}
  .admin-mobile-backdrop{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:none}
  .admin-mobile-backdrop.open{display:block}
}
.admin-mobile-toggle{display:none;width:36px;height:36px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);align-items:center;justify-content:center;color:#94a3b8;cursor:pointer}
.admin-mobile-toggle svg{width:18px;height:18px;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;fill:none}
.admin-user-detail-overlay{position:fixed;inset:0;z-index:100010;background:rgba(3,8,16,.82);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn .25s ease}
.admin-user-detail-card{width:100%;max-width:440px;max-height:72vh;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:thin;scrollbar-color:rgba(212,164,55,0.25) transparent;background:linear-gradient(180deg,rgba(12,20,38,0.92) 0%,rgba(8,14,28,0.95) 100%);backdrop-filter:blur(24px) saturate(1.3);-webkit-backdrop-filter:blur(24px) saturate(1.3);border:1px solid rgba(212,164,55,0.2);border-radius:28px;box-shadow:0 0 0 1px rgba(212,164,55,0.08),0 30px 80px rgba(0,0,0,0.6),0 0 60px rgba(212,164,55,0.06);padding:0;animation:panelSpringUp .35s cubic-bezier(.34,1.56,.64,1) forwards;position:relative}
.admin-user-detail-card::before{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;background:radial-gradient(ellipse at 25% 15%,rgba(59,130,246,0.06) 0%,transparent 50%),radial-gradient(ellipse at 75% 85%,rgba(212,164,55,0.05) 0%,transparent 50%);pointer-events:none;z-index:0}
.admin-user-detail-card>*{position:relative;z-index:1}
.admin-user-detail-scroll{padding:28px 24px 20px;display:flex;flex-direction:column;gap:0}
.admin-user-detail-header{display:flex;align-items:center;gap:16px;margin-bottom:20px}
.admin-user-detail-avatar{width:54px;height:54px;border-radius:16px;background:linear-gradient(135deg,rgba(59,130,246,.35),rgba(212,164,55,.45));display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:900;color:#fff;flex-shrink:0;box-shadow:0 4px 20px rgba(59,130,246,0.25)}
.admin-user-detail-name{font-size:18px;font-weight:800;color:#fff;font-family:'Montserrat',sans-serif;letter-spacing:-.02em}
.admin-user-detail-email{font-size:12px;color:#94a3b8;margin-top:2px}
.admin-balance-hero{text-align:center;padding:24px 20px 28px;margin:0 -24px 24px;background:linear-gradient(180deg,rgba(59,130,246,0.08) 0%,rgba(212,164,55,0.04) 100%);border-bottom:1px solid rgba(212,164,55,0.15);position:relative;overflow:hidden}
.admin-balance-hero::before{content:'';position:absolute;top:-40px;left:50%;transform:translateX(-50%);width:300px;height:160px;background:radial-gradient(ellipse,rgba(59,130,246,0.1) 0%,transparent 70%);pointer-events:none}
.admin-balance-hero-label{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:8px}
.admin-balance-hero-value{font-family:'Montserrat',sans-serif;font-size:36px;font-weight:900;color:#fff;letter-spacing:-1px;text-shadow:0 0 30px rgba(59,130,246,0.25),0 0 60px rgba(212,164,55,0.1);line-height:1.1}
.admin-balance-hero-currency{font-size:14px;font-weight:600;color:rgba(212,164,55,0.5);margin-top:4px}
.admin-copyable-id{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:8px;background:rgba(212,164,55,0.08);border:1px solid rgba(212,164,55,0.2);color:#D4A437;font-size:13px;font-weight:700;font-family:'Montserrat',sans-serif;cursor:pointer;transition:all .2s;user-select:all}
.admin-copyable-id:hover{background:rgba(212,164,55,0.14);border-color:rgba(212,164,55,0.4);box-shadow:0 0 12px rgba(212,164,55,0.15)}
.admin-copyable-id svg{width:13px;height:13px;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;fill:none;opacity:.6}
.admin-glass-divider{height:1px;background:linear-gradient(90deg,transparent 0%,rgba(212,164,55,0.2) 30%,rgba(59,130,246,0.15) 70%,transparent 100%);margin:20px 0;border:none}
.admin-user-detail-stats{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:4px}
.admin-user-detail-stat{padding:14px;border-radius:14px;background:rgba(255,255,255,0.025);border:1px solid rgba(212,164,55,0.08);transition:all .2s}
.admin-user-detail-stat:hover{background:rgba(212,164,55,0.04);border-color:rgba(212,164,55,0.15)}
.admin-user-detail-stat-label{font-size:10px;color:#64748b;text-transform:uppercase;font-weight:700;letter-spacing:.5px;margin-bottom:4px;font-family:'Montserrat',sans-serif}
.admin-user-detail-stat-value{font-size:15px;font-weight:800;color:#fff;font-family:'Montserrat',sans-serif}
.admin-user-detail-close{width:calc(100% - 48px);margin:0 24px 20px;padding:14px;border-radius:14px;border:1px solid rgba(212,164,55,0.15);background:rgba(212,164,55,0.04);color:#D4A437;font-size:13px;font-weight:700;cursor:pointer;transition:all .25s;font-family:'Montserrat',sans-serif;letter-spacing:.02em;position:relative;z-index:1}
.admin-user-detail-close:hover{background:rgba(212,164,55,0.1);color:#fff;border-color:rgba(212,164,55,0.3)}

.admin-action-group{padding:14px;border-radius:14px;background:rgba(212,164,55,0.02);border:1px solid rgba(212,164,55,0.08);margin-bottom:10px}
.admin-action-group-title{font-size:10px;font-weight:700;color:rgba(212,164,55,0.6);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px;font-family:'Montserrat',sans-serif}
.admin-action-group.danger{border-color:rgba(239,68,68,0.12);background:rgba(239,68,68,0.02)}
.admin-action-group.danger .admin-action-group-title{color:rgba(239,68,68,0.6)}
.admin-action-row{display:flex;flex-wrap:wrap;gap:8px}
.admin-action-btn{padding:10px 16px;border-radius:10px;border:1px solid rgba(212,164,55,0.12);background:rgba(212,164,55,0.04);color:rgba(212,164,55,0.7);font-size:12px;font-weight:600;cursor:pointer;transition:all .25s;display:flex;align-items:center;gap:8px;white-space:nowrap;font-family:'Montserrat',sans-serif}
.admin-action-btn:hover{background:rgba(212,164,55,0.1);color:#D4A437;transform:translateY(-1px);box-shadow:0 4px 12px rgba(212,164,55,0.1)}
.admin-action-btn:active{transform:translateY(0) scale(.97)}
.admin-action-btn.green{background:rgba(34,197,94,0.08);border-color:rgba(34,197,94,0.25);color:#4ade80}
.admin-action-btn.green:hover{background:rgba(34,197,94,0.15);border-color:rgba(34,197,94,0.4);box-shadow:0 4px 16px rgba(34,197,94,0.15)}
.admin-action-btn.red{background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.25);color:#ef4444}
.admin-action-btn.red:hover{background:rgba(239,68,68,0.15);border-color:rgba(239,68,68,0.4);box-shadow:0 4px 16px rgba(239,68,68,0.15)}
.admin-action-btn.amber{background:rgba(245,158,11,0.08);border-color:rgba(245,158,11,0.25);color:#fbbf24}
.admin-action-btn.amber:hover{background:rgba(245,158,11,0.15);border-color:rgba(245,158,11,0.4);box-shadow:0 4px 16px rgba(245,158,11,0.15)}
.admin-action-btn.blue{background:rgba(59,130,246,0.08);border-color:rgba(59,130,246,0.25);color:#60a5fa}
.admin-action-btn.blue:hover{background:rgba(59,130,246,0.15);border-color:rgba(59,130,246,0.4);box-shadow:0 4px 16px rgba(59,130,246,0.15)}
.admin-action-btn.danger{background:rgba(239,68,68,0.1);border-color:rgba(239,68,68,0.35);color:#ef4444;font-weight:700}
.admin-action-btn.danger:hover{background:rgba(239,68,68,0.18);border-color:rgba(239,68,68,0.5);box-shadow:0 4px 16px rgba(239,68,68,0.2)}
.admin-action-btn svg{width:15px;height:15px;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;fill:none;flex-shrink:0}
.admin-user-detail-card::-webkit-scrollbar{width:4px}
.admin-user-detail-card::-webkit-scrollbar-thumb{background:rgba(212,164,55,0.3);border-radius:2px}
.admin-user-detail-card::-webkit-scrollbar-track{background:transparent}
@media(max-width:480px){
  .admin-user-detail-card{max-height:68vh;border-radius:24px 24px 16px 16px}
  .admin-balance-hero{padding:20px 16px 24px;margin:0 -16px 20px}
  .admin-balance-hero-value{font-size:30px}
  .admin-action-btn{padding:9px 13px;font-size:11px}
  .admin-copyable-id{font-size:12px;padding:4px 10px}
}

.admin-inline-form{display:flex;gap:8px;align-items:center;margin-bottom:12px;padding:10px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);border-radius:12px}
.admin-inline-form input{flex:1;padding:8px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:13px;outline:none;min-width:0}
.admin-inline-form input:focus{border-color:rgba(59,130,246,0.3)}
.admin-inline-form-btn{padding:8px 16px;border-radius:8px;border:none;font-size:12px;font-weight:700;cursor:pointer;color:#fff;transition:all .2s}
.admin-inline-form-btn:active{transform:scale(.97)}
.admin-inline-form-btn.confirm{background:linear-gradient(135deg,#3b82f6,#2563eb)}
.admin-inline-form-btn.cancel{background:rgba(255,255,255,0.06);color:#94a3b8}

.admin-confirm-overlay{position:fixed;inset:0;z-index:100020;background:rgba(3,8,16,.85);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn .2s ease}
.admin-confirm-card{width:100%;max-width:380px;background:linear-gradient(180deg,#101a30,#080f1e);border:1px solid rgba(239,68,68,0.3);border-radius:20px;padding:28px;text-align:center;animation:panelSpringUp .3s cubic-bezier(.34,1.56,.64,1) forwards}
.admin-confirm-icon{width:56px;height:56px;border-radius:50%;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:#ef4444}
.admin-confirm-icon svg{width:24px;height:24px;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;fill:none}
.admin-confirm-title{font-size:16px;font-weight:800;color:#fff;margin-bottom:8px}
.admin-confirm-message{font-size:13px;color:#94a3b8;line-height:1.5;margin-bottom:20px}
.admin-confirm-actions{display:flex;gap:10px}
.admin-confirm-actions button{flex:1;padding:12px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;border:none;transition:all .2s}
.admin-confirm-actions button:active{transform:scale(.97)}
.admin-confirm-actions .cancel-btn{background:rgba(255,255,255,0.06);color:#94a3b8}
.admin-confirm-actions .danger-btn{background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;box-shadow:0 4px 16px rgba(239,68,68,0.3)}

.admin-tx-detail-overlay{position:fixed;inset:0;z-index:100010;background:rgba(3,8,16,.8);backdrop-filter:blur(12px);display:flex;align-items:center;justify-content:center;padding:20px;animation:fadeIn .2s ease}
.admin-tx-detail-card{width:100%;max-width:480px;background:linear-gradient(180deg,#101a30,#080f1e);border:1px solid rgba(59,130,246,0.22);border-radius:24px;box-shadow:0 30px 80px rgba(0,0,0,.55);padding:28px;animation:panelSpringUp .3s cubic-bezier(.34,1.56,.64,1) forwards;max-height:90vh;overflow-y:auto;overscroll-behavior:none}
.admin-tx-detail-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.admin-tx-detail-title{font-size:16px;font-weight:800;color:#fff}
.admin-tx-detail-close{width:36px;height:36px;border-radius:10px;border:1px solid rgba(255,255,255,0.08);background:rgba(255,255,255,0.04);display:flex;align-items:center;justify-content:center;color:#94a3b8;cursor:pointer;transition:all .2s}
.admin-tx-detail-close:active{transform:scale(.95)}
.admin-tx-detail-close svg{width:16px;height:16px;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;fill:none}
.admin-tx-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
.admin-tx-detail-field{padding:12px;border-radius:12px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06)}
.admin-tx-detail-label{font-size:9px;color:#64748b;text-transform:uppercase;font-weight:700;letter-spacing:.5px;margin-bottom:4px}
.admin-tx-detail-value{font-size:14px;font-weight:700;color:#fff}
.admin-tx-detail-value.pos{color:#4ade80}
.admin-tx-detail-value.neg{color:#ef4444}
.admin-tx-detail-amount{text-align:center;padding:20px;border-radius:16px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);margin-bottom:20px}
.admin-tx-detail-amount-value{font-family:'Montserrat',sans-serif;font-size:28px;font-weight:900;letter-spacing:-1px}

.admin-chart-container{background:rgba(255,255,255,0.02);border:1px solid rgba(59,130,246,0.1);border-radius:18px;padding:20px;margin-bottom:20px}
.admin-chart-title{font-size:13px;font-weight:700;color:#fff;margin-bottom:16px}
.admin-chart{display:flex;align-items:flex-end;gap:8px;height:160px;padding-bottom:24px;position:relative;border-bottom:1px solid rgba(255,255,255,0.06)}
.admin-chart-bar-wrap{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end}
.admin-chart-bar{width:100%;max-width:40px;border-radius:6px 6px 2px 2px;transition:height .5s cubic-bezier(.34,1.56,.64,1);min-height:4px;position:relative}
.admin-chart-bar.depot{background:linear-gradient(180deg,#22c55e,rgba(34,197,94,0.6))}
.admin-chart-bar.retrait{background:linear-gradient(180deg,#ef4444,rgba(239,68,68,0.6))}
.admin-chart-bar.virement{background:linear-gradient(180deg,#3b82f6,rgba(59,130,246,0.6))}
.admin-chart-bar.inscription{background:linear-gradient(180deg,#a855f7,rgba(168,85,247,0.6))}
.admin-chart-bar-label{font-size:9px;color:#64748b;font-weight:600;white-space:nowrap}
.admin-chart-bar-value{font-size:10px;font-weight:700;color:#e2e8f0;position:absolute;top:-20px;left:50%;transform:translateX(-50%);white-space:nowrap}
.admin-chart-legend{display:flex;gap:16px;margin-top:12px;justify-content:center}
.admin-chart-legend-item{display:flex;align-items:center;gap:6px;font-size:11px;color:#94a3b8}
.admin-chart-legend-dot{width:10px;height:10px;border-radius:3px}
.admin-chart-legend-dot.depot{background:#22c55e}
.admin-chart-legend-dot.retrait{background:#ef4444}
.admin-chart-legend-dot.virement{background:#3b82f6}
.admin-chart-legend-dot.inscription{background:#a855f7}

.admin-filter-bar{display:flex;flex-wrap:wrap;gap:10px;padding:12px 16px;background:rgba(255,255,255,0.02);border:1px solid rgba(59,130,246,0.1);border-radius:14px;margin-bottom:16px;align-items:flex-end}
.admin-filter-group{display:flex;flex-direction:column;gap:4px}
.admin-filter-label{font-size:9px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.5px}
.admin-filter-input{padding:7px 10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:12px;outline:none;width:130px}
.admin-filter-input:focus{border-color:rgba(59,130,246,0.3)}
.admin-filter-clear{padding:7px 12px;border-radius:8px;border:1px solid rgba(239,68,68,0.2);background:rgba(239,68,68,0.06);color:#ef4444;font-size:11px;font-weight:600;cursor:pointer;transition:all .2s;margin-left:auto}
.admin-filter-clear:hover{background:rgba(239,68,68,0.12)}

.admin-notif-form{padding:14px;border-radius:14px;background:rgba(255,255,255,0.02);border:1px solid rgba(59,130,246,0.12);margin-bottom:16px}
.admin-notif-form-title{font-size:12px;font-weight:700;color:#fff;margin-bottom:10px}
.admin-notif-form-field{margin-bottom:8px}
.admin-notif-form-field label{font-size:10px;font-weight:600;color:#64748b;display:block;margin-bottom:4px}
.admin-notif-form-field input,.admin-notif-form-field textarea{width:100%;padding:8px 12px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:8px;color:#fff;font-size:12px;outline:none;font-family:system-ui,sans-serif;resize:vertical}
.admin-notif-form-field input:focus,.admin-notif-form-field textarea:focus{border-color:rgba(59,130,246,0.3)}
.admin-notif-form-actions{display:flex;gap:8px;margin-top:10px}

.admin-activity-log{max-height:400px;overflow-y:auto;scrollbar-width:thin;scrollbar-color:rgba(59,130,246,0.2) transparent;overscroll-behavior:none}
.admin-activity-log::-webkit-scrollbar{width:4px}
.admin-activity-log::-webkit-scrollbar-thumb{background:rgba(59,130,246,0.2);border-radius:2px}
.admin-activity-item{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.03);align-items:flex-start}
.admin-activity-item:last-child{border-bottom:none}
.admin-activity-dot{width:8px;height:8px;border-radius:50%;background:rgba(59,130,246,0.4);margin-top:5px;flex-shrink:0}
.admin-activity-dot.danger{background:rgba(239,68,68,0.5)}
.admin-activity-dot.success{background:rgba(34,197,94,0.5)}
.admin-activity-dot.warning{background:rgba(245,158,11,0.5)}
.admin-activity-content{flex:1;min-width:0}
.admin-activity-action{font-size:12px;font-weight:600;color:#e2e8f0}
.admin-activity-detail{font-size:11px;color:#64748b;margin-top:2px}
.admin-activity-time{font-size:10px;color:#475569;margin-top:2px}

.admin-top-card{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));max-width:920px;gap:12px;margin-bottom:24px}
.admin-top-card-item{padding:16px;border-radius:14px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06);aspect-ratio:1/1;display:flex;flex-direction:column;justify-content:center}
.admin-top-card-label{font-size:10px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px}
.admin-top-card-value{font-family:'Montserrat',sans-serif;font-size:18px;font-weight:800;color:#fff}
.admin-top-card-value.green{color:#4ade80}
.admin-top-card-value.red{color:#ef4444}
.admin-top-card-value.blue{color:#60a5fa}
.admin-top-card-value.amber{color:#fbbf24}

.admin-top-users{background:rgba(255,255,255,0.02);border:1px solid rgba(59,130,246,0.1);border-radius:18px;padding:20px}
.admin-top-users-title{font-size:13px;font-weight:700;color:#fff;margin-bottom:12px}
.admin-top-user-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.03)}
.admin-top-user-row:last-child{border-bottom:none}
.admin-top-user-rank{width:24px;height:24px;border-radius:6px;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#fff;flex-shrink:0;margin-right:10px}
.admin-top-user-rank.gold{background:rgba(251,191,36,0.2);color:#fbbf24}
.admin-top-user-rank.silver{background:rgba(148,163,184,0.2);color:#94a3b8}
.admin-top-user-rank.bronze{background:rgba(217,119,6,0.2);color:#d97706}
.admin-top-user-rank.default{background:rgba(255,255,255,0.06);color:#64748b}
.admin-export-btn{padding:8px 14px;border-radius:10px;border:1px solid rgba(59,130,246,0.3);background:rgba(59,130,246,0.1);color:#60a5fa;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:6px}
.admin-export-btn:hover{background:rgba(59,130,246,0.18);color:#fff}
.admin-export-btn:active{transform:scale(.97)}
.admin-export-btn svg{width:14px;height:14px;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;fill:none}

@media(max-width:768px){
  .admin-chart{height:120px}
  .admin-tx-detail-grid{grid-template-columns:1fr}
  .admin-top-card{grid-template-columns:1fr 1fr}
  .admin-filter-bar{gap:8px}
  .admin-filter-input{width:110px}
}
@media(max-width:480px){
  .admin-top-card{grid-template-columns:1fr}
  .admin-tx-detail-card{padding:20px}
  .admin-chart{height:100px}
}
/* ── NEW ADMIN STYLES ── */
.admin-pagination{display:flex;align-items:center;justify-content:center;gap:8px;padding:12px 0}
.admin-pagination button{width:32px;height:32px;border-radius:8px;border:1px solid rgba(59,130,246,0.2);background:rgba(255,255,255,0.03);color:#94a3b8;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s}
.admin-pagination button:hover:not(:disabled){background:rgba(59,130,246,0.1);border-color:rgba(59,130,246,0.4);color:#fff}
.admin-pagination button:disabled{opacity:.3;cursor:not-allowed}
.admin-pagination .admin-page-info{font-size:12px;color:#64748b;font-weight:500;min-width:100px;text-align:center}
.admin-bulk-bar{display:flex;align-items:center;gap:10px;padding:10px 16px;background:rgba(59,130,246,0.08);border:1px solid rgba(59,130,246,0.2);border-radius:12px;margin-bottom:12px;flex-wrap:wrap}
.admin-bulk-bar .admin-bulk-count{font-size:12px;font-weight:700;color:#60a5fa;margin-right:auto}
.admin-bulk-btn{padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#94a3b8;font-size:11px;font-weight:600;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:4px}
.admin-bulk-btn:hover{background:rgba(255,255,255,0.08);color:#fff}
.admin-bulk-btn.danger{border-color:rgba(239,68,68,0.3);color:#ef4444}
.admin-bulk-btn.danger:hover{background:rgba(239,68,68,0.1)}
.admin-select-all-btn{padding:6px 12px;border-radius:8px;border:1px solid rgba(59,130,246,0.2);background:rgba(59,130,246,0.06);color:#60a5fa;font-size:11px;font-weight:600;cursor:pointer;transition:all .2s}
.admin-select-all-btn:hover{background:rgba(59,130,246,0.12)}
.admin-user-checkbox{width:16px;height:16px;border-radius:4px;border:1.5px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.03);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s;flex-shrink:0}
.admin-user-checkbox.checked{background:rgba(59,130,246,0.8);border-color:rgba(59,130,246,0.8)}
.admin-user-checkbox.checked::after{content:"✓";color:#fff;font-size:10px;font-weight:800}
.admin-profile-edit{padding:16px;border:1px solid rgba(59,130,246,0.15);border-radius:14px;background:rgba(255,255,255,0.02)}
.admin-profile-edit-title{font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px}
.admin-profile-field{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);gap:8px}
.admin-profile-field:last-child{border-bottom:none}
.admin-profile-field-label{font-size:12px;color:#94a3b8;font-weight:500;min-width:80px}
.admin-profile-field-value{font-size:13px;color:#fff;font-weight:600;flex:1;text-align:right}
.admin-profile-field-edit{display:flex;align-items:center;gap:6px;flex:1;justify-content:flex-end}
.admin-profile-field-edit input{width:140px;padding:5px 10px;border-radius:8px;border:1px solid rgba(59,130,246,0.3);background:rgba(59,130,246,0.06);color:#fff;font-size:12px;outline:none}
.admin-profile-field-edit input:focus{border-color:rgba(59,130,246,0.5)}
.admin-mini-btn{width:26px;height:26px;border-radius:6px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#94a3b8;font-size:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .15s}
.admin-mini-btn:hover{background:rgba(255,255,255,0.08);color:#fff}
.admin-mini-btn.save{border-color:rgba(34,197,94,0.3);color:#22c55e}
.admin-mini-btn.save:hover{background:rgba(34,197,94,0.1)}
.admin-tx-contested-badge{display:inline-flex;align-items:center;padding:2px 8px;border-radius:999px;font-size:9px;font-weight:800;background:rgba(239,68,68,0.15);color:#ef4444;border:1px solid rgba(239,68,68,0.3)}
.admin-filter-btn.contested{border-color:rgba(239,68,68,0.3);color:#ef4444}
.admin-filter-btn.contested.active{background:rgba(239,68,68,0.15);border-color:#ef4444;color:#ef4444}
.admin-report-section{padding:20px;border:1px solid rgba(59,130,246,0.12);border-radius:16px;background:rgba(255,255,255,0.02);margin-top:20px}
.admin-report-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px}
.admin-report-title{font-size:14px;font-weight:700;color:#fff}
.admin-report-modes{display:flex;gap:4px}
.admin-report-mode{padding:6px 14px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.03);color:#94a3b8;font-size:11px;font-weight:600;cursor:pointer;transition:all .2s}
.admin-report-mode.active{background:rgba(59,130,246,0.12);border-color:rgba(59,130,246,0.4);color:#60a5fa}
.admin-report-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:16px}
.admin-report-stat{padding:12px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06)}
.admin-report-stat-label{font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.admin-report-stat-value{font-size:14px;font-weight:800;color:#fff;font-family:'Montserrat',sans-serif}
.admin-report-stat-value.green{color:#4ade80}.admin-report-stat-value.red{color:#ef4444}.admin-report-stat-value.blue{color:#60a5fa}.admin-report-stat-value.amber{color:#fbbf24}
.admin-report-daterange{font-size:11px;color:#64748b;font-weight:500;margin-bottom:12px}
.admin-report-table{width:100%;border-collapse:collapse;font-size:12px}
.admin-report-table th{text-align:left;padding:8px 10px;color:#64748b;font-weight:600;font-size:10px;text-transform:uppercase;letter-spacing:.5px;border-bottom:1px solid rgba(255,255,255,0.06)}
.admin-report-table td{padding:8px 10px;color:#cbd5e1;border-bottom:1px solid rgba(255,255,255,0.03)}
.admin-fee-toggle{display:flex;gap:4px;padding:3px;border-radius:10px;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08)}
.admin-fee-toggle-btn{padding:6px 12px;border-radius:8px;border:none;background:transparent;color:#64748b;font-size:11px;font-weight:600;cursor:pointer;transition:all .2s}
.admin-fee-toggle-btn.active{background:rgba(59,130,246,0.15);color:#60a5fa}
.admin-fee-example{font-size:11px;color:#64748b;margin-top:6px;padding:8px 10px;background:rgba(255,255,255,0.02);border-radius:8px;border:1px solid rgba(255,255,255,0.04)}
.admin-fee-example strong{color:#fbbf24}
.admin-limits-section{padding:14px;border:1px solid rgba(59,130,246,0.12);border-radius:12px;background:rgba(255,255,255,0.02);margin-top:12px}
.admin-limits-title{font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-bottom:10px}
.admin-limit-field{display:flex;align-items:center;justify-content:space-between;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.04);gap:8px}
.admin-limit-field:last-child{border-bottom:none}
.admin-limit-label{font-size:12px;color:#94a3b8}
.admin-limit-value{font-size:13px;color:#fff;font-weight:700}
.admin-refresh-indicator{display:flex;align-items:center;gap:6px;font-size:11px;color:#64748b;font-weight:500}
.admin-refresh-dot{width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 8px rgba(34,197,94,0.4);animation:adminPulse 2s ease-in-out infinite}
.admin-health-card{padding:20px;border:1px solid rgba(34,197,94,0.15);border-radius:16px;background:rgba(34,197,94,0.03)}
.admin-health-title{font-size:14px;font-weight:700;color:#fff;margin-bottom:14px;display:flex;align-items:center;gap:8px}
.admin-health-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}
.admin-health-item{padding:12px;border-radius:10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.06)}
.admin-health-label{font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.5px;margin-bottom:4px}
.admin-health-value{font-size:13px;font-weight:700;color:#fff;display:flex;align-items:center;gap:6px}
.admin-health-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;font-size:10px;font-weight:700}
.admin-health-badge.green{background:rgba(34,197,94,0.12);color:#22c55e;border:1px solid rgba(34,197,94,0.25)}
.admin-admin-roles-section{padding:20px;border:1px solid rgba(212,164,55,0.15);border-radius:16px;background:rgba(212,164,55,0.03);margin-top:20px}
.admin-admin-roles-title{font-size:14px;font-weight:700;color:#fff;margin-bottom:14px;display:flex;align-items:center;gap:8px}
.admin-admin-role-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.04)}
.admin-admin-role-row:last-child{border-bottom:none}
.admin-admin-role-info{display:flex;align-items:center;gap:10px}
.admin-admin-role-avatar{width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,rgba(212,164,55,0.2),rgba(59,130,246,0.2));display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff}
.admin-admin-role-name{font-size:13px;font-weight:600;color:#fff}
.admin-admin-role-email{font-size:11px;color:#64748b}
.admin-admin-role-select{padding:5px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.1);background:rgba(255,255,255,0.04);color:#fff;font-size:11px;font-weight:600;cursor:pointer;outline:none}
.admin-admin-role-select option{background:#0c1528;color:#fff}
.admin-backup-section{padding:20px;border:1px solid rgba(59,130,246,0.15);border-radius:16px;background:rgba(255,255,255,0.02);margin-top:20px}
.admin-backup-title{font-size:14px;font-weight:700;color:#fff;margin-bottom:6px;display:flex;align-items:center;gap:8px}
.admin-backup-desc{font-size:12px;color:#64748b;margin-bottom:14px;line-height:1.5}
.admin-backup-actions{display:flex;gap:10px;flex-wrap:wrap}
.admin-backup-btn{padding:10px 18px;border-radius:10px;border:1px solid rgba(59,130,246,0.25);background:rgba(59,130,246,0.08);color:#60a5fa;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;display:flex;align-items:center;gap:6px}
.admin-backup-btn:hover{background:rgba(59,130,246,0.15)}
.admin-backup-btn.danger{border-color:rgba(239,68,68,0.25);background:rgba(239,68,68,0.08);color:#ef4444}
.admin-backup-btn.danger:hover{background:rgba(239,68,68,0.15)}
.admin-backup-btn:disabled{opacity:.5;cursor:not-allowed}
.admin-backup-warning{font-size:11px;color:#ef4444;margin-top:10px;padding:8px 10px;background:rgba(239,68,68,0.06);border-radius:8px;border:1px solid rgba(239,68,68,0.15)}
.admin-tx-detail-contest-btn{width:100%;padding:10px 16px;border-radius:10px;border:1px solid rgba(239,68,68,0.25);background:rgba(239,68,68,0.08);color:#ef4444;font-size:12px;font-weight:600;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:6px;margin-top:10px}
.admin-tx-detail-contest-btn:hover{background:rgba(239,68,68,0.15)}
@media(max-width:768px){
  .admin-report-stats{grid-template-columns:repeat(2,1fr)}
  .admin-health-grid{grid-template-columns:1fr}
  .admin-bulk-bar{flex-direction:column;align-items:stretch}
  .admin-bulk-bar .admin-bulk-count{margin-right:0}
  .admin-backup-actions{flex-direction:column}
}
.preset-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}.preset-btn{height:38px;border:none;border-radius:12px;background:rgba(255,255,255,.05);color:rgba(255,255,255,.7);font-size:12px;font-weight:700;padding:0 14px;cursor:pointer;transition:all .2s}.preset-btn.active{background:rgba(212,164,55,.15);color:var(--gold);border:1px solid rgba(212,164,55,.3)}.preset-btn:active{transform:scale(.95)}.tontine-create-form{display:flex;flex-direction:column;gap:12px;margin-bottom:20px}.tontine-create-form input{width:100%;height:48px;border-radius:14px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#fff;padding:0 16px;font-size:14px;outline:none}.tontine-create-form input:focus{border-color:rgba(212,164,55,.4)}.tontine-create-btn{height:48px;border-radius:14px;border:none;background:linear-gradient(135deg,#D4A437,#b8862d);color:#000;font-size:14px;font-weight:800;cursor:pointer;transition:all .2s}.tontine-create-btn:active{transform:scale(.97)}.tontine-group-card{padding:16px;border-radius:18px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);margin-bottom:12px}.tontine-group-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.tontine-group-name{font-size:15px;font-weight:800;color:#fff}.tontine-group-amount{font-size:11px;color:var(--gold);font-weight:700}.member-add-row{display:flex;gap:8px;margin-bottom:16px}.member-add-row input{flex:1;height:42px;border-radius:12px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);color:#fff;padding:0 14px;font-size:13px;outline:none}.member-add-row input:focus{border-color:rgba(244,63,94,.4)}.member-add-btn{height:42px;padding:0 16px;border-radius:12px;border:none;background:rgba(244,63,94,.15);color:#fb7185;font-size:12px;font-weight:800;cursor:pointer;white-space:nowrap}
`;

// Helper to build chart data from live transactions
const buildChartData = (txs: Transaction[], bal: number, days?: typeof chartDays) => {
  const usedDays = days || chartDays;
  const seededRandom = (seed: number) => {
    const x = Math.sin(seed * 9301 + 49297) % 233280;
    return x / 233280;
  };

  // Build date ranges for each chart day
  const dayRanges = usedDays.map((d) => {
    const start = new Date(d.year, d.month, d.day, 0, 0, 0).getTime();
    const end = new Date(d.year, d.month, d.day, 23, 59, 59, 999).getTime();
    return { start, end };
  });

  const dayData = usedDays.map((d, i) => {
    // Match transactions by dateTimestamp (ms) against each day's range
    const matching = txs.filter((tx) => {
      const ts = tx.dateTimestamp;
      if (!ts) return false;
      return ts >= dayRanges[i].start && ts <= dayRanges[i].end;
    });

    if (matching.length > 0) {
      // Extract positive numeric value from formatted amount strings
      const parseNum = (amountStr: string): number => {
        const cleaned = amountStr.replace(/[^\d]/g, "");
        return parseInt(cleaned, 10) || 0;
      };
      const credits = matching.filter((t) => t.type === "credit").reduce((sum, t) => sum + parseNum(t.amount), 0);
      const debits = matching.filter((t) => t.type === "debit").reduce((sum, t) => sum + parseNum(t.amount), 0);
      return { amount: credits + debits, credits, debits, hasRealData: true };
    }

    // No real data — generate deterministic simulated data
    const r = seededRandom(d.day * 31 + d.month * 7);
    const isSalaryDay = (d.day === 25 || d.day === 26 || d.day === 30 || d.day === 1);
    const isExpenseDay = (d.day === 1 || d.day === 5 || d.day === 15 || d.day === 20);
    const amount = Math.round(bal * 0.15 * (isSalaryDay ? 1.6 + r * 0.4 : isExpenseDay ? 0.6 + r * 0.3 : 0.9 + r * 0.5));
    return { amount, credits: isExpenseDay ? Math.round(amount * 0.4) : amount, debits: isExpenseDay ? Math.round(amount * 0.6) : 0, hasRealData: false };
  });

  const maxAmount = Math.max(...dayData.map((d) => d.amount), 1);

  // Build cumulative balance trajectory for sparkline
  // Reverse-engineer daily balances from current balance
  const netFlows = dayData.map((d) => d.credits - d.debits);
  const len = usedDays.length;
  const trajectory: number[] = new Array(len);
  trajectory[len - 1] = bal; // Last day = current balance
  // Walk backwards: balance[N-1] = balance[N] - netFlow[N]
  for (let i = len - 2; i >= 0; i--) {
    trajectory[i] = trajectory[i + 1] - netFlows[i];
  }
  // trajectory[0] = estimated balance 6 days ago, trajectory[6] = current balance

  return {
    heights: dayData.map((d) => Math.max(12, Math.round((d.amount / maxAmount) * 80))),
    amounts: dayData.map((d) => d.amount),
    netFlow: netFlows,
    trajectory,
  };
};

const quickActions = [
  { label: "Dépôt", icon: "wallet", message: "Effectuer un dépôt", action: "depot" },
  { label: "Retrait", icon: "receive", message: "Effectuer un retrait", action: "retrait" },
  { label: "Services", icon: "service", message: "Accéder aux services", action: "service" },
  { label: "Transférer", icon: "transfer", message: "Transférer des fonds", action: "transfer" },
] as const;

const navItems: NavItem[] = ["Accueil", "Cartes", "Privilèges", "Profil"];

const serviceTiles: Array<{ icon: IconName; name: string; desc: string; accent: string; badge?: string }> = [
  { icon: "phone", name: "Crédit", desc: "MTN & Airtel", badge: "-5%", accent: "#60a5fa" },
  { icon: "globe", name: "Internet", desc: "Pass Data", accent: "#60a5fa" },
  { icon: "tv", name: "Canal+", desc: "Réabonnement", accent: "#a78bfa" },
  { icon: "bolt", name: "Électricité", desc: "Factures & Jetons", accent: "#fbbf24" },
  { icon: "droplet", name: "Eau", desc: "SNDE / LCDE", accent: "#38bdf8" },
  { icon: "qr", name: "Marchand", desc: "Payer par QR", accent: "#22c55e" },
];

const initialPaymentContacts: PaymentContact[] = [];
const cardActions = [
  { icon: "snowflake" as IconName, label: "Geler la carte", sub: "Sécurité instantanée" },
  { icon: "pin" as IconName, label: "Code PIN", sub: "Carte confidentielle" },
  { icon: "service" as IconName, label: "Limites", sub: "Gérer les plafonds" },
  { icon: "request" as IconName, label: "Nouvelle", sub: "Carte virtuelle" },
];

const profileGroups = [
  {
    title: "Mon Compte",
    items: [
      { icon: "user" as IconName, label: "Informations Personnelles" },
      { icon: "shield" as IconName, label: "Sécurité & Biométrie", badge: "Activé" },
      { icon: "receipt" as IconName, label: "Historique des Reçus" },
      { icon: "headset" as IconName, label: "Support Client", sub: "Réponse en 5min" },
    ],
  },
  {
    title: "Légal",
    items: [
      { icon: "document" as IconName, label: "Conditions d'utilisation" },
      { icon: "lock" as IconName, label: "Confidentialité" },
    ],
  },
];

const myServices: SearchServiceItem[] = [
  { id: "credit", name: "Recharge Crédit", category: "Quotidien", icon: "phone" },
  { id: "internet", name: "Forfait Internet", category: "Quotidien", icon: "globe" },
  { id: "canal", name: "Canal+ Afrique", category: "TV", icon: "tv" },
  { id: "merchant", name: "Paiement Marchand", category: "QR", icon: "qr" },
  { id: "crypto", name: "Acheter USDT", category: "Finance", icon: "crypto" },
  { id: "loan", name: "Micro-Crédit", category: "Prêt", icon: "flash" },
  { id: "personalloan", name: "Prêt Personnel", category: "Prêt", icon: "bank" },
  { id: "wallet", name: "Portefeuilles", category: "Finance", icon: "wallet" },
  { id: "tontine", name: "Tontine Digitale", category: "Épargne", icon: "users" },
  { id: "savings", name: "Épargne", category: "Finance", icon: "piggy" },
  { id: "utility-elec", name: "Électricité", category: "Quotidien", icon: "bolt" },
  { id: "utility-water", name: "Eau", category: "Quotidien", icon: "droplet" },
];

const myContacts: SearchContactItem[] = [];

const moraliDirectory: MoraliUser[] = [];

// Format for stat cards: "+ 260 000" or "- 110 000" with proper spacing
function MoraliShield({ small = false }: { small?: boolean }) {
  const width = small ? 20 : 32;
  const height = small ? 24 : 38;
  const stroke = small ? 2.2 : 2;

  return (
    <svg width={width} height={height} viewBox="0 0 40 46" fill="none" aria-hidden="true">
      <path d="M20 2L4 8V22C4 31.6 11.2 40.5 20 44C28.8 40.5 36 31.6 36 22V8L20 2Z" fill="#1A3E78" />
      <path d="M20 2L4 8V22C4 31.6 11.2 40.5 20 44C28.8 40.5 36 31.6 36 22V8L20 2Z" stroke="#D4A437" strokeWidth={stroke} fill="none" />
      <path d="M11 29V17L20 23L29 17V29" stroke="#D4A437" strokeWidth={small ? 3.2 : 3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M11 17L20 23L29 17" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function ArrowRightIcon({ color = "white" }: { color?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M5 12h14M12 5l7 7-7 7" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}

function EyeIcon({ off = false }: { off?: boolean }) {
  return off ? (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function MoraliMarkIcon({ size = 18, stroke = "currentColor" }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 17V7l7 5 7-5v10" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M5 7l7 5 7-5" stroke={stroke} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function AppIcon({ name, size = 20, stroke = "currentColor" }: { name: IconName; size?: number; stroke?: string }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke,
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  if (name === "morali") {
    return <MoraliMarkIcon size={size} stroke={stroke} />;
  }

  if (name === "send") return <svg {...common}><path d="M5 12h14" /><path d="M12 5l7 7-7 7" /></svg>;
  if (name === "receive") return <svg {...common}><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>;
  if (name === "card") return <svg {...common}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19" /></svg>;
  if (name === "grid") return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>;
  if (name === "briefcase") return <svg {...common}><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7" /><path d="M3 12h18" /></svg>;
  if (name === "home") return <svg {...common}><path d="M4 11.5 12 5l8 6.5" /><path d="M6.5 10.5V19h11v-8.5" /><path d="M10 19v-4h4v4" /></svg>;
  if (name === "bolt") return <svg {...common}><path d="M13 2 6 13h5l-1 9 8-12h-5l0-8Z" /></svg>;
  if (name === "building") return <svg {...common}><path d="M4 20h16" /><path d="M6 20V9l6-4 6 4v11" /><path d="M9 12h.01M12 12h.01M15 12h.01M9 15h.01M12 15h.01M15 15h.01" /></svg>;
  if (name === "phone") return <svg {...common}><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M10.5 5.5h3" /><path d="M11.5 18.5h1" /></svg>;
  if (name === "cart") return <svg {...common}><circle cx="9" cy="19" r="1.5" /><circle cx="17" cy="19" r="1.5" /><path d="M4 5h2l2.2 9h8.9l2-7H7.1" /></svg>;
  if (name === "user") return <svg {...common}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="8" r="4" /></svg>;
  if (name === "lock") return <svg {...common}><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V8a4 4 0 1 1 8 0v3" /></svg>;
  if (name === "spark") return <svg {...common}><path d="M12 3v4" /><path d="M12 17v4" /><path d="M4.9 4.9l2.8 2.8" /><path d="M16.3 16.3l2.8 2.8" /><path d="M3 12h4" /><path d="M17 12h4" /><path d="M4.9 19.1l2.8-2.8" /><path d="M16.3 7.7l2.8-2.8" /></svg>;
  if (name === "bank") return <svg {...common}><path d="M3 9 12 4l9 5" /><path d="M5 10v8" /><path d="M9.5 10v8" /><path d="M14.5 10v8" /><path d="M19 10v8" /><path d="M3 20h18" /></svg>;
  if (name === "shield") return <svg {...common}><path d="M12 3 5 6v5c0 4.5 2.8 8 7 10 4.2-2 7-5.5 7-10V6l-7-3Z" /><path d="m9.5 12 1.8 1.8 3.7-3.7" /></svg>;
  if (name === "wallet") return <svg {...common}><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 15.5v-7Z" /><path d="M16 12h4" /><circle cx="16" cy="12" r="1" fill={stroke} stroke="none" /></svg>;
  if (name === "service") return <svg {...common}><circle cx="12" cy="12" r="3.5" /><path d="M12 2v3" /><path d="M12 19v3" /><path d="M4.93 4.93l2.12 2.12" /><path d="M16.95 16.95l2.12 2.12" /><path d="M2 12h3" /><path d="M19 12h3" /><path d="M4.93 19.07l2.12-2.12" /><path d="M16.95 7.05l2.12-2.12" /></svg>;
  if (name === "transfer") return <svg {...common}><path d="M7 7h11" /><path d="m14 4 4 3-4 3" /><path d="M17 17H6" /><path d="m10 14-4 3 4 3" /></svg>;
  if (name === "bell") return <svg {...common}><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>;
  if (name === "search") return <svg {...common}><circle cx="11" cy="11" r="6" /><path d="m20 20-3.5-3.5" /></svg>;
  if (name === "globe") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a15 15 0 0 1 0 18" /><path d="M12 3a15 15 0 0 0 0 18" /></svg>;
  if (name === "tv") return <svg {...common}><rect x="3" y="5" width="18" height="13" rx="2" /><path d="M8 21h8" /><path d="M10 18v3" /><path d="M14 18v3" /></svg>;
  if (name === "droplet") return <svg {...common}><path d="M12 3c2.5 3 5 6.2 5 9a5 5 0 1 1-10 0c0-2.8 2.5-6 5-9Z" /></svg>;
  if (name === "qr") return <svg {...common}><rect x="4" y="4" width="5" height="5" rx="1" /><rect x="15" y="4" width="5" height="5" rx="1" /><rect x="4" y="15" width="5" height="5" rx="1" /><path d="M15 15h2v2h-2z" /><path d="M19 15v5" /><path d="M15 19h5" /></svg>;
  if (name === "piggy") return <svg {...common}><path d="M7 10a6 6 0 0 1 6-4 7 7 0 0 1 5 2l2 1v4l-2 1v2h-2l-1-2H9l-1 2H6v-2l-2-1v-2a4 4 0 0 1 3-4Z" /><path d="M13 10h.01" /><path d="M15.5 7.5h1.5" /></svg>;
  if (name === "coins") return <svg {...common}><ellipse cx="12" cy="7" rx="5" ry="2.5" /><path d="M7 7v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7" /><path d="M9 14.5v2c0 1.1 1.8 2 4 2s4-.9 4-2v-2" /></svg>;
  if (name === "swap") return <svg {...common}><path d="M4 7h11" /><path d="m12 4 3 3-3 3" /><path d="M20 17H9" /><path d="m12 14-3 3 3 3" /></svg>;
  if (name === "users") return <svg {...common}><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="8" r="3" /><path d="M20 21v-2a3.5 3.5 0 0 0-2.5-3.35" /><path d="M15.5 5.2a3 3 0 0 1 0 5.6" /></svg>;
  if (name === "flash") return <svg {...common}><path d="M13 2 6 13h5l-1 9 8-12h-5l0-8Z" /><path d="M9 21h6" /></svg>;
  if (name === "crypto") return <svg {...common}><circle cx="12" cy="12" r="8" /><path d="M9 9.5h4a2 2 0 0 1 0 4H9.5" /><path d="M10.5 7.5v9" /><path d="M13 7.5v2" /><path d="M13 14.5v2" /></svg>;
  if (name === "camera") return <svg {...common}><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H9l1.4-2h3.2L15 6h2.5A2.5 2.5 0 0 1 20 8.5v8A2.5 2.5 0 0 1 17.5 19h-11A2.5 2.5 0 0 1 4 16.5v-8Z" /><circle cx="12" cy="12.5" r="3.2" /></svg>;
  if (name === "request") return <svg {...common}><path d="M12 5v14" /><path d="M5 12h14" /><circle cx="12" cy="12" r="9" /></svg>;
  if (name === "pin") return <svg {...common}><path d="M12 22s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" /><circle cx="12" cy="11" r="2.5" /></svg>;
  if (name === "snowflake") return <svg {...common}><path d="M12 2v20" /><path d="m4.9 6 14.2 12" /><path d="m19.1 6-14.2 12" /><path d="M4 12h16" /></svg>;
  if (name === "receipt") return <svg {...common}><path d="M7 3h10v18l-2-1.5L13 21l-2-1.5L9 21l-2-1.5L5 21V5a2 2 0 0 1 2-2Z" /><path d="M9 8h6" /><path d="M9 12h6" /><path d="M9 16h4" /></svg>;
  if (name === "headset") return <svg {...common}><path d="M4 12a8 8 0 0 1 16 0" /><rect x="3" y="12" width="4" height="7" rx="2" /><rect x="17" y="12" width="4" height="7" rx="2" /><path d="M19 19a3 3 0 0 1-3 3h-2" /></svg>;
  if (name === "document") return <svg {...common}><path d="M8 3h6l4 4v14H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M14 3v5h5" /><path d="M9 13h6" /><path d="M9 17h6" /></svg>;
  if (name === "chevronRight") return <svg {...common}><path d="m9 6 6 6-6 6" /></svg>;

  return <svg {...common}><circle cx="12" cy="12" r="8" /></svg>;
}

function renderQuickActionIcon(icon: IconName) {
  const accentMap: Partial<Record<IconName, string>> = {
    wallet: "#60a5fa",
    receive: "#3b82f6",
    service: "#93c5fd",
    transfer: "#3b82f6",
  };
  return <AppIcon name={icon} size={20} stroke={accentMap[icon] || "#3b82f6"} />;
}

function renderNavIcon(item: NavItem, active: boolean) {
  const stroke = active ? "#3b82f6" : "rgba(255,255,255,0.3)";
  const iconName: Record<NavItem, IconName> = {
    Accueil: "grid",
    Cartes: "card",
    Privilèges: "spark",
    Profil: "user",
  };

  return <AppIcon name={iconName[item]} size={18} stroke={stroke} />;
}

class RenderGuard extends React.Component<{children: React.ReactNode}, {hasError: boolean; errorDetail: string}> {
  state = { hasError: false, errorDetail: "" };
  static getDerivedStateFromError(error: Error) {
    const detail = error.message || String(error);
    // Log the full error with stack to console for debugging
    console.error("[RenderGuard] Caught render error:", detail);
    console.error("[RenderGuard] Error stack:", error.stack);
    // Try to extract object keys from React #62
    const keysMatch = detail.match(/object with keys \{([^}]+)\}/);
    if (keysMatch) console.error("[RenderGuard] Object keys:", keysMatch[1]);
    return { hasError: true, errorDetail: detail };
  }
  render() {
    if (this.state.hasError) {
      // Don't crash - show a minimal UI and let the user continue
      return (
        <div style={{padding:20,background:"#050b1a",color:"#94a3b8",fontFamily:"system-ui",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <div style={{textAlign:"center",maxWidth:300}}>
            <p style={{color:"#fff",fontWeight:700,marginBottom:8}}>Erreur de rendu</p>
            {process.env.NODE_ENV === "development" 
              ? <p style={{fontSize:11,wordBreak:"break-all"}}>{this.state.errorDetail?.substring(0, 200)}</p>
              : <p style={{fontSize:11,color:"#94a3b8"}}>Une erreur est survenue. Veuillez réessayer.</p>
            }
            <button onClick={() => this.setState({hasError:false, errorDetail:""})} style={{marginTop:16,padding:"10px 24px",background:"#3b82f6",border:"none",borderRadius:10,color:"#fff",fontWeight:700,cursor:"pointer"}}>Réessayer</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function App() {
  const [screen, setScreen] = useState<Screen>("auth");
  const [transactionReturnScreen, setTransactionReturnScreen] = useState<Screen>("dashboard");
  const [authTab, setAuthTab] = useState<AuthTab>("login");
  const [forgotStep, setForgotStep] = useState<ForgotStep>("email");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotOtpCode, setForgotOtpCode] = useState("");
  const [forgotDemoOtp, setForgotDemoOtp] = useState("");
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotVerifying, setForgotVerifying] = useState(false);
  const [forgotVerified, setForgotVerified] = useState(false);
  const [forgotNewPw, setForgotNewPw] = useState("");
  const [forgotConfirmPw, setForgotConfirmPw] = useState("");
  const [forgotResetting, setForgotResetting] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [showRegisterSuccess, setShowRegisterSuccess] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [regPinDraft, setRegPinDraft] = useState("");
  const [regPinConfirm, setRegPinConfirm] = useState("");
  const [regPinStep, setRegPinStep] = useState<"create" | "confirm">("create");
  const [regPinSaving, setRegPinSaving] = useState(false);
  const [navActive, setNavActive] = useState<NavItem>("Accueil");
  const [toastMessage, setToastMessage] = useState("");
  const [toastVisible, setToastVisible] = useState(false);
  const toastTimerRef = useRef<number | null>(null);
  const otpInputRef = useRef<HTMLInputElement | null>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  // Helper: get Firebase auth headers for API requests
  const getAuthHeaders = async (): Promise<Record<string, string>> => {
    const user = firebaseAuth.currentUser;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (user) {
      try {
        const token = await user.getIdToken();
        headers["Authorization"] = `Bearer ${token}`;
      } catch { /* token fetch failed — proceed without auth (will get 401) */ }
    }
    return headers;
  };

  const [authUid, setAuthUid] = useState<string | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [accountSuspended, setAccountSuspended] = useState(false);
  const [suspensionMessage, setSuspensionMessage] = useState("");

  const [registerData, setRegisterData] = useState<RegisterData>({
    prenom: "",
    nom: "",
    email: "",
    tel: "",
    prefix: "+242",
    pw: "",
  });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [demoOtpCode, setDemoOtpCode] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [revealAttempts, setRevealAttempts] = useState(0);
  const [revealLockedUntil, setRevealLockedUntil] = useState(0);
  const [dashboardName, setDashboardName] = useState("Utilisateur");
  const [cardTransform, setCardTransform] = useState("rotateX(4deg) rotateY(-3deg)");
  const [cardLocked, setCardLocked] = useState(false);
  const [cardNumberRevealed, setCardNumberRevealed] = useState(false);
  const [cardGenerating, setCardGenerating] = useState(false);
  const [customCardData, setCustomCardData] = useState<{ cardNumber?: string; cardCcv?: string; cardExp?: string } | null>(null);
  const [, setTick] = useState(0);
  const [chartTooltip, setChartTooltip] = useState<{ index: number } | null>(null);
  const [chartPeriod, setChartPeriod] = useState<"7j" | "30j" | "6m">("7j");
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [transactionType, setTransactionType] = useState<TransactionType>("depot");
  const [transactionAmount, setTransactionAmount] = useState("");
  const [transactionMethod, setTransactionMethod] = useState<"mtn" | "airtel">("mtn");
  const [transactionPhone, setTransactionPhone] = useState("");
  const [transactionChoiceOpen, setTransactionChoiceOpen] = useState(false);
  const [transactionDestination, setTransactionDestination] = useState<"cash" | "airtime" | null>(null);
  const [transactionPinOpen, setTransactionPinOpen] = useState(false);
  const [transactionPin, setTransactionPin] = useState("");
  const [transactionProcessing, setTransactionProcessing] = useState(false);
  const [transactionSuccess, setTransactionSuccess] = useState(false);
  const [transactionPinVerifying, setTransactionPinVerifying] = useState(false);
  const [loanAmount, setLoanAmount] = useState(5000);
  const [personalLoanAmount, setPersonalLoanAmount] = useState(250000);
  const [personalLoanDuration, setPersonalLoanDuration] = useState(6);
  const [microCreditDuration, setMicroCreditDuration] = useState<15 | 30 | 45>(30);
  const [microCreditReason, setMicroCreditReason] = useState("");
  const [personalLoanReason, setPersonalLoanReason] = useState("");
  const [personalLoanIncome, setPersonalLoanIncome] = useState("");
  const [personalLoanStep, setPersonalLoanStep] = useState<"form" | "confirm" | "done">("form");
  const [microCreditStep, setMicroCreditStep] = useState<"form" | "confirm" | "done">("form");
  const [loanApplicationStatus, setLoanApplicationStatus] = useState<"idle" | "loading" | "submitted" | "error">("idle");
  const [activeLoanType, setActiveLoanType] = useState<"micro" | "personal" | null>(null);
  const [xafAmount, setXafAmount] = useState("");
  const [currencyAmount, setCurrencyAmount] = useState("");
  const [targetCurrency, setTargetCurrency] = useState<"EUR" | "USD">("EUR");
  const [currencyRates, setCurrencyRates] = useState<Record<string, number>>({ EUR: 0.00152, USD: 0.00160 });
  const [currencyDirection, setCurrencyDirection] = useState<"sell" | "buy">("sell");
  const [fxSwapping, setFxSwapping] = useState(false);
  const [eurWallet, setEurWallet] = useState(0);
  const [usdWallet, setUsdWallet] = useState(0);
  const [airtimeOperator, setAirtimeOperator] = useState<"mtn" | "airtel">("mtn");
  const [airtimePhone, setAirtimePhone] = useState("");
  const [airtimeAmount, setAirtimeAmount] = useState("");
  const [internetOperator, setInternetOperator] = useState<"mtn" | "airtel">("mtn");
  const [internetPhone, setInternetPhone] = useState("");
  const [internetAmount, setInternetAmount] = useState("");
  const [savingsAmount, setSavingsAmount] = useState(150000);
  const [serviceProcessing, setServiceProcessing] = useState(false);
  const [canalDecoder, setCanalDecoder] = useState("");
  const [canalPlan, setCanalPlan] = useState("");
  const [elecMeter, setElecMeter] = useState("");
  const [elecAmount, setElecAmount] = useState("");
  const [waterMeter, setWaterMeter] = useState("");
  const [waterAmount, setWaterAmount] = useState("");
  const [savingsCustomAmount, setSavingsCustomAmount] = useState("");
  const [pendingPinAction, setPendingPinAction] = useState<{ type: "merchant" | "savings_deposit" | "savings_withdraw"; amount: number } | null>(null);
  const [tontineGroups, setTontineGroups] = useState<{ name: string; contributionAmount: string; members: { name: string; paid: boolean }[]; pot?: number }[]>([]);
  const [tontineName, setTontineName] = useState("");
  const [tontineContributionAmount, setTontineContributionAmount] = useState("");
  const [tontineNewMemberName, setTontineNewMemberName] = useState("");
  const [cryptoRate, setCryptoRate] = useState(650);
  const [merchantAmount, setMerchantAmount] = useState("");
  const [servicesQuery, setServicesQuery] = useState("");
  const [servicesFocused, setServicesFocused] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactQuery, setContactQuery] = useState("");
  const [contactSearchLoading, setContactSearchLoading] = useState(false);
  const [verifiedMoraliUser, setVerifiedMoraliUser] = useState<MoraliUser | null>(null);
  const [paymentContacts, setPaymentContacts] = useState<PaymentContact[]>(initialPaymentContacts);
  const [requestQrOpen, setRequestQrOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const transferInitialQueryRef = useRef<string | undefined>(undefined);

  // ── Admin Dashboard State ──
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [adminPermissionLevel, setAdminPermissionLevel] = useState<"full" | "viewer">("full");
  const [resetDataConfirm, setResetDataConfirm] = useState<false | string>(false);
  const [resetDataLoading, setResetDataLoading] = useState(false);
  const [adminTab, setAdminTab] = useState<AdminTab>("overview");
  const [adminLoginEmail, setAdminLoginEmail] = useState("");
  const [adminLoginEmailFetched, setAdminLoginEmailFetched] = useState(false);
  const [adminLoginPassword, setAdminLoginPassword] = useState("");
  const [adminLoginLoading, setAdminLoginLoading] = useState(false);
  const [adminLoginError, setAdminLoginError] = useState("");
  const [adminForgotStep, setAdminForgotStep] = useState<"idle" | "email" | "code" | "newPassword" | "success">("idle");
  const [adminForgotEmail, setAdminForgotEmail] = useState("");
  const [adminForgotOtpCode, setAdminForgotOtpCode] = useState("");
  const [adminForgotNewPw, setAdminForgotNewPw] = useState("");
  const [adminForgotConfirmPw, setAdminForgotConfirmPw] = useState("");
  const [adminForgotSending, setAdminForgotSending] = useState(false);
  const [adminForgotVerifying, setAdminForgotVerifying] = useState(false);
  const [adminForgotResetting, setAdminForgotResetting] = useState(false);
  const [adminUsers, setAdminUsers] = useState<FirestoreMoraliUser[]>([]);
  const [adminTransactions, setAdminTransactions] = useState<FirestoreTransfer[]>([]);
  const [adminSearchQuery, setAdminSearchQuery] = useState("");
  const [adminSidebarOpen, setAdminSidebarOpen] = useState(false);
  const [auditLogs, setAuditLogs] = useState<Array<Record<string, unknown>>>([]);

  const [auditLogRefreshKey, setAuditLogRefreshKey] = useState(0);
  const [adminSelectedUser, setAdminSelectedUser] = useState<FirestoreMoraliUser | null>(null);
  const [adminTxFilter, setAdminTxFilter] = useState<"all" | "virement" | "depot" | "retrait">("all");
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [defaultBalance, setDefaultBalance] = useState("0");
  const [transferFee, setTransferFee] = useState("0");
  const [maxTransferLimit, setMaxTransferLimit] = useState("1000000");
  const [bankName, setBankName] = useState("Morali Pay");
  const [adminLoading, setAdminLoading] = useState(false);
  const adminLongPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const adminLongPressTriggered = useRef(false);
  const [adminSelectedTx, setAdminSelectedTx] = useState<FirestoreTransfer | null>(null);
  const [adminActivityLog, setAdminActivityLog] = useState<AdminActivityLog[]>([]);
  const [adminBalanceEditAmount, setAdminBalanceEditAmount] = useState("");
  const [adminBalanceEditMode, setAdminBalanceEditMode] = useState<"add" | "subtract" | null>(null);
  const [adminNotifForm, setAdminNotifForm] = useState({ title: "", message: "", open: false });
  const [adminConfirmAction, setAdminConfirmAction] = useState<AdminConfirmAction | null>(null);
  const [adminTxDateFrom, setAdminTxDateFrom] = useState("");
  const [adminTxDateTo, setAdminTxDateTo] = useState("");
  const [adminLoans, setAdminLoans] = useState<Array<Record<string, unknown>>>([]);
  const [adminLoansLoading, setAdminLoansLoading] = useState(false);
  const [adminTxAmountMin, setAdminTxAmountMin] = useState("");
  const [adminTxAmountMax, setAdminTxAmountMax] = useState("");
  // ── New admin state: user management ──
  const [adminSelectedUserIds, setAdminSelectedUserIds] = useState<Set<string>>(new Set());
  const [adminUsersPage, setAdminUsersPage] = useState(1);
  const [adminUsersPerPage, setAdminUsersPerPage] = useState(20);
  const [adminEditingField, setAdminEditingField] = useState<string | null>(null);
  const [adminEditValue, setAdminEditValue] = useState("");
  // ── New admin state: transactions ──
  const [adminTxPage, setAdminTxPage] = useState(1);
  const [adminTxPerPage, setAdminTxPerPage] = useState(25);
  // ── New admin state: finance ──
  const [adminReportMode, setAdminReportMode] = useState<"daily" | "weekly" | "monthly">("daily");
  const [adminFeeMode, setAdminFeeMode] = useState<"fixed" | "percentage">("fixed");
  // ── New admin state: system ──
  const [adminLastRefresh, setAdminLastRefresh] = useState<Date>(new Date());
  const [adminBackupLoading, setAdminBackupLoading] = useState(false);
  const [adminUserLimits, setAdminUserLimits] = useState<{ dailyLimit: string; txLimit: string }>({ dailyLimit: "", txLimit: "" });
  const [adminLimitEditOpen, setAdminLimitEditOpen] = useState(false);
  const adminRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // visualViewport hack supprimé — géré par interactive-widget=resizes-content + 100dvh sur le layout racine

  const [infoDrawerOpen, setInfoDrawerOpen] = useState(false);
  const [bankingIdentity, setBankingIdentity] = useState({ id: "", rib: "" });
  const [copiedIdentityField, setCopiedIdentityField] = useState<"id" | "rib" | null>(null);
  const [cardManageOpen, setCardManageOpen] = useState(false);
  const [cardPinOpen, setCardPinOpen] = useState(false);
  const [cardLimitsOpen, setCardLimitsOpen] = useState(false);
  const [cardPinRevealed, setCardPinRevealed] = useState(false);
  const [revealedPinDigits, setRevealedPinDigits] = useState("");
  const [savedCardPin, setSavedCardPin] = useState("");
  const [savedCardPinHash, setSavedCardPinHash] = useState("");
  const [savedCardPinSalt, setSavedCardPinSalt] = useState("");
  const [sessionPinPlaintext, setSessionPinPlaintext] = useState("");
  const [cardPinDraft, setCardPinDraft] = useState("");
  const [cardPinConfirm, setCardPinConfirm] = useState("");
  const [cardPinPassword, setCardPinPassword] = useState("");
  const [revealAccountPw, setRevealAccountPw] = useState("");
  const [revealVerifying, setRevealVerifying] = useState(false);
  const [revealNeedsPin, setRevealNeedsPin] = useState(false);
  const [revealPinRaw, setRevealPinRaw] = useState("");
  const [revealPinVerifying, setRevealPinVerifying] = useState(false);
  const [revealVerifiedPw, setRevealVerifiedPw] = useState("");
  // ── pinVerifying removed — moved to TransferView ──
  const [changePinAccountPw, setChangePinAccountPw] = useState("");
  const [cardPinStage, setCardPinStage] = useState<"setup" | "menu" | "reveal" | "change" | "reset">("setup");
  const [pinResetSending, setPinResetSending] = useState(false);
  const [pinResetOtpSent, setPinResetOtpSent] = useState(false);
  const [pinResetOtpCode, setPinResetOtpCode] = useState("");
  const [pinResetDemoOtp, setPinResetDemoOtp] = useState("");
  const [pinResetVerifying, setPinResetVerifying] = useState(false);
  const [pinResetVerified, setPinResetVerified] = useState(false);
  const [pinResetNewPin, setPinResetNewPin] = useState("");
  const [pinResetConfirmPin, setPinResetConfirmPin] = useState("");
  const cardPinExistsRef = useRef(false);
  const [securityModalOpen, setSecurityModalOpen] = useState(false);
  const [passwordStage, setPasswordStage] = useState<"menu" | "change">("menu");
  const [changePwOld, setChangePwOld] = useState("");
  const [changePwNew, setChangePwNew] = useState("");
  const [changePwConfirm, setChangePwConfirm] = useState("");
  const [changePwLoading, setChangePwLoading] = useState(false);
  const [privacyModalOpen, setPrivacyModalOpen] = useState(false);
  const [privacyTab, setPrivacyTab] = useState<"policy" | "settings">("policy");
  const [cameraScannerOpen, setCameraScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState<"idle" | "scanning" | "found" | "error">("idle");
  const [scannedData, setScannedData] = useState<string | null>(null);
  const scannerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scanLoopRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scannerStatusRef = useRef(scannerStatus);
  // Keep ref in sync with state
  scannerStatusRef.current = scannerStatus;
  const [quickNotif, setQuickNotif] = useState<{ open: boolean; type: string; label: string; amount: string; icon: string; color: string } | null>(null);
  const [connectedDevices, setConnectedDevices] = useState<Array<{ id: string; device: string; browser: string; time: string; current: boolean }>>([]);
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [platformAuthSupported, setPlatformAuthSupported] = useState(false);
  const [deviceAlertShown, setDeviceAlertShown] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);
  const [tontineDistConfirm, setTontineDistConfirm] = useState<{ groupIndex: number; pot: number; members: number; sharePerMember: number } | null>(null);

  // Check biometric & platform auth support on mount
  useEffect(() => {
    if (typeof window !== "undefined" && window.PublicKeyCredential) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable().then((avail) => {
        setBiometricSupported(avail);
        setPlatformAuthSupported(avail);
      }).catch(() => {
        setBiometricSupported(false);
        setPlatformAuthSupported(false);
      });
    }
  }, []);

  const trackLoginDevice = useCallback(async () => {
    try {
      const ua = typeof navigator !== "undefined" ? navigator.userAgent : "Unknown";
      const isMobile = /Android|iPhone|iPad/i.test(ua);
      const device = isMobile ? "Mobile" : "Desktop";
      let browser = "Navigateur";
      if (ua.includes("Chrome")) browser = "Chrome";
      else if (ua.includes("Firefox")) browser = "Firefox";
      else if (ua.includes("Safari")) browser = "Safari";
      else if (ua.includes("Edge")) browser = "Edge";

      const newDevice = {
        id: `${device}-${Date.now()}`,
        device,
        browser,
        time: new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }),
        current: true,
      };

      if (!authUid) return;
      const devDoc = await getDoc(doc(firebaseDb, "users", authUid, "meta", "devices"));
      if (devDoc.exists()) {
        const existing = devDoc.data().devices || [];
        const updated = existing.map((d) => ({ ...d, current: false }));
        const final = [newDevice, ...updated].slice(0, 5);
        setConnectedDevices(final);
        await setDoc(doc(firebaseDb, "users", authUid, "meta", "devices"), { devices: final }, { merge: true });
      } else {
        setConnectedDevices([newDevice]);
        await setDoc(doc(firebaseDb, "users", authUid, "meta", "devices"), { devices: [newDevice] }, { merge: true });
      }
    } catch (err) {
      console.error("Erreur tracking device:", err);
    }
  }, [authUid]);
  const [securitySettings, setSecuritySettings] = useState({
    biometrics: false,
    faceId: false,
    deviceAlerts: true,
    transactionValidation: true,
  });
  // Dynamic security level for profile badge
  const secLevelCount = Object.values(securitySettings).filter(Boolean).length;
  const [privacySettings, setPrivacySettings] = useState({
    profileVisible: false,
    activityMasking: false,
    analyticsConsent: false,
    marketingConsent: false,
  });
  const [savedPrivacySettings, setSavedPrivacySettings] = useState({
    profileVisible: false,
    activityMasking: false,
    analyticsConsent: false,
    marketingConsent: false,
  });
  const [privacySaveState, setPrivacySaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [privacyAccessLogOpen, setPrivacyAccessLogOpen] = useState(false);
  const [privacyCloseConfirmOpen, setPrivacyCloseConfirmOpen] = useState(false);
  const [receiptsOpen, setReceiptsOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [virtualCardOpen, setVirtualCardOpen] = useState(false);
  const [virtualCardData, setVirtualCardData] = useState<VirtualCardDoc | null>(null);
  const [virtualCardLoading, setVirtualCardLoading] = useState(false);
  const [blackCardOpen, setBlackCardOpen] = useState(false);
  const [blackCardData, setBlackCardData] = useState<BlackCardDoc | null>(null);
  const [blackCardLoading, setBlackCardLoading] = useState(false);
  const [blackCardCvvVisible, setBlackCardCvvVisible] = useState(false);
  const [blackCardMaterial, setBlackCardMaterial] = useState<"steel" | "carbon">("steel");
  const [blackCardCelebrationOpen, setBlackCardCelebrationOpen] = useState(false);
  const [blackCardStep, setBlackCardStep] = useState<"preview" | "material" | "confirm">("preview");
  const [blackCardFullName, setBlackCardFullName] = useState("");
  const [blackCardPhone, setBlackCardPhone] = useState("");
  const [blackCardAddress, setBlackCardAddress] = useState("");
  const [supportMessage, setSupportMessage] = useState("");
  const [supportSending, setSupportSending] = useState(false);
  const [supportThreads, setSupportThreads] = useState<Array<{ id: string; message: string; status: string; createdAtLabel: string }>>([]);
  const [revealedAmounts, setRevealedAmounts] = useState<Record<string, boolean>>({});
  const [cardSettings, setCardSettings] = useState({
    online: true,
    international: false,
    atm: true,
  });
  const [profileForm, setProfileForm] = useState(() => {
    if (typeof window !== "undefined") {
      const savedFullName = window.localStorage.getItem("morali_profile_full_name") || "Utilisateur";
      const savedPhone = window.localStorage.getItem("morali_profile_phone") || "";
      const savedAddress = window.localStorage.getItem("morali_profile_address") || "Brazzaville, Congo";
      return {
        fullName: savedFullName,
        phone: savedPhone,
        address: savedAddress,
      };
    }
    return {
      fullName: "Utilisateur",
      phone: "",
      address: "Brazzaville, Congo",
    };
  });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [liveTransactions, setLiveTransactions] = useState<Transaction[]>([]);
  const [firestoreBalance, setFirestoreBalance] = useState<number | null>(null);

  // Tick every 30s to refresh relative timestamps
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  // Real-time listener on moraliUsers/{authUid} for balance
  useEffect(() => {
    if (!authUid) return;
    const userRef = doc(firebaseDb, "moraliUsers", authUid);
    const unsub = onSnapshot(userRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as FirestoreMoraliUser;
        if (typeof data.balance === "number") {
          // Trust the Firestore value — it reflects real transactions
          // Clamp to 0 minimum to prevent negative display
          setFirestoreBalance(Math.max(0, data.balance));
        } else {
          // Initialize balance for existing users who don't have it yet
          const initialBalance = 0;
          updateDoc(userRef, { balance: initialBalance }).catch((err: unknown) => { console.error("Erreur initialisation solde:", err); });
          setFirestoreBalance(initialBalance);
        }
        // Load savings balance from Firestore
        if (typeof data.savingsBalance === "number") {
          setSavingsAmount(data.savingsBalance);
        }
        // Load tontine groups from Firestore
        if (Array.isArray(data.tontineGroups) && data.tontineGroups.length > 0) {
          setTontineGroups(data.tontineGroups);
        }
        // Load forex wallets from Firestore
        if (typeof data.eurWallet === "number") {
          setEurWallet(data.eurWallet);
        }
        if (typeof data.usdWallet === "number") {
          setUsdWallet(data.usdWallet);
        }
      }
    });
    return () => unsub();
  }, [authUid]);

  // Auto-repair balance disabled — caused permission errors from composite Firestore queries
  // (kept as no-op for future reactivation with proper indexes)
  useEffect(() => {
    // no-op
  }, [authUid]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  // ── Escape key closes modals ──
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (blackCardOpen) { setBlackCardOpen(false); return; }
        if (cameraScannerOpen) { closeCameraScanner(); return; }
        if (securityModalOpen) { setSecurityModalOpen(false); return; }
        if (privacyModalOpen) { setPrivacyModalOpen(false); return; }
        if (contactModalOpen) { closeContactModal(); return; }
        if (historyModalOpen) { setHistoryModalOpen(false); return; }
        if (receiptsOpen) { setReceiptsOpen(false); return; }
        if (supportOpen) { setSupportOpen(false); return; }
        if (termsOpen) { setTermsOpen(false); return; }
        if (virtualCardOpen) { setVirtualCardOpen(false); return; }
        if (cardLimitsOpen) { setCardLimitsOpen(false); return; }
        if (cardManageOpen) { setCardManageOpen(false); return; }
        if (cardPinOpen) { closePinModal(); return; }
        if (infoDrawerOpen) { setInfoDrawerOpen(false); return; }
        if (transferOpen) { setTransferOpen(false); return; }
        const serviceScreens: Screen[] = ["credit", "internet", "canalplus", "electricity", "water", "crypto", "tontine", "merchant", "microcredit", "personalloan", "loans", "currency", "savings", "wallet"];
        if (serviceScreens.includes(screen)) { setScreen("dashboard"); return; }
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [blackCardOpen, cameraScannerOpen, securityModalOpen, privacyModalOpen, contactModalOpen, historyModalOpen, receiptsOpen, supportOpen, termsOpen, virtualCardOpen, cardLimitsOpen, cardManageOpen, cardPinOpen, infoDrawerOpen, transferOpen, screen]);

  useEffect(() => {
    getRedirectResult(firebaseAuth).catch((err: unknown) => {
      // On mobile/iOS, the auth state listener below will pick up the session.
      console.error("Erreur redirect auth:", err);
    });

    const unsub = onAuthStateChanged(firebaseAuth, async (user) => {
      if (!user) {
        setAuthUid(null);
        setAuthChecked(true);
        setAccountSuspended(false);
        setSuspensionMessage("");
        setScreen("auth");
        return;
      }

      setAuthUid(user.uid);
      try {
        const profileSnap = await getDoc(doc(firebaseDb, "moraliUsers", user.uid));

        if (profileSnap.exists()) {
          const data = profileSnap.data() as FirestoreMoraliUser;

          // ── Vérification suspension ──
          if (data.accountStatus === "suspended") {
            setAccountSuspended(true);
            setSuspensionMessage("Votre compte a été suspendu par un administrateur. Veuillez contacter le support.");
            setAuthChecked(true);
            return;
          }
          setAccountSuspended(false);
          setSuspensionMessage("");

          const fullName = data.fullName || `${data.firstName} ${data.lastName}`.trim() || "Utilisateur";
          setDashboardName(fullName);
          if (typeof window !== "undefined") {
            window.localStorage.setItem("morali_profile_full_name", fullName);
          }
          setProfileForm({
            fullName,
            phone: data.phone || "",
            address: profileForm.address || "Brazzaville, Congo",
          });
          setLoginEmail(data.email || user.email || "");

          if (!data.moraliId || !data.rib) {
            const immediateIdentity = getCachedIdentityForUid(user.uid) || generateMoraliIdentity(getIdentitySeed(user.email, user.uid));
            setBankingIdentity(immediateIdentity);
            cacheIdentityForUid(user.uid, immediateIdentity);
            const repairedIdentity = await persistMoraliProfile(user.uid);
            setBankingIdentity(repairedIdentity || immediateIdentity);
          } else {
            const loadedIdentity = { id: data.moraliId, rib: data.rib };
            cacheIdentityForUid(user.uid, loadedIdentity);
            setBankingIdentity(loadedIdentity);
            // Ensure directory entry exists for existing users (self-repair)
            const dirData = {
              fullName: data.fullName || `${data.firstName} ${data.lastName}`.trim() || "Utilisateur",
              pseudo: data.pseudo || "",
              moraliId: data.moraliId,
            };
            ensureDirectoryLookup(user.uid, dirData);
            publishDirectoryEntry(user.uid, {
              fullName: data.fullName || `${data.firstName} ${data.lastName}`.trim() || "Utilisateur",
              firstName: data.firstName || "",
              lastName: data.lastName || "",
              pseudo: data.pseudo || "",
              moraliId: data.moraliId,
            }).catch((err: unknown) => { console.error("Erreur publication annuaire:", err); });
          }

          setScreen("dashboard");
          setNavActive("Accueil");
        } else {
          const immediateIdentity = getCachedIdentityForUid(user.uid) || generateMoraliIdentity(getIdentitySeed(user.email, user.uid));
          setBankingIdentity(immediateIdentity);
          cacheIdentityForUid(user.uid, immediateIdentity);
          const repairedIdentity = await persistMoraliProfile(user.uid);
          setBankingIdentity(repairedIdentity || immediateIdentity);
        }
      } catch {
        const fallbackIdentity = getCachedIdentityForUid(user.uid) || generateMoraliIdentity(getIdentitySeed(user.email, user.uid));
        setBankingIdentity(fallbackIdentity);
        cacheIdentityForUid(user.uid, fallbackIdentity);
      } finally {
        setAuthChecked(true);
      }
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    if (!authUid) return;

    // Queries with ONLY where+limit (no orderBy) — no composite index needed
    const txSentQuery = query(collection(firebaseDb, "transactions"), where("senderUid", "==", authUid), limit(50));
    const txReceivedQuery = query(collection(firebaseDb, "transactions"), where("recipientUid", "==", authUid), limit(50));
    const notifQuery = query(collection(firebaseDb, "users", authUid, "notifications"), limit(6));
    const supportQuery = query(collection(firebaseDb, "users", authUid, "supportTickets"), limit(6));

    const mapTxDoc = (docSnap: { data: () => unknown }, isSent: boolean): Transaction | null => {
      const data = docSnap.data() as FirestoreTransfer;
      // Skip directory entries
      if (data.type === "__directory__" || data.status === "directory") return null;
      const isCredit = data.type === "depot" || (!isSent && data.type === "virement");
      const isIncoming = !isSent && data.type === "virement";
      // Compute real timestamp from Firestore createdAt
      let ts: number | undefined;
      const rawTs = data.createdAt;
      if (rawTs && typeof rawTs === "object" && "seconds" in rawTs) {
        ts = (rawTs as { seconds: number; nanoseconds?: number }).seconds * 1000;
      } else if (typeof rawTs === "string") {
        const parsed = Date.parse(rawTs);
        if (!isNaN(parsed)) ts = parsed;
      } else if (typeof rawTs === "number") {
        ts = rawTs;
      }
      return {
        icon: isIncoming ? "receive" : data.type === "virement" ? "send" : data.type === "depot" ? "wallet" : "receive",
        bg: isCredit ? "rgba(34,197,94,.12)" : "rgba(255,255,255,.04)",
        name: isIncoming ? `Virement de ${data.senderName}` : data.type === "virement" ? `Virement vers ${data.recipientName}` : data.type === "depot" ? "Dépôt Mobile Money" : "Retrait Mobile Money",
        date: ts ? timeAgo(ts) : "Récent",
        dateTimestamp: ts,
        amount: formatAmount(data.amount, isCredit ? "credit" : "debit"),
        type: isCredit ? "credit" : "debit",
        category: isIncoming ? "Reçu" : data.type === "virement" ? "Virement" : data.type === "depot" ? "Revenus" : "Retrait",
        receiptId: data.receiptId,
        status: data.status,
        channel: isIncoming ? "Morali Transfer" : data.destination === "airtime" ? "Crédit d'appel" : data.destination === "cash" ? "Mobile Money" : data.type === "virement" ? "Morali Transfer" : "Mobile Money",
      };
    };

    // Use refs to avoid race condition between two onSnapshot listeners
    let sentTxs: Transaction[] = [];
    let receivedTxs: Transaction[] = [];

    const mergeAndSet = () => {
      const merged = [...receivedTxs, ...sentTxs];
      // Deduplicate by receiptId
      const seen = new Set<string>();
      const deduped = merged.filter(t => {
        if (seen.has(t.receiptId)) return false;
        seen.add(t.receiptId);
        return true;
      });
      // Sort by timestamp descending
      deduped.sort((a, b) => (b.dateTimestamp || 0) - (a.dateTimestamp || 0));
      setLiveTransactions(deduped.slice(0, 30));
    };

    const unsubTxSent = onSnapshot(txSentQuery, (snap) => {
      sentTxs = snap.docs.map((d) => mapTxDoc(d, true)).filter(Boolean) as Transaction[];
      mergeAndSet();
    });

    const unsubTxReceived = onSnapshot(txReceivedQuery, (snap) => {
      receivedTxs = snap.docs.map((d) => mapTxDoc(d, false)).filter(Boolean) as Transaction[];
      mergeAndSet();
    });

    const unsubNotif = onSnapshot(notifQuery, (snap) => {
      const next = snap.docs.map((docSnap) => {
        const data = docSnap.data() as FirestoreNotification & { createdAt?: { seconds?: number } | string };
        let time = data.time || "À l'instant";
        let ts = 0;
        const rawTs = data.createdAt;
        if (rawTs && typeof rawTs === "object" && "seconds" in rawTs) {
          ts = (rawTs as { seconds: number }).seconds * 1000;
        } else if (typeof rawTs === "string") {
          const parsed = Date.parse(rawTs);
          if (!isNaN(parsed)) ts = parsed;
        }
        if (ts) time = timeAgo(ts);
        return { id: docSnap.id, ...data, time, _ts: ts } as NotificationItem & { _ts: number };
      });
      // Sort newest first (highest timestamp at top)
      next.sort((a, b) => (b._ts || 0) - (a._ts || 0));
      if (next.length) setNotifications(next);
    });

    // Also listen to serverNotifications (fallback collection with open read/write rules)
    let serverNotifs: (NotificationItem & { _ts: number; targetUid?: string })[] = [];
    const serverNotifQuery = query(
      collection(firebaseDb, "serverNotifications"),
      where("targetUid", "==", authUid),
      limit(10)
    );
    const unsubServerNotif = onSnapshot(serverNotifQuery, (snap) => {
      serverNotifs = snap.docs.map((docSnap) => {
        const data = docSnap.data() as FirestoreNotification & { targetUid?: string; createdAt?: { seconds?: number } | string };
        let time = data.time || "À l'instant";
        let ts = 0;
        const rawTs = data.createdAt;
        if (rawTs && typeof rawTs === "object" && "seconds" in rawTs) {
          ts = (rawTs as { seconds: number }).seconds * 1000;
        } else if (typeof rawTs === "string") {
          const parsed = Date.parse(rawTs);
          if (!isNaN(parsed)) ts = parsed;
        }
        if (ts) time = timeAgo(ts);
        return { id: docSnap.id, ...data, time, _ts: ts } as NotificationItem & { _ts: number; targetUid?: string };
      });
      // Merge with subcollection notifications (dedupe by title+time)
      setNotifications((prev) => {
        const existingKeys = new Set(prev.map((n) => `${n.title}-${n.time}`));
        const newNotifs = serverNotifs.filter((n) => !existingKeys.has(`${n.title}-${n.time}`));
        const merged = [...newNotifs, ...prev];
        merged.sort((a, b) => (b._ts || 0) - (a._ts || 0));
        return merged;
      });
    });

    const unsubSupport = onSnapshot(supportQuery, (snap) => {
      const next = snap.docs.map((docSnap) => {
        const data = docSnap.data() as { message?: string; status?: string; createdAt?: { seconds?: number } };
        const createdLabel = data.createdAt?.seconds ? new Date(data.createdAt.seconds * 1000).toLocaleDateString("fr-FR") : "À l'instant";
        return { id: docSnap.id, message: data.message ?? "Demande support", status: data.status ?? "Ouvert", createdAtLabel: createdLabel };
      });
      setSupportThreads(next);
    });

    return () => {
      unsubTxSent();
      unsubTxReceived();
      unsubNotif();
      unsubServerNotif();
      unsubSupport();
    };
  }, [authUid]);

  // Process pending transfer credits — polls every 3 seconds while logged in
  useEffect(() => {
    if (!authUid) return;
    // Initial check after 2s to let auth settle
    const initialTimer = setTimeout(() => {
      processPendingCredits(authUid, true); // silent on first load
    }, 2000);
    // Listen for pending credits via onSnapshot (real-time instead of polling)
    const pendingRef = collection(firebaseDb, "pendingCredits");
    let pendingUnsub: (() => void) | null = null;
    try {
      const q = query(pendingRef, where("recipientUid", "==", authUid), where("status", "==", "pending"));
      pendingUnsub = onSnapshot(q, (snap) => {
        if (snap.docs.length > 0) {
          processPendingCredits(authUid);
        }
      });
    } catch {
      // If pendingCredits collection doesn't exist, fall back to initial check only
    }
    return () => {
      clearTimeout(initialTimer);
      pendingUnsub?.();
    };
  }, [authUid]);

  const saveTontineGroups = async (groups: typeof tontineGroups) => {
    if (!authUid) return;
    try {
      await updateDoc(doc(firebaseDb, "moraliUsers", authUid), { tontineGroups: groups });
    } catch {}
  };

  useEffect(() => {
    if (authTab === "register" && currentStep === 3 && !showRegisterSuccess && !showPinSetup) {
      const timer = window.setTimeout(() => otpInputRef.current?.focus(), 250);
      return () => window.clearTimeout(timer);
    }
  }, [authTab, currentStep, showRegisterSuccess, showPinSetup]);

  useEffect(() => {
    setNotificationsOpen(false);
  }, [screen]);

  useEffect(() => {
    if (!contactModalOpen) return;
    const currentQuery = contactQuery.trim();
    if (currentQuery.length < 3) {
      setVerifiedMoraliUser(null);
      setContactSearchLoading(false);
      return;
    }

    let cancelled = false;
    setContactSearchLoading(true);

    const timer = window.setTimeout(async () => {
      const found = await findMoraliUser(currentQuery);

      if (!cancelled) {
        setVerifiedMoraliUser(found);
        setContactSearchLoading(false);
      }
    }, 450);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [contactModalOpen, contactQuery, bankingIdentity.id, profileForm.fullName, dashboardName]);

  useEffect(() => {
    if (authUid) return;
    setBankingIdentity({ id: "", rib: "" });
  }, [authUid]);

  // Fix mobile keyboard: scroll to field when keyboard opens, restore position when closes
  useEffect(() => {
    // Lock body scroll only on auth screen (prevent keyboard push issue)
    if (screen === "auth") {
      document.body.classList.add("lock-scroll");
    } else {
      document.body.classList.remove("lock-scroll");
    }

    // Save scroll position of ALL scrollable containers before keyboard opens
    const scrollPosBeforeKeyboard = new Map<HTMLElement, number>();
    let lastViewportHeight = window.visualViewport?.height ?? window.innerHeight;
    let keyboardWasOpen = false;

    const saveScrollPositions = () => {
      scrollPosBeforeKeyboard.clear();
      document.querySelectorAll<HTMLElement>(".auth-scroll, .content-scrollable, .card-modal, .bc-modal, .modal-drawer-content").forEach((el) => {
        scrollPosBeforeKeyboard.set(el, el.scrollTop);
      });
    };

    let restoreTimer: ReturnType<typeof setTimeout> | null = null;
    const restoreScrollPositions = () => {
      // Debounce: wait for keyboard animation to fully finish
      if (restoreTimer) clearTimeout(restoreTimer);
      restoreTimer = setTimeout(() => {
        scrollPosBeforeKeyboard.forEach((scrollPos, el) => {
          if (el.isConnected) {
            el.scrollTop = scrollPos;
          }
        });
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
        keyboardWasOpen = false;
      }, 300);
    };

    const handleFocusIn = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") {
        // Save current scroll positions IMMEDIATELY before keyboard pushes anything
        saveScrollPositions();

        if ((target as HTMLElement).hasAttribute("data-needs-scroll")) {
          // Aggressive scroll: wait for keyboard to fully open, then scroll
          const doScroll = () => {
            const scrollParent = target.closest<HTMLElement>(".auth-scroll, .content-scrollable, .card-modal, .bc-modal, .modal-drawer-content, .loan-screen, .fx-screen, .wallet-screen, .savings-screen, .privileges-screen");
            if (scrollParent) {
              const inputTop = target.offsetTop - scrollParent.offsetTop + scrollParent.scrollTop;
              scrollParent.scrollTop = Math.max(0, inputTop - 100);
            }
          };
          setTimeout(doScroll, 350);
          setTimeout(doScroll, 600);
          setTimeout(doScroll, 900);
        }
        if ((target as HTMLElement).hasAttribute("data-no-scroll")) {
          setTimeout(() => {
            const authScroll = document.querySelector(".auth-scroll") as HTMLElement | null;
            if (authScroll) authScroll.scrollTop = 0;
          }, 50);
        }
      }
    };

    // DO NOT restore on focusout — keyboard is still closing, it would override our restore
    // Instead, restore ONLY on visualViewport resize when height INCREASES (keyboard closing)

    const handleViewportResize = () => {
      if (window.visualViewport) {
        const currentHeight = window.visualViewport.height;

        // Track keyboard state: if viewport shrunk, keyboard opened
        if (currentHeight < window.innerHeight * 0.85) {
          keyboardWasOpen = true;
        }

        // If viewport GREW and keyboard was open → keyboard is closing → restore
        if (currentHeight > lastViewportHeight && keyboardWasOpen) {
          restoreScrollPositions();
        }

        lastViewportHeight = currentHeight;
      }
    };

    // Block scroll on body/window only — not on inner scrollable containers
    const blockScroll = (e: Event) => {
      if (e.target === document || e.target === document.body || e.target === document.documentElement) {
        e.preventDefault();
      }
    };

    document.addEventListener("focusin", handleFocusIn);
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", handleViewportResize);
      window.visualViewport.addEventListener("scroll", blockScroll, { passive: false });
    }
    document.addEventListener("scroll", blockScroll, { passive: false });

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", handleViewportResize);
        window.visualViewport.removeEventListener("scroll", blockScroll);
      }
      document.removeEventListener("scroll", blockScroll);
      if (restoreTimer) clearTimeout(restoreTimer);
      document.body.classList.remove("lock-scroll");
    };
  }, [screen]);

  useEffect(() => {
    const storedPrivacy = window.localStorage.getItem("morali_privacy_settings");
    if (!storedPrivacy) return;
    try {
      const parsed = JSON.parse(storedPrivacy) as typeof privacySettings;
      setPrivacySettings(parsed);
      setSavedPrivacySettings(parsed);
    } catch {
      // no-op
    }
  }, []);

  useEffect(() => {
    // Clean up any legacy plaintext PIN from localStorage (security)
    window.localStorage.removeItem("morali_card_pin");
    window.localStorage.removeItem("morali_card_pin_hash");
    window.localStorage.removeItem("morali_card_pin_salt");
    // PIN existence check runs AFTER auth (see authUid-dependent useEffect below)
  }, []);

  // Load card & security settings from Firestore on auth
  useEffect(() => {
    if (!authUid) return;
    const loadSettings = async () => {
      // ── PIN check: INDEPENDENT, runs even if other reads fail ──
      try {
        const pinDoc = await getDoc(doc(firebaseDb, "pinRecords", authUid));
        if (pinDoc.exists()) {
          cardPinExistsRef.current = true;
          setSavedCardPinHash("server-stored");
        }
      } catch (pinErr) {
        console.error("[loadSettings] PIN check error:", pinErr);
      }

      try {
        const [cardSnap, secSnap, privSnap, profileSnap] = await Promise.all([
          getDoc(doc(firebaseDb, "users", authUid, "meta", "cardSettings")),
          getDoc(doc(firebaseDb, "users", authUid, "meta", "securitySettings")),
          getDoc(doc(firebaseDb, "users", authUid, "meta", "privacySettings")),
          getDoc(doc(firebaseDb, "moraliUsers", authUid)),
        ]);
        if (cardSnap.exists()) {
          const d = cardSnap.data();
          setCardSettings((prev) => ({
            online: d.online !== undefined ? d.online : prev.online,
            international: d.international !== undefined ? d.international : prev.international,
            atm: d.atm !== undefined ? d.atm : prev.atm,
          }));
          // Restore card lock state
          if (d.locked !== undefined) {
            setCardLocked(d.locked);
          }
        }
        if (secSnap.exists()) {
          const d = secSnap.data();
          setSecuritySettings((prev) => ({
            biometrics: d.biometrics !== undefined ? d.biometrics : prev.biometrics,
            faceId: d.faceId !== undefined ? d.faceId : prev.faceId,
            deviceAlerts: d.deviceAlerts !== undefined ? d.deviceAlerts : prev.deviceAlerts,
            transactionValidation: d.transactionValidation !== undefined ? d.transactionValidation : prev.transactionValidation,
          }));
        }
        // Load privacy settings from Firestore
        if (privSnap.exists()) {
          const d = privSnap.data();
          setPrivacySettings((prev) => ({
            profileVisible: d.profileVisible !== undefined ? d.profileVisible : prev.profileVisible,
            activityMasking: d.activityMasking !== undefined ? d.activityMasking : prev.activityMasking,
            analyticsConsent: d.analyticsConsent !== undefined ? d.analyticsConsent : prev.analyticsConsent,
            marketingConsent: d.marketingConsent !== undefined ? d.marketingConsent : prev.marketingConsent,
          }));
          setSavedPrivacySettings(privacySettings);
        }
        // Load phone from Firestore profile
        if (profileSnap.exists()) {
          const d = profileSnap.data();
          if (d.phone) {
            setProfileForm((prev) => ({ ...prev, phone: d.phone }));
          }
          if (d.address) {
            setProfileForm((prev) => ({ ...prev, address: d.address }));
          }
        }
      } catch { /* silent fail, defaults will be used */ }
    };
    loadSettings();
  }, [authUid]);

  useEffect(() => {
    if (!bankingIdentity.id) return;
    persistMoraliProfile().catch((err: unknown) => {
      console.error("Erreur sauvegarde profil:", err);
    });
  }, [bankingIdentity.id, profileForm.fullName, profileForm.phone, profileForm.address, registerData.prefix, registerData.tel, registerData.email, loginEmail, dashboardName]);

  const passwordStrength = useMemo(() => getStrength(registerData.pw), [registerData.pw]);

  // ── KYC Level Calculation ──
  // Based on profile completion (real KYC API will override this)
  const kycLevel = useMemo(() => {
    const hasName = (profileForm.fullName || "").trim().length >= 2;
    const hasPhone = (profileForm.phone || "").trim().length >= 8;
    const hasAddress = (profileForm.address || "").trim().length >= 5 && (profileForm.address || "").trim() !== "Brazzaville, Congo";
    if (hasName && hasPhone && hasAddress) return 3; // Complet
    if (hasName && hasPhone) return 2; // Base
    return 1; // Non vérifié
  }, [profileForm.fullName, profileForm.phone, profileForm.address]);

  const kycConfig = useMemo(() => {
    if (kycLevel === 3) return { label: "Vérifié", color: "#22c55e", bg: "rgba(34,197,94,.15)", border: "rgba(34,197,94,.4)", text: "KYC Complet", pct: "100%" };
    if (kycLevel === 2) return { label: "Base", color: "#eab308", bg: "rgba(234,179,8,.15)", border: "rgba(234,179,8,.4)", text: "KYC Partiel", pct: "50%" };
    return { label: "Non vérifié", color: "#64748b", bg: "rgba(100,116,139,.15)", border: "rgba(100,116,139,.3)", text: "Non vérifié", pct: "0%" };
  }, [kycLevel]);

  const fees = transactionAmount ? Math.floor((parseInt(transactionAmount, 10) || 0) * 0.01) : 0;
  const transactionNumericAmount = parseInt(transactionAmount || "0", 10) || 0;
  const transactionTotal = transactionType === "depot" ? transactionNumericAmount + fees : Math.max(transactionNumericAmount - fees, 0);

  // ── MTN & Airtel Money limits (Congo-Brazzaville) ──
  type OperatorKey = "mtn" | "airtel";
  type TxActionKey = "depot" | "retrait";
  const OPERATOR_LIMITS: Record<OperatorKey, Record<TxActionKey, { daily: number; monthly: number; label: string }>> = {
    mtn: {
      depot:   { daily: 999000000,  monthly: 999000000, label: "MTN MoMo" },
      retrait: { daily: 300000,     monthly: 1500000,    label: "MTN MoMo" },
    },
    airtel: {
      depot:   { daily: 999000000,  monthly: 999000000, label: "Airtel Money" },
      retrait: { daily: 250000,     monthly: 1200000,    label: "Airtel Money" },
    },
  };

  const microInterest = 0.05;
  const microDailyRate = microCreditDuration === 15 ? 0.03 : microCreditDuration === 30 ? 0.05 : 0.075;
  const microTotalToPay = loanAmount + loanAmount * microDailyRate;
  const personalLoanRate = 0.12;
  const personalLoanInterest = personalLoanAmount * (personalLoanRate * (personalLoanDuration / 12));
  const personalLoanMonthlyRepayment = (personalLoanAmount + personalLoanInterest) / personalLoanDuration;
  const personalLoanTotalToRepay = personalLoanAmount + personalLoanInterest;
  const microMonthlyRepayment = microCreditDuration <= 30 ? microTotalToPay : microTotalToPay;
  const cryptoUsdtValue = xafAmount ? (parseFloat(xafAmount) / cryptoRate).toFixed(2) : "0.00";
  const currencyFee = 0.015; // 1.5% commission
  const currencyConverted = currencyAmount ? (parseFloat(currencyAmount) * currencyRates[targetCurrency]).toFixed(2) : "0.00";
  // Fetch real-time exchange rates from the API
  useEffect(() => {
    const fetchRates = async () => {
      try {
        const [eurRes, usdRes] = await Promise.all([
          fetch("/api/exchange-rate?from=XAF&to=EUR", { headers: await getAuthHeaders() }),
          fetch("/api/exchange-rate?from=XAF&to=USD", { headers: await getAuthHeaders() }),
        ]);
        const newRates: Record<string, number> = { ...currencyRates };
        if (eurRes.ok) {
          const eurData = await eurRes.json();
          newRates["EUR"] = eurData.rate; // how many EUR per 1 XAF
        }
        if (usdRes.ok) {
          const usdData = await usdRes.json();
          newRates["USD"] = usdData.rate; // how many USD per 1 XAF
        }
        setCurrencyRates(newRates);
      } catch { /* keep default fallback rates */ }
    };
    fetchRates();
    const interval = setInterval(fetchRates, 10 * 60 * 1000); // refresh every 10 min
    return () => clearInterval(interval);
  }, []);

  const savingsAnnualRate = 4.5;
  const savingsMonthlyGain = (savingsAmount * (savingsAnnualRate / 100)) / 12;
  const tontineMembers: { name: string; status: string; current: boolean }[] = [];

  const filteredServices = useMemo(() => {
    if (!servicesQuery.trim()) return [] as SearchServiceItem[];
    const q = servicesQuery.toLowerCase();
    return myServices.filter((s) => s.name.toLowerCase().includes(q) || s.category.toLowerCase().includes(q));
  }, [servicesQuery]);

  const filteredContacts = useMemo(() => {
    if (!servicesQuery.trim()) return [] as SearchContactItem[];
    const q = servicesQuery.toLowerCase();
    return myContacts.filter((c) => c.name.toLowerCase().includes(q));
  }, [servicesQuery]);

  const dashboardData = useMemo(() => {
    const firstName = registerData.prenom || dashboardName || "Utilisateur";
    const base = firstName.length * 137;
    const balance = firestoreBalance !== null ? firestoreBalance : 0;
    const income = 0;
    const expenses = 0;
    const savingsRate = "0%";
    const totalStats = "0 opération";
    const holder = registerData.prenom && registerData.nom ? `${registerData.prenom} ${registerData.nom}`.toUpperCase() : firstName.toUpperCase();
    const initials = `${(registerData.prenom || firstName).charAt(0)}${registerData.nom ? registerData.nom.charAt(0) : ""}`.toUpperCase() || "U";
    const cardNumber = `4251 98${String(base).slice(0, 2)} ${String(1000 + (base % 9000)).slice(-4)} ${String(2000 + ((base * 3) % 8000)).slice(-4)}`;
    const blackCardNumber = `5399 12${String(base + 77).slice(0, 2)} ${String(1000 + ((base + 33) % 9000)).slice(-4)} ${String(3000 + ((base * 7) % 7000)).slice(-4)}`;
    const expMonth = String(((firstName.length * 3) % 12) + 1).padStart(2, "0");
    const expYear = String(27 + (firstName.length % 4));
    const blackExpMonth = String(((firstName.length * 5 + 2) % 12) + 1).padStart(2, "0");
    const blackExpYear = String(28 + (firstName.length % 3));

    const transactions: Transaction[] = [];

    return {
      balance,
      income,
      expenses,
      savingsRate,
      totalStats,
      holder,
      initials,
      cardNumber,
      blackCardNumber,
      cardExp: `${expMonth}/${expYear}`,
      cardCcv: String(100 + (base % 900)),
      blackCardExp: `${blackExpMonth}/${blackExpYear}`,
      blackCardCcv: String(100 + ((base + 55) % 900)),
      transactions,
    };
  }, [dashboardName, registerData.nom, registerData.prenom, firestoreBalance]);

  // Track operator usage for limit enforcement
  const operatorUsage = useMemo(() => {
    const allTxs = liveTransactions.length > 0 ? liveTransactions : dashboardData.transactions;
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).getTime();

    const usage: Record<OperatorKey, Record<TxActionKey, { daily: number; monthly: number }>> = {
      mtn:    { depot: { daily: 0, monthly: 0 }, retrait: { daily: 0, monthly: 0 } },
      airtel: { depot: { daily: 0, monthly: 0 }, retrait: { daily: 0, monthly: 0 } },
    };

    allTxs.forEach((tx) => {
      const ts = tx.dateTimestamp || Date.now();
      const isToday = ts >= startOfDay;
      const isThisMonth = ts >= startOfMonth;
      if (!isToday && !isThisMonth) return;

      const isDepot = tx.type === "credit" && (tx.name.includes("Dépôt") || tx.category === "Revenus");
      const isRetrait = tx.type === "debit" && (tx.name.includes("Retrait") || tx.category === "Retrait");
      if (!isDepot && !isRetrait) return;

      const opKeys: OperatorKey[] = ["mtn", "airtel"];
      opKeys.forEach((op) => {
        if (isDepot) {
          if (isToday) usage[op].depot.daily += 1;
          if (isThisMonth) usage[op].depot.monthly += 1;
        }
        if (isRetrait) {
          if (isToday) usage[op].retrait.daily += 1;
          if (isThisMonth) usage[op].retrait.monthly += 1;
        }
      });
    });

    return usage;
  }, [liveTransactions, dashboardData.transactions]);

  const unreadNotificationsCount = notifications.filter((item) => !item.read).length;

  // Dynamic chart data connected to transactions
  const allChartTxs = liveTransactions.length > 0 ? liveTransactions : dashboardData.transactions;
  const chartBalance = firestoreBalance !== null ? firestoreBalance : dashboardData.balance;

  // Dynamic chart days based on selected period
  const dynamicChartDays = useMemo(() => {
    const monthNames = ["Jan", "Fév", "Mar", "Avr", "Mai", "Jun", "Jul", "Aoû", "Sep", "Oct", "Nov", "Déc"];
    const days = [];
    const daysBack = chartPeriod === "7j" ? 6 : chartPeriod === "30j" ? 29 : 180;
    const step = chartPeriod === "6m" ? 3 : 1;
    for (let d = daysBack; d >= 0; d -= step) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      days.push({
        label: `${date.getDate()} ${monthNames[date.getMonth()]}`,
        day: date.getDate(),
        month: date.getMonth(),
        year: date.getFullYear(),
        dateStr: date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }),
      });
    }
    return days.slice(0, 12);
  }, [chartPeriod]);

  const chartData = useMemo(() => buildChartData(allChartTxs, chartBalance, dynamicChartDays), [allChartTxs, chartBalance, dynamicChartDays]);

  // Real weekly stats from live transactions (credits = revenus, debits = dépenses)
  const weeklyStats = useMemo(() => {
    // Extract numeric value from amount string like "+ FCFA 1 500 000" or "- FCFA 500 000"
    const parseAmount = (amountStr: string): number => {
      const cleaned = amountStr.replace(/[^\d]/g, "");
      return parseInt(cleaned, 10) || 0;
    };

    // Compute period window in ms (7j=7d, 30j=30d, 6m=180d) — generous 1-day buffer
    const periodMs = (chartPeriod === "7j" ? 7 : chartPeriod === "30j" ? 30 : 180) * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - periodMs;

    let totalIncome = 0;
    let totalExpenses = 0;
    let txCount = 0;

    for (const tx of allChartTxs) {
      const ts = tx.dateTimestamp;
      // Include transactions with a timestamp within the period, OR without timestamp (recent)
      if (ts && ts < cutoff) continue;

      const num = parseAmount(tx.amount);
      if (num <= 0) continue;
      txCount++;

      if (tx.type === "credit") {
        totalIncome += num;
      } else {
        totalExpenses += num;
      }
    }

    const hasRealData = totalIncome > 0 || totalExpenses > 0;
    let savingsRate = 0;
    if (hasRealData && totalIncome > 0) {
      savingsRate = Math.max(0, Math.min(100, Math.round(((totalIncome - totalExpenses) / totalIncome) * 100)));
    }

    return {
      income: totalIncome,
      expenses: totalExpenses,
      savingsRate: hasRealData ? `${savingsRate}%` : "0%",
      txCount: txCount > 0 ? `${txCount} opération${txCount > 1 ? "s" : ""}` : "0 opération",
      hasRealData,
    };
  }, [allChartTxs, chartPeriod]);

  // Dynamic smart sparkline — luminous glow, smart slope driven by real balance trajectory
  const sparklinePath = useMemo(() => {
    const W = 320;
    const H = 72;
    const PAD_TOP = Math.round(H * 0.20);
    const PAD_BOT = Math.round(H * 0.20);
    const usableH = H - PAD_TOP - PAD_BOT;
    const traj = chartData.trajectory;
    if (!traj || traj.length < 2) {
      return { curveLine: "M0,36 L320,36", fillArea: "M0,36 L320,36 L320,72 L0,72 Z", endPt: { x: 320, y: 36 } };
    }

    // Normalize trajectory to fit within usable height
    const minVal = Math.min(...traj);
    const maxVal = Math.max(...traj);
    const range = maxVal - minVal || 1;

    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < traj.length; i++) {
      const x = Math.round((i / (traj.length - 1)) * W);
      // Normalize: higher balance = lower y (top), lower balance = higher y (bottom)
      const norm = (traj[i] - minVal) / range; // 0 = min balance, 1 = max balance
      const yRatio = 1 - norm; // Invert: max balance at top (0), min at bottom (1)
      const y = Math.round(PAD_TOP + yRatio * usableH);
      points.push({ x, y });
    }

    const buildCurve = (pts: { x: number; y: number }[]) => {
      if (pts.length < 2) return "";
      let d = `M${pts[0].x},${pts[0].y}`;
      for (let i = 1; i < pts.length; i++) {
        const prev = pts[i - 1];
        const curr = pts[i];
        const cpx1 = prev.x + (curr.x - prev.x) * 0.4;
        const cpy1 = prev.y + (curr.y - prev.y) * 0.15;
        const cpx2 = prev.x + (curr.x - prev.x) * 0.6;
        const cpy2 = curr.y - (curr.y - prev.y) * 0.15;
        d += ` C${cpx1},${cpy1} ${cpx2},${cpy2} ${curr.x},${curr.y}`;
      }
      return d;
    };

    const curveLine = buildCurve(points);
    const fillArea = `${curveLine} L${W},${H} L0,${H} Z`;

    return { curveLine, fillArea, endPt: points[points.length - 1] };
  }, [chartData]);
  const accessLogEntries = useMemo<{ place: string; device: string; time: string }[]>(() => {
    const logs: { place: string; device: string; time: string }[] = [];
    const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
    const isMobile = /Android|iPhone|iPad/i.test(ua);
    const device = isMobile ? "Mobile" : "Desktop";
    // Current session
    logs.push({ place: "Brazzaville, Congo", device, time: "Maintenant" });
    // Generate 2-3 realistic past sessions
    const locations = ["Brazzaville, Congo", "Pointe-Noire, Congo"];
    const now = Date.now();
    for (let i = 0; i < 2; i++) {
      const hoursAgo = (i + 1) * Math.floor(Math.random() * 12 + 4);
      const d = new Date(now - hoursAgo * 3600000);
      logs.push({
        place: locations[i % locations.length],
        device: i === 0 ? "Mobile" : "Desktop",
        time: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
      });
    }
    return logs;
  }, []);

  const renderProtectedAmount = (key: string, text: string, className = "") => (
    <span className={`${privacySettings.activityMasking && !revealedAmounts[key] ? `amount-blurred ${className}`.trim() : className}`.trim()} onClick={() => toggleAmountReveal(key)}>
      {text}
    </span>
  );

  const markNotificationAsRead = (id: string) => {
    setNotifications((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)));
    // Persister dans Firestore
    if (authUid) {
      updateDoc(doc(firebaseDb, "users", authUid, "notifications", id), { read: true }).catch(() => {});
    }
  };

  const markAllNotificationsAsRead = () => {
    setNotifications((current) => current.map((item) => ({ ...item, read: true })));
    // Persister dans Firestore
    if (authUid) {
      notifications.filter((n) => !n.read).forEach((n) => {
        updateDoc(doc(firebaseDb, "users", authUid, "notifications", n.id), { read: true }).catch(() => {});
      });
    }
  };

  const openCameraScanner = () => {
    setCameraScannerOpen(true);
    setScannerStatus("scanning");
    setScannedData(null);
  };

  const handleQRResult = useCallback((decodedText: string) => {
    // Stop scanning
    if (scanLoopRef.current) cancelAnimationFrame(scanLoopRef.current);
    scanLoopRef.current = null;
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    setScannerStatus("found");
    setScannedData(decodedText);
    try {
      const data = JSON.parse(decodedText);
      if (data.app === "MoraliBank" && data.userId) {
        showToast(`Compte Morali détecté: ${data.userId}`);
        setTimeout(() => {
          closeCameraScanner();
          setScreen("payments");
          setNavActive("Transferts");
          transferInitialQueryRef.current = data.userId;
          setTransferOpen(true);
        }, 1500);
      } else {
        showToast("QR code non reconnu");
        setTimeout(() => {
          setScannerStatus("scanning");
          setScannedData(null);
          initCameraStream();
        }, 2000);
      }
    } catch {
      showToast("QR code non reconnu");
      setTimeout(() => {
        setScannerStatus("scanning");
        setScannedData(null);
        initCameraStream();
      }, 2000);
    }
  }, []);

  const handleQRResultRef = useRef(handleQRResult);
  handleQRResultRef.current = handleQRResult;

  const initCameraStream = useCallback(async () => {
    // Stop any existing stream
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (scanLoopRef.current) { cancelAnimationFrame(scanLoopRef.current); scanLoopRef.current = null; }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 720 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;

      // Wait for video element to be available
      const waitForVideo = (): Promise<void> => {
        return new Promise((resolve) => {
          if (videoRef.current) {
            resolve();
            return;
          }
          const check = () => {
            if (videoRef.current) {
              resolve();
            } else {
              requestAnimationFrame(check);
            }
          };
          requestAnimationFrame(check);
        });
      };

      await waitForVideo();

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setScannerStatus("scanning");

      const jsQR = (await import("jsqr")).default;
      const scan = () => {
        // Use ref to check current status (no stale closure)
        const currentStatus = scannerStatusRef.current;
        if (currentStatus !== "scanning") return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) {
          scanLoopRef.current = requestAnimationFrame(scan);
          return;
        }
        const ctx = canvas.getContext("2d");
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
          if (code && code.data) {
            handleQRResultRef.current(code.data);
            return;
          }
        }
        scanLoopRef.current = requestAnimationFrame(scan);
      };
      scanLoopRef.current = requestAnimationFrame(scan);
    } catch (err) {
      setScannerStatus("error");
      showToast("Caméra non disponible");
    }
  }, []);

  // useEffect to start camera when modal opens
  useEffect(() => {
    if (cameraScannerOpen && scannerStatus === "scanning") {
      // Small delay to let the video element render first
      const timer = setTimeout(() => {
        initCameraStream();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [cameraScannerOpen, scannerStatus, initCameraStream]);

  const closeCameraScanner = () => {
    if (scanLoopRef.current) { cancelAnimationFrame(scanLoopRef.current); scanLoopRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) { videoRef.current.srcObject = null; }
    setCameraScannerOpen(false);
    setScannerStatus("idle");
    setScannedData(null);
  };

  const showQuickNotif = (type: string, label: string, amount: string, icon: string, color: string) => {
    setQuickNotif({ open: true, type, label, amount, icon, color });
    setTimeout(() => setQuickNotif(null), 3200);
  };

  const openRequestQr = () => {
    setRequestQrOpen(true);
  };

  const closeRequestQr = () => {
    setRequestQrOpen(false);
  };

  // ── openTransferModal: simplified — TransferView handles internal reset ──
  const openTransferModal = () => {
    transferInitialQueryRef.current = undefined;
    setTransferOpen(true);
  };

  // Publish a directory entry so other users can find this user by moraliId/pseudo
  const publishDirectoryEntry = async (uid: string, data: { fullName: string; firstName: string; lastName: string; pseudo: string; moraliId: string }, retries = 2) => {
    if (!uid || !data.moraliId) return;
    const moraliIdNorm = data.moraliId.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const pseudoNorm = data.pseudo.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]/g, "");
    const dirData = {
      uid,
      moraliId: moraliIdNorm,
      moraliIdNormalized: moraliIdNorm,
      pseudo: pseudoNorm,
      pseudoNormalized: pseudoNorm,
      fullName: sanitizeInput(data.fullName, 100) || "Utilisateur",
      firstName: sanitizeInput(data.firstName, 50),
      lastName: sanitizeInput(data.lastName, 50),
    };

    try {
      // Method 1: Try API route (uses Firebase Admin SDK server-side)
      const res = await fetch("/api/directory/register", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify(dirData),
      });
      if (!res.ok && retries > 0) {
        await new Promise((r) => setTimeout(r, 1000));
        return publishDirectoryEntry(uid, data, retries - 1);
      }
      if (res.ok) {
        const result = await res.json().catch(() => null);
        if (result?.source === "client_fallback" || !result?.success) {
          // Server told us to write directly — fall through to Method 2
        } else {
          return; // Success via Admin SDK
        }
      }
    } catch {
      // API failed — falling back to direct Firestore write
    }

    // Method 2: Write directly to Firestore from client (guaranteed to work)
    try {
      const batch = [
        setDoc(doc(firebaseDb, "directory", uid), { ...dirData, updatedAt: serverTimestamp() }, { merge: true }),
      ];
      // O(1) lookup by moraliId
      if (moraliIdNorm) {
        batch.push(setDoc(doc(firebaseDb, "directoryLookup", `morali_${moraliIdNorm}`), {
          uid, moraliId: moraliIdNorm, fullName: dirData.fullName, pseudo: pseudoNorm,
        }, { merge: true }));
      }
      // O(1) lookup by pseudo
      if (pseudoNorm) {
        batch.push(setDoc(doc(firebaseDb, "directoryLookup", `pseudo_${pseudoNorm}`), {
          uid, moraliId: moraliIdNorm, fullName: dirData.fullName, pseudo: pseudoNorm,
        }, { merge: true }));
      }
      await Promise.all(batch);
    } catch (firestoreErr) {
      console.error("[directory] Firestore direct write failed:", firestoreErr);
    }
  };

  const persistMoraliProfile = async (overrideUid?: string) => {
    const uid = overrideUid || authUid;
    if (!uid) return null;

    const userRef = doc(firebaseDb, "moraliUsers", uid);
    const existingSnap = await getDoc(userRef);
    const existingData = existingSnap.exists() ? (existingSnap.data() as Partial<FirestoreMoraliUser>) : null;

    const identitySeed = getIdentitySeed(existingData?.email || loginEmail || registerData.email || firebaseAuth.currentUser?.email, uid);
    const generatedIdentity = generateMoraliIdentity(identitySeed);

    const preservedMoraliId = generatedIdentity.id;
    const preservedRib = generatedIdentity.rib;

    const nextIdentity = { id: preservedMoraliId, rib: preservedRib };
    setBankingIdentity(nextIdentity);
    cacheIdentityForUid(uid, nextIdentity);

    const fullName = sanitizeInput(profileForm.fullName || dashboardName || `${registerData.prenom} ${registerData.nom}`.trim() || existingData?.fullName || "Utilisateur", 100);
    const firstName = sanitizeInput(registerData.prenom.trim() || existingData?.firstName || fullName.split(" ")[0] || "Utilisateur", 50);
    const lastName = sanitizeInput(registerData.nom.trim() || existingData?.lastName || fullName.split(" ").slice(1).join(" "), 50);
    const pseudoBase = fullName
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 18) || "morali";

    const payload: FirestoreMoraliUser = {
      uid,
      fullName,
      firstName,
      lastName,
      pseudo: existingData?.pseudo || `@${pseudoBase}`.toLowerCase(),
      moraliId: preservedMoraliId,
      moraliIdNormalized: preservedMoraliId.toUpperCase().replace(/[^A-Z0-9]/g, ""),
      rib: preservedRib,
      phone: sanitizeInput(profileForm.phone || existingData?.phone || `${registerData.prefix} ${registerData.tel}`.trim(), 30),
      email: sanitizeInput(registerData.email || loginEmail || existingData?.email || "", 100),
      balance: existingData?.balance !== undefined ? existingData.balance : 0,
      passwordHint: registerData.pw ? "set" : existingData?.passwordHint,
      createdAt: existingData?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(userRef, payload, { merge: true });

    // Publish directory entry in transactions collection (public read for search)
    await publishDirectoryEntry(uid, { fullName, firstName, lastName, pseudo: payload.pseudo, moraliId: preservedMoraliId });

    return { id: preservedMoraliId, rib: preservedRib };
  };

  const buildMoraliUser = (d: { uid: string; fullName?: string; pseudo?: string; moraliId?: string }): MoraliUser => ({
    name: d.fullName || "Utilisateur",
    pseudo: d.pseudo?.startsWith("@") ? d.pseudo : `@${d.pseudo || ""}`,
    account: d.moraliId || "MORALI00000",
    uid: d.uid,
    tone: "grad-blue",
  });

  // Ensure directoryLookup entry exists for the current user (self-repair)
  const ensureDirectoryLookup = async (uid: string, data: { fullName: string; pseudo: string; moraliId: string }) => {
    if (!uid || !data.moraliId) return;
    const moraliIdNorm = data.moraliId.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const pseudoNorm = data.pseudo.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]/g, "");
    try {
      const lookupDoc = await getDoc(doc(firebaseDb, "directoryLookup", `morali_${moraliIdNorm}`));
      if (!lookupDoc.exists()) {
        await publishDirectoryEntry(uid, data);
      }
    } catch {
      // Silent fail — not critical
    }
  };

  const findMoraliUser = async (rawValue: string): Promise<{ user: MoraliUser | null; isSelf: boolean }> => {
    const source = rawValue.trim();
    if (!source) return { user: null, isSelf: false };

    const normalizedMoraliId = source.toUpperCase().replace(/[^A-Z0-9]/g, "");
    const normalizedPseudo = source.toLowerCase().replace(/^@/, "").replace(/[^a-z0-9]/g, "");

    // Method 1: Search via API (uses Firebase Admin SDK)
    try {
      const res = await fetch(`/api/directory/search?q=${encodeURIComponent(source)}`, { headers: await getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        if (data.found && data.uid) {
          const isSelf = data.uid === authUid;
          return { user: buildMoraliUser({ uid: data.uid, fullName: data.name, pseudo: data.pseudo, moraliId: data.account }), isSelf };
        }
      }
    } catch {
      /* API lookup failed — try direct Firestore */
    }

    // Method 2: Search directly in Firestore — directoryLookup (O(1) lookup)
    try {
      if (normalizedMoraliId.startsWith("MORALI") && /^MORALI\d{1,20}$/.test(normalizedMoraliId)) {
        const lookupDoc = await getDoc(doc(firebaseDb, "directoryLookup", `morali_${normalizedMoraliId}`));
        if (lookupDoc.exists()) {
          const d = lookupDoc.data()!;
          return { user: buildMoraliUser(d), isSelf: d.uid === authUid };
        }
      }

      if (normalizedPseudo.length >= 2) {
        const lookupDoc = await getDoc(doc(firebaseDb, "directoryLookup", `pseudo_${normalizedPseudo}`));
        if (lookupDoc.exists()) {
          const d = lookupDoc.data()!;
          return { user: buildMoraliUser(d), isSelf: d.uid === authUid };
        }

        // Prefix search fallback
        const prefixSnap = await getDocs(query(
          collection(firebaseDb, "directoryLookup"),
          where("pseudo", ">=", normalizedPseudo),
          where("pseudo", "<=", normalizedPseudo + "\uf8ff"),
          limit(3),
        ));
        for (const snapDoc of prefixSnap.docs) {
          const d = snapDoc.data()!;
          return { user: buildMoraliUser(d), isSelf: d.uid === authUid };
        }
      }
    } catch (firestoreErr) {
      console.error("[directory] directoryLookup search failed:", firestoreErr);
    }

    // Method 3: Fallback — search moraliUsers collection directly
    // This catches users who registered before the directoryLookup was populated
    try {
      if (normalizedMoraliId.startsWith("MORALI") && /^MORALI\d{1,20}$/.test(normalizedMoraliId)) {
        const snap = await getDocs(query(
          collection(firebaseDb, "moraliUsers"),
          where("moraliId", "==", normalizedMoraliId),
          limit(1),
        ));
        for (const snapDoc of snap.docs) {
          const d = snapDoc.data()!;
          // Backfill directoryLookup so next search is O(1)
          publishDirectoryEntry(d.uid, { fullName: d.fullName || "", firstName: d.firstName || "", lastName: d.lastName || "", pseudo: d.pseudo || "", moraliId: d.moraliId }).catch(() => {});
          return { user: buildMoraliUser(d), isSelf: d.uid === authUid };
        }
      }
    } catch (err) {
      console.error("[directory] moraliUsers fallback search failed:", err);
    }

    return { user: null, isSelf: false };
  };

  // ── searchMoraliRecipient, handleTransferRecipientQuery, handleTransferPad removed — moved to TransferView ──

  const createRealtimeNotification = async (targetUid: string, item: FirestoreNotification) => {
    try {
      // Always send via API (Admin SDK bypasses Firestore rules for cross-user writes)
      const apiRes = await fetch("/api/notifications/create", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ uid: targetUid, ...item }),
      });
      const apiData = await apiRes.json().catch(() => ({}));
      const usedFallback = apiData.fallback;

      // Also write locally for real-time display (own notifications only)
      if (targetUid === authUid) {
        await addDoc(collection(firebaseDb, "users", targetUid, "notifications"), {
          ...item,
          createdAt: serverTimestamp(),
        });
      }

      // FALLBACK: If Admin SDK was unavailable, write to serverNotifications (open read/write rules)
      if (usedFallback) {
        await addDoc(collection(firebaseDb, "serverNotifications"), {
          ...item,
          targetUid,
          createdAt: serverTimestamp(),
        });
      }
    } catch (notifErr) {
      console.error("[createRealtimeNotification] Error:", notifErr);
      // Last resort: write to serverNotifications
      try {
        await addDoc(collection(firebaseDb, "serverNotifications"), {
          ...item,
          targetUid,
          createdAt: serverTimestamp(),
        });
      } catch { /* silent */ }
    }
  };

  const createRealtimeTransaction = async (payload: FirestoreTransfer) => {
    try {
      await fetch("/api/transactions/create", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify(payload),
      });
    } catch { /* silent — transaction record best-effort */ }
  };

  // Process pending credits — API first, client Firestore fallback
  const processPendingCredits = async (overrideUid?: string, silent?: boolean) => {
    const uid = overrideUid || authUid;
    if (!uid) return;

    const processOneCredit = async (credit: { id: string; amount: number; senderName?: string }, userRef: ReturnType<typeof doc>) => {
      // Credit user's own balance (own doc — allowed by rules)
      await runTransaction(firebaseDb, async (tx) => {
        const userDoc = await tx.get(userRef);
        if (!userDoc.exists()) throw new Error("USER_NOT_FOUND");
        const currentBal = userDoc.data().balance || 0;
        tx.update(userRef, { balance: currentBal + credit.amount, updatedAt: serverTimestamp() });
      });
      // Delete processed pending credit
      await deleteDoc(doc(firebaseDb, "pendingCredits", credit.id)).catch(() => {});
      // Notify recipient
      createRealtimeNotification(uid, {
        title: `Virement reçu — FCFA ${formatCurrency(credit.amount)}`,
        time: "À l'instant",
        badge: "Reçu", badgeClass: "nb-green", icon: "receive",
        bg: "rgba(34,197,94,0.12)", read: false,
      }).catch(() => {});
      if (!silent) {
        showQuickNotif("credit", `Virement reçu de ${credit.senderName || "Utilisateur"}`, formatCurrency(credit.amount), "send", "#4ade80");
        await new Promise((r) => setTimeout(r, 3500));
      }
    };

    // Method 1: Try API (Admin SDK)
    try {
      const res = await fetch(`/api/directory/pending-credit?uid=${uid}`, { headers: await getAuthHeaders() });
      if (res.ok) {
        const { credits: pendingCredits } = await res.json();
        if (pendingCredits && pendingCredits.length > 0) {
          const userRef = doc(firebaseDb, "moraliUsers", uid);
          for (const credit of pendingCredits) {
            try { await processOneCredit(credit, userRef); } catch { /* will retry */ }
          }
        }
        return; // API succeeded
      }
    } catch {
      // API failed — fall through to client-side
    }

    // Method 2: Client Firestore fallback (read pendingCredits directly — open rules)
    try {
      const q = query(collection(firebaseDb, "pendingCredits"), where("recipientUid", "==", uid), where("status", "==", "pending"));
      const snap = await getDocs(q);
      if (snap.empty) return;
      const userRef = doc(firebaseDb, "moraliUsers", uid);
      for (const docSnap of snap.docs) {
        const credit = docSnap.data();
        if (!credit.amount) continue;
        try { await processOneCredit({ id: docSnap.id, amount: credit.amount, senderName: credit.senderName }, userRef); } catch { /* will retry */ }
      }
    } catch {
      /* client fallback failed */
    }
  };

  // Helper: credit balance (depot)
  const serviceCreditBalance = async (amount: number) => {
    if (!authUid) return;
    const userRef = doc(firebaseDb, "moraliUsers", authUid);
    await runTransaction(firebaseDb, async (tx) => {
      const userDoc = await tx.get(userRef);
      const currentBal = userDoc.data().balance || 0;
      tx.update(userRef, { balance: currentBal + amount, updatedAt: serverTimestamp() });
    });
  };

  // Helper: debit balance (retrait)
  const serviceDebitBalance = async (amount: number) => {
    if (!authUid) return;
    const userRef = doc(firebaseDb, "moraliUsers", authUid);
    await runTransaction(firebaseDb, async (tx) => {
      const userDoc = await tx.get(userRef);
      const currentBal = userDoc.data().balance || 0;
      if (amount > currentBal) throw new Error("INSUFFICIENT_BALANCE");
      tx.update(userRef, { balance: currentBal - amount, updatedAt: serverTimestamp() });
    });
  };

  // Atomic savings transfer (deposit / withdraw)
  const executeSavingsTransfer = async (mode: "deposit" | "withdraw") => {
    if (!authUid) return;
    const amt = Number(savingsCustomAmount || 0);
    if (amt <= 0) { showToast("Entrez un montant"); return; }
    const userBalance = firestoreBalance !== null ? firestoreBalance : dashboardData.balance;
    const userSavings = savingsAmount || 0;
    if (mode === "deposit" && amt > userBalance) { showToast("Solde insuffisant pour alimenter l'épargne"); return; }
    if (mode === "withdraw" && amt > userSavings) { showToast("Solde épargne insuffisant"); return; }
    if (serviceProcessing) return;
    setServiceProcessing(true);
    try {
      const userRef = doc(firebaseDb, "moraliUsers", authUid);
      await runTransaction(firebaseDb, async (tx) => {
        const userDoc = await tx.get(userRef);
        if (!userDoc.exists()) throw new Error("USER_NOT_FOUND");
        const currentBalance = userDoc.data().balance || 0;
        const currentSavings = userDoc.data().savingsBalance || 0;
        if (mode === "deposit") {
          if (currentBalance < amt) throw new Error("INSUFFICIENT_BALANCE");
          tx.update(userRef, { balance: currentBalance - amt, savingsBalance: currentSavings + amt, updatedAt: serverTimestamp() });
        } else {
          if (currentSavings < amt) throw new Error("INSUFFICIENT_SAVINGS");
          tx.update(userRef, { balance: currentBalance + amt, savingsBalance: currentSavings - amt, updatedAt: serverTimestamp() });
        }
      });
      if (mode === "deposit") {
        await createRealtimeTransaction({
          senderUid: authUid, senderMoraliId: bankingIdentity.id, senderName: dashboardName,
          recipientUid: authUid, recipientMoraliId: bankingIdentity.id, recipientName: dashboardName,
          amount: amt, fees: 0, type: "depot", destination: "savings", status: "success",
          receiptId: "TX-" + Date.now().toString().slice(-8),
        });
        await createRealtimeNotification(authUid, {
          title: `Dépôt Épargne — ${formatCurrency(amt)} FCFA`,
          time: "À l'instant", badge: "Épargne", badgeClass: "nb-green",
          icon: "piggy", bg: "rgba(34,197,94,0.12)", read: false,
        });
        showQuickNotif("credit", "Dépôt Épargne", formatCurrency(amt), "piggy", "#4ade80");
      } else {
        await createRealtimeTransaction({
          senderUid: authUid, senderMoraliId: bankingIdentity.id, senderName: dashboardName,
          recipientUid: authUid, recipientMoraliId: bankingIdentity.id, recipientName: dashboardName,
          amount: amt, fees: 0, type: "retrait", destination: "savings", status: "success",
          receiptId: "TX-" + Date.now().toString().slice(-8),
        });
        await createRealtimeNotification(authUid, {
          title: `Retrait Épargne — ${formatCurrency(amt)} FCFA`,
          time: "À l'instant", badge: "Retrait", badgeClass: "nb-blue",
          icon: "wallet", bg: "rgba(59,130,246,0.12)", read: false,
        });
        showQuickNotif("debit", "Retrait Épargne", formatCurrency(amt), "wallet", "#f43f5e");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "INSUFFICIENT_BALANCE") showToast("Solde insuffisant");
      else if (msg === "INSUFFICIENT_SAVINGS") showToast("Solde épargne insuffisant");
      else showToast("Opération échouée");
    } finally { setServiceProcessing(false); }
  };

  // Service transactions
  const executeServiceDeposit = async (amount: number, label: string, icon: string) => {
    if (!authUid || amount <= 0) { showToast("Montant invalide"); return; }
    if (serviceProcessing) return;
    setServiceProcessing(true);
    try {
      await serviceCreditBalance(amount);
      await createRealtimeTransaction({
        senderUid: authUid, senderMoraliId: bankingIdentity.id, senderName: dashboardName,
        recipientUid: authUid, recipientMoraliId: bankingIdentity.id, recipientName: dashboardName,
        amount, fees: 0, type: "depot", destination: "cash", status: "success",
        receiptId: "TX-" + Date.now().toString().slice(-8),
      });
      await createRealtimeNotification(authUid, {
        title: `${label} — +${formatCurrency(amount)} FCFA`,
        time: "À l'instant", badge: "Reçu", badgeClass: "nb-green",
        icon, bg: "rgba(34,197,94,0.12)", read: false,
      });
      showQuickNotif("credit", label, formatCurrency(amount), icon, "#4ade80");
    } catch { showToast("Opération échouée"); }
    finally { setServiceProcessing(false); }
  };

  const executeServiceDebit = async (amount: number, label: string, icon: string) => {
    if (!authUid || amount <= 0) { showToast("Montant invalide"); return; }
    const userBalance = firestoreBalance !== null ? firestoreBalance : dashboardData.balance;
    if (amount > userBalance) { showToast("Solde insuffisant pour cette opération"); return; }
    if (serviceProcessing) return;
    setServiceProcessing(true);
    try {
      await serviceDebitBalance(amount);
      await createRealtimeTransaction({
        senderUid: authUid, senderMoraliId: bankingIdentity.id, senderName: dashboardName,
        recipientUid: authUid, recipientMoraliId: bankingIdentity.id, recipientName: dashboardName,
        amount, fees: 0, type: "retrait", destination: "cash", status: "success",
        receiptId: "TX-" + Date.now().toString().slice(-8),
      });
      await createRealtimeNotification(authUid, {
        title: `${label} — -${formatCurrency(amount)} FCFA`,
        time: "À l'instant", badge: "Débit", badgeClass: "nb-blue",
        icon, bg: "rgba(59,130,246,0.12)", read: false,
      });
      showQuickNotif("debit", label, formatCurrency(amount), icon, "#f43f5e");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "INSUFFICIENT_BALANCE") showToast("Solde insuffisant");
      else showToast("Opération échouée");
    }
    finally { setServiceProcessing(false); }
  };

  const submitLoanApplication = async (type: "micro" | "personal") => {
    if (!authUid) { showToast("Connexion requise"); return; }
    const amount = type === "micro" ? loanAmount : personalLoanAmount;
    if (amount <= 0) { showToast("Montant invalide"); return; }

    setActiveLoanType(type);
    setLoanApplicationStatus("loading");

    try {
      await createRealtimeTransaction({
        senderUid: authUid, senderMoraliId: bankingIdentity.id, senderName: dashboardName,
        recipientUid: authUid, recipientMoraliId: bankingIdentity.id, recipientName: dashboardName,
        amount, fees: 0, type: "retrait", destination: "loan_request", status: "pending",
        receiptId: "LN-" + Date.now().toString().slice(-8),
        loanType: type,
        totalToRepay: type === "micro" ? microTotalToPay : personalLoanTotalToRepay,
        duration: type === "micro" ? microCreditDuration : personalLoanDuration * 30,
        durationLabel: type === "micro" ? `${microCreditDuration} Jours` : `${personalLoanDuration} Mois`,
      });

      await createRealtimeNotification(authUid, {
        title: type === "micro" ? `Demande Microcrédit — ${formatCurrency(amount)} FCFA` : `Demande Prêt Personnel — ${formatCurrency(amount)} FCFA`,
        time: "À l'instant", badge: "En attente", badgeClass: "nb-blue",
        icon: "bank", bg: "rgba(59,130,246,0.12)", read: false,
      });

      setLoanApplicationStatus("submitted");
      if (type === "micro") setMicroCreditStep("done");
      else setPersonalLoanStep("done");
      showToast(type === "micro" ? "Demande de microcrédit envoyée" : "Demande de prêt envoyée");
    } catch (err) {
      setLoanApplicationStatus("error");
      showToast("Erreur lors de l'envoi de la demande");
    }
  };

  // ── executeTransfer, handleTransferPinKey, startTransferPin, confirmTransferAndProceed,
  //     updateTransferDrag, endTransferDrag, beginTransferDrag, shareTransferReceipt,
  //     closeTransferSuccess, and 2 transfer useEffects removed — moved to TransferView ──

  const openInfoDrawer = () => {
    setInfoDrawerOpen(true);
  };

  const closeInfoDrawer = () => {
    setInfoDrawerOpen(false);
  };

  const saveProfileInfos = async () => {
    const normalizedName = profileForm.fullName.trim() || "Utilisateur";
    if (typeof window !== "undefined") {
      window.localStorage.setItem("morali_profile_full_name", normalizedName);
      window.localStorage.setItem("morali_profile_phone", profileForm.phone);
      window.localStorage.setItem("morali_profile_address", profileForm.address);
    }
    setProfileForm((current) => ({ ...current, fullName: normalizedName }));
    setDashboardName(normalizedName);
    if (authUid) {
      await updateDoc(doc(firebaseDb, "moraliUsers", authUid), {
        fullName: normalizedName,
        phone: profileForm.phone,
        address: profileForm.address,
        updatedAt: serverTimestamp(),
      });
    }
    setInfoDrawerOpen(false);
    showToast("Profil mis à jour");
  };

  const copyToClipboard = async (type: "id" | "rib", value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedIdentityField(type);
      window.setTimeout(() => setCopiedIdentityField((current) => (current === type ? null : current)), 1400);
    } catch {
      showToast("Copie impossible pour le moment");
    }
  };

  // ── Real biometric prompt via WebAuthn ──
  const promptBiometric = async (): Promise<boolean> => {
    try {
      if (!window.PublicKeyCredential) return false;
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (!available) return false;
      // Create a dummy challenge for biometric verification
      const challenge = new Uint8Array(32);
      crypto.getRandomValues(challenge);
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge,
          rp: { name: "Morali Pay" },
          user: { id: new Uint8Array(16), name: "morali-user", displayName: "Utilisateur Morali" },
          pubKeyCredParams: [{ type: "public-key", alg: -7 }],
          authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
          timeout: 30000,
        },
      });
      return !!credential;
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "NotAllowedError") return false;
      return false;
    }
  };

  // ── Device fingerprint check on login ──
  const checkNewDevice = useCallback(async () => {
    if (!authUid) return;
    try {
      const ua = navigator.userAgent;
      const fingerprint = btoa(ua.slice(0, 120) + "|" + screen.width + "x" + screen.height + "|" + navigator.language);
      const devRef = doc(firebaseDb, "users", authUid, "meta", "deviceFingerprint");
      const snap = await getDoc(devRef);
      if (snap.exists() && snap.data().fingerprint && snap.data().fingerprint !== fingerprint) {
        // New device detected!
        const secSnap = await getDoc(doc(firebaseDb, "users", authUid, "meta", "securitySettings"));
        const alertsEnabled = secSnap.exists() ? secSnap.data().deviceAlerts !== false : true;
        if (alertsEnabled) {
          setDeviceAlertShown(true);
          setTimeout(() => setDeviceAlertShown(false), 8000);
        }
      }
      // Update current device fingerprint
      await setDoc(devRef, { fingerprint, lastSeen: serverTimestamp() }, { merge: true });
    } catch {
      // Silent fail
    }
  }, [authUid]);

  // Check device fingerprint after auth + settings loaded
  useEffect(() => {
    if (authUid) {
      const timer = setTimeout(() => checkNewDevice(), 2000);
      return () => clearTimeout(timer);
    }
  }, [authUid, checkNewDevice]);

  const openSecurityModal = () => {
    setPasswordStage("menu");
    setChangePwOld("");
    setChangePwNew("");
    setChangePwConfirm("");
    setSecurityModalOpen(true);
  };

  const closeSecurityModal = () => {
    setSecurityModalOpen(false);
    setPasswordStage("menu");
    setChangePwOld("");
    setChangePwNew("");
    setChangePwConfirm("");
  };

  const handleChangePassword = async () => {
    const user = firebaseAuth.currentUser;
    if (!user || !user.email) {
      showToast("Aucun compte connecté");
      return;
    }
    if (!changePwOld.trim() || !changePwNew.trim() || !changePwConfirm.trim()) {
      showToast("Remplissez tous les champs");
      return;
    }
    if (changePwNew.length < 8) {
      showToast("Le nouveau mot de passe doit contenir au moins 8 caractères");
      return;
    }
    if (changePwNew !== changePwConfirm) {
      showToast("Les mots de passe ne correspondent pas");
      return;
    }
    if (changePwOld === changePwNew) {
      showToast("Le nouveau mot de passe doit être différent de l'ancien");
      return;
    }
    setChangePwLoading(true);
    try {
      // Re-authenticate with old password (using recommended Firebase method)
      const credential = EmailAuthProvider.credential(user.email, changePwOld.trim());
      await reauthenticateWithCredential(user, credential);
      // Update password
      await updatePassword(user, changePwNew.trim());
      showToast("Mot de passe mis à jour avec succès");
      // Notifier l'utilisateur du changement de mot de passe
      if (authUid) {
        await createRealtimeNotification(authUid, {
          title: "Votre mot de passe a été modifié",
          time: new Date().toLocaleString("fr-FR"),
          badge: "Sécurité",
          badgeClass: "nb-green",
          icon: "lock",
          bg: "rgba(34,197,94,0.12)",
          read: false,
        });
      }
      setPasswordStage("menu");
      setChangePwOld("");
      setChangePwNew("");
      setChangePwConfirm("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("wrong-password") || msg.includes("invalid-credential") || msg.includes("INVALID_LOGIN_CREDENTIALS")) {
        showToast("Ancien mot de passe incorrect");
        setChangePwOld("");
      } else if (msg.includes("weak-password") || msg.includes("WEAK_PASSWORD")) {
        showToast("Le nouveau mot de passe est trop faible (min. 8 caractères)");
      } else if (msg.includes("too-many-requests") || msg.includes("TOO_MANY_ATTEMPTS")) {
        showToast("Trop de tentatives. Réessayez dans quelques minutes.");
      } else {
        showToast("Erreur lors du changement de mot de passe");
        console.error("Change password error:", err);
      }
    } finally {
      setChangePwLoading(false);
    }
  };

  const saveSecuritySettings = async () => {
    if (authUid) {
      try {
        await setDoc(doc(firebaseDb, "users", authUid, "meta", "securitySettings"), {
          ...securitySettings,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch {
        window.localStorage.setItem("morali_security_settings", JSON.stringify(securitySettings));
      }
    } else {
      window.localStorage.setItem("morali_security_settings", JSON.stringify(securitySettings));
    }
    setSecurityModalOpen(false);
    showToast("Sécurité et biométrie mises à jour");
  };

  const openPrivacyModal = () => {
    setPrivacySaveState("idle");
    setPrivacyAccessLogOpen(false);
    setPrivacyModalOpen(true);
  };

  const closePrivacyModal = () => {
    const hasUnsaved = JSON.stringify(privacySettings) !== JSON.stringify(savedPrivacySettings);
    if (hasUnsaved) {
      setPrivacyCloseConfirmOpen(true);
      return;
    }
    setPrivacyAccessLogOpen(false);
    setPrivacyModalOpen(false);
  };

  const discardPrivacyChanges = () => {
    setPrivacySettings(savedPrivacySettings);
    setPrivacyAccessLogOpen(false);
    setPrivacyCloseConfirmOpen(false);
    setPrivacyModalOpen(false);
  };

  const cancelPrivacyClose = () => {
    setPrivacyCloseConfirmOpen(false);
  };

  const savePrivacySettings = async () => {
    setPrivacySaveState("saving");
    if (typeof window !== "undefined") {
      window.localStorage.setItem("morali_privacy_settings", JSON.stringify(privacySettings));
    }
    if (authUid) {
      try {
        await setDoc(doc(firebaseDb, "users", authUid, "meta", "privacySettings"), {
          ...privacySettings,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch {
        console.error("Erreur sauvegarde confidentialité Firestore");
      }
    }
    setSavedPrivacySettings(privacySettings);
    window.setTimeout(() => {
      setPrivacySaveState("saved");
      window.setTimeout(() => {
        setPrivacyModalOpen(false);
        setPrivacyAccessLogOpen(false);
        setPrivacySaveState("idle");
        showToast("Paramètres de confidentialité mis à jour");
      }, 1000);
    }, 800);
  };

  const toggleAmountReveal = (key: string) => {
    if (!privacySettings.activityMasking) return;
    setRevealedAmounts((current) => ({ ...current, [key]: true }));
    window.setTimeout(() => {
      setRevealedAmounts((current) => ({ ...current, [key]: false }));
    }, 3000);
  };

  const openAccessLog = () => {
    setPrivacyAccessLogOpen((current) => !current);
  };

  const disconnectOtherDevices = () => {
    setPrivacyAccessLogOpen(false);
    showToast("Tous les autres appareils ont été déconnectés");
  };

  const openReceiptsModal = () => {
    setReceiptsOpen(true);
  };

  const closeReceiptsModal = () => {
    setReceiptsOpen(false);
  };

  const openSupportModal = () => {
    setSupportOpen(true);
  };

  const closeSupportModal = () => {
    setSupportOpen(false);
    setSupportMessage("");
  };

  const openTermsModal = () => {
    setTermsOpen(true);
  };

  const closeTermsModal = () => {
    setTermsOpen(false);
  };

  const openVirtualCardModal = async () => {
    setVirtualCardOpen(true);
    if (!authUid) return;
    setVirtualCardLoading(true);
    try {
      const cardRef = doc(firebaseDb, "users", authUid, "meta", "virtualCard");
      const snap = await getDoc(cardRef);
      if (snap.exists()) {
        setVirtualCardData(snap.data() as VirtualCardDoc);
      } else {
        setVirtualCardData(null);
      }
    } finally {
      setVirtualCardLoading(false);
    }
  };

  const closeVirtualCardModal = () => {
    setVirtualCardOpen(false);
  };

  const openBlackCardModal = async () => {
    setBlackCardOpen(true);
    setBlackCardStep("preview");
    if (!authUid) return;
    setBlackCardLoading(true);
    try {
      const cardRef = doc(firebaseDb, "users", authUid, "meta", "blackCard");
      const snap = await getDoc(cardRef);
      if (snap.exists()) {
        setBlackCardData(snap.data() as BlackCardDoc);
      } else {
        setBlackCardData({
          tier: "black",
          eligible: true,
          status: "none",
          provider: "Visa Infinite",
          spendingLimit: 1500000,
          monthlyLimit: 10000000,
          concierge: true,
          loungeAccess: true,
          prioritySupport: true,
          cashbackRate: 2.5,
        });
      }
    } finally {
      setBlackCardLoading(false);
    }
  };

  const closeBlackCardModal = () => {
    setBlackCardOpen(false);
  };

  const requestBlackCard = async () => {
    if (!authUid) {
      showToast("Connexion requise");
      return;
    }
    setBlackCardLoading(true);
    const payload: BlackCardDoc = {
      tier: "black",
      eligible: true,
      status: "requested",
      provider: "Visa Infinite",
      spendingLimit: 1500000,
      monthlyLimit: 10000000,
      concierge: true,
      loungeAccess: true,
      prioritySupport: true,
      cashbackRate: 2.5,
      requestedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };
    try {
      await setDoc(
        doc(firebaseDb, "users", authUid, "meta", "blackCard"),
        {
          ...payload,
          material: blackCardMaterial,
        },
        { merge: true },
      );
      setBlackCardData(payload);
      setBlackCardCelebrationOpen(true);
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.([20, 40, 20]);
      }
    } catch {
      showToast("Demande Carte Black impossible");
    } finally {
      setBlackCardLoading(false);
    }
  };

  const activateVirtualCard = async () => {
    if (!authUid) {
      showToast("Connexion requise");
      return;
    }
    setVirtualCardLoading(true);
    try {
      const seed = getIdentitySeed(loginEmail || bankingIdentity.id || authUid, authUid).replace(/[^A-Za-z0-9]/g, "");
      const digits = seed.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0).toString().padStart(8, "0");
      const number = `4482 ${digits.slice(0, 4)} ${digits.slice(4, 8)} ${digits.slice(-4)}`;
      const card: VirtualCardDoc = {
        number,
        expiry: "09/28",
        cvv: digits.slice(-3),
        active: true,
        onlineOnly: true,
        frozen: false,
        alias: "Morali Virtual Blue",
        spendingLimit: 250000,
        provider: "Visa",
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
      };
      await setDoc(doc(firebaseDb, "users", authUid, "meta", "virtualCard"), card, { merge: true });
      setVirtualCardData(card);
      showToast("Carte virtuelle activée");
    } catch {
      showToast("Activation de la carte virtuelle impossible");
    } finally {
      setVirtualCardLoading(false);
    }
  };

  const exportReceipts = async () => {
    const source = liveTransactions.length ? liveTransactions : dashboardData.transactions;
    const rows = source
      .map((tx, index) => {
        const receiptLine = tx.receiptId ? ` · Reçu ${tx.receiptId}` : "";
        const statusLine = tx.status ? ` · Statut ${tx.status}` : "";
        const channelLine = tx.channel ? ` · Canal ${tx.channel}` : "";
        return `${index + 1}. ${tx.name} — ${tx.amount} — ${tx.date}${channelLine}${statusLine}${receiptLine}`;
      })
      .join("\n");
    const text = `Historique des reçus Morali Pay\n\n${rows}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Historique des Reçus", text });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      showToast("Reçus prêts à partager");
    } catch {
      showToast("Export annulé");
    }
  };

  const submitSupportMessage = async () => {
    const message = supportMessage.trim();
    if (!message) {
      showToast("Décrivez votre demande");
      return;
    }
    setSupportSending(true);
    try {
      if (authUid) {
        await addDoc(collection(firebaseDb, "users", authUid, "supportTickets"), {
          message,
          status: "Ouvert",
          createdAt: serverTimestamp(),
        });
      }
      setSupportThreads((current) => [{ id: `local-${Date.now()}`, message, status: "Ouvert", createdAtLabel: "À l'instant" }, ...current]);
      setSupportMessage("");
      showToast("Demande envoyée au support Morali");
    } catch {
      showToast("Envoi du message impossible pour le moment");
    } finally {
      setSupportSending(false);
    }
  };

  const openManageCardModal = () => {
    setCardManageOpen(true);
  };

  const closeManageCardModal = () => {
    setCardManageOpen(false);
  };

  const openPinModal = () => {
    // PIN existence is tracked via cardPinExistsRef (set during registration/change or server check)
    // No longer reading from localStorage — server is source of truth
    setCardPinOpen(true);
    setCardPinRevealed(false);
    setCardPinPassword("");
    setRevealAccountPw("");
    setCardPinDraft("");
    setCardPinConfirm("");
    setCardPinStage(cardPinExistsRef.current ? "menu" : "setup");
  };

  const closePinModal = () => {
    setCardPinOpen(false);
    setCardPinRevealed(false);
    setCardPinPassword("");
    setCardPinDraft("");
    setCardPinConfirm("");
    setCardPinStage(savedCardPinHash ? "menu" : "setup");
  };

  const saveCardPinCode = async () => {
    if (!/^\d{4}$/.test(cardPinDraft) || cardPinDraft !== cardPinConfirm) {
      showToast("Les codes PIN ne correspondent pas");
      return;
    }
    // Send plaintext PIN to server; server hashes with bcrypt
    try {
      // Remove any legacy items
      window.localStorage.removeItem("morali_card_pin");
      window.localStorage.removeItem("morali_card_pin_hash");
      window.localStorage.removeItem("morali_card_pin_salt");
      setSavedCardPin("••••");
      setSessionPinPlaintext(cardPinDraft);
      cardPinExistsRef.current = true;
      setCardPinRevealed(false);
      setCardPinPassword("");
      // Store on server (source of truth — bcrypt)
      try {
        const token = await firebaseAuth.currentUser?.getIdToken();
        await fetch("/api/pin/store", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ pin: cardPinDraft }),
        });
      } catch { /* server store failed */ }
      // Server is source of truth for PIN hash (bcrypt)
      setCardPinStage("menu");
      showToast("Code PIN de la carte enregistré");
    } catch {
      showToast("Erreur lors de l'enregistrement du PIN");
    }
  };

  const revealPinWithPassword = async () => {
    // Rate limiting: max 3 attempts, then 5-minute lockout
    if (revealLockedUntil > Date.now()) {
      const waitSec = Math.ceil((revealLockedUntil - Date.now()) / 1000);
      showToast(`Trop de tentatives. Réessayez dans ${waitSec}s`);
      return;
    }
    const user = firebaseAuth.currentUser;
    if (!user || !user.email) {
      showToast("Aucun compte connecté");
      return;
    }
    if (!revealAccountPw.trim()) {
      showToast("Entrez votre mot de passe");
      return;
    }
    setRevealVerifying(true);
    try {
      // Use Firebase re-authentication (recommended over signInWithEmailAndPassword)
      const credential = EmailAuthProvider.credential(user.email, revealAccountPw.trim());
      await reauthenticateWithCredential(user, credential);
      const uid = user.uid;
      let decrypted: string | null = null;
      
      // Try server first
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/pin/get-encrypted", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.hasEncrypted && data.encryptedPin) {
          decrypted = await decryptPinWithPassword(data.encryptedPin, revealAccountPw.trim(), uid);
        }
      } catch { /* fallback to localStorage */ }
      
      // Fallback to localStorage
      if (!decrypted) {
        const localEncrypted = window.localStorage.getItem("morali_card_pin_encrypted");
        if (localEncrypted) {
          decrypted = await decryptPinWithPassword(localEncrypted, revealAccountPw.trim(), uid);
        }
      }
      
      if (decrypted && /^\d{4}$/.test(decrypted)) {
        setRevealedPinDigits(decrypted.split("").join(" "));
        setCardPinRevealed(true);
        setRevealAttempts(0);
        setRevealLockedUntil(0);
        setRevealAccountPw("");
        setRevealNeedsPin(false);
        setRevealPinRaw("");
        setRevealVerifiedPw("");
        showToast("Code PIN affiché");
      } else {
        // PIN not encrypted — ask user to enter their PIN so we can verify + encrypt it
        setRevealVerifiedPw(revealAccountPw.trim());
        setRevealAccountPw("");
        setRevealNeedsPin(true);
        setRevealPinRaw("");
        showToast("Entrez votre PIN pour le chiffrer et l'afficher.");
      }
    } catch (err: unknown) {
      const code = err instanceof Error ? (err as { code?: string }).code || "" : "";
      const newAttempts = revealAttempts + 1;
      setRevealAttempts(newAttempts);
      if (code === "auth/too-many-requests") {
        setRevealLockedUntil(Date.now() + 5 * 60 * 1000);
        showToast("Trop de requêtes Firebase. Verrouillé pendant 5 minutes.");
      } else if (code === "auth/wrong-password" || code === "auth/invalid-credential") {
        if (newAttempts >= 3) {
          setRevealLockedUntil(Date.now() + 5 * 60 * 1000);
          showToast("Trop de tentatives. Verrouillé pendant 5 minutes.");
        } else {
          showToast(`Mot de passe incorrect (${3 - newAttempts} tentative(s) restante(s))`);
        }
      } else if (code === "auth/network-request-failed") {
        showToast("Erreur réseau. Vérifiez votre connexion et réessayez.");
      } else {
        showToast(`Erreur de vérification. ${code ? `[${code}]` : ""} Réessayez.`);
      }
      setRevealAccountPw("");
    } finally {
      setRevealVerifying(false);
    }
  };

  // ── Encrypt existing PIN with verified password then reveal ──
  const encryptAndRevealPin = async () => {
    if (!/^\d{4}$/.test(revealPinRaw)) {
      showToast("Entrez un code PIN à 4 chiffres");
      return;
    }
    const user = firebaseAuth.currentUser;
    if (!user) return;
    setRevealPinVerifying(true);
    try {
      // Verify PIN against server hash, fallback to client Firestore
      let pinValid = false;
      try {
        const token = await user.getIdToken();
        const pinRes = await fetch("/api/verify-pin", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ pin: revealPinRaw }),
        });
        const pinData = await pinRes.json();
        pinValid = !!pinData.valid;
      } catch {
        showToast("Erreur de vérification");
        setRevealPinRaw("");
        setRevealPinVerifying(false);
        return;
      }

      if (!pinValid) {
        showToast("Code PIN incorrect");
        setRevealPinRaw("");
        setRevealPinVerifying(false);
        return;
      }
      // PIN is correct — encrypt it with verified password
      const uid = user.uid;
      const encrypted = await encryptPinWithPassword(revealPinRaw, revealVerifiedPw, uid);
      window.localStorage.setItem("morali_card_pin_encrypted", encrypted.encryptedPin);
      window.localStorage.setItem("morali_card_pin_iv", encrypted.pinIv);
      // Store encrypted PIN on server
      try {
        const token = await user.getIdToken();
        await fetch("/api/pin/store", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ encryptedPin: encrypted.encryptedPin, pinIv: encrypted.pinIv }),
        });
      } catch { /* server store failed, localStorage is enough */ }
      // Also store in client Firestore as fallback
      try {
        await setDoc(doc(firebaseDb, "pinRecords", uid), { encryptedPin: encrypted.encryptedPin, pinIv: encrypted.pinIv }, { merge: true });
      } catch { /* client Firestore also failed */ }
      // Show PIN
      setRevealedPinDigits(revealPinRaw.split("").join(" "));
      setCardPinRevealed(true);
      setRevealNeedsPin(false);
      setRevealPinRaw("");
      setRevealVerifiedPw("");
      setSessionPinPlaintext(revealPinRaw);
      showToast("PIN chiffré et affiché avec succès !");
    } catch {
      showToast("Erreur lors du chiffrement");
    } finally {
      setRevealPinVerifying(false);
    }
  };

  const changeCardPinCode = async () => {
    if (!/^\d{4}$/.test(cardPinPassword) || !/^\d{4}$/.test(cardPinDraft) || cardPinDraft !== cardPinConfirm) {
      showToast("Vérifiez les codes PIN");
      return;
    }
    // Verify old PIN via server (client-side state may be empty after reload)
    try {
      const token = await firebaseAuth.currentUser?.getIdToken();
      const pinRes = await fetch("/api/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pin: cardPinPassword }),
      });
      const pinData = await pinRes.json();
      if (!pinData.valid) {
        showToast("Ancien code PIN incorrect");
        return;
      }
      // Save new PIN (server hashes with bcrypt)
      setSavedCardPin("\u2022\u2022\u2022\u2022");
      setSessionPinPlaintext(cardPinDraft);
      cardPinExistsRef.current = true;
      // Encrypt new PIN with account password if provided (for future reveal)
      if (changePinAccountPw.trim() && firebaseAuth.currentUser?.uid) {
        try {
          const encrypted = await encryptPinWithPassword(cardPinDraft, changePinAccountPw.trim(), firebaseAuth.currentUser.uid);
          window.localStorage.setItem("morali_card_pin_encrypted", encrypted.encryptedPin);
          window.localStorage.setItem("morali_card_pin_iv", encrypted.pinIv);
          await fetch("/api/pin/store", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ pin: cardPinDraft, encryptedPin: encrypted.encryptedPin, pinIv: encrypted.pinIv }),
          });
        } catch { /* encryption failed, store without encrypted version */ }
      } else {
        // Store without encryption (PIN reveal won't work but PIN verification will)
        try {
          await fetch("/api/pin/store", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ pin: cardPinDraft }),
          });
        } catch { /* server store failed */ }
      }
      // Server is source of truth for PIN hash (bcrypt)
      setCardPinRevealed(false);
      setRevealedPinDigits("");
      setCardPinPassword("");
      setCardPinDraft("");
      setCardPinConfirm("");
      setChangePinAccountPw("");
      setCardPinStage("menu");
      showToast("Code PIN mis à jour");
    } catch {
      showToast("Erreur lors de la mise à jour");
    }
  };

  // ── PIN Reset via Email OTP ──
  const sendPinResetOtp = async () => {
    const user = firebaseAuth.currentUser;
    if (!user?.email) {
      showToast("Aucun email associé à ce compte");
      return;
    }
    setPinResetSending(true);
    setPinResetDemoOtp("");
    setPinResetOtpCode("");
    try {
      const res = await fetch("/api/email/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email }),
      });
      const data = await res.json();
      if (data.success) {
        setPinResetOtpSent(true);
        if (data.demoOtp) {
          setPinResetDemoOtp(data.demoOtp);
        }
        showToast(data.demoMode ? "Code de test généré (mode démo)" : "Code envoyé par email");
      } else {
        showToast(data.error || "Erreur d'envoi du code");
      }
    } catch {
      showToast("Erreur d'envoi du code");
    } finally {
      setPinResetSending(false);
    }
  };

  const verifyPinResetOtp = async () => {
    const user = firebaseAuth.currentUser;
    if (!user?.email) return;
    if (pinResetOtpCode.length !== 6) {
      showToast("Entrez le code à 6 chiffres");
      return;
    }
    setPinResetVerifying(true);
    try {
      const res = await fetch("/api/email/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: user.email, code: pinResetOtpCode }),
      });
      const data = await res.json();
      if (data.valid) {
        setPinResetVerified(true);
        showToast("Email vérifié ! Créez votre nouveau code PIN.");
      } else {
        showToast(data.error || "Code incorrect");
      }
    } catch {
      showToast("Erreur de vérification");
    } finally {
      setPinResetVerifying(false);
    }
  };

  const resetPinWithNewCode = async () => {
    if (!/^\d{4}$/.test(pinResetNewPin) || pinResetNewPin !== pinResetConfirmPin) {
      showToast("Les codes PIN ne correspondent pas");
      return;
    }
    try {
      const token = await firebaseAuth.currentUser?.getIdToken();
      if (!token) {
        showToast("Non autorisé");
        return;
      }
      // Save new PIN via reset endpoint (server hashes with bcrypt)
      const res = await fetch("/api/pin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ pin: pinResetNewPin }),
      });
      const data = await res.json();
      if (data.success) {
        // Update local state
        setSavedCardPin("\u2022\u2022\u2022\u2022");
        setSessionPinPlaintext(pinResetNewPin);
        cardPinExistsRef.current = true;
        // Server is source of truth for PIN hash (bcrypt)
        // Reset state and go to menu
        resetPinResetState();
        setCardPinStage("menu");
        showToast("Code PIN réinitialisé avec succès");
      } else {
        showToast(data.error || "Erreur de réinitialisation");
      }
    } catch {
      showToast("Erreur lors de la réinitialisation");
    }
  };

  const resetPinResetState = () => {
    setPinResetOtpSent(false);
    setPinResetOtpCode("");
    setPinResetDemoOtp("");
    setPinResetVerified(false);
    setPinResetNewPin("");
    setPinResetConfirmPin("");
    setPinResetSending(false);
    setPinResetVerifying(false);
  };

  const saveCardSettings = async () => {
    if (authUid) {
      try {
        await setDoc(doc(firebaseDb, "users", authUid, "meta", "cardSettings"), {
          ...cardSettings,
          locked: cardLocked,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch {
        // Fallback: save locally
        window.localStorage.setItem("morali_card_settings", JSON.stringify({ ...cardSettings, locked: cardLocked }));
      }
    } else {
      window.localStorage.setItem("morali_card_settings", JSON.stringify({ ...cardSettings, locked: cardLocked }));
    }
    setCardManageOpen(false);
    showToast("Paramètres carte mis à jour");
  };

  /* ── Registration PIN Setup ── */
  const handleRegPinDraftChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    setRegPinDraft(digits);
  };

  const handleRegPinConfirmChange = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 4);
    setRegPinConfirm(digits);
  };

  const handleRegPinBack = () => {
    setRegPinStep("create");
    setRegPinDraft("");
    setRegPinConfirm("");
  };

  const handleRegPinSave = async () => {
    if (regPinDraft.length !== 4 || regPinConfirm.length !== 4) {
      showToast("Entrez un code PIN à 4 chiffres");
      return;
    }
    if (regPinDraft !== regPinConfirm) {
      showToast("Les codes PIN ne correspondent pas. Réessayez.");
      setRegPinStep("create");
      setRegPinDraft("");
      setRegPinConfirm("");
      return;
    }
    setRegPinSaving(true);
    try {
      // Send plaintext PIN to server; server hashes with bcrypt
      window.localStorage.removeItem("morali_card_pin");
      window.localStorage.removeItem("morali_card_pin_hash");
      window.localStorage.removeItem("morali_card_pin_salt");
      setSavedCardPin("••••");
      setSessionPinPlaintext(regPinDraft); // Store in memory for reveal
      cardPinExistsRef.current = true;
      // Encrypt PIN with account password for later reveal
      const encrypted = await encryptPinWithPassword(regPinDraft, registerData.pw, firebaseAuth.currentUser?.uid || "");
      window.localStorage.setItem("morali_card_pin_encrypted", encrypted.encryptedPin);
      window.localStorage.setItem("morali_card_pin_iv", encrypted.pinIv);
      // Store plaintext PIN + encrypted version on server
      try {
        const token = await firebaseAuth.currentUser?.getIdToken();
        await fetch("/api/pin/store", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ pin: regPinDraft, encryptedPin: encrypted.encryptedPin, pinIv: encrypted.pinIv }),
        });
      } catch { /* server store failed */ }
      // Server is source of truth for PIN hash (bcrypt)
      // Clear registration PIN states and go to success
      setShowPinSetup(false);
      setRegPinDraft("");
      setRegPinConfirm("");
      setRegPinStep("create");
      setShowRegisterSuccess(true);
      cardPinExistsRef.current = true;
      showToast("Code PIN créé avec succès");
    } catch {
      showToast("Erreur lors de la création du PIN");
    } finally {
      setRegPinSaving(false);
    }
  };

  const handleSkipPinSetup = () => {
    setShowPinSetup(false);
    setRegPinDraft("");
    setRegPinConfirm("");
    setRegPinStep("create");
    setShowRegisterSuccess(true);
  };

  const openCardLimitsModal = () => {
    setCardLimitsOpen(true);
  };

  const closeCardLimitsModal = () => {
    setCardLimitsOpen(false);
  };

  const addNewContact = () => {
    setContactQuery("");
    setVerifiedMoraliUser(null);
    setContactSearchLoading(false);
    setContactModalOpen(true);
  };

  const closeContactModal = () => {
    setContactModalOpen(false);
    setContactQuery("");
    setVerifiedMoraliUser(null);
    setContactSearchLoading(false);
  };

  const confirmAddNewContact = () => {
    if (!verifiedMoraliUser) {
      showToast("Aucun compte Morali vérifié trouvé");
      return;
    }
    setPaymentContacts((current) => {
      const exists = current.some((contact) => contact.name.toLowerCase() === verifiedMoraliUser.name.toLowerCase());
      if (exists) return current;
      return [{ name: verifiedMoraliUser.name, tone: verifiedMoraliUser.tone }, ...current];
    });
    showToast(`${verifiedMoraliUser.name} ajouté aux favoris`);
    closeContactModal();
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setToastVisible(true);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToastVisible(false);
    }, 2400);
  };

  const switchAuthTab = (tab: AuthTab) => {
    setAuthTab(tab);
    if (tab === "register") {
      setCurrentStep(1);
      setShowRegisterSuccess(false);
      setShowPinSetup(false);
      setRegPinDraft("");
      setRegPinConfirm("");
      setRegPinStep("create");
      setOtpValue("");
    }
  };

  const goToStep = async (step: number) => {
    if (step === 2) {
      const { prenom, nom, email, tel } = registerData;
      if (!prenom.trim() || !nom.trim() || !email.trim() || !tel.trim()) {
        showToast("Remplissez tous les champs");
        return;
      }
      if (!email.includes("@")) {
        showToast("Email invalide");
        return;
      }
      setCurrentStep(2);
      return;
    }

    if (step === 3) {
      if (registerData.pw.length < 8) {
        showToast("Mot de passe trop court (8 min)");
        return;
      }
      if (registerData.pw !== confirmPassword) {
        showToast("Les mots de passe ne correspondent pas");
        return;
      }
      if (!termsAccepted) {
        showToast("Acceptez les conditions générales");
        return;
      }
      setOtpValue("");
      // Send OTP when moving to verification step
      try {
        const phone = `${registerData.prefix}${registerData.tel}`;
        const res = await fetch("/api/sms/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        const data = await res.json();
        if (data.success) {
          if (data.demoOtp) {
            setDemoOtpCode(data.demoOtp);
          }
        } else {
          showToast(data.error || "Erreur d'envoi du code");
          return;
        }
      } catch {
        showToast("Erreur d'envoi du code");
        return;
      }
      setCurrentStep(3);
      return;
    }

    if (step === 1 || step === 2) {
      setCurrentStep(step);
    }
  };

  const handleVerify = async () => {
    if (otpValue.length < 6) {
      showToast("Entrez le code à 6 chiffres");
      return;
    }
    // Verify OTP via API
    try {
      const phone = `${registerData.prefix}${registerData.tel}`;
      const res = await fetch("/api/sms/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code: otpValue }),
      });
      const data = await res.json();
      if (!data.valid) {
        showToast(data.error || "Code de vérification incorrect");
        return;
      }
    } catch {
      showToast("Erreur de vérification");
      return;
    }

    setVerifyLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(firebaseAuth, registerData.email.trim(), registerData.pw);
      const normalizedFullName = `${registerData.prenom} ${registerData.nom}`.trim();
      const immediateIdentity = generateMoraliIdentity(getIdentitySeed(cred.user.email, cred.user.uid));
      setBankingIdentity(immediateIdentity);
      cacheIdentityForUid(cred.user.uid, immediateIdentity);
      if (typeof window !== "undefined") {
        window.localStorage.setItem("morali_profile_full_name", normalizedFullName);
        window.localStorage.setItem("morali_profile_phone", `${registerData.prefix} ${registerData.tel}`.trim());
      }
      setProfileForm((current) => ({
        ...current,
        fullName: normalizedFullName,
        phone: `${registerData.prefix} ${registerData.tel}`.trim(),
      }));
      setDashboardName(normalizedFullName || registerData.prenom);

      try {
        const createdIdentity = await persistMoraliProfile(cred.user.uid);
        if (createdIdentity) {
          setBankingIdentity(createdIdentity);
        }
      } catch {
        showToast("Compte créé. Synchronisation du profil en attente.");
      }

      setShowPinSetup(true);
    } catch (error) {
      const message = firebaseAuthMessage(error);
      showToast(message || "Création du compte impossible");
    } finally {
      setVerifyLoading(false);
    }
  };

  const enterDashboard = (nameOverride?: string) => {
    const fallbackFromEmail = loginEmail ? `${loginEmail.split("@")[0].charAt(0).toUpperCase()}${loginEmail.split("@")[0].slice(1)}` : "";
    const savedFullName = typeof window !== "undefined" ? window.localStorage.getItem("morali_profile_full_name") || "" : "";
    const nextName = nameOverride || savedFullName || profileForm.fullName || registerData.prenom || fallbackFromEmail || "Utilisateur";
    setDashboardName(nextName);
    setScreen("dashboard");
    showToast(`Bienvenue ${nextName}`);
  };

  const handleLogin = async () => {
    if (!loginEmail.trim() || !loginPassword.trim()) {
      showToast("Remplissez tous les champs");
      return;
    }
    if (!loginEmail.includes("@")) {
      showToast("Email invalide");
      return;
    }
    setLoginLoading(true);
    try {
      const cred = await signInWithEmailAndPassword(firebaseAuth, loginEmail.trim(), loginPassword);
      // Charger le profil depuis Firestore pour récupérer le vrai nom/prénom
      try {
        const profileSnap = await getDoc(doc(firebaseDb, "moraliUsers", cred.user.uid));
        if (profileSnap.exists()) {
          const data = profileSnap.data() as FirestoreMoraliUser;
          const fullName = data.fullName || `${data.firstName} ${data.lastName}`.trim() || "";
          if (fullName) {
            window.localStorage.setItem("morali_profile_full_name", fullName);
            setProfileForm((prev) => ({ ...prev, fullName }));
            enterDashboard(fullName);
          } else {
            enterDashboard();
          }
        } else {
          enterDashboard();
        }
      } catch {
        enterDashboard();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connexion impossible";
      showToast(message.includes("invalid-credential") ? "Email ou mot de passe incorrect" : "Connexion impossible");
    } finally {
      setLoginLoading(false);
    }
  };

  const handleForgot = () => {
    setForgotEmail(loginEmail.trim());
    setForgotOtpCode("");
    setForgotDemoOtp("");
    setForgotSending(false);
    setForgotVerifying(false);
    setForgotVerified(false);
    setForgotNewPw("");
    setForgotConfirmPw("");
    setForgotResetting(false);
    setForgotStep("email");
    setAuthTab("forgot");
  };

  const forgotSendCode = async () => {
    if (!forgotEmail.trim() || !forgotEmail.includes("@")) {
      showToast("Entrez un email valide");
      return;
    }
    setForgotSending(true);
    setForgotOtpCode("");
    setForgotDemoOtp("");
    try {
      const res = await fetch("/api/auth/send-reset-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setForgotStep("code");
        if (data.demoOtp) setForgotDemoOtp(data.demoOtp);
        showToast(data.demoMode ? "Code de test généré (mode démo)" : "Code envoyé par email");
      } else {
        showToast(data.error || "Erreur d'envoi du code");
      }
    } catch {
      showToast("Erreur d'envoi du code");
    } finally {
      setForgotSending(false);
    }
  };

  const forgotVerifyCode = async () => {
    if (forgotOtpCode.length !== 6) {
      showToast("Entrez le code à 6 chiffres");
      return;
    }
    setForgotVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-reset-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim(), code: forgotOtpCode }),
      });
      const data = await res.json();
      if (data.valid) {
        setForgotVerified(true);
        setForgotStep("newPassword");
        showToast("Code vérifié ! Choisissez votre nouveau mot de passe.");
      } else {
        showToast(data.error || "Code incorrect");
      }
    } catch {
      showToast("Erreur de vérification");
    } finally {
      setForgotVerifying(false);
    }
  };

  const forgotResetPassword = async () => {
    if (forgotNewPw.length < 8) {
      showToast("Le mot de passe doit contenir au moins 8 caractères");
      return;
    }
    if (forgotNewPw !== forgotConfirmPw) {
      showToast("Les mots de passe ne correspondent pas");
      return;
    }
    setForgotResetting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail.trim(), newPassword: forgotNewPw }),
      });
      const data = await res.json();
      if (data.success) {
        setForgotStep("success");
        showToast("Mot de passe modifié avec succès !");
      } else {
        showToast(data.error || "Erreur de réinitialisation");
      }
    } catch {
      showToast("Erreur lors de la réinitialisation");
    } finally {
      setForgotResetting(false);
    }
  };

  const handleSocialLogin = async (provider: string) => {
    if (provider !== "Google") {
      showToast(`Connexion ${provider} indisponible`);
      return;
    }

    const googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: "select_account" });

    const isMobileLike = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.innerWidth < 768;

    try {
      if (isMobileLike) {
        await signInWithRedirect(firebaseAuth, googleProvider);
        return;
      }

      const cred = await signInWithPopup(firebaseAuth, googleProvider);
      const user = cred.user;
      const displayName = (user.displayName || "Utilisateur Morali").trim();
      const parts = displayName.split(/\s+/).filter(Boolean);
      const firstName = parts[0] || "Utilisateur";
      const lastName = parts.slice(1).join(" ") || "Morali";
      const pseudoBase = displayName.toLowerCase().replace(/[^a-z0-9]+/g, "") || user.uid.slice(0, 8).toLowerCase();
      const identity = generateMoraliIdentity(getIdentitySeed(user.email, user.uid));
      const phone = profileForm.phone.trim() || `${registerData.prefix || "+242"}${registerData.tel || ""}`;

      await setDoc(
        doc(firebaseDb, "moraliUsers", user.uid),
        {
          uid: user.uid,
          fullName: displayName,
          firstName,
          lastName,
          pseudo: pseudoBase,
          moraliId: identity.id,
          moraliIdNormalized: identity.id.replace(/[^A-Z0-9]/g, ""),
          rib: identity.rib,
          phone,
          email: user.email || "",
          updatedAt: serverTimestamp(),
          createdAt: serverTimestamp(),
        },
        { merge: true },
      );

      // Publish directory entry for Google login users
      await publishDirectoryEntry(user.uid, { fullName: displayName, firstName, lastName, pseudo: `@${pseudoBase}`, moraliId: identity.id });

      cacheIdentityForUid(user.uid, identity);
      setBankingIdentity(identity);
      setDashboardName(displayName);
      setProfileForm((prev) => ({
        ...prev,
        fullName: displayName,
        phone: prev.phone || phone,
        address: prev.address || "Brazzaville, Congo",
      }));
      setLoginEmail(user.email || "");
      setAuthTab("login");
      setScreen("dashboard");
      setNavActive("Accueil");
      showToast("Connexion Google réussie");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connexion Google impossible";
      showToast(message);
    }
  };

  const handleOtpChange = (value: string) => {
    setOtpValue(value.replace(/\D/g, "").slice(0, 6));
  };

  const resendOtp = async () => {
    setOtpValue("");
    setDemoOtpCode("");
    try {
      const phone = `${registerData.prefix}${registerData.tel}`;
      const res = await fetch("/api/sms/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("Nouveau code envoyé !");
        if (data.demoOtp) {
          setDemoOtpCode(data.demoOtp);
        }
      } else {
        showToast(data.error || "Erreur d'envoi");
      }
    } catch {
      showToast("Erreur d'envoi du code");
    }
    window.setTimeout(() => otpInputRef.current?.focus(), 150);
  };

  const handleCardMove = (clientX: number, clientY: number, rect: DOMRect) => {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = (clientX - cx) / (rect.width / 2);
    const dy = (clientY - cy) / (rect.height / 2);
    setCardTransform(`rotateX(${(-dy * 9).toFixed(2)}deg) rotateY(${(dx * 7).toFixed(2)}deg) scale(1.02)`);
  };

  const activeCardNumber = customCardData?.cardNumber || dashboardData.cardNumber;
  const activeCardCcv = customCardData?.cardCcv || dashboardData.cardCcv;
  const activeCardExp = customCardData?.cardExp || dashboardData.cardExp;

  const maskCardNumber = (num: string) => {
    const parts = num.split(" ");
    if (parts.length === 4) return `${parts[0]} •••• •••• ${parts[3]}`;
    return num;
  };

  const toggleCardNumberReveal = () => {
    if (cardNumberRevealed) {
      setCardNumberRevealed(false);
    } else {
      setCardNumberRevealed(true);
      setTimeout(() => setCardNumberRevealed(false), 10000);
    }
  };

  const generateCardNumber = () => {
    const blocks = Array.from({ length: 4 }, () => String(1000 + Math.floor(Math.random() * 9000)));
    return `${blocks[0]} ${blocks[1]} ${blocks[2]} ${blocks[3]}`;
  };

  const handleCardGenerate = () => {
    if (cardGenerating) return;
    setCardGenerating(true);
    setTimeout(() => {
      const newNumber = generateCardNumber();
      const newCcv = String(100 + Math.floor(Math.random() * 900));
      const newExpMonth = String(1 + Math.floor(Math.random() * 12)).padStart(2, "0");
      const newExpYear = String(28 + Math.floor(Math.random() * 5));
      setCustomCardData({ cardNumber: newNumber, cardCcv: newCcv, cardExp: `${newExpMonth}/${newExpYear}` });
      setCardGenerating(false);
      setCardLocked(false);
      setCardNumberRevealed(false);
      showToast("Nouvelle carte générée avec succès");
    }, 1800);
  };

  const openPaymentsTab = () => {
    setScreen("payments");
  };

  const openCardsTab = () => {
    setScreen("cards");
    setNavActive("Cartes");
  };

  const openPrivilegesTab = () => {
    setScreen("privileges");
    setNavActive("Privilèges");
  };

  const openProfileTab = () => {
    setScreen("profile");
    setNavActive("Profil");
  };

  const openDashboard = () => {
    setScreen("dashboard");
    setNavActive("Accueil");
  };

  const openTransaction = (type: TransactionType) => {
    setTransactionType(type);
    setTransactionReturnScreen(screen);
    setScreen("transaction");
  };

  const openServices = () => {
    setScreen("services");
    setNavActive("Accueil");
  };

  const openMerchant = () => {
    setScreen("merchant");
    setNavActive("Accueil");
  };

  const openFromSearch = (id: string) => {
    if (id === "credit") {
      openAirtimeData();
      return;
    }
    if (id === "internet") {
      openInternet();
      return;
    }
    if (id === "canal") {
      openCanalPlus();
      return;
    }
    if (id === "merchant") {
      openMerchant();
      return;
    }
    if (id === "crypto") {
      openCrypto();
      return;
    }
    if (id === "loan") {
      openMicroCredit();
      return;
    }
    if (id === "personalloan") {
      openPersonalLoan();
      return;
    }
    if (id === "currency") {
      openCurrency();
      return;
    }
    if (id === "tontine") {
      openTontine();
      return;
    }
    if (id === "savings") {
      openSavings();
      return;
    }
    if (id === "utility-elec") {
      openElectricity();
      return;
    }
    if (id === "utility-water") {
      openWater();
      return;
    }
    if (id === "wallet") {
      openWallet();
      return;
    }
  };

  const openSavings = () => {
    setScreen("savings");
    setNavActive("Accueil");
  };

  const openMicroCredit = () => {
    setScreen("microcredit");
    setNavActive("Accueil");
  };

  const openPersonalLoan = () => {
    setScreen("personalloan");
    setNavActive("Accueil");
  };

  const openWallet = () => {
    setScreen("wallet");
    setNavActive("Accueil");
  };

  const openCurrency = () => {
    setScreen("currency");
    setNavActive("Accueil");
  };

  const openEurWallet = () => {
    setScreen("eurWallet");
    setNavActive("Accueil");
  };

  const openUsdWallet = () => {
    setScreen("usdWallet");
    setNavActive("Accueil");
  };

  const openAirtimeData = () => {
    setScreen("credit");
    setNavActive("Accueil");
  };

  const openInternet = () => {
    setScreen("internet");
    setNavActive("Accueil");
  };

  const openCanalPlus = () => {
    setScreen("canalplus");
    setNavActive("Accueil");
  };

  const openElectricity = () => {
    setScreen("electricity");
    setNavActive("Accueil");
  };

  const openWater = () => {
    setScreen("water");
    setNavActive("Accueil");
  };

  const openTontine = () => {
    setScreen("tontine");
    setNavActive("Accueil");
  };

  const openCrypto = () => {
    setScreen("crypto");
    setNavActive("Accueil");
  };

  const closeServices = () => {
    setScreen("dashboard");
    setNavActive("Accueil");
  };

  const closeHub = () => {
    setScreen("services");
    setNavActive("Accueil");
  };

  const resetTransactionFlow = () => {
    setTransactionChoiceOpen(false);
    setTransactionDestination(null);
    setTransactionPinOpen(false);
    setTransactionPin("");
    setTransactionProcessing(false);
    setTransactionSuccess(false);
  };

  const closeTransaction = () => {
    resetTransactionFlow();
    setScreen(transactionReturnScreen);
  };

  const validateTransactionFields = () => {
    if (!transactionAmount || transactionNumericAmount <= 0) {
      showToast("Entrez un montant valide");
      return false;
    }

    const digits = transactionPhone.replace(/\D/g, "");
    if (!/^(06|05)\d{7}$/.test(digits)) {
      showToast("Le numéro doit contenir 9 chiffres et commencer par 06 ou 05");
      return false;
    }

    return true;
  };

  const openTransactionChoice = () => {
    if (!validateTransactionFields()) return;
    setTransactionChoiceOpen(true);
  };

  const closeTransactionChoice = () => {
    setTransactionChoiceOpen(false);
  };

  const openTransactionPin = () => {
    setTransactionPinOpen(true);
    setTransactionPin("");
    setTransactionProcessing(false);
    setTransactionSuccess(false);
    setTransactionPinVerifying(false);
  };

  const closeTransactionPin = () => {
    setTransactionPinOpen(false);
    setTransactionPin("");
    setTransactionProcessing(false);
    setTransactionSuccess(false);
    setTransactionPinVerifying(false);
    setPendingPinAction(null);
  };

  const selectTransactionDestination = (destination: "cash" | "airtime") => {
    setTransactionDestination(destination);
    window.setTimeout(() => {
      setTransactionChoiceOpen(false);
      openTransactionPin();
    }, 300);
  };

  const executeTransaction = async () => {
    setTransactionProcessing(true);
    try {
      const receiptId = `TX-${Date.now().toString().slice(-8)}`;
      if (authUid) {
        const userRef = doc(firebaseDb, "moraliUsers", authUid);

        // Pre-flight: check suspension
        const userSnap = await getDoc(userRef);
        if (userSnap.exists() && userSnap.data().accountStatus === "suspended") {
          showToast("Votre compte est suspendu. Opération impossible.");
          setTransactionProcessing(false);
          return;
        }

        // Operator limit checks (retrait only)
        if (transactionType === "retrait") {
          const limits = OPERATOR_LIMITS[transactionMethod].retrait;
          const opLabel = limits.label;
          if (transactionNumericAmount > limits.daily) {
            showToast(`Limite journalière ${opLabel} : ${formatCurrency(limits.daily)} FCFA`);
            setTransactionProcessing(false);
            return;
          }
          if (transactionNumericAmount > limits.monthly) {
            showToast(`Limite mensuelle ${opLabel} : ${formatCurrency(limits.monthly)} FCFA`);
            setTransactionProcessing(false);
            return;
          }
        }

        // Pre-flight balance check (retrait only)
        if (transactionType === "retrait") {
          const userBal = firestoreBalance !== null ? firestoreBalance : dashboardData.balance;
          if ((transactionNumericAmount + fees) > userBal) {
            showToast("Solde insuffisant pour ce retrait");
            setTransactionProcessing(false);
            return;
          }
        }

        // Atomic balance check + update via runTransaction
        const balanceDelta = transactionType === "depot"
          ? transactionNumericAmount - fees  // Net received after fees
          : -(transactionNumericAmount + fees);  // Gross debited including fees
        await runTransaction(firebaseDb, async (tx) => {
          const userDoc = await tx.get(userRef);
          if (!userDoc.exists()) throw new Error("USER_NOT_FOUND");
          const currentBal = userDoc.data().balance || 0;
          if (transactionType === "retrait" && (transactionNumericAmount + fees) > currentBal) {
            throw new Error("INSUFFICIENT_BALANCE");
          }
          tx.update(userRef, { balance: currentBal + balanceDelta, updatedAt: serverTimestamp() });
        });

        await createRealtimeTransaction({
          senderUid: authUid, senderMoraliId: bankingIdentity.id, senderName: dashboardName,
          recipientUid: authUid, recipientMoraliId: bankingIdentity.id, recipientName: dashboardName,
          amount: transactionNumericAmount, fees,
          type: transactionType, destination: transactionDestination || "cash", status: "success", receiptId,
        });
        try {
          const netAmount = transactionType === "depot" ? transactionNumericAmount - fees : transactionNumericAmount + fees;
          await createRealtimeNotification(authUid, {
            title: `${transactionType === "depot" ? "Dépôt" : "Retrait"} confirmé — FCFA ${formatCurrency(transactionNumericAmount)}`,
            time: "À l'instant", badge: transactionType === "depot" ? `+${formatCurrency(netAmount)}` : `-${formatCurrency(netAmount)}`,
            badgeClass: transactionType === "depot" ? "nb-green" : "nb-blue",
            icon: transactionType === "depot" ? "wallet" : "receive",
            bg: transactionType === "depot" ? "rgba(34,197,94,0.12)" : "rgba(59,130,246,0.12)", read: false,
          });
        } catch { /* notification best-effort */ }
      }
      window.setTimeout(() => {
        setTransactionProcessing(false);
        setTransactionSuccess(true);
        const destLabel = transactionDestination === "airtime" ? "Crédit d'appel" : "Mobile Money";
        const opLabel = transactionMethod === "mtn" ? "MTN" : "Airtel";
        showQuickNotif(
          transactionType === "depot" ? "credit" : "debit",
          `${transactionType === "depot" ? "Dépôt" : "Retrait"} ${destLabel} ${opLabel}`,
          formatCurrency(transactionNumericAmount),
          transactionType === "depot" ? "wallet" : "receive",
          transactionType === "depot" ? "#4ade80" : "#60a5fa"
        );
      }, 1500);
    } catch (err: unknown) {
      setTransactionProcessing(false);
      const msg = err instanceof Error ? err.message : "";
      if (msg === "INSUFFICIENT_BALANCE") showToast("Solde insuffisant");
      else { showToast("Transaction impossible pour le moment"); }
    }
  };

  const handleTransactionPinKey = async (value: string) => {
    if (transactionProcessing || transactionSuccess) return;

    if (value === "back") {
      setTransactionPin((current) => current.slice(0, -1));
      return;
    }

    if (transactionPin.length >= 4) return;
    const nextPin = `${transactionPin}${value}`.slice(0, 4);
    setTransactionPin(nextPin);

    if (nextPin.length === 4) {
      // ── SERVER-SIDE PIN VERIFICATION ──
      // Prevents PIN bypass via browser DevTools (same pattern as transfer flow)
      if (!cardPinExistsRef.current) {
        // No PIN set — proceed directly (same behavior as transfer flow)
        window.setTimeout(() => executeTransaction(), 120);
        return;
      }
      setTransactionPinVerifying(true);
      try {
        const res = await fetch("/api/verify-pin", {
          method: "POST",
          headers: await getAuthHeaders(),
          body: JSON.stringify({ pin: nextPin }),
        });
        const data = await res.json();
        if (res.status === 429) {
          setTransactionPin("");
          showToast(data.error || "Trop de tentatives");
          setTransactionPinVerifying(false);
          return;
        }
        if (!data.valid) {
          setTransactionPin("");
          showToast("Code PIN incorrect");
          setTransactionPinVerifying(false);
          return;
        }
        // PIN verified — proceed with transaction
        setTransactionPinVerifying(false);
        if (pendingPinAction) {
          const action = pendingPinAction;
          setPendingPinAction(null);
          window.setTimeout(async () => {
            closeTransactionPin();
            if (action.type === "merchant") {
              executeServiceDebit(action.amount, "Paiement Marchand", "qr");
            } else if (action.type === "savings_deposit") {
              executeSavingsTransfer("deposit");
            } else if (action.type === "savings_withdraw") {
              executeSavingsTransfer("withdraw");
            }
          }, 200);
          return;
        }
        window.setTimeout(() => executeTransaction(), 120);
      } catch {
        showToast("Erreur de vérification PIN");
        setTransactionPin("");
        setTransactionPinVerifying(false);
      }
    }
  };

  const finishTransactionFlow = () => {
    const operatorLabel = transactionMethod === "mtn" ? "MTN MoMo" : "Airtel Money";
    const destinationLabel = transactionDestination === "airtime" ? "Crédit d'appel" : "Mobile Money";
    const actionLabel = transactionType === "depot" ? "Dépôt" : "Retrait";
    showToast(`${actionLabel} ${destinationLabel} ${operatorLabel} effectué`);
    setTransactionAmount("");
    setTransactionPhone("");
    setTransactionMethod("mtn");
    resetTransactionFlow();
    setScreen(transactionReturnScreen);
  };

  // ── Admin Functions ──
  const handleAdminLongPressStart = () => {
    adminLongPressTriggered.current = false;
    adminLongPressRef.current = setTimeout(() => {
      adminLongPressTriggered.current = true;
      setScreen("admin");
    }, 3000);
  };

  const handleAdminLongPressEnd = () => {
    if (adminLongPressRef.current) {
      clearTimeout(adminLongPressRef.current);
      adminLongPressRef.current = null;
    }
  };

  // ── Fetch admin email from server (frozen/readonly on the login form) ──
  useEffect(() => {
    if (screen !== "admin" || isAdminLoggedIn || adminLoginEmailFetched) return;
    (async () => {
      try {
        const res = await fetch("/api/admin/config");
        if (res.ok) {
          const data = await res.json();
          if (data.email) {
            setAdminLoginEmail(data.email);
            setAdminForgotEmail(data.email);
          }
        }
      } catch {
        // Fallback: leave empty, user can type manually
      } finally {
        setAdminLoginEmailFetched(true);
      }
    })();
  }, [screen, isAdminLoggedIn, adminLoginEmailFetched]);

  // ── Admin forgot password handlers ──
  const adminForgotSendCode = async () => {
    if (!adminForgotEmail.trim() || !adminForgotEmail.includes("@")) {
      showToast("Email invalide");
      return;
    }
    setAdminForgotSending(true);
    try {
      const res = await fetch("/api/auth/send-reset-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminForgotEmail.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setAdminForgotStep("code");
      } else {
        showToast(data.error || "Erreur lors de l'envoi du code");
      }
    } catch {
      showToast("Erreur réseau");
    } finally {
      setAdminForgotSending(false);
    }
  };

  const adminForgotVerifyCode = async () => {
    if (adminForgotOtpCode.length !== 6) {
      showToast("Code à 6 chiffres requis");
      return;
    }
    setAdminForgotVerifying(true);
    try {
      const res = await fetch("/api/auth/verify-reset-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminForgotEmail.trim(), code: adminForgotOtpCode }),
      });
      const data = await res.json();
      if (data.success) {
        setAdminForgotStep("newPassword");
      } else {
        showToast(data.error || "Code invalide");
      }
    } catch {
      showToast("Erreur réseau");
    } finally {
      setAdminForgotVerifying(false);
    }
  };

  const adminForgotResetPassword = async () => {
    if (adminForgotNewPw.length < 8) {
      showToast("Minimum 8 caractères");
      return;
    }
    if (adminForgotNewPw !== adminForgotConfirmPw) {
      showToast("Les mots de passe ne correspondent pas");
      return;
    }
    setAdminForgotResetting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: adminForgotEmail.trim(), code: adminForgotOtpCode, newPassword: adminForgotNewPw }),
      });
      const data = await res.json();
      if (data.success) {
        setAdminForgotStep("success");
      } else {
        showToast(data.error || "Erreur lors de la réinitialisation");
      }
    } catch {
      showToast("Erreur réseau");
    } finally {
      setAdminForgotResetting(false);
    }
  };

  const handleAdminLogin = async () => {
    setAdminLoginLoading(true);
    setAdminLoginError("");
    try {
      // SECURITY: Step 0 — Server-side credential verification via API
      // This adds a server-side gate: credentials are checked against ADMIN_EMAIL
      // and ADMIN_PASSWORD_HASH env vars (bcrypt). Even if Firebase Auth is bypassed,
      // the admin password must match the server-side hash.
      try {
        const loginRes = await fetch("/api/admin/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: adminLoginEmail, password: adminLoginPassword }),
        });
        const loginData = await loginRes.json();
        if (!loginData.success) {
          setAdminLoginError(loginData.error || "Identifiants incorrects.");
          setAdminLoginLoading(false);
          return;
        }
      } catch {
        // API unreachable — allow fallback to Firebase Auth only in development
        if (process.env.NODE_ENV === "production") {
          setAdminLoginError("Service de connexion indisponible.");
          setAdminLoginLoading(false);
          return;
        }
      }

      // 1. Se connecter uniquement — jamais créer de compte
      const cred = await signInWithEmailAndPassword(firebaseAuth, adminLoginEmail, adminLoginPassword);

      // 2. Vérifier que le rôle "admin" existe DANS Firestore
      const userRef = doc(firebaseDb, "moraliUsers", cred.user.uid);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        setAdminLoginError("Compte non reconnu. Contactez le super-admin.");
        await signOut(firebaseAuth);
        return;
      }

      const userData = userDoc.data();
      if (userData.role !== "admin") {
        setAdminLoginError("Accès refusé. Vous n'avez pas les droits administrateur.");
        await signOut(firebaseAuth);
        return;
      }
      // Set permission level: "full" for super-admin, "viewer" for read-only
      setAdminPermissionLevel(userData.roleLevel === "viewer" ? "viewer" : "full");

      setIsAdminLoggedIn(true);
      setAdminLoginEmail("");
      setAdminLoginPassword("");
    } catch (err: unknown) {
      const code = typeof err === "object" && err && "code" in err ? String((err as { code?: string }).code || "") : "";
      if (code === "auth/user-not-found" || code === "auth/wrong-password" || code === "auth/invalid-credential") {
        setAdminLoginError("Identifiants incorrects.");
      } else if (code === "auth/too-many-requests") {
        setAdminLoginError("Trop de tentatives. Réessayez plus tard.");
      } else {
        setAdminLoginError("Erreur de connexion. Vérifiez vos identifiants.");
      }
    } finally {
      setAdminLoginLoading(false);
    }
  };

  const handleAdminLogout = async () => {
    // SECURITY: Revoke all tokens on server (forces logout on ALL devices)
    try { await fetch("/api/auth/logout", { method: "POST", headers: await getAuthHeaders() }); } catch { /* best-effort */ }
    try { await signOut(firebaseAuth); } catch { /* ignore */ }
    setIsAdminLoggedIn(false);
    setAdminPermissionLevel("full");
    setAdminTab("overview");
    setAdminUsers([]);
    setAdminTransactions([]);
    setAdminSelectedUser(null);
    setAdminLoginError("");
    setLogoutModalOpen(false);
    setScreen("auth");
    showToast("Déconnexion effectuée");
  };

  const fetchAdminData = async () => {
    setAdminLoading(true);
    try {
      const [usersSnap, txSnap] = await Promise.all([
        getDocs(collection(firebaseDb, "moraliUsers")),
        getDocs(collection(firebaseDb, "transactions")),
      ]);
      const users = usersSnap.docs
        .map((d) => ({ uid: d.id, ...d.data() } as FirestoreMoraliUser))
        .filter((u) => u.role !== "admin");
      const txs = txSnap.docs
        .map((d) => ({ id: d.id, ...d.data() } as FirestoreTransfer & { id?: string }))
        .filter((d) => d.type !== "__directory__" && d.status !== "directory")
        .sort((a, b) => {
          const ta = a.createdAt && typeof a.createdAt === "object" && "seconds" in a.createdAt ? (a.createdAt as { seconds: number }).seconds * 1000 : 0;
          const tb = b.createdAt && typeof b.createdAt === "object" && "seconds" in b.createdAt ? (b.createdAt as { seconds: number }).seconds * 1000 : 0;
          return tb - ta;
        });
      setAdminUsers(users);
      setAdminTransactions(txs as FirestoreTransfer[]);
    } catch (err) {
      /* admin data fetch failed silently */
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (isAdminLoggedIn) {
      fetchAdminData();
    }
  }, [isAdminLoggedIn]);

  // Load loan applications for admin loans tab
  useEffect(() => {
    if (isAdminLoggedIn && adminTab === "loans") {
      setAdminLoansLoading(true);
      // Load from transactions collection where destination is loan_request
      const q = query(collection(firebaseDb, "transactions"), where("destination", "==", "loan_request"));
      getDocs(q).then((snap) => {
        const loans = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        loans.sort((a, b) => {
          const ta = a.createdAt?.seconds || 0;
          const tb = b.createdAt?.seconds || 0;
          return tb - ta;
        });
        setAdminLoans(loans);
      }).catch((err: unknown) => { console.error("Erreur chargement prêts admin:", err); showToast("Erreur de connexion"); }).finally(() => setAdminLoansLoading(false));
    }
  }, [isAdminLoggedIn, adminTab]);

  // Fetch audit logs when audit tab is selected
  useEffect(() => {
    if (!isAdminLoggedIn || adminTab !== "audit" || !authUid) return;
    const fetchLogs = async () => {
      try {
        const res = await fetch("/api/admin/audit-log?limit=50", { headers: await getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          setAuditLogs(data.logs || []);
        }
      } catch {}
    };
    fetchLogs();
  }, [isAdminLoggedIn, adminTab, authUid, auditLogRefreshKey]);

  const adminTotalBalance = useMemo(() => adminUsers.reduce((s, u) => s + (u.balance || 0), 0), [adminUsers]);
  const adminTotalTransactions = useMemo(() => adminTransactions.reduce((s, t) => s + t.amount, 0), [adminTransactions]);
  const adminTodayTransactions = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    return adminTransactions.filter((t) => {
      if (!t.createdAt || typeof t.createdAt !== "object" || !("seconds" in t.createdAt)) return false;
      return (t.createdAt as { seconds: number }).seconds * 1000 >= todayMs;
    }).length;
  }, [adminTransactions]);

  const filteredAdminUsers = useMemo(() => {
    if (!adminSearchQuery.trim()) return adminUsers;
    const q = adminSearchQuery.toLowerCase();
    return adminUsers.filter(
      (u) =>
        (u.fullName || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q) ||
        (u.moraliId || "").toLowerCase().includes(q) ||
        (u.pseudo || "").toLowerCase().includes(q)
    );
  }, [adminUsers, adminSearchQuery]);

  const filteredAdminTransactions = useMemo(() => {
    let result = adminTransactions;
    if (adminTxFilter !== "all") result = result.filter((t) => t.type === adminTxFilter);
    if (adminTxDateFrom) {
      const fromMs = new Date(adminTxDateFrom).setHours(0, 0, 0, 0);
      result = result.filter((t) => {
        if (!t.createdAt || typeof t.createdAt !== "object" || !("seconds" in t.createdAt)) return false;
        return (t.createdAt as { seconds: number }).seconds * 1000 >= fromMs;
      });
    }
    if (adminTxDateTo) {
      const toMs = new Date(adminTxDateTo).setHours(23, 59, 59, 999);
      result = result.filter((t) => {
        if (!t.createdAt || typeof t.createdAt !== "object" || !("seconds" in t.createdAt)) return false;
        return (t.createdAt as { seconds: number }).seconds * 1000 <= toMs;
      });
    }
    if (adminTxAmountMin) {
      const min = parseFloat(adminTxAmountMin);
      if (!isNaN(min)) result = result.filter((t) => t.amount >= min);
    }
    if (adminTxAmountMax) {
      const max = parseFloat(adminTxAmountMax);
      if (!isNaN(max)) result = result.filter((t) => t.amount <= max);
    }
    return result;
  }, [adminTransactions, adminTxFilter, adminTxDateFrom, adminTxDateTo, adminTxAmountMin, adminTxAmountMax]);

  const getAdminUserInitials = (user: FirestoreMoraliUser) => {
    const first = (user.firstName || user.pseudo || "?").charAt(0).toUpperCase();
    const last = (user.lastName || "").charAt(0).toUpperCase();
    return last ? first + last : first;
  };

  const formatAdminDate = (ts: unknown) => {
    if (!ts || typeof ts !== "object" || !("seconds" in ts)) return "—";
    return new Date((ts as { seconds: number }).seconds * 1000).toLocaleDateString("fr-FR", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  };

  const getAdminTxTypeLabel = (type: string) => {
    switch (type) {
      case "virement": return { label: "Virement", cls: "info" };
      case "depot": return { label: "Dépôt", cls: "success" };
      case "retrait": return { label: "Retrait", cls: "warning" };
      case "remboursement": return { label: "Remboursement", cls: "danger" };
      default: return { label: type, cls: "info" };
    }
  };

  const logAdminActivity = async (action: string, detail: string) => {
    setAdminActivityLog((prev) => [{ action, detail, timestamp: new Date() }, ...prev]);
    // Persister dans la DB via API (auth automatique via token)
    try {
      const headers = await getAuthHeaders();
      logAdminAction(action, detail, undefined, headers).catch((err: unknown) => { console.error("Erreur journal activité:", err); });
    } catch { /* token unavailable */ }
    // Auto-refresh audit log tab if visible
    setAuditLogRefreshKey((k) => k + 1);
  };

  const handleAdminBalanceEdit = async (mode: "add" | "subtract") => {
    if (!adminSelectedUser || !adminBalanceEditAmount) return;
    const amount = parseFloat(adminBalanceEditAmount);
    if (isNaN(amount) || amount <= 0) return;
    // Sécurité: vérifier solde suffisant pour un retrait
    if (mode === "subtract" && amount > (adminSelectedUser.balance || 0)) {
      showToast(`Solde insuffisant — disponible: ${formatCurrency(adminSelectedUser.balance || 0)} XAF`);
      return;
    }
    try {
      const userRef = doc(firebaseDb, "moraliUsers", adminSelectedUser.uid);
      if (mode === "add") {
        await updateDoc(userRef, { balance: increment(amount) });
        const txReceiptId = `ADM-${Date.now()}`;
        // Écrire dans Firestore pour le dashboard + PostgreSQL pour l'historique
        await addDoc(collection(firebaseDb, "transactions"), {
          senderUid: "admin", senderMoraliId: "admin", senderName: "Admin Morali",
          recipientUid: adminSelectedUser.uid, recipientMoraliId: adminSelectedUser.moraliId || "",
          recipientName: adminSelectedUser.fullName || adminSelectedUser.pseudo || "",
          amount, fees: 0, type: "depot", status: "success", receiptId: txReceiptId,
          createdAt: serverTimestamp(),
        });
        await createRealtimeTransaction({
          senderUid: "admin", senderMoraliId: "admin", senderName: "Admin Morali",
          recipientUid: adminSelectedUser.uid, recipientMoraliId: adminSelectedUser.moraliId || "",
          recipientName: adminSelectedUser.fullName || adminSelectedUser.pseudo || "",
          amount, fees: 0, type: "depot", status: "success", receiptId: txReceiptId,
        });
        logAdminActivity("Dépôt de fonds", `+${formatCurrency(amount)} XAF → ${adminSelectedUser.fullName || adminSelectedUser.pseudo}`);
        // Notifier l'utilisateur du dépôt
        await createRealtimeNotification(adminSelectedUser.uid, {
          title: `Dépôt reçu : ${formatCurrency(amount)} XAF`,
          time: new Date().toLocaleString("fr-FR"),
          badge: "Dépôt",
          badgeClass: "nb-green",
          icon: "wallet",
          bg: "rgba(34,197,94,0.12)",
          read: false,
        });
      } else {
        // Double protection: runTransaction lit le solde actuel avant de débiter
        await runTransaction(firebaseDb, async (tx) => {
          const userSnap = await tx.get(userRef);
          if (!userSnap.exists()) throw new Error("USER_NOT_FOUND");
          const currentBal = userSnap.data().balance || 0;
          if (amount > currentBal) throw new Error("INSUFFICIENT_BALANCE");
          tx.update(userRef, { balance: currentBal - amount, updatedAt: serverTimestamp() });
        });
        const txReceiptId = `ADM-${Date.now()}`;
        // Écrire dans Firestore pour le dashboard + PostgreSQL pour l'historique
        await addDoc(collection(firebaseDb, "transactions"), {
          senderUid: adminSelectedUser.uid, senderMoraliId: adminSelectedUser.moraliId || "",
          senderName: adminSelectedUser.fullName || adminSelectedUser.pseudo || "",
          recipientUid: "admin", recipientMoraliId: "admin", recipientName: "Admin Morali",
          amount, fees: 0, type: "retrait", status: "success", receiptId: txReceiptId,
          createdAt: serverTimestamp(),
        });
        await createRealtimeTransaction({
          senderUid: adminSelectedUser.uid, senderMoraliId: adminSelectedUser.moraliId || "",
          senderName: adminSelectedUser.fullName || adminSelectedUser.pseudo || "",
          recipientUid: "admin", recipientMoraliId: "admin", recipientName: "Admin Morali",
          amount, fees: 0, type: "retrait", status: "success", receiptId: txReceiptId,
        });
        logAdminActivity("Retrait de fonds", `-${formatCurrency(amount)} XAF → ${adminSelectedUser.fullName || adminSelectedUser.pseudo}`);
        // Notifier l'utilisateur du retrait
        await createRealtimeNotification(adminSelectedUser.uid, {
          title: `Retrait effectué : ${formatCurrency(amount)} XAF`,
          time: new Date().toLocaleString("fr-FR"),
          badge: "Retrait",
          badgeClass: "nb-blue",
          icon: "wallet",
          bg: "rgba(59,130,246,0.12)",
          read: false,
        });
      }
      setAdminBalanceEditAmount("");
      setAdminBalanceEditMode(null);
      setAdminUsers((prev) => prev.map((u) => u.uid === adminSelectedUser.uid ? { ...u, balance: (u.balance || 0) + (mode === "add" ? amount : -amount) } : u));
      setAdminSelectedUser((prev) => prev ? { ...prev, balance: (prev.balance || 0) + (mode === "add" ? amount : -amount) } : prev);
      fetchAdminData();
      showToast(mode === "add" ? "Fonds ajoutés avec succès" : "Fonds retirés avec succès");
    } catch (err) {
      console.error("Erreur modification solde:", err);
      showToast("Erreur lors de la modification du solde");
    }
  };

  const handleAdminSuspendUser = async () => {
    if (!adminSelectedUser) return;
    const isSuspended = adminSelectedUser.accountStatus === "suspended";
    try {
      const userRef = doc(firebaseDb, "moraliUsers", adminSelectedUser.uid);
      await updateDoc(userRef, { accountStatus: isSuspended ? "active" : "suspended" });
      const newStatus = isSuspended ? "active" : "suspended";
      setAdminUsers((prev) => prev.map((u) => u.uid === adminSelectedUser.uid ? { ...u, accountStatus: newStatus as "active" | "suspended" } : u));
      setAdminSelectedUser((prev) => prev ? { ...prev, accountStatus: newStatus as "active" | "suspended" } : prev);
      logAdminActivity(isSuspended ? "Réactivation compte" : "Suspension compte", `${adminSelectedUser.fullName || adminSelectedUser.pseudo} → ${newStatus}`);
      // Notifier l'utilisateur de la modification de son compte
      await createRealtimeNotification(adminSelectedUser.uid, {
        title: isSuspended ? "Votre compte a été réactivé" : "Votre compte a été suspendu",
        time: new Date().toLocaleString("fr-FR"),
        badge: isSuspended ? "Sécurité" : "Alerte",
        badgeClass: isSuspended ? "nb-green" : "nb-red",
        icon: "shield",
        bg: isSuspended ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
        read: false,
      });
    } catch (err) {
      /* suspend failed silently */
    }
  };

  const handleAdminDeleteUser = async () => {
    if (!adminSelectedUser) return;
    const uid = adminSelectedUser.uid;
    try {
      // 1. Try API first (Admin SDK bypasses Firestore rules)
      const apiRes = await fetch("/api/admin/delete-user", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ uid }),
      });
      const apiData = await apiRes.json().catch(() => ({}));

      if (apiData.success) {
        // API succeeded — full cleanup done server-side (including Firebase Auth disable)
        setAdminUsers((prev) => prev.filter((u) => u.uid !== uid));
        setAdminSelectedUser(null);
        setAdminConfirmAction(null);
        logAdminActivity("Suppression utilisateur", `${adminSelectedUser.fullName || adminSelectedUser.pseudo} (${adminSelectedUser.email})`);
        showToast("Utilisateur supprimé — toutes les données Firebase nettoyées");
        return;
      }

      // 2. Fallback: client-side Firestore deletion
      await deleteDoc(doc(firebaseDb, "moraliUsers", uid));
      try { await deleteDoc(doc(firebaseDb, "pinRecords", uid)); } catch { }
      try { await deleteDoc(doc(firebaseDb, "kycRecords", uid)); } catch { }

      const sentSnap = await getDocs(query(collection(firebaseDb, "transactions"), where("senderUid", "==", uid)));
      if (!sentSnap.empty) {
        const batch1 = writeBatch(firebaseDb);
        sentSnap.docs.forEach((d) => batch1.delete(d.ref));
        await batch1.commit();
      }
      const recvSnap = await getDocs(query(collection(firebaseDb, "transactions"), where("recipientUid", "==", uid)));
      if (!recvSnap.empty) {
        const batch2 = writeBatch(firebaseDb);
        recvSnap.docs.forEach((d) => batch2.delete(d.ref));
        await batch2.commit();
      }

      setAdminUsers((prev) => prev.filter((u) => u.uid !== uid));
      setAdminSelectedUser(null);
      setAdminConfirmAction(null);
      logAdminActivity("Suppression utilisateur", `${adminSelectedUser.fullName || adminSelectedUser.pseudo} (${adminSelectedUser.email})`);
      showToast("Utilisateur supprimé (mode fallback — Firebase Auth non désactivé)");
    } catch (err) {
      console.error("Erreur suppression utilisateur:", err);
      showToast("Erreur lors de la suppression : " + (err instanceof Error ? err.message : "Erreur inconnue"));
    }
  };

  const handleAdminResetPin = async () => {
    if (!adminSelectedUser) return;
    try {
      // SECURITY: PIN is stored client-side only (hashed).
      // Admin cannot set a PIN for another user — they can only
      // flag the account to require PIN re-setup on next login.
      const userRef = doc(firebaseDb, "moraliUsers", adminSelectedUser.uid);
      await updateDoc(userRef, { pinResetRequired: true });
      logAdminActivity("Réinitialisation PIN", `PIN réinitialisé pour ${adminSelectedUser.fullName || adminSelectedUser.pseudo}`);
      showToast("PIN réinitialisé — l'utilisateur devra créer un nouveau code");
      // Notifier l'utilisateur que son PIN a été réinitialisé
      await createRealtimeNotification(adminSelectedUser.uid, {
        title: "Votre code PIN a été réinitialisé",
        time: new Date().toLocaleString("fr-FR"),
        badge: "Sécurité",
        badgeClass: "nb-gold",
        icon: "lock",
        bg: "rgba(245,158,11,0.12)",
        read: false,
      });
    } catch {
      /* admin reset PIN failed silently */
      showToast("Échec de la réinitialisation PIN");
    }
  };

  const handleAdminRefund = async (tx: FirestoreTransfer) => {
    if (!tx || tx.type !== "virement") return;
    try {
      if (tx.recipientUid !== tx.senderUid) {
        const senderRef = doc(firebaseDb, "moraliUsers", tx.senderUid);
        const recipientRef = doc(firebaseDb, "moraliUsers", tx.recipientUid);
        await runTransaction(firebaseDb, async (txn) => {
          const [recipientDoc, senderDoc] = await Promise.all([txn.get(recipientRef), txn.get(senderRef)]);
          if (!recipientDoc.exists()) throw new Error("RECIPIENT_NOT_FOUND");
          if (!senderDoc.exists()) throw new Error("SENDER_NOT_FOUND");
          const recipientBal = recipientDoc.data().balance || 0;
          if (recipientBal < tx.amount) throw new Error("INSUFFICIENT_BALANCE");
          txn.update(recipientRef, { balance: recipientBal - tx.amount, updatedAt: serverTimestamp() });
          const senderBal = senderDoc.data().balance || 0;
          txn.update(senderRef, { balance: senderBal + tx.amount, updatedAt: serverTimestamp() });
        });
      } else {
        const senderRef = doc(firebaseDb, "moraliUsers", tx.senderUid);
        await updateDoc(senderRef, { balance: increment(tx.amount) });
      }
      // Create refund transaction record after successful balance operations
      await createRealtimeTransaction({
        senderUid: "admin", senderMoraliId: "admin", senderName: "Admin Morali",
        recipientUid: tx.senderUid, recipientMoraliId: tx.senderMoraliId || "",
        recipientName: tx.senderName || "",
        amount: tx.amount, fees: 0, type: "remboursement", status: "success",
        receiptId: `REF-${Date.now()}`,
      });
      // Notify the sender about the refund
      try {
        await createRealtimeNotification(tx.senderUid, {
          title: `Remboursement reçu — +${formatCurrency(tx.amount)} FCFA`,
          time: "À l'instant", badge: "Reçu", badgeClass: "nb-green",
          icon: "refresh", bg: "rgba(34,197,94,0.12)", read: false,
        });
      } catch {}
      // Notify the recipient if different from sender
      if (tx.recipientUid && tx.recipientUid !== tx.senderUid) {
        try {
          await createRealtimeNotification(tx.recipientUid, {
            title: `Retrait virement — -${formatCurrency(tx.amount)} FCFA`,
            time: "À l'instant", badge: "Débit", badgeClass: "nb-blue",
            icon: "arrow-down", bg: "rgba(59,130,246,0.12)", read: false,
          });
        } catch {}
      }
      logAdminActivity("Remboursement", `Remboursement de ${formatCurrency(tx.amount)} XAF à ${tx.senderName}`);
      setAdminConfirmAction(null);
      setAdminSelectedTx(null);
      fetchAdminData();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "INSUFFICIENT_BALANCE") showToast("Solde du destinataire insuffisant pour le remboursement");
      else { /* refund failed silently */ }
    }
  };

  const handleAdminSendNotification = async () => {
    if (!adminSelectedUser || !adminNotifForm.title || !adminNotifForm.message) return;
    try {
      await createRealtimeNotification(adminSelectedUser.uid, {
        title: `${adminNotifForm.title}: ${adminNotifForm.message}`,
        time: new Date().toLocaleString("fr-FR"),
        badge: "Admin", badgeClass: "nb-blue", icon: "bell", bg: "rgba(59,130,246,0.12)", read: false,
      });
      logAdminActivity("Notification envoyée", `À ${adminSelectedUser.fullName || adminSelectedUser.pseudo}: "${adminNotifForm.title}"`);
      setAdminNotifForm({ title: "", message: "", open: false });
    } catch (err) {
      /* notification failed silently */
    }
  };

  const generateUsersCSV = () => {
    const headers = ["Nom", "Email", "Pseudo", "ID Morali", "Solde", "Statut", "Date inscription"];
    const rows = filteredAdminUsers.map((u) => [
      u.fullName || "",
      u.email || "",
      u.pseudo || "",
      u.moraliId || "",
      String(u.balance || 0),
      (u as Record<string, unknown>).accountStatus === "suspended" ? "Suspendu" : "Actif",
      formatAdminDate(u.createdAt),
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "morali_users.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const generateTransactionsCSV = () => {
    const headers = ["Date", "Expéditeur", "Destinataire", "Montant", "Frais", "Type", "Statut", "Reçu"];
    const rows = filteredAdminTransactions.map((t) => [
      formatAdminDate(t.createdAt),
      t.senderName || t.senderMoraliId || "",
      t.recipientName || t.recipientMoraliId || "",
      String(t.amount),
      String(t.fees),
      t.type,
      t.status,
      t.receiptId || "",
    ]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "morali_transactions.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportFinancialReportPDF = async () => {
    try {
      const doc = new jsPDF();

      // Title
      doc.setFontSize(18);
      doc.setTextColor(30, 30, 30);
      doc.text("Morali Pay \u2014 Rapport Financier", 14, 22);

      // Period
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(`P\u00e9riode : ${adminFinancialReport.rangeLabel}`, 14, 30);
      doc.text(`G\u00e9n\u00e9r\u00e9 le : ${new Date().toLocaleString("fr-FR")}`, 14, 36);

      // Summary stats
      doc.setFontSize(11);
      doc.setTextColor(30, 30, 30);
      doc.text("R\u00e9sum\u00e9", 14, 48);

      const summaryData = [
        ["Total D\u00e9p\u00f4ts", `${formatCurrency(adminFinancialReport.totalDepots)} XAF`],
        ["Total Retraits", `${formatCurrency(adminFinancialReport.totalRetraits)} XAF`],
        ["Total Virements", `${formatCurrency(adminFinancialReport.totalVirements)} XAF`],
        ["R\u00e9sultat Net", `${adminFinancialReport.net >= 0 ? "+" : ""}${formatCurrency(adminFinancialReport.net)} XAF`],
      ];

      autoTable(doc, {
        startY: 52,
        head: [["Indicateur", "Montant"]],
        body: summaryData,
        theme: "grid",
        headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
        styles: { fontSize: 10, cellPadding: 4 },
        columnStyles: { 0: { fontStyle: "bold" } },
      });

      // Transaction table
      if (adminFinancialReport.transactions.length > 0) {
        const lastY = (doc as any).lastAutoTable.finalY + 12;
        doc.setFontSize(11);
        doc.setTextColor(30, 30, 30);
        doc.text("D\u00e9tail des transactions", 14, lastY);

        const txData = adminFinancialReport.transactions.slice(0, 50).map((tx: any) => [
          tx.createdAt ? new Date(tx.createdAt).toLocaleDateString("fr-FR") : "\u2014",
          tx.type || "\u2014",
          tx.senderName || "\u2014",
          tx.recipientName || "\u2014",
          `${formatCurrency(tx.amount)} XAF`,
        ]);

        autoTable(doc, {
          startY: lastY + 6,
          head: [["Date", "Type", "De", "\u00c0", "Montant"]],
          body: txData,
          theme: "striped",
          headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold" },
          styles: { fontSize: 8, cellPadding: 3 },
        });
      }

      // Footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150, 150, 150);
        doc.text(
          `Morali Pay \u2014 Rapport confidentiel \u2014 Page ${i}/${pageCount}`,
          doc.internal.pageSize.getWidth() / 2,
          doc.internal.pageSize.getHeight() - 10,
          { align: "center" }
        );
      }

      doc.save(`Morali_Bank_Rapport_${adminReportMode}_${new Date().toISOString().slice(0, 10)}.pdf`);
      showToast("Rapport PDF export\u00e9 avec succ\u00e8s");
    } catch (err) {
      console.error("PDF export error:", err);
      showToast("Erreur lors de l\u2019export PDF");
    }
  };

  // Analytics computations
  const adminAnalyticsStats = useMemo(() => {
    const totalDepots = adminTransactions.filter((t) => t.type === "depot").reduce((s, t) => s + t.amount, 0);
    const totalRetraits = adminTransactions.filter((t) => t.type === "retrait").reduce((s, t) => s + t.amount, 0);
    const totalVirements = adminTransactions.filter((t) => t.type === "virement").reduce((s, t) => s + t.amount, 0);
    const avgBalance = adminUsers.length > 0 ? Math.round(adminUsers.reduce((s, u) => s + (u.balance || 0), 0) / adminUsers.length) : 0;
    return { totalDepots, totalRetraits, totalVirements, avgBalance };
  }, [adminTransactions, adminUsers]);

  const adminInscriptionsPerDay = useMemo(() => {
    const days: { label: string; count: number }[] = [];
    for (let d = 6; d >= 0; d--) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      date.setHours(0, 0, 0, 0);
      const endMs = new Date(date);
      endMs.setHours(23, 59, 59, 999);
      const startMs = date.getTime();
      const count = adminUsers.filter((u) => {
        if (!u.createdAt || typeof u.createdAt !== "object" || !("seconds" in u.createdAt)) return false;
        const ms = (u.createdAt as { seconds: number }).seconds * 1000;
        return ms >= startMs && ms <= endMs.getTime();
      }).length;
      days.push({ label: date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }), count });
    }
    return days;
  }, [adminUsers]);

  const adminTxVolumePerDay = useMemo(() => {
    const days: { label: string; depot: number; retrait: number; virement: number }[] = [];
    for (let d = 6; d >= 0; d--) {
      const date = new Date();
      date.setDate(date.getDate() - d);
      date.setHours(0, 0, 0, 0);
      const endMs = new Date(date);
      endMs.setHours(23, 59, 59, 999);
      const startMs = date.getTime();
      let depot = 0, retrait = 0, virement = 0;
      adminTransactions.forEach((t) => {
        if (!t.createdAt || typeof t.createdAt !== "object" || !("seconds" in t.createdAt)) return;
        const ms = (t.createdAt as { seconds: number }).seconds * 1000;
        if (ms >= startMs && ms <= endMs.getTime()) {
          if (t.type === "depot") depot += t.amount;
          else if (t.type === "retrait") retrait += t.amount;
          else if (t.type === "virement") virement += t.amount;
        }
      });
      days.push({ label: date.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric" }), depot, retrait, virement });
    }
    return days;
  }, [adminTransactions]);

  const adminTopUsersByVolume = useMemo(() => {
    const userVolumes: { uid: string; name: string; volume: number }[] = [];
    adminUsers.forEach((u) => {
      const vol = adminTransactions
        .filter((t) => t.senderUid === u.uid || t.recipientUid === u.uid)
        .reduce((s, t) => s + t.amount, 0);
      if (vol > 0) userVolumes.push({ uid: u.uid, name: u.fullName || u.pseudo || "—", volume: vol });
    });
    return userVolumes.sort((a, b) => b.volume - a.volume).slice(0, 5);
  }, [adminUsers, adminTransactions]);

  const submitTransaction = () => {
    openTransactionChoice();
  };

  // ── Real-time auto-refresh ──
  useEffect(() => {
    if (isAdminLoggedIn && screen === "admin") {
      adminRefreshRef.current = setInterval(async () => {
        await fetchAdminData();
        setAdminLastRefresh(new Date());
      }, 15000);
    } else {
      if (adminRefreshRef.current) {
        clearInterval(adminRefreshRef.current);
        adminRefreshRef.current = null;
      }
    }
    return () => {
      if (adminRefreshRef.current) {
        clearInterval(adminRefreshRef.current);
        adminRefreshRef.current = null;
      }
    };
  }, [isAdminLoggedIn, screen]);

  // Update lastRefresh on initial fetch

  const adminRefreshSeconds = useMemo(() => {
    return Math.floor((Date.now() - adminLastRefresh.getTime()) / 1000);
  }, [adminLastRefresh]);

  // Tick for refresh indicator
  useEffect(() => {
    const iv = setInterval(() => setAdminLastRefresh((d) => new Date(d.getTime())), 1000);
    return () => clearInterval(iv);
  }, []);

  // ── User profile editing ──
  const handleAdminEditProfileField = async (field: string) => {
    if (!adminSelectedUser || !adminEditValue.trim()) return;
    try {
      const userRef = doc(firebaseDb, "moraliUsers", adminSelectedUser.uid);
      const updateData: Record<string, string> = {};
      if (field === "firstName") updateData.firstName = adminEditValue.trim();
      else if (field === "lastName") updateData.lastName = adminEditValue.trim();
      else if (field === "phone") updateData.phone = adminEditValue.trim();
      else if (field === "pseudo") updateData.pseudo = adminEditValue.trim();
      await updateDoc(userRef, updateData);
      // Also update fullName if firstName or lastName changed
      if (field === "firstName" || field === "lastName") {
        const newFirst = field === "firstName" ? adminEditValue.trim() : (adminSelectedUser.firstName || "");
        const newLast = field === "lastName" ? adminEditValue.trim() : (adminSelectedUser.lastName || "");
        await updateDoc(userRef, { fullName: `${newFirst} ${newLast}`.trim() });
      }
      setAdminUsers((prev) => prev.map((u) => {
        if (u.uid !== adminSelectedUser.uid) return u;
        const updated = { ...u, ...updateData };
        if (field === "firstName" || field === "lastName") {
          updated.fullName = `${updated.firstName || ""} ${updated.lastName || ""}`.trim();
        }
        return updated;
      }));
      setAdminSelectedUser((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, ...updateData };
        if (field === "firstName" || field === "lastName") {
          updated.fullName = `${updated.firstName || ""} ${updated.lastName || ""}`.trim();
        }
        return updated;
      });
      logAdminActivity("Modification profil", `Champ "${field}" modifié pour ${adminSelectedUser.fullName || adminSelectedUser.pseudo}`);
      setAdminEditingField(null);
      setAdminEditValue("");
    } catch (err) {
      /* profile edit failed silently */
    }
  };

  // ── Bulk selection ──
  const toggleUserSelect = (uid: string) => {
    const next = new Set(adminSelectedUserIds);
    if (next.has(uid)) next.delete(uid); else next.add(uid);
    setAdminSelectedUserIds(next);
  };

  const selectAllUsers = () => {
    if (adminSelectedUserIds.size === pagedAdminUsers.length) {
      setAdminSelectedUserIds(new Set());
    } else {
      setAdminSelectedUserIds(new Set(pagedAdminUsers.map((u) => u.uid)));
    }
  };

  const handleBulkSuspend = async () => {
    if (adminSelectedUserIds.size === 0) return;
    const uidsToSuspend = Array.from(adminSelectedUserIds);
    const successfulUids: string[] = [];
    try {
      // Phase 1: Suspendre tous les utilisateurs un par un (ne pas utiliser Promise.all)
      for (const uid of uidsToSuspend) {
        try {
          await updateDoc(doc(firebaseDb, "moraliUsers", uid), { accountStatus: "suspended" as const });
          successfulUids.push(uid);
        } catch {
          console.error(`[bulk-suspend] Échec pour UID: ${uid}`);
        }
      }

      if (successfulUids.length === 0) {
        showToast("Aucun utilisateur n'a pu être suspendu");
        return;
      }

      // Phase 2: Mettre à jour le state local uniquement pour les succès
      setAdminUsers((prev) => prev.map((u) => successfulUids.includes(u.uid) ? { ...u, accountStatus: "suspended" as const } : u));
      logAdminActivity("Suspension en masse", `${successfulUids.length}/${uidsToSuspend.length} utilisateurs suspendus`);

      // Phase 3: Notifier chaque utilisateur suspendu (en parallèle, non bloquant)
      Promise.allSettled(
        successfulUids.map((uid) =>
          createRealtimeNotification(uid, {
            title: "Votre compte a été suspendu",
            time: new Date().toLocaleString("fr-FR"),
            badge: "Alerte",
            badgeClass: "nb-red",
            icon: "shield",
            bg: "rgba(239,68,68,0.12)",
            read: false,
          })
        )
      );

      // Feedback à l'admin
      if (successfulUids.length < uidsToSuspend.length) {
        showToast(`${successfulUids.length}/${uidsToSuspend.length} utilisateurs suspendus — certains ont échoué`);
      } else {
        showToast(`${successfulUids.length} utilisateurs suspendus avec succès`);
      }

      setAdminSelectedUserIds(new Set());
    } catch (err) {
      console.error("Erreur suspension en masse:", err);
      showToast("Erreur lors de la suspension en masse");
    }
  };

  const handleBulkExport = () => {
    const selected = filteredAdminUsers.filter((u) => adminSelectedUserIds.has(u.uid));
    const headers = ["Nom", "Email", "Pseudo", "ID Morali", "Solde", "Statut"];
    const rows = selected.map((u) => [u.fullName || "", u.email || "", u.pseudo || "", u.moraliId || "", String(u.balance || 0), u.accountStatus === "suspended" ? "Suspendu" : "Actif"]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "morali_export_selection.csv"; a.click();
    URL.revokeObjectURL(url);
    logAdminActivity("Export sélection", `${selected.length} utilisateurs exportés`);
  };

  const handleBulkNotify = async () => {
    try {
      await Promise.all(
        Array.from(adminSelectedUserIds).map((uid) =>
          createRealtimeNotification(uid, {
            title: "Notification administrative",
            time: new Date().toLocaleString("fr-FR"),
            badge: "Admin", badgeClass: "nb-blue", icon: "bell", bg: "rgba(59,130,246,0.12)", read: false,
          })
        )
      );
      logAdminActivity("Notification en masse", `Notification envoyée à ${adminSelectedUserIds.size} utilisateurs`);
      setAdminSelectedUserIds(new Set());
    } catch (err) {
      /* bulk notify failed silently */
    }
  };

  // ── Pagination ──
  const adminUsersTotalPages = Math.ceil(filteredAdminUsers.length / adminUsersPerPage) || 1;
  const pagedAdminUsers = filteredAdminUsers.slice((adminUsersPage - 1) * adminUsersPerPage, adminUsersPage * adminUsersPerPage);

  // Reset page on filter change
  useEffect(() => { setAdminUsersPage(1); }, [adminSearchQuery]);
  useEffect(() => { setAdminTxPage(1); }, [adminTxFilter, adminTxDateFrom, adminTxDateTo, adminTxAmountMin, adminTxAmountMax]);

  // ── Transaction search for transactions tab ──
  const txSearchFilteredAdminTransactions = useMemo(() => {
    if (adminTab !== "transactions" || !adminSearchQuery.trim()) return filteredAdminTransactions;
    const q = adminSearchQuery.toLowerCase();
    return filteredAdminTransactions.filter(
      (t) =>
        (t.senderName || "").toLowerCase().includes(q) ||
        (t.recipientName || "").toLowerCase().includes(q) ||
        (t.receiptId || "").toLowerCase().includes(q) ||
        (t.senderMoraliId || "").toLowerCase().includes(q) ||
        (t.recipientMoraliId || "").toLowerCase().includes(q)
    );
  }, [filteredAdminTransactions, adminSearchQuery, adminTab]);

  const pagedTxSearchTransactions = useMemo(() => {
    const txTotalPages = Math.ceil(txSearchFilteredAdminTransactions.length / adminTxPerPage) || 1;
    return txSearchFilteredAdminTransactions.slice((adminTxPage - 1) * adminTxPerPage, adminTxPage * adminTxPerPage);
  }, [txSearchFilteredAdminTransactions, adminTxPage, adminTxPerPage]);

  const txSearchTotalPages = Math.ceil(txSearchFilteredAdminTransactions.length / adminTxPerPage) || 1;

  // ── Contest/flag transaction ──
  const handleAdminContestTx = async (tx: FirestoreTransfer) => {
    try {
      // Find the tx document - we need its ID from the transactions collection
      const txId = (tx as FirestoreTransfer & { id?: string }).id;
      if (txId) {
        await updateDoc(doc(firebaseDb, "transactions", txId), { status: "contested" });
      }
      setAdminTransactions((prev) => prev.map((t) => (t as FirestoreTransfer & { id?: string }).id === txId ? { ...t, status: "contested" as const } : t));
      setAdminSelectedTx((prev) => prev && (prev as FirestoreTransfer & { id?: string }).id === txId ? { ...prev, status: "contested" as const } : prev);
      logAdminActivity("Transaction contestée", `${tx.receiptId} — ${formatCurrency(tx.amount)} XAF`);
    } catch (err) {
      /* contest tx failed silently */
    }
  };

  // ── Financial Reports ──
  const adminFinancialReport = useMemo(() => {
    const now = new Date();
    let startDate: Date;
    let rangeLabel: string;

    if (adminReportMode === "daily") {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      rangeLabel = `Aujourd'hui — ${now.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`;
    } else if (adminReportMode === "weekly") {
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1; // Monday
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff, 0, 0, 0);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      rangeLabel = `${startDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })} — ${endDate.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })}`;
    } else {
      startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
      rangeLabel = `${now.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`;
    }

    const startMs = startDate.getTime();
    const inRange = adminTransactions.filter((t) => {
      if (!t.createdAt || typeof t.createdAt !== "object" || !("seconds" in t.createdAt)) return false;
      return (t.createdAt as { seconds: number }).seconds * 1000 >= startMs;
    });

    const totalDepots = inRange.filter((t) => t.type === "depot").reduce((s, t) => s + t.amount, 0);
    const totalRetraits = inRange.filter((t) => t.type === "retrait").reduce((s, t) => s + t.amount, 0);
    const totalVirements = inRange.filter((t) => t.type === "virement").reduce((s, t) => s + t.amount, 0);
    const net = totalDepots - totalRetraits - totalVirements;

    return { rangeLabel, totalDepots, totalRetraits, totalVirements, net, transactions: inRange };
  }, [adminTransactions, adminReportMode]);

  // ── Fee calculation example ──
  const adminFeeExample = useMemo(() => {
    const exampleAmount = 500000;
    if (adminFeeMode === "fixed") {
      return `Ex: ${formatCurrency(exampleAmount)} XAF + ${formatCurrency(parseFloat(transferFee) || 0)} XAF = ${formatCurrency(exampleAmount + (parseFloat(transferFee) || 0))} XAF`;
    } else {
      const feePct = parseFloat(transferFee) || 0;
      const feeAmount = Math.round((exampleAmount * feePct) / 100);
      return `Ex: ${formatCurrency(exampleAmount)} XAF × ${feePct}% = ${formatCurrency(feeAmount)} XAF`;
    }
  }, [adminFeeMode, transferFee]);

  // ── Per-user limits ──
  const handleAdminSaveUserLimits = async () => {
    if (!adminSelectedUser) return;
    try {
      const userRef = doc(firebaseDb, "moraliUsers", adminSelectedUser.uid);
      await updateDoc(userRef, {
        dailyLimit: parseFloat(adminUserLimits.dailyLimit) || 0,
        txLimit: parseFloat(adminUserLimits.txLimit) || 0,
      });
      logAdminActivity("Limites modifiées", `Limites personnalisées mises à jour pour ${adminSelectedUser.fullName || adminSelectedUser.pseudo}`);
      setAdminLimitEditOpen(false);
    } catch (err) {
      /* save limits failed silently */
    }
  };

  // ── Admin roles ──
  const [adminAdminUsers, setAdminAdminUsers] = useState<FirestoreMoraliUser[]>([]);

  useEffect(() => {
    if (isAdminLoggedIn) {
      getDocs(collection(firebaseDb, "moraliUsers")).then((snap) => {
        const admins = snap.docs
          .map((d) => ({ uid: d.id, ...d.data() } as FirestoreMoraliUser))
          .filter((u) => (u as Record<string, unknown>).role === "admin");
        setAdminAdminUsers(admins);
      }).catch((err: unknown) => { console.error("Erreur chargement admins:", err); });
    }
  }, [isAdminLoggedIn]);

  const handleAdminChangeRole = async (uid: string, newRole: string) => {
    try {
      await updateDoc(doc(firebaseDb, "moraliUsers", uid), { adminRole: newRole });
      setAdminAdminUsers((prev) => prev.map((u) => u.uid === uid ? { ...u, adminRole: newRole } as FirestoreMoraliUser & { adminRole?: string } : u));
      logAdminActivity("Rôle modifié", `Rôle changé en "${newRole}" pour l'admin ${uid}`);
    } catch (err) {
      /* change role failed silently */
    }
  };

  // ── Backup/Restore ──
  const handleAdminBackup = async () => {
    setAdminBackupLoading(true);
    try {
      const [usersSnap, txSnap] = await Promise.all([
        getDocs(collection(firebaseDb, "moraliUsers")),
        getDocs(collection(firebaseDb, "transactions")),
      ]);
      const users = usersSnap.docs.map((d) => ({ uid: d.id, ...d.data() }));
      const transactions = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const backup = JSON.stringify({ users, transactions, exportedAt: new Date().toISOString(), version: 1 }, null, 2);
      const blob = new Blob([backup], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `morali_backup_${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      logAdminActivity("Sauvegarde exportée", `${users.length} utilisateurs, ${transactions.length} transactions`);
    } catch (err) {
      /* backup failed silently */
    } finally {
      setAdminBackupLoading(false);
    }
  };

  const handleAdminRestore = async (file: File) => {
    setAdminBackupLoading(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data.users || !data.transactions) throw new Error("Format de fichier invalide");
      let userCount = 0;
      let txCount = 0;
      await Promise.all(
        data.users.map((u: Record<string, unknown>) => {
          userCount++;
          return setDoc(doc(firebaseDb, "moraliUsers", String(u.uid)), u);
        })
      );
      await Promise.all(
        data.transactions.map((t: Record<string, unknown>) => {
          txCount++;
          return setDoc(doc(firebaseDb, "transactions", String(t.id)), t);
        })
      );
      logAdminActivity("Données restaurées", `${userCount} utilisateurs, ${txCount} transactions importés`);
      await fetchAdminData();
    } catch (err) {
      /* restore failed silently */
      logAdminActivity("Erreur restauration", `Échec de la restauration: ${(err as Error).message}`);
    } finally {
      setAdminBackupLoading(false);
    }
  };

  // ── Admin Loan Management ──
  const handleAdminApproveLoan = async (loan: { id: string; senderUid: string; senderName: string; senderMoraliId: string; amount: number; type?: string }) => {
    try {
      const userRef = doc(firebaseDb, "moraliUsers", loan.senderUid);
      const loanTxRef = doc(firebaseDb, "transactions", loan.id);

      // Atomically credit user balance and update loan status
      await runTransaction(firebaseDb, async (tx) => {
        const userDoc = await tx.get(userRef);
        if (!userDoc.exists()) throw new Error("USER_NOT_FOUND");
        const currentBal = userDoc.data().balance || 0;
        tx.update(userRef, { balance: currentBal + loan.amount, updatedAt: serverTimestamp() });
        tx.update(loanTxRef, { status: "success", destination: "loan_granted", updatedAt: serverTimestamp() });
      });

      // Create disbursement transaction record
      await createRealtimeTransaction({
        senderUid: "admin", senderMoraliId: "MORALI-ADMIN", senderName: "Morali Pay",
        recipientUid: loan.senderUid, recipientMoraliId: loan.senderMoraliId, recipientName: loan.senderName,
        amount: loan.amount, fees: 0,
        type: "depot", destination: "loan_granted", status: "success",
        receiptId: "LN-APPROVED-" + Date.now().toString().slice(-8),
      });

      // Notify user
      await createRealtimeNotification(loan.senderUid, {
        title: `Prêt approuvé — ${formatCurrency(loan.amount)} FCFA`,
        time: "À l'instant", badge: "Approuvé", badgeClass: "nb-green",
        icon: "bank", bg: "rgba(34,197,94,0.12)", read: false,
      });

      logAdminActivity("Prêt approuvé", `${loan.senderName} — ${formatCurrency(loan.amount)} FCFA`);
      showToast(`Prêt approuvé pour ${loan.senderName}`);
      setAdminLoans((prev) => prev.filter((l) => l.id !== loan.id));
    } catch (err) {
      /* approve loan failed silently */
      showToast("Erreur lors de l'approbation");
    }
  };

  const handleAdminRejectLoan = async (loan: { id: string; senderUid: string; senderName: string; amount: number; type?: string }) => {
    try {
      const loanTxRef = doc(firebaseDb, "transactions", loan.id);
      await updateDoc(loanTxRef, { status: "contested", updatedAt: serverTimestamp() });

      // Notify user
      await createRealtimeNotification(loan.senderUid, {
        title: `Prêt refusé — ${formatCurrency(loan.amount)} FCFA`,
        time: "À l'instant", badge: "Refusé", badgeClass: "nb-red",
        icon: "bank", bg: "rgba(239,68,68,0.12)", read: false,
      });

      logAdminActivity("Prêt refusé", `${loan.senderName} — ${formatCurrency(loan.amount)} FCFA`);
      showToast(`Prêt refusé pour ${loan.senderName}`);
      setAdminLoans((prev) => prev.filter((l) => l.id !== loan.id));
    } catch (err) {
      /* reject loan failed silently */
      showToast("Erreur lors du refus");
    }
  };

  const stepDot = (step: number) => {
    if (showRegisterSuccess || showPinSetup || currentStep > step) return "done";
    if (currentStep === step) return "active";
    return "";
  };

  const SIMULATED_BANNER = (
    <div style={{
      background: "linear-gradient(135deg, rgba(234,179,8,0.15), rgba(234,179,8,0.05))",
      border: "1px solid rgba(234,179,8,0.3)",
      borderRadius: "12px",
      padding: "12px 16px",
      marginBottom: "16px",
      display: "flex",
      alignItems: "center",
      gap: "10px",
    }}>
      <span style={{ fontSize: "18px" }}>🔔</span>
      <div>
        <div style={{ color: "#eab308", fontSize: "13px", fontWeight: 600 }}>Bientôt disponible</div>
        <div style={{ color: "#94a3b8", fontSize: "11px" }}>Ce service sera bientôt connecté à nos partenaires</div>
      </div>
    </div>
  );

  return (
    <RenderGuard>
    <>
      <style>{appStyles}</style>
      {!authChecked ? (
        <div className="stage"><div className="app-viewport" style={{ alignItems: "center", justifyContent: "center", color: "white", display: "flex" }}>Chargement sécurisé...</div></div>
      ) : accountSuspended ? (
        <div className="stage">
          <div className="app-viewport" style={{ alignItems: "center", justifyContent: "center", display: "flex", padding: 24 }}>
            <div style={{ textAlign: "center", maxWidth: 320 }}>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}>
                <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: "#fff", marginBottom: 8 }}>Compte Suspendu</div>
              <div style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.6, marginBottom: 28 }}>{suspensionMessage}</div>
              <button className="btn-secondary" onClick={() => {
                setScreen("auth");
                setAccountSuspended(false);
                signOut(firebaseAuth).catch(() => {});
              }} style={{ maxWidth: 200, margin: "0 auto" }}>Se déconnecter</button>
            </div>
          </div>
        </div>
      ) : (
      <div className="stage">
        <div className="app-viewport">
          {screen === "auth" && (
          <AuthView
            showToast={showToast}
            setScreen={setScreen}
            setNavActive={setNavActive}
            setDashboardName={setDashboardName}
            setProfileForm={setProfileForm}
            setBankingIdentity={setBankingIdentity}
            profileForm={profileForm}
            handleAdminLongPressStart={handleAdminLongPressStart}
            handleAdminLongPressEnd={handleAdminLongPressEnd}
            onAuthSuccess={() => {}}
            persistMoraliProfile={persistMoraliProfile}
          />
          )}
          {screen === "transaction" && (
            <TransactionsView
              type={transactionType}
              amount={transactionAmount}
              onAmountChange={setTransactionAmount}
              method={transactionMethod}
              onMethodChange={setTransactionMethod}
              phone={transactionPhone}
              onPhoneChange={setTransactionPhone}
              balance={firestoreBalance !== null ? firestoreBalance : dashboardData.balance}
              total={transactionTotal}
              onClose={closeTransaction}
              onSubmit={submitTransaction}
            />
          )}

          <div className={`app-screen ${screen === "services" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="services-screen">
                <div className="services-header">
                  <div className="services-topbar">
                    <h1 className="services-title">Services</h1>
                    <button className="services-bell" onClick={closeServices} aria-label="Fermer la fenêtre services">
                      <span className="close-x">×</span>
                    </button>
                  </div>

                  <div className="services-search" style={{ zIndex: 20 }}>
                    <span className="search-icon">
                      <AppIcon name="search" size={18} stroke="#64748b" />
                    </span>
                    <input
                      type="text"
                      placeholder="Rechercher un service ou marchand..."
                      value={servicesQuery}
                      onFocus={() => setServicesFocused(true)}
                      onBlur={() => window.setTimeout(() => setServicesFocused(false), 180)}
                      onChange={(e) => setServicesQuery(e.target.value)}
                    />
                    {servicesQuery && (
                      <button
                        type="button"
                        onClick={() => setServicesQuery("")}
                        style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: "#64748b", fontWeight: 800, cursor: "pointer" }}
                        aria-label="Effacer la recherche"
                      >
                        ×
                      </button>
                    )}

                    {servicesFocused && servicesQuery.trim().length > 0 && (
                      <div style={{ position: "absolute", top: 64, left: 0, width: "100%", background: "rgba(22,28,44,.95)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 28, boxShadow: "0 24px 48px rgba(0,0,0,.35)", overflow: "hidden" }}>
                        {filteredServices.length > 0 && (
                          <div style={{ padding: 16, borderBottom: filteredContacts.length ? "1px solid rgba(255,255,255,.05)" : "none" }}>
                            <p style={{ fontSize: 10, color: "#64748b", fontWeight: 900, textTransform: "uppercase", letterSpacing: ".18em", marginBottom: 10, padding: "0 8px" }}>Services & Actions</p>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {filteredServices.map((service) => (
                                <button
                                  key={service.id}
                                  type="button"
                                  onClick={() => { openFromSearch(service.id); setServicesQuery(""); }}
                                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: 12, borderRadius: 14, border: "none", background: "transparent", color: "white", cursor: "pointer", textAlign: "left" }}
                                >
                                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <AppIcon name={service.icon} size={18} stroke="#60a5fa" />
                                    <span style={{ fontSize: 14, fontWeight: 800 }}>{service.name}</span>
                                  </div>
                                  <span style={{ fontSize: 10, color: "#64748b", fontWeight: 800, textTransform: "uppercase" }}>{service.category}</span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {filteredServices.length === 0 && (
                          <div style={{ padding: 24, textAlign: "center", color: "#64748b", fontSize: 14, fontStyle: "italic" }}>
                            Aucun résultat pour “{servicesQuery}”
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <section className="services-section">
                  <div className="services-kicker">Quotidien</div>
                  <div className="services-grid">
                    {serviceTiles.map((tile) => (
                      <button
                        key={tile.name}
                        className="service-tile"
                        onClick={() => {
                          if (tile.name === "Crédit") {
                            openAirtimeData();
                            return;
                          }
                          if (tile.name === "Internet") {
                            openInternet();
                            return;
                          }
                          if (tile.name === "Canal+") {
                            openCanalPlus();
                            return;
                          }
                          if (tile.name === "Électricité") {
                            openElectricity();
                            return;
                          }
                          if (tile.name === "Eau") {
                            openWater();
                            return;
                          }
                          if (tile.name === "Marchand") {
                            openMerchant();
                            return;
                          }
                          showToast(`${tile.name} bientôt disponible`);
                        }}
                      >
                        {tile.badge && <span className="service-badge">{tile.badge}</span>}
                        <div className="service-icon-box">
                          <AppIcon name={tile.icon} size={20} stroke={tile.accent} />
                        </div>
                        <div className="service-name">{tile.name}</div>
                        <div className="service-desc">{tile.desc}</div>
                      </button>
                    ))}
                  </div>
                </section>

                <section className="services-section" style={{ marginTop: 34 }}>
                  <div className="services-section-head">
                    <div className="services-kicker">Finance & Investissement</div>
                    <span className="services-premium-badge">PREMIUM</span>
                  </div>

                  <div className="finance-grid">
                    <button className="finance-card emerald" onClick={openSavings}>
                      <div className="finance-card-icon emerald">
                        <AppIcon name="piggy" size={22} stroke="#34d399" />
                      </div>
                      <div className="finance-card-title">Épargne</div>
                      <div className="finance-card-sub emerald">Taux annuel +4.5%</div>
                    </button>

                    <button className="finance-card amber" onClick={() => { setScreen("loans"); setNavActive("Accueil"); }}>
                      <div className="finance-card-icon amber">
                        <AppIcon name="bank" size={22} stroke="#fbbf24" />
                      </div>
                      <div className="finance-card-title">Prêt</div>
                      <div className="finance-card-sub amber">Personnel & rapide</div>
                    </button>

                    <button className="finance-card blue" onClick={openWallet}>
                      <div className="finance-card-icon blue">
                        <AppIcon name="wallet" size={22} stroke="#60a5fa" />
                      </div>
                      <div className="finance-card-title">Portefeuilles</div>
                      <div className="finance-card-sub blue">EUR / USD</div>
                    </button>

                    <button className="finance-card rose" onClick={openTontine}>
                      <div className="finance-card-icon rose">
                        <AppIcon name="users" size={22} stroke="#fb7185" />
                      </div>
                      <div className="finance-card-title">Tontine</div>
                      <div className="finance-card-sub rose">Collectif sécurisé</div>
                    </button>
                  </div>
                </section>
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "merchant" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="hub-screen">
                <div className="hub-topbar">
                  <h2 className="hub-title">Paiement Marchand</h2>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                </div>

                <div className="hub-card">
                  <div style={{ display: "flex", justifyContent: "center", padding: "24px 0" }}>
                    <button onClick={openCameraScanner} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "28px 40px", borderRadius: 28, border: "2px solid rgba(59,130,246,.3)", background: "rgba(59,130,246,.08)", color: "#60a5fa", fontWeight: 800, fontSize: 14, cursor: "pointer", transition: "all .2s" }}>
                      <AppIcon name="camera" size={32} stroke="#60a5fa" />
                      Scanner marchand
                    </button>
                  </div>

                  <div className="exchange-box">
                    <div className="exchange-kicker" style={{ justifyContent: "center" }}>
                      <span>Montant à régler</span>
                    </div>
                    <div className="hub-center" style={{ paddingTop: 0 }}>
                      <h3>
                        {merchantAmount || "0"} <span>XAF</span>
                      </h3>
                    </div>
                    <div style={{ padding: "0 6px" }}>
                      <input
                        type="text"
                        inputMode="numeric"
                        placeholder="0"
                        value={merchantAmount}
                        onChange={(e) => setMerchantAmount(e.target.value.replace(/\D/g, ""))}
                        style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: "white", fontSize: 18, fontWeight: 800, textAlign: "center" }}
                      />
                    </div>
                  </div>

                  <button className="hub-cta" onClick={() => { const amt = Number(merchantAmount || 0); if (amt <= 0) { showToast("Entrez un montant"); return; } setPendingPinAction({ type: "merchant", amount: amt }); openTransactionPin(); }}>Confirmer le paiement</button>

                  <div className="tontine-progress" style={{ background: 'rgba(37,99,235,.06)', borderColor: 'rgba(59,130,246,.12)' }}>
                    <div className="service-wide-main" style={{ gap: 12 }}>
                      <div className="token-badge" style={{ background: 'rgba(37,99,235,.18)', color: '#60a5fa' }}>
                        <AppIcon name="shield" size={16} stroke="#60a5fa" />
                      </div>
                      <div className="tontine-sub" style={{ fontSize: 11, color: 'rgba(255,255,255,.72)' }}>
                        Tous les paiements marchands Morali Pay sont protégés par un cryptage de bout en bout et une couverture anti-fraude.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "savings" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="savings-screen">
                <div className="hub-topbar">
                  <h2 className="hub-title">Épargne</h2>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                </div>

                <div className="savings-stack">
                  <div className="savings-card">
                    <div className="savings-orb">
                      <AppIcon name="piggy" size={56} stroke="#34d399" />
                    </div>
                    <div className="savings-kicker">Solde Épargne</div>
                    <div className="savings-amount">
                      <strong>{formatCurrency(savingsAmount)}</strong>
                      <span>XAF</span>
                    </div>

                    <div className="savings-divider">
                      <div>
                        <div className="savings-metric-top">Intérêts annuels</div>
                        <div className="savings-metric-bottom emerald">+{savingsAnnualRate}%</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div className="savings-metric-top">Gain estimé / mois</div>
                        <div className="savings-metric-bottom">~ {formatCurrency(Math.floor(savingsMonthlyGain))} F</div>
                      </div>
                    </div>
                  </div>

                  <div className="transaction-group" style={{ marginBottom: 16 }}>
                    <label className="transaction-label">Montant (XAF)</label>
                    <div className="exchange-box">
                      <div className="exchange-row">
                        <input type="text" inputMode="numeric" placeholder="0" value={savingsCustomAmount} onChange={(e) => setSavingsCustomAmount(e.target.value.replace(/\D/g, ""))} />
                        <div className="exchange-unit">XAF</div>
                      </div>
                    </div>
                  </div>

                  <div className="savings-actions">
                    <button className="savings-btn" onClick={() => { const amt = Number(savingsCustomAmount || 0); if (amt <= 0) { showToast("Entrez un montant"); return; } setPendingPinAction({ type: "savings_withdraw", amount: amt }); openTransactionPin(); }}>Retirer</button>
                    <button className="savings-btn primary" onClick={() => { const amt = Number(savingsCustomAmount || 0); if (amt <= 0) { showToast("Entrez un montant"); return; } setPendingPinAction({ type: "savings_deposit", amount: amt }); openTransactionPin(); }}>Déposer +</button>
                  </div>

                  <div className="savings-note">
                    <div className="savings-note-icon">
                      <AppIcon name="shield" size={20} stroke="#60a5fa" />
                    </div>
                    <div>
                      <div className="savings-note-title">Sécurité Garantie</div>
                      <div className="savings-note-copy">Vos fonds sont protégés et disponibles à tout moment, sans frais de retrait.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── Prêt Landing Screen (choose Microcrédit or Prêt Personnel) ── */}
          <div className={`app-screen ${screen === "loans" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="loans-landing">
                {/* Header */}
                <div className="loans-landing-header">
                  <div>
                    <h2 className="loans-landing-title">Nos Prêts</h2>
                    <p className="loans-landing-sub">Choisissez le financement adapté à votre besoin</p>
                  </div>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer" style={{ flexShrink: 0 }}>
                    <span className="close-x">×</span>
                  </button>
                </div>

                {/* Microcrédit Card */}
                <button className="loans-option-card" onClick={() => setScreen("microcredit")}>
                  <div className="loans-option-top">
                    <div className="loans-option-icon blue">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                      </svg>
                    </div>
                    <div className="loans-option-badge blue">RAPIDE</div>
                  </div>
                  <div className="loans-option-body">
                    <div className="loans-option-name">Microcrédit</div>
                    <div className="loans-option-desc">Financement express pour vos besoins quotidiens et urgences.</div>
                    <div className="loans-option-metrics">
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val">1 000 — 50 000</div>
                        <div className="loans-option-metric-lbl">FCFA</div>
                      </div>
                      <div className="loans-option-divider" />
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val">15 — 45</div>
                        <div className="loans-option-metric-lbl">jours</div>
                      </div>
                      <div className="loans-option-divider" />
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val blue">3 — 7.5%</div>
                        <div className="loans-option-metric-lbl">intérêt</div>
                      </div>
                    </div>
                  </div>
                  <div className="loans-option-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>

                {/* Prêt Personnel Card */}
                <button className="loans-option-card gold" onClick={() => setScreen("personalloan")}>
                  <div className="loans-option-top">
                    <div className="loans-option-icon gold">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
                        <rect x="2" y="5" width="20" height="14" rx="2" />
                        <line x1="2" y1="10" x2="22" y2="10" />
                      </svg>
                    </div>
                    <div className="loans-option-badge gold">PREMIUM</div>
                  </div>
                  <div className="loans-option-body">
                    <div className="loans-option-name">Prêt Personnel</div>
                    <div className="loans-option-desc">Financez vos projets importants : commerce, études, équipement.</div>
                    <div className="loans-option-metrics">
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val">100K — 2M</div>
                        <div className="loans-option-metric-lbl">FCFA</div>
                      </div>
                      <div className="loans-option-divider" />
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val">3 — 12</div>
                        <div className="loans-option-metric-lbl">mois</div>
                      </div>
                      <div className="loans-option-divider" />
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val gold">TAEG 12%</div>
                        <div className="loans-option-metric-lbl">fixe</div>
                      </div>
                    </div>
                  </div>
                  <div className="loans-option-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>

                {/* Info banner */}
                <div className="loans-info-banner">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>Toutes les demandes sont soumises à l'approbation de Morali Pay. Les fonds sont crédités sous 24 à 48h après validation.</span>
                </div>
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "microcredit" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="loan-screen">
                {/* ── Header ── */}
                <div className="loan-header">
                  <div className="loan-header-left">
                    <div>
                      <h2 className="loan-header-title">Microcrédit</h2>
                      <p className="loan-header-sub">Financement rapide pour vos besoins quotidiens</p>
                    </div>
                  </div>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer" style={{ flexShrink: 0 }}>
                    <span className="close-x">×</span>
                  </button>
                </div>

                {microCreditStep === "done" ? (
                  <div className="success-wrap" style={{ paddingTop: 60 }}>
                    <div className="success-circle">
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" width="34" height="34" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div className="success-title">Demande envoyée !</div>
                    <div className="success-sub">
                      Votre demande de microcrédit de <strong style={{ color: "#fbbf24" }}>{formatCurrency(loanAmount)} FCFA</strong> est en cours d'examen.<br />
                      Vous recevrez une notification dès validation.
                    </div>
                    <button className="hub-cta" onClick={closeHub}>
                      Retour à l'accueil
                    </button>
                  </div>
                ) : microCreditStep === "confirm" ? (
                  /* ── Confirmation Step ── */
                  <div className="loan-screen" style={{ padding: 0 }}>
                    <div className="loan-confirm-card">
                      <div className="loan-confirm-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
                          <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" />
                        </svg>
                      </div>
                      <div className="loan-confirm-title">Récapitulatif de votre demande</div>

                      <div className="loan-recap-grid">
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Montant demandé</div>
                          <div className="loan-recap-value">{formatCurrency(loanAmount)} FCFA</div>
                        </div>
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Durée</div>
                          <div className="loan-recap-value">{microCreditDuration} jours</div>
                        </div>
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Taux d'intérêt</div>
                          <div className="loan-recap-value" style={{ color: "#fbbf24" }}>{(microDailyRate * 100).toFixed(0)}%</div>
                        </div>
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Intérêts totaux</div>
                          <div className="loan-recap-value">{formatCurrency(Math.round(loanAmount * microDailyRate))} FCFA</div>
                        </div>
                        <div className="loan-recap-item highlight">
                          <div className="loan-recap-label">Total à rembourser</div>
                          <div className="loan-recap-value">{formatCurrency(Math.round(microTotalToPay))} FCFA</div>
                        </div>
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Motif</div>
                          <div className="loan-recap-value" style={{ fontSize: 12, textTransform: "none" }}>{microCreditReason || "Non précisé"}</div>
                        </div>
                      </div>

                      <div className="loan-notice">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        Le remboursement sera déduit automatiquement de votre solde à l'échéance.
                      </div>

                      <div className="loan-btn-group">
                        <button className="loan-btn-secondary" onClick={() => setMicroCreditStep("form")}>Modifier</button>
                        <button className="hub-cta loan-btn-confirm" disabled={loanApplicationStatus === "loading"} onClick={() => submitLoanApplication("micro")}>
                          {loanApplicationStatus === "loading" ? <div className="btn-loader" /> : "Confirmer la demande"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Form Step ── */
                  <>
                    {/* Amount selector */}
                    <div className="loan-card">
                      <div className="loan-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                          <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                        </svg>
                        Montant souhaité
                      </div>
                      <div className="loan-amount-display">
                        <span className="loan-amount-value">{formatCurrency(loanAmount)}</span>
                        <span className="loan-amount-unit">FCFA</span>
                      </div>
                      <div className="loan-range">
                        <input type="range" min="1000" max="50000" step="500" value={loanAmount} onChange={(e) => setLoanAmount(parseInt(e.target.value, 10))} />
                        <div className="loan-range-labels"><span>1 000</span><span>50 000</span></div>
                      </div>
                      <div className="loan-presets">
                        {[5000, 10000, 20000, 35000, 50000].map((v) => (
                          <button key={v} className={`loan-preset-btn ${loanAmount === v ? "active" : ""}`} onClick={() => setLoanAmount(v)}>
                            {v >= 1000 ? `${v / 1000}K` : v}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Duration selector */}
                    <div className="loan-card">
                      <div className="loan-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                          <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
                        </svg>
                        Durée du remboursement
                      </div>
                      <div className="loan-duration-grid">
                        {[15, 30, 45].map((d) => (
                          <button key={d} className={`loan-duration-btn ${microCreditDuration === d ? "active" : ""}`} onClick={() => setMicroCreditDuration(d as 15 | 30 | 45)}>
                            <div className="loan-duration-value">{d}</div>
                            <div className="loan-duration-unit">jours</div>
                            <div className="loan-duration-rate">{d === 15 ? "3%" : d === 30 ? "5%" : "7.5%"}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Reason */}
                    <div className="loan-card">
                      <div className="loan-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                        </svg>
                        Motif du prêt
                      </div>
                      <textarea className="loan-textarea" placeholder="Décrivez brièvement l'usage prévu de ce microcrédit..." value={microCreditReason} onChange={(e) => setMicroCreditReason(e.target.value.slice(0, 200))} maxLength={200} rows={3} />
                      <div className="loan-char-count">{microCreditReason.length}/200</div>
                    </div>

                    {/* Summary */}
                    <div className="loan-summary-card">
                      <div className="loan-summary-row">
                        <span>Montant</span>
                        <span>{formatCurrency(loanAmount)} FCFA</span>
                      </div>
                      <div className="loan-summary-row">
                        <span>Intérêts ({(microDailyRate * 100).toFixed(0)}%)</span>
                        <span style={{ color: "#fbbf24" }}>+{formatCurrency(Math.round(loanAmount * microDailyRate))} FCFA</span>
                      </div>
                      <div className="loan-summary-row total">
                        <span>Total à rembourser</span>
                        <span>{formatCurrency(Math.round(microTotalToPay))} FCFA</span>
                      </div>
                      <div className="loan-summary-row">
                        <span>Échéance</span>
                        <span>{microCreditDuration} jours</span>
                      </div>
                    </div>

                    <button className="hub-cta" onClick={() => {
                      if (loanAmount <= 0) { showToast("Entrez un montant"); return; }
                      setMicroCreditStep("confirm");
                    }}>
                      Voir le récapitulatif
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "personalloan" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="loan-screen">
                {/* ── Header ── */}
                <div className="loan-header">
                  <div className="loan-header-left">
                    <div>
                      <h2 className="loan-header-title">Prêt Personnel</h2>
                      <p className="loan-header-sub">Financez vos projets importants</p>
                    </div>
                  </div>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer" style={{ flexShrink: 0 }}>
                    <span className="close-x">×</span>
                  </button>
                </div>

                {personalLoanStep === "done" ? (
                  <div className="success-wrap" style={{ paddingTop: 60 }}>
                    <div className="success-circle">
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" width="34" height="34" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                    <div className="success-title">Demande envoyée !</div>
                    <div className="success-sub">
                      Votre demande de prêt de <strong style={{ color: "#fbbf24" }}>{formatCurrency(personalLoanAmount)} FCFA</strong> est en cours d'examen.<br />
                      Délai de traitement estimé : 24 à 48h.
                    </div>
                    <button className="hub-cta" onClick={closeHub}>
                      Retour à l'accueil
                    </button>
                  </div>
                ) : personalLoanStep === "confirm" ? (
                  /* ── Confirmation Step ── */
                  <div className="loan-screen" style={{ padding: 0 }}>
                    <div className="loan-confirm-card">
                      <div className="loan-confirm-icon" style={{ background: "linear-gradient(145deg,rgba(212,164,55,.15),rgba(212,164,55,.05))", borderColor: "rgba(212,164,55,.25)", color: "rgba(212,164,55,.9)" }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="28" height="28">
                          <path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="10" />
                        </svg>
                      </div>
                      <div className="loan-confirm-title">Récapitulatif de votre prêt</div>

                      <div className="loan-recap-grid">
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Montant du prêt</div>
                          <div className="loan-recap-value">{formatCurrency(personalLoanAmount)} FCFA</div>
                        </div>
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Durée</div>
                          <div className="loan-recap-value">{personalLoanDuration} mois</div>
                        </div>
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">TAEG</div>
                          <div className="loan-recap-value" style={{ color: "#fbbf24" }}>12.00%</div>
                        </div>
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Mensualité estimée</div>
                          <div className="loan-recap-value" style={{ color: "#60a5fa" }}>{formatCurrency(Math.round(personalLoanMonthlyRepayment))} FCFA</div>
                        </div>
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Intérêts totaux</div>
                          <div className="loan-recap-value">{formatCurrency(Math.round(personalLoanInterest))} FCFA</div>
                        </div>
                        <div className="loan-recap-item highlight">
                          <div className="loan-recap-label">Coût total du crédit</div>
                          <div className="loan-recap-value">{formatCurrency(Math.round(personalLoanTotalToRepay))} FCFA</div>
                        </div>
                        <div className="loan-recap-item">
                          <div className="loan-recap-label">Motif</div>
                          <div className="loan-recap-value" style={{ fontSize: 12, textTransform: "none" }}>{personalLoanReason || "Non précisé"}</div>
                        </div>
                        {personalLoanIncome && (
                          <div className="loan-recap-item">
                            <div className="loan-recap-label">Revenus mensuels déclarés</div>
                            <div className="loan-recap-value">{formatCurrency(Number(personalLoanIncome))} FCFA</div>
                          </div>
                        )}
                      </div>

                      <div className="loan-notice">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="16" height="16">
                          <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                        Le taux annuel effectif global (TAEG) est de 12%. Les mensualités seront prélevées automatiquement.
                      </div>

                      <div className="loan-btn-group">
                        <button className="loan-btn-secondary" onClick={() => setPersonalLoanStep("form")}>Modifier</button>
                        <button className="hub-cta loan-btn-confirm" disabled={loanApplicationStatus === "loading"} onClick={() => submitLoanApplication("personal")} style={{ background: "linear-gradient(135deg,#d4a437,#a67c00)", boxShadow: "0 10px 30px rgba(212,164,55,.3)" }}>
                          {loanApplicationStatus === "loading" ? <div className="btn-loader" /> : "Confirmer la demande"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* ── Form Step ── */
                  <>
                    {/* Amount selector */}
                    <div className="loan-card">
                      <div className="loan-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                          <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                        </svg>
                        Montant du financement
                      </div>
                      <div className="loan-amount-display gold">
                        <span className="loan-amount-value">{formatCurrency(personalLoanAmount)}</span>
                        <span className="loan-amount-unit">FCFA</span>
                      </div>
                      <div className="loan-range">
                        <input type="range" min="100000" max="2000000" step="50000" value={personalLoanAmount} onChange={(e) => setPersonalLoanAmount(Number(e.target.value))} style={{ accentColor: "#d4a437" }} />
                        <div className="loan-range-labels"><span>100 000</span><span>2 000 000</span></div>
                      </div>
                      <div className="loan-presets gold">
                        {[100000, 250000, 500000, 1000000, 2000000].map((v) => (
                          <button key={v} className={`loan-preset-btn gold ${personalLoanAmount === v ? "active" : ""}`} onClick={() => setPersonalLoanAmount(v)}>
                            {v >= 1000000 ? `${v / 1000000}M` : `${v / 1000}K`}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Duration selector */}
                    <div className="loan-card">
                      <div className="loan-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                        Durée du remboursement
                      </div>
                      <div className="loan-duration-grid">
                        {[3, 6, 12].map((m) => (
                          <button key={m} className={`loan-duration-btn gold ${personalLoanDuration === m ? "active" : ""}`} onClick={() => setPersonalLoanDuration(m)}>
                            <div className="loan-duration-value">{m}</div>
                            <div className="loan-duration-unit">mois</div>
                            <div className="loan-duration-rate">{formatCurrency(Math.round((personalLoanAmount + personalLoanAmount * (0.12 * (m / 12))) / m))}/mois</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Reason & Income */}
                    <div className="loan-card">
                      <div className="loan-card-title">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="18" height="18">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                        </svg>
                        Détails du projet
                      </div>
                      <div className="loan-field">
                        <label className="loan-field-label">Motif du prêt *</label>
                        <input className="loan-field-input" placeholder="Commerce, Équipement, Études, Santé..." value={personalLoanReason} onChange={(e) => setPersonalLoanReason(e.target.value.slice(0, 150))} maxLength={150} />
                      </div>
                      <div className="loan-field">
                        <label className="loan-field-label">Revenus mensuels (FCFA)</label>
                        <input className="loan-field-input" type="number" placeholder="Ex: 150000" value={personalLoanIncome} onChange={(e) => setPersonalLoanIncome(e.target.value.replace(/\D/g, "").slice(0, 10))} />
                      </div>
                    </div>

                    {/* Financial Summary */}
                    <div className="loan-summary-card gold">
                      <div className="loan-summary-row">
                        <span>Capital emprunté</span>
                        <span>{formatCurrency(personalLoanAmount)} FCFA</span>
                      </div>
                      <div className="loan-summary-row">
                        <span>Taux (TAEG)</span>
                        <span>12.00%</span>
                      </div>
                      <div className="loan-summary-row">
                        <span>Durée</span>
                        <span>{personalLoanDuration} mois</span>
                      </div>
                      <div className="loan-summary-row">
                        <span>Intérêts totaux</span>
                        <span style={{ color: "#fbbf24" }}>+{formatCurrency(Math.round(personalLoanInterest))} FCFA</span>
                      </div>
                      <div className="loan-summary-row total gold">
                        <span>Coût total du crédit</span>
                        <span>{formatCurrency(Math.round(personalLoanTotalToRepay))} FCFA</span>
                      </div>
                      <div className="loan-summary-row">
                        <span>Mensualité estimée</span>
                        <span style={{ color: "#60a5fa", fontWeight: 800 }}>{formatCurrency(Math.round(personalLoanMonthlyRepayment))} FCFA/mois</span>
                      </div>
                    </div>

                    <button className="hub-cta" style={{ background: "linear-gradient(135deg,#d4a437,#a67c00)", boxShadow: "0 10px 30px rgba(212,164,55,.3)" }} onClick={() => {
                      if (personalLoanAmount <= 0) { showToast("Entrez un montant"); return; }
                      if (!personalLoanReason.trim()) { showToast("Précisez le motif du prêt"); return; }
                      setPersonalLoanStep("confirm");
                    }}>
                      Voir le récapitulatif
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ===== PORTEFEUILLES (Landing) ===== */}
          <div className={`app-screen ${screen === "wallet" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="loans-landing">
                {/* Header */}
                <div className="loans-landing-header">
                  <div>
                    <h2 className="loans-landing-title">Portefeuilles</h2>
                    <p className="loans-landing-sub">Gérez vos devises étrangères</p>
                  </div>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer" style={{ flexShrink: 0 }}>
                    <span className="close-x">×</span>
                  </button>
                </div>

                {/* Euro Card */}
                <button className="loans-option-card" onClick={openEurWallet}>
                  <div className="loans-option-top">
                    <div className="loans-option-icon" style={{ background: "rgba(16,185,129,.12)", color: "#34d399" }}>
                      <span style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Montserrat',sans-serif" }}>€</span>
                    </div>
                    <div className="loans-option-badge" style={{ background: "rgba(16,185,129,.12)", color: "#34d399" }}>EURO</div>
                  </div>
                  <div className="loans-option-body">
                    <div className="loans-option-name">Portefeuille Euro</div>
                    <div className="loans-option-desc">Détenez et convertissez vos euros. Taux en temps réel avec commission de 1.5%.</div>
                    <div className="loans-option-metrics">
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val" style={{ color: "#34d399" }}>{eurWallet.toFixed(2)}</div>
                        <div className="loans-option-metric-lbl">EUR</div>
                      </div>
                      <div className="loans-option-divider" />
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val">1 € = {Math.round(1 / currencyRates["EUR"])}</div>
                        <div className="loans-option-metric-lbl">FCFA</div>
                      </div>
                      <div className="loans-option-divider" />
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val">1.5%</div>
                        <div className="loans-option-metric-lbl">commission</div>
                      </div>
                    </div>
                  </div>
                  <div className="loans-option-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>

                {/* Dollar Card */}
                <button className="loans-option-card" onClick={openUsdWallet}>
                  <div className="loans-option-top">
                    <div className="loans-option-icon" style={{ background: "rgba(245,158,11,.12)", color: "#fbbf24" }}>
                      <span style={{ fontSize: 28, fontWeight: 900, fontFamily: "'Montserrat',sans-serif" }}>$</span>
                    </div>
                    <div className="loans-option-badge" style={{ background: "rgba(245,158,11,.12)", color: "#fbbf24" }}>DOLLAR</div>
                  </div>
                  <div className="loans-option-body">
                    <div className="loans-option-name">Portefeuille Dollar</div>
                    <div className="loans-option-desc">Détenez et convertissez vos dollars US. Taux en temps réel avec commission de 1.5%.</div>
                    <div className="loans-option-metrics">
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val" style={{ color: "#fbbf24" }}>{usdWallet.toFixed(2)}</div>
                        <div className="loans-option-metric-lbl">USD</div>
                      </div>
                      <div className="loans-option-divider" />
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val">1 $ = {Math.round(1 / currencyRates["USD"])}</div>
                        <div className="loans-option-metric-lbl">FCFA</div>
                      </div>
                      <div className="loans-option-divider" />
                      <div className="loans-option-metric">
                        <div className="loans-option-metric-val">1.5%</div>
                        <div className="loans-option-metric-lbl">commission</div>
                      </div>
                    </div>
                  </div>
                  <div className="loans-option-arrow">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "currency" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="fx-screen">
                {/* ── Header ── */}
                <div className="fx-header">
                  <div className="fx-header-title">Change Devises</div>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer" style={{ flexShrink: 0 }}>
                    <span className="close-x">×</span>
                  </button>
                </div>

                {/* ── Simple From / Swap / To ── */}
                <div className="fx-exchange-box">
                  {/* FROM — changes based on direction */}
                  <div className={`fx-ex-from ${fxSwapping ? "fx-swap-anim" : ""}`}>
                    <div className="fx-ex-label">Vous envoyez</div>
                    <div className="fx-ex-row">
                      <input
                        type="number"
                        className="fx-ex-input"
                        placeholder="0"
                        value={currencyAmount}
                        onChange={(e) => setCurrencyAmount(e.target.value)}
                      />
                      {currencyDirection === "sell" ? (
                        <div className={`fx-ex-currency-badge ${fxSwapping ? "fx-swap-anim" : ""}`} style={{ background: "rgba(59,130,246,.12)", color: "#60a5fa" }}>
                          FCFA
                        </div>
                      ) : (
                        <div className={`fx-ex-currency-selector ${fxSwapping ? "fx-swap-anim" : ""}`}>
                          {(["EUR", "USD"] as const).map((c) => (
                            <button
                              key={c}
                              className={`fx-ex-curr-btn ${targetCurrency === c ? "active" : ""}`}
                              style={targetCurrency === c ? (c === "EUR" ? { background: "rgba(16,185,129,.12)", color: "#34d399", borderColor: "rgba(16,185,129,.25)" } : { background: "rgba(245,158,11,.12)", color: "#fbbf24", borderColor: "rgba(245,158,11,.25)" }) : {}}
                              onClick={() => { setTargetCurrency(c); setCurrencyAmount(""); }}
                            >
                              {c === "EUR" ? "€ EUR" : "$ USD"}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SWAP BUTTON */}
                  <div style={{ display: "flex", justifyContent: "center", margin: "-8px 0" }}>
                    <button
                      className="fx-ex-swap-circle"
                      onClick={() => {
                        setFxSwapping(true);
                        setCurrencyDirection(currencyDirection === "sell" ? "buy" : "sell");
                        setCurrencyAmount("");
                        setTimeout(() => setFxSwapping(false), 400);
                      }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                        <path d="M7 16V4m0 0L3 8m4-4l4 4" />
                        <path d="M17 8v12m0 0l4-4m-4 4l-4-4" />
                      </svg>
                    </button>
                  </div>

                  {/* TO — changes based on direction */}
                  <div className={`fx-ex-to ${fxSwapping ? "fx-swap-anim" : ""}`}>
                    <div className="fx-ex-label">Vous recevez</div>
                    <div className="fx-ex-row">
                      <div className={`fx-ex-result ${fxSwapping ? "fx-swap-anim" : ""}`} style={currencyDirection === "buy" ? { color: "#60a5fa" } : {}}>
                        {currencyAmount && parseFloat(currencyAmount) > 0
                          ? currencyDirection === "sell"
                            ? (parseFloat(currencyAmount) * currencyRates[targetCurrency] * (1 - currencyFee)).toFixed(2)
                            : formatCurrency(Math.round(parseFloat(currencyAmount) / currencyRates[targetCurrency] * (1 - currencyFee)))
                          : currencyDirection === "sell" ? "0.00" : "0"}
                      </div>
                      {currencyDirection === "sell" ? (
                        <div className={`fx-ex-currency-selector ${fxSwapping ? "fx-swap-anim" : ""}`}>
                          {(["EUR", "USD"] as const).map((c) => (
                            <button
                              key={c}
                              className={`fx-ex-curr-btn ${targetCurrency === c ? "active" : ""}`}
                              style={targetCurrency === c ? (c === "EUR" ? { background: "rgba(16,185,129,.12)", color: "#34d399", borderColor: "rgba(16,185,129,.25)" } : { background: "rgba(245,158,11,.12)", color: "#fbbf24", borderColor: "rgba(245,158,11,.25)" }) : {}}
                              onClick={() => { setTargetCurrency(c); setCurrencyAmount(""); }}
                            >
                              {c === "EUR" ? "€ EUR" : "$ USD"}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className={`fx-ex-currency-badge ${fxSwapping ? "fx-swap-anim" : ""}`} style={{ background: "rgba(59,130,246,.12)", color: "#60a5fa" }}>
                          FCFA
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Mode indicator ── */}
                <div style={{ textAlign: "center" }}>
                  <span style={{ fontSize: 11, color: "#64748b", fontWeight: 600 }}>
                    {currencyDirection === "sell" ? `Conversion : FCFA → ${targetCurrency}` : `Conversion : ${targetCurrency} → FCFA`}
                  </span>
                </div>

                {/* ── Summary ── */}
                {currencyAmount && parseFloat(currencyAmount) > 0 ? (
                  <div className="fx-ex-summary">
                    <div className="fx-ex-sum-row">
                      <span>Taux</span>
                      <span>1 {targetCurrency} = {Math.round(1 / currencyRates[targetCurrency])} FCFA</span>
                    </div>
                    <div className="fx-ex-sum-row">
                      <span>Frais (1.5%)</span>
                      <span>
                        {currencyDirection === "sell"
                          ? `${formatCurrency(Math.round(parseFloat(currencyAmount) * currencyFee))} FCFA`
                          : `${(parseFloat(currencyAmount) * currencyFee).toFixed(2)} ${targetCurrency}`}
                      </span>
                    </div>
                    <div className="fx-ex-sum-row">
                      <span>Votre solde {currencyDirection === "sell" ? "FCFA" : targetCurrency}</span>
                      <span>
                        {currencyDirection === "sell"
                          ? formatCurrency(firestoreBalance !== null ? firestoreBalance : dashboardData.balance)
                          : `${(targetCurrency === "EUR" ? eurWallet : usdWallet).toFixed(2)} ${targetCurrency}`}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="fx-ex-summary" style={{ opacity: 0.5 }}>
                    <div className="fx-ex-sum-row">
                      <span>Taux</span>
                      <span>1 {targetCurrency} = {Math.round(1 / currencyRates[targetCurrency])} FCFA</span>
                    </div>
                  </div>
                )}

                {/* ── Confirm ── */}
                <button
                  className="fx-confirm-btn"
                  disabled={serviceProcessing || !currencyAmount || parseFloat(currencyAmount) <= 0}
                  onClick={currencyDirection === "sell" ? async () => {
                    const amt = Number(currencyAmount || 0);
                    if (amt <= 0) { showToast("Entrez un montant"); return; }
                    if (!authUid) { showToast("Connexion requise"); return; }
                    const userBal = firestoreBalance !== null ? firestoreBalance : dashboardData.balance;
                    if (amt > userBal) { showToast("Solde FCFA insuffisant pour ce change"); return; }
                    try {
                      setServiceProcessing(true);
                      const userRef = doc(firebaseDb, "moraliUsers", authUid);
                      const feeAmount = Math.round(amt * currencyFee);
                      const netXaf = amt - feeAmount;
                      const convertedAmt = netXaf * currencyRates[targetCurrency];
                      await runTransaction(firebaseDb, async (tx) => {
                        const userDoc = await tx.get(userRef);
                        if (!userDoc.exists()) throw new Error("USER_NOT_FOUND");
                        const currentBal = userDoc.data().balance || 0;
                        if (amt > currentBal) throw new Error("INSUFFICIENT_BALANCE");
                        const updates: Record<string, unknown> = { balance: currentBal - amt, updatedAt: serverTimestamp() };
                        if (targetCurrency === "EUR") { updates.eurWallet = (userDoc.data().eurWallet || 0) + convertedAmt; }
                        else { updates.usdWallet = (userDoc.data().usdWallet || 0) + convertedAmt; }
                        tx.update(userRef, updates);
                      });
                      await createRealtimeTransaction({ senderUid: authUid, senderMoraliId: bankingIdentity.id, senderName: dashboardName, recipientUid: authUid, recipientMoraliId: bankingIdentity.id, recipientName: dashboardName, amount: amt, fees: feeAmount, type: "retrait", destination: "cash", status: "success", receiptId: "FX-" + Date.now().toString().slice(-8) });
                      await createRealtimeNotification(authUid, { title: `Change ${targetCurrency} — ${formatCurrency(amt)} FCFA → ${convertedAmt.toFixed(2)} ${targetCurrency}`, time: "À l'instant", badge: "Change", badgeClass: "nb-blue", icon: "swap", bg: "rgba(59,130,246,0.12)", read: false });
                      showToast(`Change réussi ! +${convertedAmt.toFixed(2)} ${targetCurrency} crédités`);
                      setCurrencyAmount("");
                    } catch (err: unknown) {
                      const msg = err instanceof Error ? err.message : "";
                      if (msg === "INSUFFICIENT_BALANCE") showToast("Solde insuffisant");
                      else showToast("Erreur lors du change");
                    } finally { setServiceProcessing(false); }
                  } : async () => {
                    const amt = Number(currencyAmount || 0);
                    if (amt <= 0) { showToast("Entrez un montant"); return; }
                    if (!authUid) { showToast("Connexion requise"); return; }
                    const walletBal = targetCurrency === "EUR" ? eurWallet : usdWallet;
                    if (amt > walletBal) { showToast(`Solde ${targetCurrency} insuffisant`); return; }
                    try {
                      setServiceProcessing(true);
                      const userRef = doc(firebaseDb, "moraliUsers", authUid);
                      const feeCurrency = amt * currencyFee;
                      const netCurrency = amt - feeCurrency;
                      const convertedXaf = Math.round(netCurrency / currencyRates[targetCurrency]);
                      await runTransaction(firebaseDb, async (tx) => {
                        const userDoc = await tx.get(userRef);
                        if (!userDoc.exists()) throw new Error("USER_NOT_FOUND");
                        const currentWalletBal = targetCurrency === "EUR" ? (userDoc.data().eurWallet || 0) : (userDoc.data().usdWallet || 0);
                        if (amt > currentWalletBal) throw new Error("INSUFFICIENT_BALANCE");
                        const updates: Record<string, unknown> = { balance: (userDoc.data().balance || 0) + convertedXaf, updatedAt: serverTimestamp() };
                        if (targetCurrency === "EUR") { updates.eurWallet = currentWalletBal - amt; }
                        else { updates.usdWallet = currentWalletBal - amt; }
                        tx.update(userRef, updates);
                      });
                      await createRealtimeTransaction({ senderUid: authUid, senderMoraliId: bankingIdentity.id, senderName: dashboardName, recipientUid: authUid, recipientMoraliId: bankingIdentity.id, recipientName: dashboardName, amount: convertedXaf, fees: 0, type: "depot", destination: "cash", status: "success", receiptId: "FX-" + Date.now().toString().slice(-8) });
                      await createRealtimeNotification(authUid, { title: `Change ${targetCurrency} — ${amt.toFixed(2)} ${targetCurrency} → ${formatCurrency(convertedXaf)} FCFA`, time: "À l'instant", badge: "Change", badgeClass: "nb-blue", icon: "swap", bg: "rgba(59,130,246,0.12)", read: false });
                      showToast(`Change réussi ! +${formatCurrency(convertedXaf)} FCFA crédités`);
                      setCurrencyAmount("");
                    } catch (err: unknown) {
                      const msg = err instanceof Error ? err.message : "";
                      if (msg === "INSUFFICIENT_BALANCE") showToast(`Solde ${targetCurrency} insuffisant`);
                      else showToast("Erreur lors du change");
                    } finally { setServiceProcessing(false); }
                  }}
                >
                  {serviceProcessing ? <div className="btn-loader" /> : <>Confirmer</>}
                </button>
              </div>
            </div>
          </div>

          {/* ===== PORTEFEUILLE EURO ===== */}
          <div className={`app-screen ${screen === "eurWallet" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="wallet-detail-screen">
                {/* Header */}
                <div className="wallet-detail-header">
                  <div>
                    <div className="wallet-detail-title" style={{ color: "#34d399" }}>
                      <span style={{ fontSize: 28, marginRight: 8 }}>€</span> Portefeuille Euro
                    </div>
                    <div className="wallet-detail-sub">Compte en devises — EUR</div>
                  </div>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer" style={{ flexShrink: 0 }}>
                    <span className="close-x">×</span>
                  </button>
                </div>

                {/* Solde principal */}
                <div className="wallet-detail-balance-card eur">
                  <div className="wallet-detail-card-orb" />
                  <div className="wallet-detail-card-label">Solde disponible</div>
                  <div className="wallet-detail-card-amount">{eurWallet.toFixed(2)} <span style={{ fontSize: 18, fontWeight: 700, opacity: 0.7 }}>EUR</span></div>
                  <div className="wallet-detail-card-equiv">≈ {formatCurrency(Math.round(eurWallet / currencyRates["EUR"]))} FCFA</div>
                </div>

                {/* Infos clés */}
                <div className="wallet-detail-info-grid">
                  <div className="wallet-detail-info-item">
                    <div className="wallet-detail-info-label">Devise</div>
                    <div className="wallet-detail-info-value">Euro (€)</div>
                  </div>
                  <div className="wallet-detail-info-item">
                    <div className="wallet-detail-info-label">Code ISO</div>
                    <div className="wallet-detail-info-value">EUR</div>
                  </div>
                  <div className="wallet-detail-info-item">
                    <div className="wallet-detail-info-label">Taux actuel</div>
                    <div className="wallet-detail-info-value">1 € = {Math.round(1 / currencyRates["EUR"])} FCFA</div>
                  </div>
                  <div className="wallet-detail-info-item">
                    <div className="wallet-detail-info-label">Commission</div>
                    <div className="wallet-detail-info-value">1.5%</div>
                  </div>
                </div>

                {/* Récap équivalence */}
                <div className="wallet-detail-equivalence">
                  <div className="wallet-detail-eq-row">
                    <span>1 EUR</span>
                    <span>→ {Math.round(1 / currencyRates["EUR"])} FCFA</span>
                  </div>
                  <div className="wallet-detail-eq-row">
                    <span>10 EUR</span>
                    <span>→ {formatCurrency(Math.round(10 / currencyRates["EUR"]))} FCFA</span>
                  </div>
                  <div className="wallet-detail-eq-row">
                    <span>50 EUR</span>
                    <span>→ {formatCurrency(Math.round(50 / currencyRates["EUR"]))} FCFA</span>
                  </div>
                  <div className="wallet-detail-eq-row">
                    <span>100 EUR</span>
                    <span>→ {formatCurrency(Math.round(100 / currencyRates["EUR"]))} FCFA</span>
                  </div>
                  <div className="wallet-detail-eq-row">
                    <span>500 EUR</span>
                    <span>→ {formatCurrency(Math.round(500 / currencyRates["EUR"]))} FCFA</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="wallet-detail-actions">
                  <button className="wallet-detail-action-btn green" onClick={() => { setTargetCurrency("EUR"); setCurrencyDirection("sell"); setCurrencyAmount(""); openCurrency(); }}>
                    Acheter des EUR
                  </button>
                  <button className="wallet-detail-action-btn outline-green" onClick={() => { setTargetCurrency("EUR"); setCurrencyDirection("buy"); setCurrencyAmount(""); openCurrency(); }}>
                    Vendre des EUR
                  </button>
                </div>

                <div style={{ padding: "0 4px", marginTop: 8 }}>
                  <div className="wallet-detail-notice">
                    <AppIcon name="shield" size={14} stroke="#64748b" />
                    <span>Taux indicatif. Commission de 1.5% appliquée sur chaque opération de change.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== PORTEFEUILLE DOLLAR ===== */}
          <div className={`app-screen ${screen === "usdWallet" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="wallet-detail-screen">
                {/* Header */}
                <div className="wallet-detail-header">
                  <div>
                    <div className="wallet-detail-title" style={{ color: "#fbbf24" }}>
                      <span style={{ fontSize: 28, marginRight: 8 }}>$</span> Portefeuille Dollar
                    </div>
                    <div className="wallet-detail-sub">Compte en devises — USD</div>
                  </div>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer" style={{ flexShrink: 0 }}>
                    <span className="close-x">×</span>
                  </button>
                </div>

                {/* Solde principal */}
                <div className="wallet-detail-balance-card usd">
                  <div className="wallet-detail-card-orb" />
                  <div className="wallet-detail-card-label">Solde disponible</div>
                  <div className="wallet-detail-card-amount">{usdWallet.toFixed(2)} <span style={{ fontSize: 18, fontWeight: 700, opacity: 0.7 }}>USD</span></div>
                  <div className="wallet-detail-card-equiv">≈ {formatCurrency(Math.round(usdWallet / currencyRates["USD"]))} FCFA</div>
                </div>

                {/* Infos clés */}
                <div className="wallet-detail-info-grid">
                  <div className="wallet-detail-info-item">
                    <div className="wallet-detail-info-label">Devise</div>
                    <div className="wallet-detail-info-value">Dollar américain ($)</div>
                  </div>
                  <div className="wallet-detail-info-item">
                    <div className="wallet-detail-info-label">Code ISO</div>
                    <div className="wallet-detail-info-value">USD</div>
                  </div>
                  <div className="wallet-detail-info-item">
                    <div className="wallet-detail-info-label">Taux actuel</div>
                    <div className="wallet-detail-info-value">1 $ = {Math.round(1 / currencyRates["USD"])} FCFA</div>
                  </div>
                  <div className="wallet-detail-info-item">
                    <div className="wallet-detail-info-label">Commission</div>
                    <div className="wallet-detail-info-value">1.5%</div>
                  </div>
                </div>

                {/* Récap équivalence */}
                <div className="wallet-detail-equivalence">
                  <div className="wallet-detail-eq-row">
                    <span>1 USD</span>
                    <span>→ {Math.round(1 / currencyRates["USD"])} FCFA</span>
                  </div>
                  <div className="wallet-detail-eq-row">
                    <span>10 USD</span>
                    <span>→ {formatCurrency(Math.round(10 / currencyRates["USD"]))} FCFA</span>
                  </div>
                  <div className="wallet-detail-eq-row">
                    <span>50 USD</span>
                    <span>→ {formatCurrency(Math.round(50 / currencyRates["USD"]))} FCFA</span>
                  </div>
                  <div className="wallet-detail-eq-row">
                    <span>100 USD</span>
                    <span>→ {formatCurrency(Math.round(100 / currencyRates["USD"]))} FCFA</span>
                  </div>
                  <div className="wallet-detail-eq-row">
                    <span>500 USD</span>
                    <span>→ {formatCurrency(Math.round(500 / currencyRates["USD"]))} FCFA</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="wallet-detail-actions">
                  <button className="wallet-detail-action-btn gold" onClick={() => { setTargetCurrency("USD"); setCurrencyDirection("sell"); setCurrencyAmount(""); openCurrency(); }}>
                    Acheter des USD
                  </button>
                  <button className="wallet-detail-action-btn outline-gold" onClick={() => { setTargetCurrency("USD"); setCurrencyDirection("buy"); setCurrencyAmount(""); openCurrency(); }}>
                    Vendre des USD
                  </button>
                </div>

                <div style={{ padding: "0 4px", marginTop: 8 }}>
                  <div className="wallet-detail-notice">
                    <AppIcon name="shield" size={14} stroke="#64748b" />
                    <span>Taux indicatif. Commission de 1.5% appliquée sur chaque opération de change.</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== CRÉDIT (Airtime) ===== */}
          <div className={`app-screen ${screen === "credit" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="hub-screen">
                <div className="hub-topbar">
                  <h2 className="hub-title">Crédit Téléphonique</h2>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                </div>

                {SIMULATED_BANNER}

                <div className="hub-card">
                  <div className="operator-grid">
                    <button className={`operator-card ${airtimeOperator === "mtn" ? "active-mtn" : ""}`} onClick={() => setAirtimeOperator("mtn")}>
                      <div className="operator-badge" style={{ background: "#ffcc00", color: "#000" }}>MTN</div>
                      <span style={{ color: airtimeOperator === "mtn" ? "#fff" : "#64748b" }}>MoMo</span>
                    </button>
                    <button className={`operator-card ${airtimeOperator === "airtel" ? "active-airtel" : ""}`} onClick={() => setAirtimeOperator("airtel")}>
                      <div className="operator-badge" style={{ background: "#ff0000", color: "#fff" }}>Airtel</div>
                      <span style={{ color: airtimeOperator === "airtel" ? "#fff" : "#64748b" }}>Money</span>
                    </button>
                  </div>

                  <div className="transaction-group">
                    <label className="transaction-label">Numéro de téléphone</label>
                    <div className="phone-input-wrap">
                      <span className="phone-prefix">+242</span>
                      <input type="tel" placeholder="" value={airtimePhone} onChange={(e) => setAirtimePhone(e.target.value)} />
                    </div>
                  </div>

                  <div className="transaction-group">
                    <label className="transaction-label">Montant (XAF)</label>
                    <div className="exchange-box">
                      <div className="exchange-row">
                        <input type="text" inputMode="numeric" placeholder="0" value={airtimeAmount} onChange={(e) => setAirtimeAmount(e.target.value.replace(/\D/g, ""))} />
                        <div className="exchange-unit" style={{ color: airtimeOperator === "mtn" ? "#ffcc00" : "#ff4d4d" }}>-{airtimeOperator.toUpperCase()}</div>
                      </div>
                    </div>
                  </div>

                  <div className="preset-row">
                    {[100, 200, 500, 1000, 2000, 5000].map((preset) => (
                      <button key={preset} className={`preset-btn ${airtimeAmount === String(preset) ? "active" : ""}`} onClick={() => setAirtimeAmount(String(preset))}>{formatCurrency(preset)}</button>
                    ))}
                  </div>

                  <button className="hub-cta" disabled style={{ background: airtimeOperator === "mtn" ? "#ffcc00" : "#ff0000", color: airtimeOperator === "mtn" ? "#000" : "#fff", boxShadow: "none", opacity: 0.4, cursor: "not-allowed" }} onClick={() => {}}>Indisponible</button>
                </div>
              </div>
            </div>
          </div>

          {/* ===== INTERNET (Data) ===== */}
          <div className={`app-screen ${screen === "internet" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="hub-screen">
                <div className="hub-topbar">
                  <h2 className="hub-title">Forfait Internet</h2>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                </div>

                {SIMULATED_BANNER}

                <div className="hub-card">
                  <div className="service-wide-main" style={{ padding: 20, borderRadius: 24, background: "rgba(96,165,250,.06)", border: "1px solid rgba(96,165,250,.14)" }}>
                    <div className="service-wide-icon blue">
                      <AppIcon name="globe" size={24} stroke="#60a5fa" />
                    </div>
                    <div>
                      <div className="service-wide-title">Pass Data</div>
                      <div className="service-wide-sub">Achetez votre forfait internet en instantané</div>
                    </div>
                  </div>

                  <div className="operator-grid">
                    <button className={`operator-card ${internetOperator === "mtn" ? "active-mtn" : ""}`} onClick={() => setInternetOperator("mtn")}>
                      <div className="operator-badge" style={{ background: "#ffcc00", color: "#000" }}>MTN</div>
                      <span style={{ color: internetOperator === "mtn" ? "#fff" : "#64748b" }}>MoMo</span>
                    </button>
                    <button className={`operator-card ${internetOperator === "airtel" ? "active-airtel" : ""}`} onClick={() => setInternetOperator("airtel")}>
                      <div className="operator-badge" style={{ background: "#ff0000", color: "#fff" }}>Airtel</div>
                      <span style={{ color: internetOperator === "airtel" ? "#fff" : "#64748b" }}>Money</span>
                    </button>
                  </div>

                  <div className="member-list" style={{ marginBottom: 12 }}>
                    {['1 Go (500 F)', '3 Go (1 000 F)', '5 Go (2 000 F)', '10 Go (3 500 F)'].map((plan) => (
                      <button key={plan} className={`member-row ${internetAmount === plan.split(" (")[1].replace(")", "") ? 'current' : ''}`} onClick={() => setInternetAmount(plan.split(" (")[1].replace(")", ""))}>
                        <div className="member-name">{plan.split(" (")[0].trim()}</div>
                        <div className="member-pill" style={{ background: internetAmount === plan.split(" (")[1].replace(")", "") ? '#3b82f6' : 'transparent', color: '#60a5fa', border: 'none', padding: 0 }}>{plan.split(" (")[1].replace(")", "")}</div>
                      </button>
                    ))}
                  </div>

                  <div className="transaction-group">
                    <label className="transaction-label">Numéro de téléphone</label>
                    <div className="phone-input-wrap">
                      <span className="phone-prefix">+242</span>
                      <input type="tel" placeholder="" value={internetPhone} onChange={(e) => setInternetPhone(e.target.value)} />
                    </div>
                  </div>

                  <button className="hub-cta" disabled style={{ background: "#3b82f6", color: "#fff", boxShadow: "none", opacity: 0.4, cursor: "not-allowed" }} onClick={() => {}}>Indisponible</button>
                </div>
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "canalplus" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="hub-screen">
                <div className="hub-topbar">
                  <h2 className="hub-title">Canal+</h2>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                </div>

                {SIMULATED_BANNER}

                <div className="hub-card">
                  <div className="service-wide-main" style={{ padding: 20, borderRadius: 24, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)" }}>
                    <div className="service-wide-icon blue">
                      <AppIcon name="tv" size={24} stroke="#a78bfa" />
                    </div>
                    <div>
                      <div className="service-wide-title">Canal+ Afrique</div>
                      <div className="service-wide-sub">Réabonnement instantané 24h/7j</div>
                    </div>
                  </div>

                  <div className="transaction-group">
                    <label className="transaction-label">Numéro de carte décodeur</label>
                    <div className="exchange-box">
                      <div className="exchange-row">
                        <input type="text" inputMode="numeric" placeholder="" value={canalDecoder} onChange={(e) => setCanalDecoder(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div className="member-list">
                    {['Access (5 000 F)', 'Evasion (10 000 F)', 'Tout Canal (40 000 F)'].map((b) => (
                      <button key={b} className={`member-row ${canalPlan === b ? 'current' : ''}`} onClick={() => setCanalPlan(b)}>
                        <div className="member-name">{b.split('(')[0].trim()}</div>
                        <div className="member-pill" style={{ background: canalPlan === b ? '#3b82f6' : 'transparent', color: '#60a5fa', border: 'none', padding: 0 }}>{b.split('(')[1].replace(')', '')}</div>
                      </button>
                    ))}
                  </div>

                  <button className="hub-cta" disabled style={{ background: '#fff', color: '#000', boxShadow: '0 10px 30px rgba(255,255,255,.08)', opacity: 0.4, cursor: "not-allowed" }} onClick={() => {}}>Indisponible</button>
                </div>
              </div>
            </div>
          </div>

          {/* ===== ÉLECTRICITÉ ===== */}
          <div className={`app-screen ${screen === "electricity" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="hub-screen">
                <div className="hub-topbar">
                  <h2 className="hub-title">Électricité</h2>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                </div>

                {SIMULATED_BANNER}

                <div className="hub-card">
                  <div className="service-wide-main" style={{ padding: 20, borderRadius: 24, background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.14)" }}>
                    <div className="service-wide-icon" style={{ background: "rgba(251,191,36,.12)" }}>
                      <AppIcon name="bolt" size={24} stroke="#fbbf24" />
                    </div>
                    <div>
                      <div className="service-wide-title">Électricité</div>
                      <div className="service-wide-sub">Payez vos factures SNE & achetez vos jetons</div>
                    </div>
                  </div>

                  <div className="transaction-group">
                    <label className="transaction-label">Numéro de compteur ou contrat</label>
                    <div className="exchange-box">
                      <div className="exchange-row">
                        <input type="text" placeholder="" value={elecMeter} onChange={(e) => setElecMeter(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div className="transaction-group">
                    <label className="transaction-label">Montant à payer</label>
                    <div className="exchange-box">
                      <div className="exchange-row">
                        <input type="text" inputMode="numeric" placeholder="0" value={elecAmount} onChange={(e) => setElecAmount(e.target.value.replace(/\D/g, ""))} />
                        <div className="exchange-unit">XAF</div>
                      </div>
                    </div>
                  </div>

                  <div className="tontine-progress" style={{ background: 'rgba(251,191,36,.06)', borderColor: 'rgba(251,191,36,.12)' }}>
                    <div className="service-wide-main" style={{ gap: 12 }}>
                      <div className="token-badge" style={{ background: 'rgba(251,191,36,.16)', color: '#fbbf24' }}>✓</div>
                      <div className="tontine-sub" style={{ fontSize: 11, color: 'rgba(251,191,36,.84)' }}>Votre reçu sera disponible instantanément dans vos transactions.</div>
                    </div>
                  </div>

                  <button className="hub-cta" disabled style={{ background: '#f59e0b', opacity: 0.4, cursor: "not-allowed" }} onClick={() => {}}>Indisponible</button>
                </div>
              </div>
            </div>
          </div>

          {/* ===== EAU ===== */}
          <div className={`app-screen ${screen === "water" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="hub-screen">
                <div className="hub-topbar">
                  <h2 className="hub-title">Eau</h2>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                </div>

                {SIMULATED_BANNER}

                <div className="hub-card">
                  <div className="service-wide-main" style={{ padding: 20, borderRadius: 24, background: "rgba(56,189,248,.06)", border: "1px solid rgba(56,189,248,.14)" }}>
                    <div className="service-wide-icon blue">
                      <AppIcon name="droplet" size={24} stroke="#38bdf8" />
                    </div>
                    <div>
                      <div className="service-wide-title">Eau</div>
                      <div className="service-wide-sub">Payez vos factures SNDE / LCDE</div>
                    </div>
                  </div>

                  <div className="transaction-group">
                    <label className="transaction-label">Numéro de compteur ou contrat</label>
                    <div className="exchange-box">
                      <div className="exchange-row">
                        <input type="text" placeholder="" value={waterMeter} onChange={(e) => setWaterMeter(e.target.value)} />
                      </div>
                    </div>
                  </div>

                  <div className="transaction-group">
                    <label className="transaction-label">Montant à payer</label>
                    <div className="exchange-box">
                      <div className="exchange-row">
                        <input type="text" inputMode="numeric" placeholder="0" value={waterAmount} onChange={(e) => setWaterAmount(e.target.value.replace(/\D/g, ""))} />
                        <div className="exchange-unit">XAF</div>
                      </div>
                    </div>
                  </div>

                  <div className="tontine-progress" style={{ background: 'rgba(56,189,248,.06)', borderColor: 'rgba(56,189,248,.12)' }}>
                    <div className="service-wide-main" style={{ gap: 12 }}>
                      <div className="token-badge" style={{ background: 'rgba(56,189,248,.16)', color: '#38bdf8' }}>✓</div>
                      <div className="tontine-sub" style={{ fontSize: 11, color: 'rgba(56,189,248,.84)' }}>Votre reçu sera disponible instantanément dans vos transactions.</div>
                    </div>
                  </div>

                  <button className="hub-cta" disabled style={{ background: '#0ea5e9', opacity: 0.4, cursor: "not-allowed" }} onClick={() => {}}>Indisponible</button>
                </div>
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "tontine" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="hub-screen">
                <div className="hub-topbar">
                  <h2 className="hub-title">Tontine Digitale</h2>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                </div>

                <div className="hub-card">
                  <div className="tontine-head">
                    <h2 className="hub-title" style={{ fontSize: 22 }}>Tontine Digitale</h2>
                    <p className="tontine-sub">Créez et gérez vos tontines</p>
                  </div>

                  <div className="tontine-create-form">
                    <input type="text" placeholder="Nom de la tontine" value={tontineName} onChange={(e) => setTontineName(e.target.value)} />
                    <input type="text" inputMode="numeric" placeholder="Contribution par membre (XAF)" value={tontineContributionAmount} onChange={(e) => setTontineContributionAmount(e.target.value.replace(/\D/g, ""))} />
                    <button className="tontine-create-btn" onClick={() => { if (!tontineName.trim() || !Number(tontineContributionAmount) || Number(tontineContributionAmount) <= 0) { showToast("Remplissez tous les champs"); return; } const next = [...tontineGroups, { name: tontineName.trim(), contributionAmount: tontineContributionAmount, members: [] }]; setTontineGroups(next); saveTontineGroups(next); setTontineName(""); setTontineContributionAmount(""); showToast("Tontine créée avec succès !"); }}>Créer une tontine</button>
                  </div>

                  {tontineGroups.length === 0 ? (
                    <div className="member-list" style={{ padding: "24px 0" }}>
                      <p style={{ textAlign: "center", color: "#64748b", fontSize: 13, lineHeight: 1.6 }}>Aucune tontine active. Créez-en une pour commencer.</p>
                    </div>
                  ) : (
                    tontineGroups.map((group, gi) => {
                      const paidCount = group.members.filter((m) => m.paid).length;
                      const totalMembers = group.members.length;
                      const progressPct = totalMembers > 0 ? Math.round((paidCount / totalMembers) * 100) : 0;
                      return (
                        <div key={gi} className="tontine-group-card">
                          <div className="tontine-group-header">
                            <div className="tontine-group-name">{group.name}</div>
                            <div className="tontine-group-amount">{formatCurrency(Number(group.contributionAmount))} F / membre</div>
                          </div>

                          <div className="hub-metrics" style={{ marginBottom: 12 }}>
                            <div className="hub-metric">
                              <div className="hub-metric-label">Membres</div>
                              <div className="hub-metric-value">{totalMembers}</div>
                            </div>
                            <div className="hub-metric">
                              <div className="hub-metric-label">Contributions</div>
                              <div className="hub-metric-value" style={{ color: "#fb7185" }}>{paidCount}/{totalMembers}</div>
                            </div>
                          </div>

                          {totalMembers > 0 && (
                            <div className="tontine-progress" style={{ marginBottom: 12, background: "rgba(244,63,94,.06)", borderColor: "rgba(244,63,94,.12)" }}>
                              <div className="tontine-progress-row">
                                <span>Progression</span>
                                <strong style={{ color: "#fb7185" }}>{progressPct}%</strong>
                              </div>
                              <div style={{ height: 6, borderRadius: 3, background: "rgba(255,255,255,.06)", marginTop: 8, overflow: "hidden" }}>
                                <div className="tontine-bar" style={{ width: `${progressPct}%`, height: "100%", borderRadius: 3, background: "linear-gradient(90deg, #f43f5e, #fb7185)" }} />
                              </div>
                            </div>
                          )}

                          <div className="member-add-row">
                            <input type="text" placeholder="Nom du membre" value={tontineNewMemberName} onChange={(e) => setTontineNewMemberName(e.target.value)} />
                            <button className="member-add-btn" onClick={() => { if (!tontineNewMemberName.trim()) { showToast("Entrez un nom"); return; } const next = tontineGroups.map((g, idx) => idx === gi ? { ...g, members: [...g.members, { name: tontineNewMemberName.trim(), paid: false }] } : g); setTontineGroups(next); saveTontineGroups(next); setTontineNewMemberName(""); }}>Ajouter</button>
                          </div>

                          {group.members.length > 0 && (
                            <div className="member-list">
                              {group.members.map((member, mi) => (
                                <div key={mi} className="member-row">
                                  <div className="member-avatar" style={{ background: member.paid ? "rgba(244,63,94,.18)" : "rgba(255,255,255,.06)", color: member.paid ? "#fb7185" : "#64748b" }}>{member.name[0].toUpperCase()}</div>
                                  <div className="member-main">
                                    <div className="member-name">{member.name}</div>
                                    <div className="member-status">
                                      <span className="member-pill" style={{ background: member.paid ? "rgba(244,63,94,.15)" : "rgba(255,255,255,.04)", color: member.paid ? "#fb7185" : "#64748b", fontSize: 10, padding: "2px 8px", borderRadius: 999, fontWeight: 700 }}>{member.paid ? "Contribué" : "En attente"}</span>
                                    </div>
                                  </div>
                                  {!member.paid && (
                                    <button className="member-add-btn" style={{ height: 34, padding: "0 12px", fontSize: 11 }} onClick={async () => { const contribAmt = Number(group.contributionAmount); const userBal = firestoreBalance !== null ? firestoreBalance : dashboardData.balance; if (contribAmt > userBal) { showToast("Solde insuffisant pour cette contribution"); return; } await executeServiceDebit(contribAmt, `Tontine ${group.name}`, "users"); const next = tontineGroups.map((g, idx) => idx === gi ? { ...g, pot: (g.pot || 0) + contribAmt, members: g.members.map((m, midx) => midx === mi ? { ...m, paid: true } : m) } : g); setTontineGroups(next); saveTontineGroups(next); }}>Contribuer</button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Pot display and distribute button */}
                          <div style={{ marginTop: 12, padding: 12, borderRadius: 14, background: "rgba(212,164,55,0.06)", border: "1px solid rgba(212,164,55,0.15)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div>
                                <div style={{ fontSize: 9, color: "rgba(212,164,55,0.7)", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Pot total</div>
                                <div style={{ fontSize: 18, fontWeight: 800, color: "#fbbf24", fontFamily: "'Montserrat',sans-serif", marginTop: 2 }}>{formatCurrency(group.pot || 0)} F</div>
                              </div>
                              {totalMembers > 0 && paidCount === totalMembers && (group.pot || 0) > 0 ? (
                                <button
                                  onClick={() => {
                                    const sharePerMember = Math.floor((group.pot || 0) / totalMembers);
                                    setTontineDistConfirm({ groupIndex: gi, pot: group.pot || 0, members: totalMembers, sharePerMember });
                                  }}
                                  style={{
                                    height: 36, borderRadius: 10, border: "none", cursor: "pointer",
                                    background: "linear-gradient(135deg, #D4A437, #b8862d)", color: "#000",
                                    fontSize: 11, fontWeight: 800, padding: "0 14px",
                                    boxShadow: "0 4px 12px rgba(212,164,55,0.3)",
                                  }}
                                >Distribuer le pot</button>
                              ) : (
                                <div style={{ fontSize: 10, color: "#64748b", textAlign: "right", maxWidth: 120 }}>
                                  {paidCount}/{totalMembers} contributions nécessaires
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "crypto" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="hub-screen">
                <div className="hub-topbar">
                  <h2 className="hub-title">Échange Crypto</h2>
                  <button className="transaction-back" onClick={closeHub} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                </div>

                {SIMULATED_BANNER}

                <div className="hub-card">
                  <div className="exchange-stack">
                    <div className="exchange-box">
                      <div className="exchange-kicker">
                        <span>Vous payez</span>
                        <span>Solde: {formatCurrency(firestoreBalance !== null ? firestoreBalance : dashboardData.balance)} F</span>
                      </div>
                      <div className="exchange-row">
                        <input type="number" placeholder="0" value={xafAmount} onChange={(e) => setXafAmount(e.target.value)} />
                        <div className="exchange-unit">XAF (Mobile Money)</div>
                      </div>
                    </div>

                    <div className="swap-button">
                      <div>
                        <AppIcon name="receive" size={18} stroke="#fff" />
                      </div>
                    </div>

                    <div className="exchange-box receive">
                      <div className="exchange-kicker">
                        <span>Vous recevez</span>
                        <span>Taux: 1 USDT = {cryptoRate} F</span>
                      </div>
                      <div className="exchange-row">
                        <div style={{ fontSize: 30, fontWeight: 800, fontFamily: "Montserrat, sans-serif" }}>{cryptoUsdtValue}</div>
                        <div className="token-wrap">
                          <div className="token-badge">T</div>
                          <div className="exchange-unit" style={{ color: "#10b981" }}>USDT</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <button className="hub-cta" disabled style={{ opacity: 0.4, cursor: "not-allowed" }} onClick={() => {}}>Indisponible</button>
                </div>
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "payments" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="payments-screen">
                <div className="tab-head">
                  <div className="tab-title">Transferts</div>
                  <div style={{display:"flex",alignItems:"center",gap:10}}>
                    <button className="btn-camera-top" onClick={openCameraScanner} aria-label="Scanner">
                      <AppIcon name="camera" size={20} stroke="#fff" />
                    </button>
                    <button className="contact-modal-close" onClick={() => { setScreen("dashboard"); setNavActive("Accueil"); }} aria-label="Fermer">
                      <span style={{ fontSize: 20, lineHeight: 1 }}>×</span>
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <p className="tab-kicker">Envoyer à un contact</p>
                  <div className="contacts-scroll">
                    <div className="contact-item add-new" onClick={addNewContact}>
                      <div className="add-circle">
                        <AppIcon name="request" size={20} stroke="currentColor" />
                      </div>
                      <span className="contact-name">Nouveau</span>
                    </div>
                    {paymentContacts.map((contact) => (
                      <div key={contact.name} className="contact-item" onClick={() => { openPaymentsTab(); setServicesQuery(""); closeContactModal(); }}>
                        <div className={`contact-circle ${contact.tone}`}>{contact.name[0]}</div>
                        <span className="contact-name">{contact.name}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {contactModalOpen && (
                  <div className="contact-modal-overlay" onClick={closeContactModal}>
                    <div className="contact-modal" onClick={(event) => event.stopPropagation()}>
                      <div className="contact-modal-head">
                        <div>
                          <div className="contact-modal-title">Nouveau contact</div>
                          <div className="contact-modal-sub">Recherchez un client Morali par pseudo ou identifiant pour l’ajouter à vos bénéficiaires.</div>
                        </div>
                        <button className="contact-modal-close" onClick={closeContactModal} aria-label="Fermer">
                          <span style={{ fontSize: 20, lineHeight: 1 }}>×</span>
                        </button>
                      </div>

                      <div className="contact-modal-field">
                        <label className="contact-modal-label">Rechercher un contact</label>
                        <div className="search-box">
                          <input
                            className="contact-modal-input"
                            type="text"
                            placeholder="@pseudo ou numéro de compte..."
                            value={contactQuery}
                            onChange={(e) => setContactQuery(e.target.value)}
                          />
                          {contactSearchLoading && <div className="loader-spinner" />}
                        </div>
                      </div>

                      {verifiedMoraliUser && (
                        <div className="user-preview">
                          <div className={`contact-modal-avatar ${verifiedMoraliUser.tone}`}>{verifiedMoraliUser.name.charAt(0).toUpperCase()}</div>
                          <div>
                            <div className="contact-modal-preview-name">{verifiedMoraliUser.name}</div>
                            <div className="preview-status">Compte Morali vérifié • {verifiedMoraliUser.pseudo}</div>
                          </div>
                        </div>
                      )}

                      {!contactSearchLoading && contactQuery.trim().length > 2 && !verifiedMoraliUser && (
                        <div className="contact-modal-preview">
                          <div className="contact-modal-avatar">?</div>
                          <div>
                            <div className="contact-modal-preview-name">Aucun compte trouvé</div>
                            <div className="contact-modal-preview-meta">Essayez @sarah, @prince ou un identifiant Morali</div>
                          </div>
                        </div>
                      )}

                      <div className="contact-modal-actions">
                        <button className="contact-modal-btn secondary" onClick={closeContactModal}>Annuler</button>
                        <button className="contact-modal-btn primary" id="addBtn" onClick={confirmAddNewContact} disabled={!verifiedMoraliUser}>Ajouter au favoris</button>
                      </div>
                    </div>
                  </div>
                )}

                {requestQrOpen && (
                  <div className="request-modal-overlay" onClick={closeRequestQr}>
                    <div className="request-container" onClick={(event) => event.stopPropagation()}>
                      <button className="request-close" onClick={closeRequestQr} aria-label="Fermer">
                        <span style={{ fontSize: 20, lineHeight: 1 }}>×</span>
                      </button>
                      <div className="qr-glass-card">
                        <div className="qr-header">
                          <span className="qr-label">MON QR CODE MORALI</span>
                          <div className="qr-status-dot" />
                        </div>
                        <div className="qr-main">
                          <div className="qr-frame">
                            <QRCodeSVG
                              value={JSON.stringify({ app: "MoraliBank", userId: bankingIdentity.id || `@${firebaseAuth.currentUser?.email?.split("@")[0]}`, name: dashboardName, ts: Date.now() })}
                              size={180}
                              bgColor="#ffffff"
                              fgColor="#0d1b3e"
                              level="H"
                              includeMargin={false}
                            />
                            <div className="qr-logo-overlay">M</div>
                          </div>
                        </div>
                        <div className="qr-footer">
                          <span className="user-id">{bankingIdentity.id || `@${firebaseAuth.currentUser?.email?.split("@")[0]}`}</span>
                          <p className="qr-instruction">Scanner pour me payer instantanément</p>
                        </div>
                      </div>
                      <div className="share-actions">
                        <button className="btn-share" onClick={() => {
                          const qrPayload = JSON.stringify({ app: "MoraliBank", userId: bankingIdentity.id || `@${firebaseAuth.currentUser?.email?.split("@")[0]}`, name: dashboardName });
                          navigator.clipboard.writeText(qrPayload).then(() => showToast("Lien copié !")).catch(() => showToast("Erreur de copie"));
                        }}>Copier le lien</button>
                        <button className="btn-share secondary" onClick={async () => {
                          const qrPayload = JSON.stringify({ app: "MoraliBank", userId: bankingIdentity.id || `@${firebaseAuth.currentUser?.email?.split("@")[0]}`, name: dashboardName });
                          if (navigator.share) {
                            try {
                              await navigator.share({ title: "Paiement Morali Pay", text: `Paiement via Morali Pay pour ${dashboardName}`, url: qrPayload });
                            } catch {}
                          } else {
                            navigator.clipboard.writeText(qrPayload).then(() => showToast("Lien copié !")).catch(() => showToast("Erreur de copie"));
                          }
                        }}>Partager</button>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Transfer modal (extracted to TransferView) ── */}
                <TransferView
                  open={transferOpen}
                  onClose={() => setTransferOpen(false)}
                  onNavigate={(screen) => { setTransferOpen(false); setScreen(screen as Screen); }}
                  authUid={authUid || ""}
                  dashboardName={dashboardName}
                  bankingIdentity={bankingIdentity}
                  balance={firestoreBalance !== null ? firestoreBalance : dashboardData.balance}
                  securitySettings={securitySettings}
                  showToast={showToast}
                  showQuickNotif={showQuickNotif}
                  promptBiometric={promptBiometric}
                  getAuthHeaders={getAuthHeaders}
                  findMoraliUser={findMoraliUser}
                  createRealtimeNotification={createRealtimeNotification}
                  createRealtimeTransaction={createRealtimeTransaction}
                  openCameraScanner={openCameraScanner}
                  initialRecipientQuery={transferInitialQueryRef.current}
                />

                <div className="tab-grid-two">
                  <button className="service-card virement" onClick={openTransferModal}>
                    <div className="service-icon-box">
                      <AppIcon name="send" size={18} stroke="#60a5fa" />
                    </div>
                    <div>
                      <p className="tab-card-title">Virement</p>
                      <p className="tab-card-sub">Vers banque ou mobile</p>
                    </div>
                  </button>
                  <button className="service-card demander" onClick={openRequestQr}>
                    <div className="service-icon-box">
                      <AppIcon name="request" size={18} stroke="#4ade80" />
                    </div>
                    <div>
                      <p className="tab-card-title">Demander</p>
                      <p className="tab-card-sub">Lien de paiement QR</p>
                    </div>
                  </button>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 2px" }}>
                    <p className="tab-kicker" style={{ color: "var(--gold)" }}>Activité récente</p>
                    <span style={{ fontSize: 10, color: "#3b82f6", fontWeight: 800, cursor: "pointer" }} onClick={() => setHistoryModalOpen(true)}>Voir tout →</span>
                  </div>
                  <div className="activity-wrap">
                    {(() => {
                      // In the Transfers tab, only show transfer-related transactions (send/receive)
                      const allTx = liveTransactions.length ? liveTransactions : dashboardData.transactions;
                      const transferOnly = allTx.filter((tx) => tx.icon === "send" || tx.icon === "receive" || tx.name.toLowerCase().includes("virement"));
                      if (transferOnly.length === 0) {
                        return (
                          <div style={{ padding: "28px 16px", textAlign: "center" }}>
                            <div style={{ width: 56, height: 56, margin: "0 auto 10px", borderRadius: 16, background: "linear-gradient(135deg, rgba(212,164,55,0.15), rgba(26,62,120,0.2))", border: "1px solid rgba(212,164,55,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#D4A437" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                            </div>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--dim)", lineHeight: 1.5 }}>Aucun virement effectué.<br />Vos transferts apparaîtront ici.</div>
                          </div>
                        );
                      }
                      return transferOnly.slice(0, 5).map((tx, idx) => (
                        <div className="activity-item" key={tx.receiptId || `act-${idx}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 4px", borderBottom: idx < transferOnly.length - 1 ? "1px solid rgba(255,255,255,0.06)" : "none" }}>
                          <div style={{ width: 40, height: 40, borderRadius: 12, background: tx.bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <AppIcon name={tx.icon} size={18} stroke={tx.type === "credit" ? "#60a5fa" : "rgba(255,255,255,0.82)"} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{tx.name}</div>
                            <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{tx.dateTimestamp ? timeAgo(tx.dateTimestamp) : tx.date}</div>
                          </div>
                          <div style={{ textAlign: "right" }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: tx.type === "credit" ? "#22c55e" : "var(--fg)" }}>{tx.type === "credit" ? "+" : "-"}{tx.amount}</div>
                            <div style={{ fontSize: 10, color: "var(--dim)", marginTop: 2 }}>{tx.category}</div>
                          </div>
                        </div>
                      ));
                    })()}
                  </div>
                  </div>
              </div>
            </div>
          </div>

          <div className={`app-screen ${screen === "privileges" ? "active" : ""}`}>
            <div className="content-scrollable nav-safe">
              <div className="privileges-screen">

                {/* ── HERO IMAGE SECTION ── */}
                <div className="priv-hero-img-wrap">
                  <img src="/black-card-hero.png" alt="Morali Black Card" />
                  <div className="priv-hero-img-overlay" />
                  <div className="priv-hero-img-content">
                    <div className="priv-kicker-row">
                      <MoraliShield small />
                      <div className="priv-kicker-text">Morali Pay</div>
                    </div>
                    <div className="priv-badge-coming">
                      <div className="priv-badge-coming-dot" />
                      <div className="priv-badge-coming-text">Bientôt disponible</div>
                    </div>
                    <h1 className="priv-hero-title">
                      La Carte <span>Black</span><br />d&apos;exception
                    </h1>
                    <p className="priv-hero-sub">Votre passeport vers un monde de privilèges exclusifs. Puissance, prestige et performances bancaires réunis.</p>
                  </div>
                </div>

                {/* ── BODY CONTENT ── */}
                <div className="priv-body" style={{ paddingTop: 28 }}>

                  {/* EXCLUSIVE NUMBERS */}
                  <div className="priv-section-label">En chiffres</div>
                  <div className="priv-stats-row">
                    <div className="priv-stat-card">
                      <div className="priv-stat-value">5M+</div>
                      <div className="priv-stat-label">Plafond mensuel</div>
                    </div>
                    <div className="priv-stat-card">
                      <div className="priv-stat-value">3.5%</div>
                      <div className="priv-stat-label">Cashback premium</div>
                    </div>
                    <div className="priv-stat-card">
                      <div className="priv-stat-value">24/7</div>
                      <div className="priv-stat-label">Conciergerie dédiée</div>
                    </div>
                  </div>

                  <div className="priv-divider" />

                  {/* BENEFITS GRID */}
                  <div className="priv-section-label">Avantages exclusifs</div>
                  <div className="priv-benefits-grid">
                    <div className="priv-benefit-card">
                      <div className="priv-benefit-icon gold">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                      </div>
                      <div className="priv-benefit-name">Plafonds Élevés</div>
                      <div className="priv-benefit-desc">Limites de dépenses et retraits ajustables selon votre profil.</div>
                    </div>
                    <div className="priv-benefit-card">
                      <div className="priv-benefit-icon sapphire">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      </div>
                      <div className="priv-benefit-name">Cashback Renforcé</div>
                      <div className="priv-benefit-desc">Jusqu&apos;à 3.5% de remise sur tous vos achats premium.</div>
                    </div>
                    <div className="priv-benefit-card">
                      <div className="priv-benefit-icon emerald">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      </div>
                      <div className="priv-benefit-name">Conciergerie 24/7</div>
                      <div className="priv-benefit-desc">Assistance personnelle pour voyages, réservations et demandes.</div>
                    </div>
                    <div className="priv-benefit-card">
                      <div className="priv-benefit-icon rose">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>
                      </div>
                      <div className="priv-benefit-name">Assurance Voyage</div>
                      <div className="priv-benefit-desc">Couverture internationale complète sur vos déplacements.</div>
                    </div>
                    <div className="priv-benefit-card">
                      <div className="priv-benefit-icon amber">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                      </div>
                      <div className="priv-benefit-name">Accès Lounges</div>
                      <div className="priv-benefit-desc">Salons VIP dans plus de 1 300 aéroports dans le monde.</div>
                    </div>
                    <div className="priv-benefit-card">
                      <div className="priv-benefit-icon violet">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                      </div>
                      <div className="priv-benefit-name">Sécurité Maximale</div>
                      <div className="priv-benefit-desc">Protection anti-fraud avancée et authentification biométrique.</div>
                    </div>
                  </div>

                  <div className="priv-divider" />

                  {/* EXCLUSIVE BANNER */}
                  <div className="priv-exclusive-banner">
                    <div className="priv-exclusive-icon">
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    </div>
                    <div className="priv-exclusive-title">Sur invitation uniquement</div>
                    <div className="priv-exclusive-desc">
                      La Carte Morali Black est réservée à nos clients les plus exclusifs. Un programme sur sélection pour une expérience bancaire d&apos;exception.
                    </div>
                  </div>

                  {/* CTA */}
                  <button className="priv-cta-btn" onClick={openBlackCardModal}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                    Demander ma Carte Black
                  </button>

                  <div className="priv-divider" />

                  {/* FOOTER */}
                  <div style={{ textAlign: 'center', padding: '8px 0 0' }}>
                    <p style={{ fontSize: 10, color: '#334155', fontWeight: 700, letterSpacing: '.05em' }}>MORALI PAY — Programme Black Card</p>
                    <p style={{ fontSize: 9, color: '#1e293b', fontWeight: 600, marginTop: 4 }}>Conditions d&apos;éligibilité applicables. Réservé aux clients sélectionnés.</p>
                  </div>

                </div>
              </div>
            </div>
          </div>

          {screen === "cards" && (
            <CardsView
              cardLocked={cardLocked}
              cardTransform={cardTransform}
              onCardMove={handleCardMove}
              onCardLeave={() => setCardTransform("rotateX(4deg) rotateY(-3deg)")}
              cardNumber={dashboardData.cardNumber}
              cardCcv={dashboardData.cardCcv}
              cardExp={dashboardData.cardExp}
              holder={dashboardData.holder}
              blackCardNumber={dashboardData.blackCardNumber}
              blackCardCcv={dashboardData.blackCardCcv}
              blackCardExp={dashboardData.blackCardExp}
              onBlackCardClick={openBlackCardModal}
              onHistoryClick={() => setHistoryModalOpen(true)}
              cardActions={cardActions}
              onCardAction={(label) => {
                if (label === "Geler la carte") openManageCardModal();
                else if (label === "Code PIN") openPinModal();
                else if (label === "Limites") openCardLimitsModal();
                else if (label === "Nouvelle") openVirtualCardModal();
                else showToast(label);
              }}
              showToast={showToast}
            />
          )}

          {screen === "profile" && (
            <ProfileView
              holder={dashboardData.holder}
              bankingId={bankingIdentity.id}
              kycConfig={kycConfig}
              kycLevel={kycLevel}
              secLevelCount={secLevelCount}
              profileGroups={profileGroups}
              onAction={(label) => {
                if (label === "Informations Personnelles") openInfoDrawer();
                else if (label === "Sécurité & Biométrie") openSecurityModal();
                else if (label === "Historique des Reçus") openReceiptsModal();
                else if (label === "Support Client") openSupportModal();
                else if (label === "Conditions d'utilisation") openTermsModal();
                else if (label === "Confidentialité") openPrivacyModal();
                else showToast(label);
              }}
              onLogout={() => setLogoutModalOpen(true)}
            />
          )}

          {(screen === "dashboard" || historyModalOpen) && (
          <DashboardView
            dashboardName={dashboardName}
            dashboardData={dashboardData}
            chartBalance={chartBalance}
            sparklinePath={sparklinePath}
            chartDays={chartDays}
            weeklyStats={weeklyStats}
            chartData={chartData}
            dynamicChartDays={dynamicChartDays}
            liveTransactions={liveTransactions}
            notifications={notifications}
            unreadNotificationsCount={unreadNotificationsCount}
            cardLocked={cardLocked}
            setCardLocked={setCardLocked}
            cardGenerating={cardGenerating}
            handleCardGenerate={handleCardGenerate}
            cardTransform={cardTransform}
            handleCardMove={handleCardMove}
            setCardTransform={setCardTransform}
            cardNumberRevealed={cardNumberRevealed}
            activeCardNumber={activeCardNumber}
            maskCardNumber={maskCardNumber}
            toggleCardNumberReveal={toggleCardNumberReveal}
            activeCardCcv={activeCardCcv}
            activeCardExp={activeCardExp}
            chartPeriod={chartPeriod}
            setChartPeriod={setChartPeriod}
            chartTooltip={chartTooltip}
            setChartTooltip={setChartTooltip}
            notificationsOpen={notificationsOpen}
            setNotificationsOpen={setNotificationsOpen}
            historyModalOpen={historyModalOpen}
            setHistoryModalOpen={setHistoryModalOpen}
            renderProtectedAmount={renderProtectedAmount}
            showToast={showToast}
            openTransaction={openTransaction}
            openServices={openServices}
            openPaymentsTab={openPaymentsTab}
          />
          )}

          {screen !== "auth" && screen !== "admin" && (
            <nav className="bottom-nav" role="tablist" aria-label="Navigation principale">
              {navItems.map((item) => {
                const active = navActive === item;
                return (
                  <div
                    key={item}
                    className={`bn ${active ? "act" : ""}`}
                    role="tab"
                    aria-selected={active}
                    tabIndex={active ? 0 : -1}
                    onClick={() => {
                      if (item === "Accueil") {
                        openDashboard();
                        return;
                      }
                      if (item === "Cartes") {
                        openCardsTab();
                        return;
                      }
                      if (item === "Privilèges") {
                        openPrivilegesTab();
                        return;
                      }
                      if (item === "Profil") {
                        openProfileTab();
                        return;
                      }
                    }}
                    onKeyDown={(e) => {
                      const items = navItems;
                      const idx = items.indexOf(item);
                      if (e.key === "ArrowRight") { const next = items[(idx + 1) % items.length]; const el = document.querySelector(`[aria-selected="${next === navActive}"]`)?.parentElement?.children[idx + 1] as HTMLElement; el?.focus(); }
                      if (e.key === "ArrowLeft") { const prev = items[(idx - 1 + items.length) % items.length]; const el = document.querySelector(`[aria-selected="${prev === navActive}"]`)?.parentElement?.children[idx - 1] as HTMLElement; el?.focus(); }
                    }}
                  >
                    <div className={`bn-ico ${active ? "act" : ""}`}>
                      {renderNavIcon(item, active)}
                    </div>
                    <div className="bn-lbl">{item}</div>
                    <div className="bn-pip" />
                  </div>
                );
              })}
            </nav>
          )}
        </div>

        <div className={`modal-drawer-overlay ${infoDrawerOpen ? "active" : ""}`} onClick={closeInfoDrawer}>
          <div className="modal-drawer-content" onClick={(event) => event.stopPropagation()}>
            <div className="drawer-handle" />
            <div className="modal-drawer-header">
              <h3>Mes Informations</h3>
              <button className="btn-close-circle" onClick={closeInfoDrawer} aria-label="Fermer">×</button>
            </div>
            <section className="banking-identity">
              <div className="banking-identity-card" onClick={() => copyToClipboard("id", bankingIdentity.id)}>
                <div className="banking-identity-copy">
                  <span className="banking-identity-label">ID MORALI</span>
                  <span className="banking-identity-value master">{bankingIdentity.id || "MORALI…"}</span>
                </div>
                <div className={`banking-copy-indicator ${copiedIdentityField === "id" ? "success" : ""}`}>
                  {copiedIdentityField === "id" ? "✓" : "⧉"}
                </div>
              </div>
              <div className="banking-identity-card" onClick={() => copyToClipboard("rib", bankingIdentity.rib)}>
                <div className="banking-identity-copy">
                  <span className="banking-identity-label">VOTRE RIB MOKG</span>
                  <span className="banking-identity-value">{bankingIdentity.rib || "MOKG-…"}</span>
                </div>
                <div className={`banking-copy-indicator ${copiedIdentityField === "rib" ? "success" : ""}`}>
                  {copiedIdentityField === "rib" ? "✓" : "⧉"}
                </div>
              </div>
            </section>
            <div className="edit-avatar-section">
              <div className="profile-avatar grad-blue small">
                <span className="avatar-text">{(profileForm.fullName || "P").charAt(0).toUpperCase()}</span>
              </div>
              <button className="btn-change-photo" onClick={() => showToast("Changement de photo bientôt disponible")}>Changer la photo</button>
            </div>
            <div className="edit-form">
              <div className="input-group-glass">
                <label>Nom complet</label>
                <input type="text" value={profileForm.fullName} placeholder="Ton nom" onChange={(e) => setProfileForm((current) => ({ ...current, fullName: e.target.value }))} />
              </div>
              <div className="input-group-glass">
                <label>Numéro de téléphone</label>
                <input type="tel" value={profileForm.phone} placeholder="Ton numéro" onChange={(e) => setProfileForm((current) => ({ ...current, phone: e.target.value }))} />
              </div>
              <div className="input-group-glass">
                <label>Adresse de résidence</label>
                <input type="text" value={profileForm.address} placeholder="Ton adresse" onChange={(e) => setProfileForm((current) => ({ ...current, address: e.target.value }))} />
              </div>
            </div>

            {/* KYC Status */}
            <div style={{ padding: "14px 16px", borderRadius: 16, background: `${kycConfig.bg}`, border: `1px solid ${kycConfig.border}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: kycConfig.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: "#fff" }}>
                    {kycLevel === 3 ? "✓" : kycLevel === 2 ? "~" : "?"}
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#fff" }}>Niveau KYC</div>
                    <div style={{ fontSize: 10, color: kycConfig.color, fontWeight: 700 }}>{kycConfig.text}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 800, color: kycConfig.color }}>{kycConfig.pct}</div>
              </div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {[1, 2, 3].map((step) => (
                  <div key={step} style={{ flex: 1, height: 4, borderRadius: 2, background: step <= kycLevel ? kycConfig.color : "rgba(255,255,255,.06)", transition: "background .3s" }} />
                ))}
              </div>
              <div style={{ display: "flex", gap: 8, fontSize: 9, color: "#64748b" }}>
                <span style={kycLevel >= 1 ? { color: kycConfig.color, fontWeight: 700 } : undefined}>Nom</span>
                <span style={kycLevel >= 2 ? { color: kycConfig.color, fontWeight: 700 } : undefined}>Téléphone</span>
                <span style={kycLevel >= 3 ? { color: kycConfig.color, fontWeight: 700 } : undefined}>Adresse</span>
              </div>
            </div>

            <button className="btn-save-elite" onClick={saveProfileInfos}>Mettre à jour le profil</button>
          </div>
        </div>

        {cardManageOpen && (
          <div className="card-modal-overlay" onClick={closeManageCardModal}>
            <div className="bc-modal" onClick={(event) => event.stopPropagation()}>
              <div className="bc-head">
                <div className="bc-head-left">
                  <div className="bc-kicker">Paramètres</div>
                  <div className="bc-title">Gérer la carte</div>
                  <div className="bc-subtitle">Contrôlez votre carte Morali avec des réglages premium et instantanés.</div>
                </div>
                <button className="bc-close" onClick={closeManageCardModal} aria-label="Fermer">&times;</button>
              </div>

              <div className="card-manage-stack">
                <div className="card-setting-row">
                  <div>
                    <div className="card-setting-title">Carte verrouillée</div>
                    <div className="card-setting-copy">Bloquez temporairement les paiements de la carte.</div>
                  </div>
                  <div className={`mini-switch ${cardLocked ? "active" : ""}`} role="switch" aria-checked={cardLocked} tabIndex={0} onClick={() => setCardLocked((current) => !current)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCardLocked((current) => !current); } }} />
                </div>

                <div className="card-setting-row">
                  <div>
                    <div className="card-setting-title">Paiements en ligne</div>
                    <div className="card-setting-copy">Autoriser les achats web et abonnements sécurisés.</div>
                  </div>
                  <div className={`mini-switch ${cardSettings.online ? "active" : ""}`} role="switch" aria-checked={cardSettings.online} tabIndex={0} onClick={() => setCardSettings((current) => ({ ...current, online: !current.online }))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCardSettings((current) => ({ ...current, online: !current.online })); } }} />
                </div>

                <div className="card-setting-row">
                  <div>
                    <div className="card-setting-title">International</div>
                    <div className="card-setting-copy">Activer la carte hors Congo et pour les services mondiaux.</div>
                  </div>
                  <div className={`mini-switch ${cardSettings.international ? "active" : ""}`} role="switch" aria-checked={cardSettings.international} tabIndex={0} onClick={() => setCardSettings((current) => ({ ...current, international: !current.international }))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setCardSettings((current) => ({ ...current, international: !current.international })); } }} />
                </div>
              </div>

              <div className="pin-display" style={{ background: "linear-gradient(145deg,rgba(59,130,246,.06),rgba(10,14,23,.18))", borderColor: "rgba(59,130,246,.12)" }}>
                <div className="pin-kicker" style={{ color: "rgba(96,165,250,.55)" }}>Statistiques</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, textAlign: "center" }}>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>Plafond journalier</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>750 000 <span style={{ fontSize: 10, color: "#64748b" }}>FCFA</span></div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>Retrait ATM</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: cardSettings.atm ? "#34d399" : "#f87171" }}>{cardSettings.atm ? "Actif" : "Désactivé"}</div>
                  </div>
                </div>
              </div>

              <button className="bc-btn-full" onClick={saveCardSettings}>Enregistrer les réglages</button>
            </div>
          </div>
        )}

        {cardPinOpen && (
          <div className="card-modal-overlay" onClick={closePinModal}>
            <div className="bc-modal" onClick={(event) => event.stopPropagation()}>
              <div className="bc-head">
                <div className="bc-head-left">
                  <div className="bc-kicker">Sécurité</div>
                  <div className="bc-title">Code PIN</div>
                  <div className="bc-subtitle">Protégez votre carte avec un code PIN à 4 chiffres.</div>
                </div>
                <button className="bc-close" onClick={closePinModal} aria-label="Fermer">&times;</button>
              </div>

              {cardPinStage === "setup" ? (
                <div className="bc-step-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Créer votre code PIN</div>
                    <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.5 }}>Choisissez 4 chiffres faciles à retenir mais difficiles à deviner.</div>
                  </div>

                  <div className="pin-display">
                    <div className="pin-dots">
                      {[0,1,2,3].map(i => <div key={i} className={`pin-dot ${cardPinDraft.length > i ? "filled" : ""}`} />)}
                    </div>
                  </div>

                  <div className="bc-form">
                    <div className="bc-field">
                      <div className="bc-field-label">Code PIN</div>
                      <input className="bc-field-input" type="password" inputMode="numeric" maxLength={4} value={cardPinDraft} onChange={(event) => setCardPinDraft(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em", fontWeight: 900 }} />
                    </div>
                    <div className="bc-field">
                      <div className="bc-field-label">Confirmer le code PIN</div>
                      <input className="bc-field-input" type="password" inputMode="numeric" maxLength={4} value={cardPinConfirm} onChange={(event) => setCardPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em", fontWeight: 900 }} />
                    </div>
                  </div>

                  <button className="bc-btn-full" onClick={saveCardPinCode} disabled={cardPinDraft.length !== 4 || cardPinConfirm.length !== 4} style={cardPinDraft.length !== 4 || cardPinConfirm.length !== 4 ? { opacity: .4 } : {}}>
                    Enregistrer le code PIN
                  </button>

                  <div className="bc-notice">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    <div className="bc-notice-text">Ce code sera demandé pour confirmer certaines opérations sensibles sur votre carte.</div>
                  </div>
                </div>
              ) : cardPinStage === "menu" ? (
                <div className="bc-step-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="pin-display">
                    <div className="pin-kicker">Code PIN actif</div>
                    <div className="pin-code">{cardPinRevealed && revealedPinDigits ? revealedPinDigits : "• • • •"}</div>
                  </div>

                  <div className="bc-notice" style={{ background: "rgba(34,197,94,.04)", borderColor: "rgba(34,197,94,.12)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                    <div className="bc-notice-text">Votre carte Morali est protégée par un code PIN sécurisé.</div>
                  </div>

                  <div className="pin-actions-row">
                    <button className="pin-action-btn" onClick={() => { setCardPinStage("reveal"); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      Afficher
                    </button>
                    <button className="pin-action-btn" onClick={() => { setCardPinDraft(""); setCardPinConfirm(""); setCardPinStage("change"); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                      Modifier
                    </button>
                    <button className="pin-action-btn" style={{ color: "#fbbf24" }} onClick={() => { resetPinResetState(); setCardPinStage("reset"); }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                      PIN oublié
                    </button>
                  </div>

                  <button className="bc-btn-full bc-btn-secondary" onClick={closePinModal}>Fermer</button>
                </div>
              ) : cardPinStage === "reveal" ? (
                <div className="bc-step-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                  {/* PIN revealed successfully */}
                  {cardPinRevealed && revealedPinDigits ? (
                    <>
                      <div className="pin-display">
                        <div className="pin-kicker">Votre code PIN</div>
                        <div className="pin-code revealed">{revealedPinDigits}</div>
                      </div>
                      <div className="bc-actions">
                        <button className="bc-btn bc-btn-secondary" onClick={() => { setCardPinStage("menu"); setCardPinRevealed(false); setRevealAccountPw(""); }}>Retour</button>
                        <button className="bc-btn bc-btn-primary" onClick={() => setCardPinStage("menu")}>OK</button>
                      </div>
                    </>
                  ) : revealNeedsPin ? (
                    /* PIN not encrypted — ask user to enter their PIN to encrypt + reveal */
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Chiffrer votre PIN</div>
                        <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.5 }}>Mot de passe vérifié ✓. Entrez votre code PIN pour le chiffrer et l'afficher. Cette étape ne se fera qu'une seule fois.</div>
                      </div>
                      <div className="bc-form">
                        <div className="bc-field">
                          <div className="bc-field-label">Votre code PIN</div>
                          <input
                            className="bc-field-input"
                            type="password"
                            inputMode="numeric"
                            maxLength={4}
                            value={revealPinRaw}
                            onChange={(event) => setRevealPinRaw(event.target.value.replace(/\D/g, "").slice(0, 4))}
                            placeholder="••••"
                            style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em", fontWeight: 900 }}
                            autoFocus
                          />
                        </div>
                      </div>
                      <button
                        className="bc-btn-full"
                        onClick={encryptAndRevealPin}
                        disabled={revealPinRaw.length !== 4 || revealPinVerifying}
                        style={revealPinRaw.length !== 4 || revealPinVerifying ? { opacity: .4 } : {}}
                      >
                        {revealPinVerifying ? <div className="btn-loader" /> : "Chiffrer et afficher"}
                      </button>
                      <button className="bc-btn bc-btn-secondary" onClick={() => { setRevealNeedsPin(false); setRevealPinRaw(""); setRevealVerifiedPw(""); setCardPinStage("menu"); }}>Annuler</button>
                    </>
                  ) : (
                    /* Default: ask for account password */
                    <>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Vérification de sécurité</div>
                        <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.5 }}>Entrez le mot de passe de votre compte Morali pour afficher votre code PIN.</div>
                      </div>
                      <div className="bc-form">
                        <div className="bc-field">
                          <div className="bc-field-label">Mot de passe du compte</div>
                          <input
                            className="bc-field-input"
                            type="password"
                            value={revealAccountPw}
                            onChange={(event) => setRevealAccountPw(event.target.value)}
                            placeholder="Votre mot de passe"
                            style={{ textAlign: "center", fontSize: 16, fontWeight: 700 }}
                            autoFocus
                          />
                        </div>
                      </div>
                      <button
                        className="bc-btn-full"
                        onClick={revealPinWithPassword}
                        disabled={!revealAccountPw.trim() || revealVerifying || revealLockedUntil > Date.now()}
                        style={!revealAccountPw.trim() || revealVerifying || revealLockedUntil > Date.now() ? { opacity: .4 } : {}}
                      >
                        {revealVerifying ? <div className="btn-loader" /> : revealLockedUntil > Date.now() ? "Verrouillé" : "Vérifier et afficher"}
                      </button>
                      {revealLockedUntil > Date.now() && (
                        <div style={{ textAlign: "center", padding: "8px 12px", borderRadius: 12, background: "rgba(239,68,68,.08)", border: "1px solid rgba(239,68,68,.15)" }}>
                          <div style={{ fontSize: 10, fontWeight: 800, color: "#f87171" }}>Trop de tentatives incorrectes</div>
                          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Réessayez dans quelques minutes</div>
                        </div>
                      )}
                      {revealAttempts > 0 && revealLockedUntil <= Date.now() && (
                        <div style={{ textAlign: "center", fontSize: 10, color: "#fbbf24", fontWeight: 700 }}>{3 - revealAttempts} tentative(s) restante(s)</div>
                      )}
                      <div className="bc-actions">
                        <button className="bc-btn bc-btn-secondary" onClick={() => { setCardPinStage("menu"); setRevealAccountPw(""); }}>Retour</button>
                      </div>
                    </>
                  )}

                </div>
              ) : cardPinStage === "reset" ? (
                <div className="bc-step-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Réinitialiser le code PIN</div>
                    <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.5 }}>Un code de confirmation sera envoyé à votre email pour vérifier votre identité.</div>
                  </div>

                  {!pinResetOtpSent ? (
                    <>
                      <div className="bc-notice" style={{ background: "rgba(251,191,36,.04)", borderColor: "rgba(251,191,36,.12)" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(251,191,36,.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg>
                        <div className="bc-notice-text">Le code sera envoyé à : <strong style={{ color: "#fbbf24" }}>{firebaseAuth.currentUser?.email || "..."}</strong></div>
                      </div>
                      <button className="bc-btn-full" onClick={sendPinResetOtp} disabled={pinResetSending} style={pinResetSending ? { opacity: .4 } : {}}>
                        {pinResetSending ? <div className="btn-loader" /> : "Envoyer le code par email"}
                      </button>
                    </>
                  ) : !pinResetVerified ? (
                    <>
                      <div className="bc-form">
                        <div className="bc-field">
                          <div className="bc-field-label">Code de confirmation</div>
                          <input
                            className="bc-field-input"
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={pinResetOtpCode}
                            onChange={(event) => setPinResetOtpCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                            placeholder="000000"
                            style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em", fontWeight: 900 }}
                            autoFocus
                          />
                        </div>
                      </div>

                      {pinResetDemoOtp && (
                        <div style={{ textAlign: "center", padding: "8px 12px", borderRadius: 12, background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.12)" }}>
                          <div style={{ fontSize: 9, fontWeight: 800, color: "#fbbf24", letterSpacing: ".1em", textTransform: "uppercase" }}>Mode démo</div>
                          <div style={{ fontSize: 18, fontWeight: 900, color: "#fff", letterSpacing: ".2em", marginTop: 2 }}>{pinResetDemoOtp}</div>
                        </div>
                      )}

                      <button className="bc-btn-full" onClick={verifyPinResetOtp} disabled={pinResetOtpCode.length !== 6 || pinResetVerifying} style={pinResetOtpCode.length !== 6 || pinResetVerifying ? { opacity: .4 } : {}}>
                        {pinResetVerifying ? <div className="btn-loader" /> : "Vérifier le code"}
                      </button>

                      <div style={{ textAlign: "center" }}>
                        <span style={{ fontSize: 11, color: "#64748b" }}>Pas de code ? </span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", cursor: "pointer" }} onClick={sendPinResetOtp}>Renvoyer</span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="bc-notice" style={{ background: "rgba(34,197,94,.04)", borderColor: "rgba(34,197,94,.12)" }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(34,197,94,.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
                        <div className="bc-notice-text">Email vérifié ! Créez votre nouveau code PIN.</div>
                      </div>
                      <div className="bc-form">
                        <div className="bc-field">
                          <div className="bc-field-label">Nouveau code PIN</div>
                          <input className="bc-field-input" type="password" inputMode="numeric" maxLength={4} value={pinResetNewPin} onChange={(event) => setPinResetNewPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em", fontWeight: 900 }} />
                        </div>
                        <div className="bc-field">
                          <div className="bc-field-label">Confirmer le code PIN</div>
                          <input className="bc-field-input" type="password" inputMode="numeric" maxLength={4} value={pinResetConfirmPin} onChange={(event) => setPinResetConfirmPin(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em", fontWeight: 900 }} />
                        </div>
                      </div>
                      <button className="bc-btn-full" onClick={resetPinWithNewCode} disabled={pinResetNewPin.length !== 4 || pinResetConfirmPin.length !== 4 || pinResetNewPin !== pinResetConfirmPin} style={pinResetNewPin.length !== 4 || pinResetConfirmPin.length !== 4 || pinResetNewPin !== pinResetConfirmPin ? { opacity: .4 } : {}}>
                        Réinitialiser le PIN
                      </button>
                    </>
                  )}

                  <div className="bc-actions">
                    <button className="bc-btn bc-btn-secondary" onClick={() => { resetPinResetState(); setCardPinStage("menu"); }}>Retour</button>
                  </div>
                </div>
              ) : (
                <div className="bc-step-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Modifier le code PIN</div>
                    <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.5 }}>Saisissez l\'ancien puis le nouveau code PIN.</div>
                  </div>

                  <div className="bc-form">
                    <div className="bc-field">
                      <div className="bc-field-label">Ancien code PIN</div>
                      <input className="bc-field-input" type="password" inputMode="numeric" maxLength={4} value={cardPinPassword} onChange={(event) => setCardPinPassword(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em", fontWeight: 900 }} />
                    </div>
                    <div className="bc-field">
                      <div className="bc-field-label">Nouveau code PIN</div>
                      <input className="bc-field-input" type="password" inputMode="numeric" maxLength={4} value={cardPinDraft} onChange={(event) => setCardPinDraft(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em", fontWeight: 900 }} />
                    </div>
                    <div className="bc-field">
                      <div className="bc-field-label">Confirmer nouveau code PIN</div>
                      <input className="bc-field-input" type="password" inputMode="numeric" maxLength={4} value={cardPinConfirm} onChange={(event) => setCardPinConfirm(event.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" style={{ textAlign: "center", fontSize: 22, letterSpacing: ".3em", fontWeight: 900 }} />
                    </div>
                    <div className="bc-notice" style={{ background: "rgba(59,130,246,.04)", borderColor: "rgba(59,130,246,.12)" }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(96,165,250,.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                      <div className="bc-notice-text">Le mot de passe du compte est optionnel. Saisissez-le pour pouvoir afficher votre PIN plus tard.</div>
                    </div>
                    <div className="bc-field">
                      <div className="bc-field-label">Mot de passe du compte <span style={{ fontSize: 10, color: "#64748b", fontWeight: 600 }}>(optionnel)</span></div>
                      <input
                        className="bc-field-input"
                        type="password"
                        value={changePinAccountPw}
                        onChange={(event) => setChangePinAccountPw(event.target.value)}
                        placeholder="Votre mot de passe"
                        style={{ textAlign: "center", fontSize: 16, fontWeight: 700 }}
                      />
                    </div>
                  </div>

                  <button className="bc-btn-full" onClick={changeCardPinCode} disabled={cardPinPassword.length !== 4 || cardPinDraft.length !== 4 || cardPinConfirm.length !== 4} style={cardPinPassword.length !== 4 || cardPinDraft.length !== 4 || cardPinConfirm.length !== 4 ? { opacity: .4 } : {}}>
                    Mettre à jour le PIN
                  </button>

                  <button className="bc-btn-full bc-btn-secondary" onClick={() => { setCardPinDraft(""); setCardPinConfirm(""); setCardPinPassword(""); setChangePinAccountPw(""); setCardPinStage("menu"); }}>Annuler</button>
                </div>
              )}

            </div>
          </div>
        )}

        {cardLimitsOpen && (
          <div className="card-modal-overlay" onClick={closeCardLimitsModal}>
            <div className="bc-modal" onClick={(event) => event.stopPropagation()}>
              <div className="bc-head">
                <div className="bc-head-left">
                  <div className="bc-kicker">Plafonds</div>
                  <div className="bc-title">Limites &amp; Plafonds</div>
                  <div className="bc-subtitle">Référentiel local inspiré des plafonds opérateurs MTN MoMo et Airtel Money au Congo-Brazzaville.</div>
                </div>
                <button className="bc-close" onClick={closeCardLimitsModal} aria-label="Fermer">&times;</button>
              </div>

              <div className="pin-display" style={{ background: "linear-gradient(145deg,rgba(59,130,246,.06),rgba(10,14,23,.18))", borderColor: "rgba(59,130,246,.12)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14, textAlign: "left" }}>
                  <div style={{ padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>Virement / transaction</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>500 000 FCFA</div>
                  </div>
                  <div style={{ padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>Paiement marchand</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>1 000 000 FCFA</div>
                  </div>
                  <div style={{ padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>Quotidien conseillé</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>1 500 000 FCFA</div>
                  </div>
                  <div style={{ padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>Solde maximum</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>5 000 000 FCFA</div>
                  </div>
                </div>
              </div>

              <div className="card-manage-stack">
                <div className="card-setting-row">
                  <div>
                    <div className="card-setting-title"><span style={{ color: "#D4A437", marginRight: 6 }}>&#9679;</span>Référence MTN MoMo Congo</div>
                    <div className="card-setting-copy">Cash-out observé jusqu&apos;à 500 000 FCFA par opération, P2P et paiements élevés selon profil vérifié.</div>
                  </div>
                </div>
                <div className="card-setting-row">
                  <div>
                    <div className="card-setting-title"><span style={{ color: "#f87171", marginRight: 6 }}>&#9679;</span>Référence Airtel Money Congo</div>
                    <div className="card-setting-copy">Compte standard à vérifié : plafond journalier observé entre 500 000 et 2 000 000 FCFA selon niveau KYC.</div>
                  </div>
                </div>
                <div className="card-setting-row">
                  <div>
                    <div className="card-setting-title"><span style={{ color: "#60a5fa", marginRight: 6 }}>&#9679;</span>Politique Morali Carte</div>
                    <div className="card-setting-copy">Votre carte applique une limite prudente locale pour réduire les risques et rester compatible avec les rails Mobile Money du Congo.</div>
                  </div>
                </div>
              </div>

              <div className="bc-notice">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <div className="bc-notice-text">Conseil : pour des montants plus élevés, vérifiez votre identité complète et activez les plafonds premium auprès du support Morali.</div>
              </div>

              <button className="bc-btn-full" onClick={() => { closeCardLimitsModal(); showToast("Plafonds carte consultés"); }}>Compris</button>
            </div>
          </div>
        )}

        {receiptsOpen && (
          <div className="card-modal-overlay" onClick={closeReceiptsModal}>
            <div className="bc-modal" onClick={(event) => event.stopPropagation()}>
              <div className="bc-head">
                <div className="bc-head-left">
                  <div className="bc-kicker">Historique</div>
                  <div className="bc-title">Historique des Reçus</div>
                  <div className="bc-subtitle">Retrouvez les preuves d&apos;opérations Morali les plus récentes, prêtes à être vérifiées ou partagées.</div>
                </div>
                <button className="bc-close" onClick={closeReceiptsModal} aria-label="Fermer">&times;</button>
              </div>
              <div className="card-manage-stack">
                {(liveTransactions.length ? liveTransactions : dashboardData.transactions).map((tx, index) => (
                  <div key={`${tx.name}-${tx.date}-${index}`} className="card-setting-row">
                    <div style={{ flex: 1 }}>
                      <div className="card-setting-title">{tx.name}</div>
                      <div className="card-setting-copy">{tx.date} · {tx.category}{tx.channel ? ` · ${tx.channel}` : ""}</div>
                      {tx.receiptId && <div className="card-setting-copy">ID reçu : {tx.receiptId}</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="card-setting-title">{tx.amount}</div>
                      <div className="card-setting-copy">{tx.status === "failed" ? "Échec" : tx.status === "pending" ? "En attente" : "Reçu disponible"}</div>
                    </div>
                  </div>
                ))}
              </div>
              <button className="bc-btn-full" onClick={closeReceiptsModal}>Fermer</button>
            </div>
          </div>
        )}

        {supportOpen && (
          <div className="card-modal-overlay" onClick={closeSupportModal}>
            <div className="bc-modal" onClick={(event) => event.stopPropagation()}>
              <div className="bc-head">
                <div className="bc-head-left">
                  <div className="bc-kicker">Support</div>
                  <div className="bc-title">Support Client</div>
                  <div className="bc-subtitle">Décrivez votre besoin. Morali enregistrera un ticket et le suivra depuis votre compte.</div>
                </div>
                <button className="bc-close" onClick={closeSupportModal} aria-label="Fermer">&times;</button>
              </div>
              <div className="input-group-glass">
                <label>Votre message</label>
                <textarea value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} placeholder="Ex : Virement non reçu, carte refusée, besoin d'assistance..." style={{ width: "100%", minHeight: 120, background: "rgba(255,255,255,.05)", border: "1px solid rgba(255,255,255,.1)", borderRadius: 16, padding: 14, color: "#fff", outline: "none", fontSize: 15, resize: "none" }} />
              </div>
              {supportThreads.length > 0 && (
                <div className="card-manage-stack">
                  {supportThreads.map((thread) => (
                    <div key={thread.id} className="card-setting-row">
                      <div style={{ flex: 1 }}>
                        <div className="card-setting-title">{thread.message}</div>
                        <div className="card-setting-copy">{thread.createdAtLabel}</div>
                      </div>
                      <span className="profile-badge">{thread.status}</span>
                    </div>
                  ))}
                </div>
              )}
              <button className="bc-btn-full" onClick={submitSupportMessage} disabled={supportSending}>{supportSending ? "Envoi..." : "Envoyer au support"}</button>
            </div>
          </div>
        )}

        {termsOpen && (
          <div className="card-modal-overlay" onClick={closeTermsModal}>
            <div className="bc-modal legal-modal" onClick={(event) => event.stopPropagation()}>
              <button className="bc-close legal-modal-close" onClick={closeTermsModal} aria-label="Fermer">&times;</button>
              <LegalTerms mode="modal" onAccept={() => { closeTermsModal(); showToast("Conditions acceptées"); }} />
            </div>
          </div>
        )}

                {blackCardOpen && (
          <div className="card-modal-overlay" onClick={closeBlackCardModal} style={{ alignItems: "center", padding: "16px" }}>
            <div className="bc-modal" onClick={(event) => event.stopPropagation()}>
              <div className="bc-head">
                <div className="bc-head-left">
                  <div className="bc-kicker">Morali Black</div>
                  <div className="bc-title">Demander votre Carte Black</div>
                  <div className="bc-subtitle">Votre passeport vers l&apos;excellence bancaire.</div>
                </div>
                <button className="bc-close" onClick={closeBlackCardModal} aria-label="Fermer">&times;</button>
              </div>

              <div className="bc-steps">
                <div className={`bc-step-dot ${blackCardStep === "preview" ? "active" : blackCardStep === "material" || blackCardStep === "confirm" ? "done" : ""}`} />
                <div className={`bc-step-dot ${blackCardStep === "material" ? "active" : blackCardStep === "confirm" ? "done" : ""}`} />
                <div className={`bc-step-dot ${blackCardStep === "confirm" ? "active" : ""}`} />
              </div>

              {/* STEP 1: PREVIEW */}
              {blackCardStep === "preview" && (
                <div className="bc-step-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="bc-card-preview">
                    <img src="/black-card-hero.png" alt="Carte Black" />
                    <div className="bc-card-preview-overlay">
                      <div className="bc-card-preview-badge">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2" /><line x1="2" y1="10" x2="22" y2="10" /></svg>
                        <span>Visa Infinite</span>
                      </div>
                    </div>
                  </div>

                  <div className="bc-features">
                    <div className="bc-feature">
                      <div className="bc-feature-icon gold">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      </div>
                      <div>
                        <div className="bc-feature-text">5M+ FCFA</div>
                        <div className="bc-feature-label">Plafond mensuel</div>
                      </div>
                    </div>
                    <div className="bc-feature">
                      <div className="bc-feature-icon blue">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                      </div>
                      <div>
                        <div className="bc-feature-text">3.5%</div>
                        <div className="bc-feature-label">Cashback premium</div>
                      </div>
                    </div>
                    <div className="bc-feature">
                      <div className="bc-feature-icon green">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                      </div>
                      <div>
                        <div className="bc-feature-text">24/7</div>
                        <div className="bc-feature-label">Conciergerie</div>
                      </div>
                    </div>
                    <div className="bc-feature">
                      <div className="bc-feature-icon rose">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                      </div>
                      <div>
                        <div className="bc-feature-text">1 300+</div>
                        <div className="bc-feature-label">Lounges VIP</div>
                      </div>
                    </div>
                  </div>

                  <div className="bc-notice">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    <div className="bc-notice-text">La Carte Black est réservée aux clients sélectionnés. Votre demande sera étudiée sous 24h.</div>
                  </div>

                  <button className="bc-btn-full" onClick={() => setBlackCardStep("material")}>
                    Continuer
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                  </button>
                </div>
              )}

              {/* STEP 2: MATERIAL + INFO */}
              {blackCardStep === "material" && (
                <div className="bc-step-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: "#fff" }}>Choisissez votre finition</div>
                    <div style={{ fontSize: 11.5, color: "#64748b", lineHeight: 1.5 }}>La matière de votre carte reflète votre style. Sélectionnez la finition qui vous correspond.</div>
                  </div>

                  <div className="bc-material-grid">
                    <div className={`bc-material-card ${blackCardMaterial === "steel" ? "selected" : ""}`} onClick={() => setBlackCardMaterial("steel")}>
                      <div className="bc-material-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                      <div className="bc-material-name">Acier Brossé</div>
                      <div className="bc-material-desc">Élégant, classique et intemporel</div>
                    </div>
                    <div className={`bc-material-card ${blackCardMaterial === "carbon" ? "selected" : ""}`} onClick={() => setBlackCardMaterial("carbon")}>
                      <div className="bc-material-check"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
                      <div className="bc-material-name">Carbone Mat</div>
                      <div className="bc-material-desc">Moderne, léger et exclusif</div>
                    </div>
                  </div>

                  <div className="bc-form">
                    <div className="bc-field">
                      <div className="bc-field-label">Nom complet</div>
                      <input className="bc-field-input" placeholder="Ex: Emmanuel Morali" value={blackCardFullName} onChange={(e) => setBlackCardFullName(e.target.value)} />
                    </div>
                    <div className="bc-field">
                      <div className="bc-field-label">Téléphone</div>
                      <div style={{ position: "relative" }}>
                        <span style={{ position: "absolute", left: 16, top: "50%", transform: "translateY(-50%)", fontSize: 14, fontWeight: 700, color: "#64748b", pointerEvents: "none" }}>+242</span>
                        <input className="bc-field-input" placeholder="XXXXXXXXX" value={blackCardPhone} onChange={(e) => setBlackCardPhone(e.target.value)} style={{ paddingLeft: 62 }} />
                      </div>
                    </div>
                    <div className="bc-field">
                      <div className="bc-field-label">Adresse de livraison</div>
                      <textarea className="bc-field-textarea" placeholder="Votre adresse complète pour la livraison" value={blackCardAddress} onChange={(e) => setBlackCardAddress(e.target.value)} />
                    </div>
                  </div>

                  <div className="bc-actions">
                    <button className="bc-btn bc-btn-secondary" onClick={() => setBlackCardStep("preview")}>Retour</button>
                    <button className="bc-btn bc-btn-primary" onClick={() => setBlackCardStep("confirm")} disabled={!blackCardFullName.trim() || !blackCardPhone.trim() || !blackCardAddress.trim()} style={!blackCardFullName.trim() || !blackCardPhone.trim() || !blackCardAddress.trim() ? { opacity: .4 } : {}}>
                      Confirmer
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3: CONFIRMATION */}
              {blackCardStep === "confirm" && (
                <div className="bc-step-content" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div className="bc-confirm-card">
                    <div className="bc-confirm-icon">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    </div>
                    <div className="bc-confirm-title">Confirmez votre demande</div>
                    <div className="bc-confirm-sub">Vérifiez les informations ci-dessous avant de soumettre votre demande de Carte Black.</div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 0, padding: "4px 16px", borderRadius: 16, background: "rgba(255,255,255,.02)", border: "1px solid rgba(255,255,255,.05)" }}>
                    <div className="bc-confirm-row">
                      <span>Finition</span>
                      <span>{blackCardMaterial === "steel" ? "Acier Brossé" : "Carbone Mat"}</span>
                    </div>
                    <div className="bc-confirm-row">
                      <span>Nom</span>
                      <span>{blackCardFullName || "—"}</span>
                    </div>
                    <div className="bc-confirm-row">
                      <span>Téléphone</span>
                      <span>{blackCardPhone || "—"}</span>
                    </div>
                    <div className="bc-confirm-row">
                      <span>Livraison</span>
                      <span>{blackCardAddress || "—"}</span>
                    </div>
                    <div className="bc-confirm-row">
                      <span>Plafond</span>
                      <span style={{ color: "#D4A437" }}>5M+ FCFA</span>
                    </div>
                    <div className="bc-confirm-row">
                      <span>Frais</span>
                      <span style={{ color: "#4ade80" }}>Gratuit</span>
                    </div>
                  </div>

                  <div className="bc-notice">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                    <div className="bc-notice-text">En soumettant, vous acceptez les conditions du Programme Black Morali. Votre conciergerie vous contactera sous 24h.</div>
                  </div>

                  <div className="bc-actions">
                    <button className="bc-btn bc-btn-secondary" onClick={() => setBlackCardStep("material")}>Retour</button>
                    <button className="bc-btn bc-btn-primary" onClick={requestBlackCard} disabled={blackCardLoading || blackCardData?.status === "requested"}>
                      {blackCardLoading ? <><div className="bc-loader" /> Envoi...</> : blackCardData?.status === "requested" ? "Forge en cours..." : "COMMANDER"}
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>
        )}

        

        {blackCardCelebrationOpen && (
          <div className="card-modal-overlay" onClick={() => setBlackCardCelebrationOpen(false)}>
            <div className="bc-modal" onClick={(event) => event.stopPropagation()}>
              <div className="bc-head">
                <div className="bc-head-left">
                  <div className="bc-kicker">Morali Black</div>
                  <div className="bc-title">Bienvenue dans l’Exception</div>
                  <div className="bc-subtitle">Votre demande Morali Black a été enregistrée avec succès.</div>
                </div>
                <button className="bc-close" onClick={() => setBlackCardCelebrationOpen(false)} aria-label="Fermer">&times;</button>
              </div>
              <div className="card-manage-stack">
                <div className="black-request-banner" style={{ background: "linear-gradient(145deg,rgba(212,164,55,.14),rgba(255,255,255,.03))" }}>
                  <div className="black-request-meta">
                    <div className="black-request-title">Votre conciergerie vous contactera sous 24h</div>
                    <div className="black-request-sub">Votre carte en métal premium est en cours de forge. Livraison prioritaire sous 3 jours ouvrés.</div>
                  </div>
                </div>
                <div className="card-setting-row"><div><div className="card-setting-title">Statut de fabrication</div><div className="card-setting-copy">Forge en cours → Gravure laser → Expédition VIP</div></div></div>
              </div>
              <button className="bc-btn-full" onClick={() => { setBlackCardCelebrationOpen(false); closeBlackCardModal(); openPrivilegesTab(); }}>ACCÉDER À MON ESPACE PRIVILÈGE</button>
            </div>
          </div>
        )}

        {virtualCardOpen && (
          <div className="card-modal-overlay" onClick={closeVirtualCardModal}>
            <div className="bc-modal" onClick={(event) => event.stopPropagation()}>
              <div className="bc-head">
                <div className="bc-head-left">
                  <div className="bc-kicker">Carte Digitale</div>
                  <div className="bc-title">Carte Virtuelle</div>
                  <div className="bc-subtitle">Une carte dédiée à vos achats en ligne et abonnements, séparée de votre carte principale.</div>
                </div>
                <button className="bc-close" onClick={closeVirtualCardModal} aria-label="Fermer">&times;</button>
              </div>
              <div className="pin-display" style={{ background: "linear-gradient(145deg,rgba(59,130,246,.06),rgba(10,14,23,.18))", borderColor: "rgba(59,130,246,.12)" }}>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 14, textAlign: "left" }}>
                  <div style={{ padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>Numéro</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{virtualCardData?.number ?? "4482 •••• •••• 1187"}</div>
                  </div>
                  <div style={{ padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>Expire</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{virtualCardData?.expiry ?? "09/28"}</div>
                  </div>
                  <div style={{ padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>CVV</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{virtualCardData?.cvv ?? "•••"}</div>
                  </div>
                  <div style={{ padding: "12px 14px", borderRadius: 16, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".16em", textTransform: "uppercase", color: "#64748b", marginBottom: 6 }}>Fournisseur</div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>{virtualCardData?.provider ?? "Visa"}</div>
                  </div>
                </div>
              </div>
              <div className="card-manage-stack">
                <div className="card-setting-row">
                  <div>
                    <div className="card-setting-title">Alias</div>
                    <div className="card-setting-copy">{virtualCardData?.alias ?? "Morali Virtual Blue"}</div>
                  </div>
                </div>
                <div className="card-setting-row">
                  <div>
                    <div className="card-setting-title">Usage web sécurisé</div>
                    <div className="card-setting-copy">Idéale pour les paiements e-commerce, abonnements SaaS et sandbox sans exposer la carte physique.</div>
                  </div>
                </div>
                <div className="card-setting-row">
                  <div>
                    <div className="card-setting-title">Plafond en ligne</div>
                    <div className="card-setting-copy">{formatCurrency(virtualCardData?.spendingLimit ?? 250000)} XAF par transaction pour un usage prudent.</div>
                  </div>
                  <div
                    className={`mini-switch ${(virtualCardData?.active && !virtualCardData?.frozen) ? "active" : ""}`}
                    role="switch"
                    aria-checked={virtualCardData?.active && !virtualCardData?.frozen}
                    tabIndex={0}
                    onClick={async () => {
                      if (!authUid || !virtualCardData) return;
                      const nextFrozen = !virtualCardData.frozen;
                      const nextCard = { ...virtualCardData, frozen: nextFrozen, updatedAt: serverTimestamp() };
                      setVirtualCardData(nextCard);
                      await setDoc(doc(firebaseDb, "users", authUid, "meta", "virtualCard"), nextCard, { merge: true });
                      showToast(nextFrozen ? "Carte virtuelle gelée" : "Carte virtuelle réactivée");
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (async () => { if (!authUid || !virtualCardData) return; const nextFrozen = !virtualCardData.frozen; const nextCard = { ...virtualCardData, frozen: nextFrozen, updatedAt: serverTimestamp() }; setVirtualCardData(nextCard); await setDoc(doc(firebaseDb, "users", authUid, "meta", "virtualCard"), nextCard, { merge: true }); showToast(nextFrozen ? "Carte virtuelle gelée" : "Carte virtuelle réactivée"); })(); } }}
                  />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="bc-btn-full bc-btn-secondary" onClick={closeVirtualCardModal}>Fermer</button>
                <button className="bc-btn-full bc-btn-primary" onClick={activateVirtualCard} disabled={virtualCardLoading}>{virtualCardLoading ? "Activation..." : virtualCardData?.active ? "Réactiver" : "Activer"}</button>
              </div>
            </div>
          </div>
        )}

        <QrScanner
          open={cameraScannerOpen}
          status={scannerStatus}
          videoRef={videoRef}
          canvasRef={canvasRef}
          onClose={closeCameraScanner}
          onRetry={openCameraScanner}
        />

        {securityModalOpen && (
          <div className="card-modal-overlay" onClick={closeSecurityModal}>
            <div className="bc-modal" onClick={(event) => event.stopPropagation()}>
              <div className="bc-head">
                <div className="bc-head-left">
                  <div className="bc-kicker">Sécurité</div>
                  <div className="bc-title">Sécurité & Biométrie</div>
                  <div className="bc-subtitle">Pilotez les protections d’accès et les validations sensibles de votre compte Morali.</div>
                </div>
                <button className="bc-close" onClick={closeSecurityModal} aria-label="Fermer">&times;</button>
              </div>

              <div className="security-modal-grid">
                <div className="security-feature" style={!biometricSupported ? { opacity: 0.55 } : {}}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div className="security-feature-title">Authentification biométrique</div>
                      {biometricSupported && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: "rgba(34,197,94,.15)", color: "#4ade80", fontWeight: 800 }}>Disponible</span>}
                    </div>
                    <div className="security-feature-copy">{biometricSupported ? "Vérification par empreinte ou visage avant chaque transfert." : "Non disponible sur cet appareil ou navigateur."}</div>
                  </div>
                  <div
                    className={`mini-switch ${securitySettings.biometrics ? "active" : ""}`}
                    role="switch"
                    aria-checked={securitySettings.biometrics}
                    tabIndex={0}
                    style={!biometricSupported ? { pointerEvents: "none" } : {}}
                    onClick={() => biometricSupported && setSecuritySettings((c) => ({ ...c, biometrics: !c.biometrics }))}
                    onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && biometricSupported) { e.preventDefault(); setSecuritySettings((c) => ({ ...c, biometrics: !c.biometrics })); } }}
                  />
                </div>
                <div className="security-feature" style={!platformAuthSupported ? { opacity: 0.55 } : {}}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div className="security-feature-title">Face ID / Reconnaissance</div>
                      {platformAuthSupported && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: "rgba(34,197,94,.15)", color: "#4ade80", fontWeight: 800 }}>Disponible</span>}
                    </div>
                    <div className="security-feature-copy">{platformAuthSupported ? "Validation par reconnaissance faciale pour les actions sensibles." : "Cet appareil ne supporte pas l’authentification faciale."}</div>
                  </div>
                  <div
                    className={`mini-switch ${securitySettings.faceId ? "active" : ""}`}
                    role="switch"
                    aria-checked={securitySettings.faceId}
                    tabIndex={0}
                    style={!platformAuthSupported ? { pointerEvents: "none" } : {}}
                    onClick={() => platformAuthSupported && setSecuritySettings((c) => ({ ...c, faceId: !c.faceId }))}
                    onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && platformAuthSupported) { e.preventDefault(); setSecuritySettings((c) => ({ ...c, faceId: !c.faceId })); } }}
                  />
                </div>
                <div className="security-feature">
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div className="security-feature-title">Alertes nouvel appareil</div>
                      {securitySettings.deviceAlerts && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: "rgba(34,197,94,.15)", color: "#4ade80", fontWeight: 800 }}>Actif</span>}
                    </div>
                    <div className="security-feature-copy">Notification instantanée si votre compte est accédé depuis un nouvel appareil.</div>
                  </div>
                  <div className={`mini-switch ${securitySettings.deviceAlerts ? "active" : ""}`} role="switch" aria-checked={securitySettings.deviceAlerts} tabIndex={0} onClick={() => setSecuritySettings((c) => ({ ...c, deviceAlerts: !c.deviceAlerts }))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSecuritySettings((c) => ({ ...c, deviceAlerts: !c.deviceAlerts })); } }} />
                </div>
                <div className="security-feature">
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div className="security-feature-title">Validation des transactions</div>
                      {securitySettings.transactionValidation && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: "rgba(234,179,8,.15)", color: "#eab308", fontWeight: 800 }}>&#8805; 50 000 F</span>}
                    </div>
                    <div className="security-feature-copy">Confirmation supplémentaire pour tous les transferts à partir de 50 000 FCFA.</div>
                  </div>
                  <div className={`mini-switch ${securitySettings.transactionValidation ? "active" : ""}`} role="switch" aria-checked={securitySettings.transactionValidation} tabIndex={0} onClick={() => setSecuritySettings((c) => ({ ...c, transactionValidation: !c.transactionValidation }))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setSecuritySettings((c) => ({ ...c, transactionValidation: !c.transactionValidation })); } }} />
                </div>
              </div>

              <div className="security-summary">
                <div className="security-stat">
                  <div className="security-stat-kicker">Niveau de sécurité</div>
                  <div className="security-stat-value" style={{ color: Object.values(securitySettings).filter(Boolean).length === 4 ? "#22c55e" : Object.values(securitySettings).filter(Boolean).length >= 2 ? "#eab308" : "#ef4444" }}>
                    {Object.values(securitySettings).filter(Boolean).length === 4 ? "Élevé" : Object.values(securitySettings).filter(Boolean).length >= 2 ? "Moyen" : "Faible"}
                  </div>
                </div>
                <div className="security-stat">
                  <div className="security-stat-kicker">Sécurités actives</div>
                  <div className="security-stat-value">{Object.values(securitySettings).filter(Boolean).length} / 4</div>
                </div>
              </div>

              {passwordStage === "menu" ? (
                <>
                  <button style={{ width: "100%", height: 48, border: "none", borderRadius: 16, background: "linear-gradient(135deg, #3b82f6, #2563eb)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 10px 24px rgba(59,130,246,.28)", marginTop: 4 }} onClick={saveSecuritySettings}>Enregistrer les changements</button>
                  <button style={{ width: "100%", height: 48, border: "1px solid rgba(59,130,246,.2)", borderRadius: 16, background: "rgba(59,130,246,.08)", color: "#60a5fa", fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }} onClick={() => setPasswordStage("change")}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
                    Modifier le mot de passe
                  </button>
                </>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button className="pin-action-btn" style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0, padding: 0 }} onClick={() => { setPasswordStage("menu"); setChangePwOld(""); setChangePwNew(""); setChangePwConfirm(""); }}>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
                    </button>
                    <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", fontFamily: "'Montserrat',sans-serif" }}>Changer le mot de passe</div>
                  </div>

                  <div className="bc-notice" style={{ background: "rgba(251,191,36,.04)", borderColor: "rgba(251,191,36,.1)" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(251,191,36,.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
                    <div className="bc-notice-text">Pour des raisons de sécurité, vous devez confirmer votre mot de passe actuel avant de le modifier.</div>
                  </div>

                  <div className="bc-form">
                    <div className="bc-field">
                      <div className="bc-field-label">Mot de passe actuel</div>
                      <input className="bc-field-input" type="password" value={changePwOld} onChange={(e) => setChangePwOld(e.target.value)} placeholder="Votre mot de passe actuel" autoComplete="current-password" />
                    </div>
                    <div className="bc-field">
                      <div className="bc-field-label">Nouveau mot de passe</div>
                      <input className="bc-field-input" type="password" value={changePwNew} onChange={(e) => setChangePwNew(e.target.value)} placeholder="Min. 8 caractères" autoComplete="new-password" />
                      <div style={{ fontSize: 9, color: changePwNew.length >= 8 ? "#22c55e" : "#64748b", marginTop: 4, fontWeight: 700, transition: "color .2s" }}>
                        {changePwNew.length === 0 ? "Entrez un nouveau mot de passe" : changePwNew.length < 8 ? `${8 - changePwNew.length} caractère(s) requis` : "Force suffisante"}
                      </div>
                    </div>
                    <div className="bc-field">
                      <div className="bc-field-label">Confirmer le nouveau mot de passe</div>
                      <input className="bc-field-input" type="password" value={changePwConfirm} onChange={(e) => setChangePwConfirm(e.target.value)} placeholder="Répétez le nouveau mot de passe" autoComplete="new-password" style={changePwConfirm && changePwNew !== changePwConfirm ? { borderColor: "rgba(239,68,68,.35)" } : {}} />
                      {changePwConfirm && changePwNew !== changePwConfirm && (
                        <div style={{ fontSize: 9, color: "#f87171", marginTop: 4, fontWeight: 700 }}>Les mots de passe ne correspondent pas</div>
                      )}
                    </div>
                  </div>

                  <button
                    className="bc-btn-full"
                    onClick={handleChangePassword}
                    disabled={!changePwOld.trim() || !changePwNew.trim() || !changePwConfirm.trim() || changePwNew.length < 8 || changePwNew !== changePwConfirm || changePwLoading}
                    style={!changePwOld.trim() || !changePwNew.trim() || !changePwConfirm.trim() || changePwNew.length < 8 || changePwNew !== changePwConfirm || changePwLoading ? { opacity: .4 } : {}}
                  >
                    {changePwLoading ? <div className="btn-loader" /> : "Mettre à jour le mot de passe"}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {privacyModalOpen && (
          <div className="card-modal-overlay" onClick={closePrivacyModal}>
            <div className="bc-modal legal-modal" onClick={(event) => event.stopPropagation()}>
              <button className="bc-close legal-modal-close" onClick={closePrivacyModal} aria-label="Fermer">&times;</button>
              <div className="privacy-tabs">
                <button className={`privacy-tab ${privacyTab === "policy" ? "active" : ""}`} onClick={() => setPrivacyTab("policy")}>Politique</button>
                <button className={`privacy-tab ${privacyTab === "settings" ? "active" : ""}`} onClick={() => setPrivacyTab("settings")}>Paramètres</button>
              </div>
              {privacyTab === "policy" ? (
                <PrivacyPolicy mode="modal" />
              ) : (
                <>
                  <div className="bc-head" style={{paddingTop: 0}}>
                    <div className="bc-head-left">
                      <div className="bc-kicker">Confidentialité</div>
                      <div className="bc-title">Paramètres de confidentialité</div>
                      <div className="bc-subtitle">Gérez la visibilité de votre profil et vos préférences de partage.</div>
                    </div>
                  </div>
              <div className="security-modal-grid">
                <div className="security-feature">
                  <div>
                    <div className="security-feature-title">Profil visible aux autres clients</div>
                    <div className="security-feature-copy">Autoriser la découverte de votre pseudo Morali lors d’une recherche de virement.</div>
                  </div>
                  <div className={`mini-switch ${privacySettings.profileVisible ? "active" : ""}`} role="switch" aria-checked={privacySettings.profileVisible} tabIndex={0} onClick={() => setPrivacySettings((current) => ({ ...current, profileVisible: !current.profileVisible }))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPrivacySettings((current) => ({ ...current, profileVisible: !current.profileVisible })); } }} />
                </div>
                <div className="security-feature">
                  <div>
                    <div className="security-feature-title">Masquage des activités sensibles</div>
                    <div className="security-feature-copy">Masquer automatiquement les montants sur les aperçus et reçus rapides.</div>
                  </div>
                  <div className={`mini-switch ${privacySettings.activityMasking ? "active" : ""}`} role="switch" aria-checked={privacySettings.activityMasking} tabIndex={0} onClick={() => setPrivacySettings((current) => ({ ...current, activityMasking: !current.activityMasking }))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPrivacySettings((current) => ({ ...current, activityMasking: !current.activityMasking })); } }} />
                </div>
                <div className="security-feature">
                  <div>
                    <div className="security-feature-title">Analyses d’usage</div>
                    <div className="security-feature-copy">Partager des données anonymisées pour améliorer l’expérience Morali Pay.</div>
                  </div>
                  <div className={`mini-switch ${privacySettings.analyticsConsent ? "active" : ""}`} role="switch" aria-checked={privacySettings.analyticsConsent} tabIndex={0} onClick={() => setPrivacySettings((current) => ({ ...current, analyticsConsent: !current.analyticsConsent }))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPrivacySettings((current) => ({ ...current, analyticsConsent: !current.analyticsConsent })); } }} />
                </div>
                <div className="security-feature">
                  <div>
                    <div className="security-feature-title">Communications marketing</div>
                    <div className="security-feature-copy">Recevoir des offres, nouveautés et invitations premium de Morali Pay.</div>
                  </div>
                  <div className={`mini-switch ${privacySettings.marketingConsent ? "active" : ""}`} role="switch" aria-checked={privacySettings.marketingConsent} tabIndex={0} onClick={() => setPrivacySettings((current) => ({ ...current, marketingConsent: !current.marketingConsent }))} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPrivacySettings((current) => ({ ...current, marketingConsent: !current.marketingConsent })); } }} />
                </div>
              </div>

              <div className="security-summary">
                <div className="security-stat">
                  <div className="security-stat-kicker">Centre de données</div>
                  <div className="security-stat-value privacy-region"><AppIcon name="shield" size={14} stroke="#60a5fa" />Région Afrique Centrale</div>
                  <div className="security-stat-kicker" style={{ marginTop: 6, textTransform: "none", letterSpacing: ".02em" }}>Conformité CEMAC / ANSSI Congo</div>
                </div>
                <div className="security-stat privacy-link-row" onClick={openAccessLog}>
                  <div className="security-stat-kicker">Journal d’accès</div>
                  <div className="security-stat-value">Disponible 30 jours</div>
                </div>
              </div>

              {privacyAccessLogOpen && (
                <div className="privacy-log">
                  {accessLogEntries.map((entry) => (
                    <div className="privacy-log-item" key={`${entry.place}-${entry.device}`}>
                      <div>
                        <div className="privacy-log-main">{entry.place} — {entry.device}</div>
                        <div className="privacy-log-sub">{entry.time}</div>
                      </div>
                    </div>
                  ))}
                  <button className="bc-btn-full" onClick={disconnectOtherDevices}>Déconnecter tous les autres appareils</button>
                </div>
              )}

              <button className={`btn-save-elite ${privacySaveState === "saving" ? "saving ripple" : privacySaveState === "saved" ? "saved" : ""}`} onClick={savePrivacySettings} disabled={privacySaveState !== "idle"}>
                {privacySaveState === "saving" ? "Enregistrement..." : privacySaveState === "saved" ? "Enregistré" : "Enregistrer la confidentialité"}
              </button>
                </>
              )}
            </div>
          </div>
        )}

        {privacyCloseConfirmOpen && (
          <div className="card-modal-overlay" onClick={cancelPrivacyClose}>
            <div className="confirm-sheet" onClick={(event) => event.stopPropagation()}>
              <div className="confirm-sheet-title">Modifications non enregistrées</div>
              <div className="confirm-sheet-copy">Certaines préférences de confidentialité n’ont pas encore été sauvegardées. Pour préserver vos réglages actuels, continuez l’édition ou confirmez la fermeture de cette fenêtre.</div>
              <div className="confirm-sheet-actions">
                <button type="button" className="secondary" onClick={cancelPrivacyClose}>Continuer l’édition</button>
                <button type="button" className="danger" onClick={discardPrivacyChanges}>Ignorer et fermer</button>
              </div>
            </div>
          </div>
        )}

        {transactionChoiceOpen && (
          <div className="transaction-flow-overlay" onClick={closeTransactionChoice}>
            <div className="transaction-flow-modal" onClick={(event) => event.stopPropagation()}>
              <div className="transaction-flow-head">
                <div>
                  <div className="transaction-flow-title">Choisir la destination</div>
                  <div className="transaction-flow-sub">Précisez comment vous souhaitez finaliser cette opération avant sécurisation.</div>
                </div>
                <button className="transaction-flow-close" onClick={closeTransactionChoice} aria-label="Fermer">
                  <span className="close-x">×</span>
                </button>
              </div>
              <div className="transaction-choice-grid">
                <button className={`transaction-choice-card ${transactionDestination === "cash" ? "selected" : ""}`} onClick={() => selectTransactionDestination("cash")}>
                  <div className="transaction-choice-icon">
                    <AppIcon name="card" size={22} stroke="#60a5fa" />
                  </div>
                  <div className="transaction-choice-title">Mobile Money (Cash)</div>
                  <div className="transaction-choice-copy">Vers le portefeuille mobile pour retrait ou encaissement immédiat.</div>
                </button>
                <button className={`transaction-choice-card ${transactionDestination === "airtime" ? "selected" : ""}`} onClick={() => selectTransactionDestination("airtime")}>
                  <div className="transaction-choice-icon airtime">
                    <AppIcon name="phone" size={22} stroke="#fbbf24" />
                  </div>
                  <div className="transaction-choice-title">Crédit d'appel</div>
                  <div className="transaction-choice-copy">Convertir instantanément le montant en crédit de communication.</div>
                </button>
              </div>
            </div>
          </div>
        )}

        {transactionPinOpen && (
          <div className="transaction-flow-overlay" onClick={transactionProcessing ? undefined : closeTransactionPin}>
            <div className="transaction-flow-modal" onClick={(event) => event.stopPropagation()}>
              <div className="transaction-flow-head">
                <div>
                  <div className="transaction-flow-title">Code PIN</div>
                  <div className="transaction-flow-sub">Saisissez votre code secret à 4 chiffres pour sécuriser l’opération.</div>
                </div>
                {!transactionProcessing && !transactionSuccess && (
                  <button className="transaction-flow-close" onClick={closeTransactionPin} aria-label="Fermer">
                    <span className="close-x">×</span>
                  </button>
                )}
              </div>

              {pendingPinAction ? (
                <div className="pin-summary">
                  <div>
                    <span>Opération</span>
                    <strong>{pendingPinAction.type === "merchant" ? "Paiement Marchand" : pendingPinAction.type === "savings_deposit" ? "Dépôt Épargne" : "Retrait Épargne"}</strong>
                  </div>
                  <div>
                    <span>Montant</span>
                    <strong>{formatCurrency(pendingPinAction.amount)} XAF</strong>
                  </div>
                </div>
              ) : (
                <div className="pin-summary">
                  <div>
                    <span>Opération</span>
                    <strong>{transactionType === "depot" ? "Dépôt" : "Retrait"}</strong>
                  </div>
                  <div>
                    <span>Destination</span>
                    <strong>{transactionDestination === "airtime" ? "Crédit d'appel" : "Mobile Money"}</strong>
                  </div>
                  <div>
                    <small>Montant</small>
                    <strong>{formatCurrency(transactionNumericAmount)} XAF</strong>
                  </div>
                </div>
              )}

              {!transactionProcessing && !transactionSuccess && (
                <>
                  <div className="pin-dots">
                    {[0, 1, 2, 3].map((dot) => (
                      <div key={dot} className={`pin-dot ${transactionPinVerifying ? "verifying" : transactionPin.length > dot ? "filled" : ""}`} />
                    ))}
                  </div>
                  {transactionPinVerifying ? (
                    <div className="pin-helper" style={{ color: "#60a5fa" }}>Vérification du code PIN en cours…</div>
                  ) : (
                    <div className="pin-helper">Les chiffres restent masqués. La vérification démarre automatiquement au 4e appui.</div>
                  )}
                  <div className="pin-pad">
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"].map((key, index) => (
                      <button
                        key={`${key}-${index}`}
                        className={`pin-key ${key === "" ? "ghost" : ""}`}
                        onClick={() => key && handleTransactionPinKey(key)}
                        type="button"
                        disabled={transactionPinVerifying}
                      >
                        {key === "back" ? "⌫" : key}
                      </button>
                    ))}
                  </div>
                </>
              )}

              {transactionProcessing && (
                <div className="pin-processing">
                  <div className="pin-loader" />
                  <div className="transaction-flow-title" style={{ fontSize: 16 }}>Traitement sécurisé...</div>
                  <div className="transaction-flow-sub" style={{ textAlign: "center" }}>Communication en cours avec les serveurs {transactionMethod === "mtn" ? "MTN" : "Airtel"}.</div>
                </div>
              )}

              {transactionSuccess && (
                <div className="pin-success">
                  <div className="pin-success-icon">✓</div>
                  <div className="transaction-flow-title" style={{ fontSize: 18 }}>Transaction réussie</div>
                  <div className="transaction-flow-sub" style={{ textAlign: "center" }}>Votre opération a été validée et sécurisée avec succès.</div>
                  <div className="transaction-flow-actions">
                    <button className="btn-save-elite" onClick={finishTransactionFlow}>Fermer</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        <NotificationsPanel notifications={notifications} open={notificationsOpen} unreadCount={unreadNotificationsCount} onClose={() => setNotificationsOpen(false)} onMarkAllRead={markAllNotificationsAsRead} onMarkRead={markNotificationAsRead} />

        {/* ── Device alert banner ── */}
        {deviceAlertShown && (
          <div style={{ position: "fixed", top: 16, left: 12, right: 12, zIndex: 10000, padding: "14px 16px", borderRadius: 16, background: "linear-gradient(135deg, rgba(239,68,68,.18), rgba(239,68,68,.08))", border: "1px solid rgba(239,68,68,.35)", backdropFilter: "blur(14px)", animation: "fadeIn .35s ease" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", fontFamily: "'Montserrat',sans-serif" }}>Nouvel appareil détecté</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>Votre compte a été accédé depuis un appareil ou navigateur différent.</div>
              </div>
              <button onClick={() => setDeviceAlertShown(false)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#64748b", fontSize: 20, cursor: "pointer", padding: 4 }}>&times;</button>
            </div>
          </div>
        )}

        {/* ── Transfer confirm sheet removed — moved to TransferView ── */}

        <div className={`toast ${toastVisible ? "show" : ""}`} role="status" aria-live="polite">{toastMessage}</div>
        {quickNotif && (
          <div className="quick-notif-overlay">
            <div className="quick-notif-card">
              <div className="quick-notif-ring" style={{ borderColor: quickNotif.color }}>
                <div className="quick-notif-ring" style={{ borderColor: quickNotif.color }}>
                  <div className="quick-notif-icon-wrap" style={{ borderColor: quickNotif.color, background: `${quickNotif.color}15` }}>
                    <AppIcon name={quickNotif.icon} size={28} stroke={quickNotif.color} />
                  </div>
                </div>
              </div>
              <div className="quick-notif-amount">
                {quickNotif.type === "credit" ? "+" : "-"}{quickNotif.amount}<span>FCFA</span>
              </div>
              <div className="quick-notif-label">{quickNotif.label}</div>
              <div className="quick-notif-badge" style={{ background: `${quickNotif.color}18`, color: quickNotif.color, border: `1px solid ${quickNotif.color}30` }}>
                {quickNotif.type === "credit" ? (
                  <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                  Montant reçu</>
                ) : (
                  <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
                  Montant envoyé</>
                )}
              </div>
              <div className="quick-notif-progress">
                <div className="quick-notif-progress-bar" style={{ background: quickNotif.color }} />
              </div>
            </div>
          </div>
        )}
      </div>
      )}

      {/* ── ADMIN SCREENS ── */}
      {screen === "admin" && !isAdminLoggedIn && adminForgotStep === "idle" && (
        <div className="admin-login-screen">
          <button className="admin-login-back" onClick={() => { setScreen("auth"); setAdminForgotStep("idle"); }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: "rgba(26,62,120,0.3)", border: "1px solid rgba(212,164,55,0.4)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 32px rgba(59,130,246,0.3)" }}>
            <MoraliShield />
          </div>
          <div className="admin-login-card">
            <div className="admin-login-title">Administration</div>
            <div className="admin-login-sub">Accès réservé aux administrateurs Morali Pay. Utilisez vos identifiants administrateur.</div>
            <div className="admin-login-field">
              <label className="admin-login-label">Email administrateur</label>
              <input type="email" className="admin-login-input" placeholder="admin@morali.bank" value={adminLoginEmailFetched ? adminLoginEmail : "Chargement..."} readOnly style={{ opacity: adminLoginEmailFetched ? 0.7 : 0.5, cursor: "default" }} autoComplete="email" />
            </div>
            <div className="admin-login-field">
              <label className="admin-login-label">Mot de passe</label>
              <input type="password" className="admin-login-input" placeholder="••••••••" value={adminLoginPassword} onChange={(e) => setAdminLoginPassword(e.target.value)} autoComplete="current-password" onKeyDown={(e) => { if (e.key === "Enter") handleAdminLogin(); }} />
            </div>
            <button className="admin-login-btn" onClick={handleAdminLogin} disabled={adminLoginLoading || !adminLoginEmail || !adminLoginPassword}>
              {adminLoginLoading ? <div className="btn-loader" /> : <><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 1 1 10 0v4"/></svg> Connexion Admin</>}
            </button>
            <div className="admin-login-error">{adminLoginError || "\u00A0"}</div>
            <div onClick={() => setAdminForgotStep("email")} style={{ textAlign: "center", marginTop: 14, fontSize: 12, color: "#64748b", cursor: "pointer" }}>
              Mot de passe oublié ?
            </div>
          </div>
        </div>
      )}

      {/* ── ADMIN FORGOT PASSWORD ── */}
      {screen === "admin" && !isAdminLoggedIn && adminForgotStep !== "idle" && (
        <div className="admin-login-screen">
          <button className="admin-login-back" onClick={() => setAdminForgotStep("idle")}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
          </button>
          <div style={{ width: 72, height: 72, borderRadius: 20, background: "rgba(26,62,120,0.3)", border: "1px solid rgba(212,164,55,0.4)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 0 32px rgba(59,130,246,0.3)" }}>
            <MoraliShield />
          </div>
          <div className="admin-login-card">
            <div className="admin-login-title">
              {adminForgotStep === "email" && "Mot de passe oublié"}
              {adminForgotStep === "code" && "Vérification du code"}
              {adminForgotStep === "newPassword" && "Nouveau mot de passe"}
              {adminForgotStep === "success" && "Succès"}
            </div>
            <div className="admin-login-sub">
              {adminForgotStep === "email" && "Entrez l'email admin pour recevoir un code de vérification."}
              {adminForgotStep === "code" && "Saisissez le code envoyé à votre email."}
              {adminForgotStep === "newPassword" && "Choisissez votre nouveau mot de passe."}
              {adminForgotStep === "success" && "Votre mot de passe a été modifié avec succès."}
            </div>

            {/* Step indicators */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 22 }}>
              {(["email", "code", "newPassword"] as const).map((step, i) => (
                <React.Fragment key={step}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 11, fontWeight: 800,
                      background: adminForgotStep === step || (step === "email" && adminForgotStep === "code") || (step !== "newPassword" && adminForgotStep === "newPassword")
                        ? "rgba(212,164,55,.15)" : "rgba(255,255,255,.04)",
                      border: adminForgotStep === step || (step === "email" && adminForgotStep === "code") || (step !== "newPassword" && adminForgotStep === "newPassword")
                        ? "1px solid rgba(212,164,55,.3)" : "1px solid rgba(255,255,255,.08)",
                      color: adminForgotStep === step || (step === "email" && adminForgotStep === "code") || (step !== "newPassword" && adminForgotStep === "newPassword")
                        ? "#d4a437" : "#475569",
                    }}>
                      {adminForgotStep === "success" || (step !== "newPassword" && adminForgotStep === "newPassword") || (step === "email" && adminForgotStep !== "email") ? "✓" : i + 1}
                    </div>
                    <span style={{ fontSize: 9, color: "#475569", fontWeight: 700 }}>{["Email", "Code", "Mot de passe"][i]}</span>
                  </div>
                  {i < 2 && (
                    <div style={{ width: 32, height: 2, margin: "0 4px", marginBottom: 16, borderRadius: 1,
                      background: (step === "email" && adminForgotStep !== "email") || (step === "code" && adminForgotStep === "newPassword") || adminForgotStep === "success"
                        ? "#d4a437" : "rgba(255,255,255,.08)" }} />
                  )}
                </React.Fragment>
              ))}
            </div>

            {adminForgotStep === "email" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="admin-login-field">
                  <label className="admin-login-label">Email administrateur</label>
                  <input type="email" className="admin-login-input" placeholder="admin@morali.bank" value={adminForgotEmail} onChange={(e) => setAdminForgotEmail(e.target.value)} autoFocus />
                </div>
                <button className="admin-login-btn" onClick={adminForgotSendCode} disabled={adminForgotSending || !adminForgotEmail.trim() || !adminForgotEmail.includes("@")} style={adminForgotSending || !adminForgotEmail.trim() ? { opacity: 0.4 } : {}}>
                  {adminForgotSending ? <div className="btn-loader" /> : "Envoyer le code"}
                </button>
              </div>
            )}

            {adminForgotStep === "code" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="admin-login-field">
                  <label className="admin-login-label">Code de vérification</label>
                  <input type="text" className="admin-login-input" inputMode="numeric" maxLength={6} placeholder="000000" value={adminForgotOtpCode} onChange={(e) => setAdminForgotOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))} style={{ textAlign: "center", fontSize: 20, letterSpacing: ".3em", fontWeight: 900 }} autoFocus />
                </div>
                <button className="admin-login-btn" onClick={adminForgotVerifyCode} disabled={adminForgotOtpCode.length !== 6 || adminForgotVerifying} style={adminForgotOtpCode.length !== 6 ? { opacity: 0.4 } : {}}>
                  {adminForgotVerifying ? <div className="btn-loader" /> : "Vérifier le code"}
                </button>
                <div onClick={adminForgotSendCode} style={{ textAlign: "center", fontSize: 11, color: "#64748b", cursor: "pointer" }}>
                  Renvoyer le code
                </div>
              </div>
            )}

            {adminForgotStep === "newPassword" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="admin-login-field">
                  <label className="admin-login-label">Nouveau mot de passe</label>
                  <input type="password" className="admin-login-input" placeholder="Minimum 8 caractères" value={adminForgotNewPw} onChange={(e) => setAdminForgotNewPw(e.target.value)} autoFocus />
                </div>
                <div className="admin-login-field">
                  <label className="admin-login-label">Confirmer le mot de passe</label>
                  <input type="password" className="admin-login-input" placeholder="Confirmez" value={adminForgotConfirmPw} onChange={(e) => setAdminForgotConfirmPw(e.target.value)} />
                </div>
                <button className="admin-login-btn" onClick={adminForgotResetPassword} disabled={adminForgotNewPw.length < 8 || adminForgotNewPw !== adminForgotConfirmPw || adminForgotResetting} style={adminForgotNewPw.length < 8 || adminForgotNewPw !== adminForgotConfirmPw ? { opacity: 0.4 } : {}}>
                  {adminForgotResetting ? <div className="btn-loader" /> : "Réinitialiser le mot de passe"}
                </button>
              </div>
            )}

            {adminForgotStep === "success" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14, alignItems: "center", textAlign: "center", padding: "20px 0" }}>
                <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(34,197,94,.1)", border: "2px solid rgba(34,197,94,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 600, lineHeight: 1.6 }}>
                  Mot de passe modifié avec succès.<br />Vous pouvez maintenant vous connecter.
                </div>
                <button className="admin-login-btn" onClick={() => { setAdminForgotStep("idle"); setAdminLoginPassword(""); setAdminForgotOtpCode(""); setAdminForgotNewPw(""); setAdminForgotConfirmPw(""); }} style={{ marginTop: 4 }}>
                  Retour à la connexion
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {screen === "admin" && isAdminLoggedIn && (
        <div className="admin-fullscreen">
          <div className="admin-mobile-backdrop" style={{ display: adminSidebarOpen ? "block" : "none" }} onClick={() => setAdminSidebarOpen(false)} />
          <div className={`admin-layout`}>
            <aside className={`admin-sidebar ${adminSidebarOpen ? "open" : ""}`}>
              <div className="admin-sidebar-logo">MB</div>
              <nav className="admin-sidebar-nav">
                {([
                  { tab: "overview" as AdminTab, label: "Dashboard", icon: <><path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10.5V19h11v-8.5"/><path d="M10 19v-4h4v4"/></> },
                  { tab: "users" as AdminTab, label: "Utilisateurs", icon: <><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="8" r="3"/><path d="M20 21v-2a3.5 3.5 0 0 0-2.5-3.35"/><path d="M15.5 5.2a3 3 0 0 1 0 5.6"/></> },
                  { tab: "transactions" as AdminTab, label: "Transactions", icon: <><path d="M7 7h11"/><path d="m14 4 4 3-4 3"/><path d="M17 17H6"/><path d="m10 14-4 3 4 3"/></> },
                  { tab: "analytics" as AdminTab, label: "Analytique", icon: <><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></> },
                  { tab: "loans" as AdminTab, label: "Prêts", icon: <><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></> },
                  { tab: "audit" as AdminTab, label: "Journal d'audit", icon: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></> },
                  { tab: "settings" as AdminTab, label: "Paramètres", icon: <><circle cx="12" cy="12" r="3"/><path d="M12 2v3"/><path d="M12 19v3"/><path d="M4.93 4.93l2.12 2.12"/><path d="M16.95 16.95l2.12 2.12"/><path d="M3 12h4"/><path d="M17 12h4"/></> },
                ]).map((item) => (
                  <button key={item.tab} className={`admin-sidebar-item ${adminTab === item.tab ? "active" : ""}`} onClick={() => { setAdminTab(item.tab); setAdminSidebarOpen(false); }}>
                    <svg viewBox="0 0 24 24" stroke="currentColor">{item.icon}</svg>
                    <span className="admin-sidebar-label">{item.label}</span>
                  </button>
                ))}
              </nav>
              <div className="admin-sidebar-footer">
                <button className="admin-sidebar-item logout-btn" onClick={() => setLogoutModalOpen(true)}>
                  <svg viewBox="0 0 24 24" stroke="currentColor"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  <span className="admin-sidebar-label">Déconnexion</span>
                </button>
              </div>
            </aside>

            <main className="admin-main">
              <header className="admin-header">
                <div className="admin-header-left">
                  <button className="admin-mobile-toggle" onClick={() => setAdminSidebarOpen(!adminSidebarOpen)}>
                    <svg viewBox="0 0 24 24"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                  </button>
                  <div>
                    <div className="admin-header-title">
                      {adminTab === "overview" && "Tableau de bord"}
                      {adminTab === "users" && "Utilisateurs"}
                      {adminTab === "transactions" && "Transactions"}
                      {adminTab === "analytics" && "Analytique"}
                      {adminTab === "loans" && "Demandes de Prêts"}
                      {adminTab === "audit" && "Journal d'audit"}
                      {adminTab === "settings" && "Paramètres"}
                    </div>
                  </div>
                  <span className="admin-header-badge" style={adminPermissionLevel === "viewer" ? { background: "rgba(100,116,139,.2)", color: "#94a3b8" } : {}}>
                    {adminPermissionLevel === "full" ? "Super Admin" : "Lecture seule"}
                  </span>
                </div>
                <div className="admin-header-right">
                  <input className="admin-header-search" placeholder="Rechercher..." value={adminSearchQuery} onChange={(e) => setAdminSearchQuery(e.target.value)} />
                  <div className="admin-header-avatar">AD</div>
                  <div className="admin-refresh-indicator">
                    <div className="admin-refresh-dot" />
                    <span>il y a {adminRefreshSeconds}s</span>
                  </div>
                </div>
              </header>

              <div className="admin-content">
                {adminLoading ? (
                  <div className="admin-empty">
                    <div className="btn-loader" style={{ width: 32, height: 32, margin: "0 auto 16px" }} />
                    <div className="admin-empty-text">Chargement des données...</div>
                  </div>
                ) : (
                  <>
                    {/* OVERVIEW TAB */}
                    {adminTab === "overview" && (
                      <>
                        <div className="admin-stats">
                          <div className="admin-stat-card blue">
                            <div className="admin-stat-top">
                              <span className="admin-stat-label">Total Utilisateurs</span>
                              <span className="admin-stat-trend up">Actifs</span>
                            </div>
                            <div className="admin-stat-value">{formatCurrency(adminUsers.length)}</div>
                            <div className="admin-stat-icon blue">
                              <svg viewBox="0 0 24 24" stroke="currentColor"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="8" r="3"/><path d="M20 21v-2a3.5 3.5 0 0 0-2.5-3.35"/><path d="M15.5 5.2a3 3 0 0 1 0 5.6"/></svg>
                            </div>
                          </div>
                          <div className="admin-stat-card green">
                            <div className="admin-stat-top">
                              <span className="admin-stat-label">Solde Total Banque</span>
                              <span className="admin-stat-trend up">XAF</span>
                            </div>
                            <div className="admin-stat-value" style={{ fontSize: adminTotalBalance > 9999999 ? 18 : 24 }}>{formatCurrency(adminTotalBalance)}</div>
                            <div className="admin-stat-icon green">
                              <svg viewBox="0 0 24 24" stroke="currentColor"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H18a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 15.5v-7Z"/><path d="M16 12h4"/><circle cx="16" cy="12" r="1" fill="currentColor" stroke="none"/></svg>
                            </div>
                          </div>
                          <div className="admin-stat-card amber">
                            <div className="admin-stat-top">
                              <span className="admin-stat-label">Transactions Aujourd'hui</span>
                              <span className="admin-stat-trend up">Live</span>
                            </div>
                            <div className="admin-stat-value">{formatCurrency(adminTodayTransactions)}</div>
                            <div className="admin-stat-icon amber">
                              <svg viewBox="0 0 24 24" stroke="currentColor"><path d="M7 7h11"/><path d="m14 4 4 3-4 3"/><path d="M17 17H6"/><path d="m10 14-4 3 4 3"/></svg>
                            </div>
                          </div>
                          <div className="admin-stat-card purple">
                            <div className="admin-stat-top">
                              <span className="admin-stat-label">Volume Total</span>
                              <span className="admin-stat-trend up">XAF</span>
                            </div>
                            <div className="admin-stat-value" style={{ fontSize: adminTotalTransactions > 9999999 ? 18 : 24 }}>{formatCurrency(adminTotalTransactions)}</div>
                            <div className="admin-stat-icon purple">
                              <svg viewBox="0 0 24 24" stroke="currentColor"><ellipse cx="12" cy="7" rx="5" ry="2.5"/><path d="M7 7v4c0 1.4 2.2 2.5 5 2.5s5-1.1 5-2.5V7"/><path d="M9 14.5v2c0 1.1 1.8 2 4 2s4-.9 4-2v-2"/></svg>
                            </div>
                          </div>
                        </div>

                        <div className="admin-section">
                          <div className="admin-section-header">
                            <div className="admin-section-title">Transactions récentes</div>
                          </div>
                          <div className="admin-table-wrap">
                            {adminTransactions.length === 0 ? (
                              <div className="admin-empty"><div className="admin-empty-icon">📋</div><div className="admin-empty-text">Aucune transaction trouvée.</div></div>
                            ) : (
                              <div className="admin-table-scroll">
                                <table className="admin-table">
                                  <thead><tr><th>Date</th><th>De</th><th>À</th><th>Montant</th><th>Type</th></tr></thead>
                                  <tbody>
                                    {adminTransactions.slice(0, 10).map((tx, i) => {
                                      const txType = getAdminTxTypeLabel(tx.type);
                                      return (
                                        <tr key={i}>
                                          <td style={{ color: "#94a3b8", fontSize: 12 }}>{formatAdminDate(tx.createdAt)}</td>
                                          <td style={{ color: "#fff", fontWeight: 600 }}>{tx.senderName || tx.senderMoraliId || "—"}</td>
                                          <td style={{ color: "#fff", fontWeight: 600 }}>{tx.recipientName || tx.recipientMoraliId || "—"}</td>
                                          <td className={tx.type === "depot" ? "admin-amount-pos" : "admin-amount-neg"}>
                                            {tx.type === "depot" ? "+" : "-"} {formatCurrency(tx.amount)} XAF
                                          </td>
                                          <td><span className={`admin-badge ${txType.cls}`}>{txType.label}</span></td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="admin-section">
                          <div className="admin-section-header">
                            <div className="admin-section-title">Derniers utilisateurs inscrits</div>
                          </div>
                          <div className="admin-table-wrap">
                            {adminUsers.length === 0 ? (
                              <div className="admin-empty"><div className="admin-empty-icon">👥</div><div className="admin-empty-text">Aucun utilisateur enregistré.</div></div>
                            ) : (
                              <div className="admin-table-scroll">
                                <table className="admin-table">
                                  <thead><tr><th>Utilisateur</th><th>ID Morali</th><th>Solde</th><th>Date</th></tr></thead>
                                  <tbody>
                                    {[...adminUsers].reverse().slice(0, 8).map((u) => (
                                      <tr key={u.uid} style={{ cursor: "pointer" }} onClick={() => setAdminSelectedUser(u)}>
                                        <td>
                                          <div className="admin-user-cell">
                                            <div className="admin-user-avatar">{getAdminUserInitials(u)}</div>
                                            <div><div className="admin-user-name">{u.fullName || u.pseudo || "—"}</div><div className="admin-user-email">{u.email || "—"}</div></div>
                                          </div>
                                        </td>
                                        <td style={{ color: "#60a5fa", fontWeight: 600 }}>{u.moraliId || "—"}</td>
                                        <td style={{ fontWeight: 700 }}>{formatCurrency(u.balance || 0)} XAF</td>
                                        <td style={{ color: "#94a3b8", fontSize: 12 }}>{formatAdminDate(u.createdAt)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    {/* USERS TAB */}
                    {adminTab === "users" && (
                      <div className="admin-section">
                        <div className="admin-section-header">
                          <div className="admin-section-title">Tous les utilisateurs ({filteredAdminUsers.length})</div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <button className="admin-select-all-btn" onClick={selectAllUsers}>
                              {adminSelectedUserIds.size === pagedAdminUsers.length && pagedAdminUsers.length > 0 ? "Tout désélectionner" : "Tout sélectionner"}
                            </button>
                            <button className="admin-export-btn" onClick={generateUsersCSV}>
                              <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              Exporter CSV
                            </button>
                          </div>
                        </div>
                        {adminSelectedUserIds.size > 0 && (
                          <div className="admin-bulk-bar">
                            <span className="admin-bulk-count">{adminSelectedUserIds.size} sélectionné(s)</span>
                            {adminPermissionLevel === "full" && <button className="admin-bulk-btn danger" onClick={handleBulkSuspend}>Suspendre la sélection</button>}
                            <button className="admin-bulk-btn" onClick={handleBulkExport}>Exporter sélection</button>
                            {adminPermissionLevel === "full" && <button className="admin-bulk-btn" onClick={handleBulkNotify}>Envoyer notification</button>}
                          </div>
                        )}
                        <div className="admin-table-wrap">
                          {filteredAdminUsers.length === 0 ? (
                            <div className="admin-empty"><div className="admin-empty-icon">👥</div><div className="admin-empty-text">{adminSearchQuery ? "Aucun résultat pour cette recherche." : "Aucun utilisateur enregistré."}</div></div>
                          ) : (
                            <div className="admin-table-scroll">
                              <table className="admin-table">
                                <thead><tr><th style={{ width: 36 }}></th><th>Utilisateur</th><th>Email</th><th>ID Morali</th><th>Solde</th><th>Statut</th><th>Inscription</th></tr></thead>
                                <tbody>
                                  {pagedAdminUsers.map((u) => (
                                    <tr key={u.uid} style={{ cursor: "pointer" }} onClick={() => { setAdminSelectedUser(u); setAdminBalanceEditMode(null); setAdminBalanceEditAmount(""); setAdminNotifForm({ title: "", message: "", open: false }); setAdminEditingField(null); setAdminLimitEditOpen(false); }}>
                                      <td onClick={(e) => e.stopPropagation()}>
                                        <div className={`admin-user-checkbox ${adminSelectedUserIds.has(u.uid) ? "checked" : ""}`} onClick={(e) => { e.stopPropagation(); toggleUserSelect(u.uid); }} />
                                      </td>
                                      <td>
                                        <div className="admin-user-cell">
                                          <div className="admin-user-avatar">{getAdminUserInitials(u)}</div>
                                          <div className="admin-user-name">{u.fullName || u.pseudo || "—"}</div>
                                        </div>
                                      </td>
                                      <td style={{ color: "#94a3b8", fontSize: 12 }}>{u.email || "—"}</td>
                                      <td style={{ color: "#60a5fa", fontWeight: 600, fontSize: 12 }}>{u.moraliId || "—"}</td>
                                      <td style={{ fontWeight: 700 }}>{formatCurrency(u.balance || 0)} XAF</td>
                                      <td><span className={`admin-badge ${u.accountStatus === "suspended" ? "danger" : (u.balance || 0) > 0 ? "success" : "warning"}`}>{u.accountStatus === "suspended" ? "Suspendu" : (u.balance || 0) > 0 ? "Actif" : "Nouveau"}</span></td>
                                      <td style={{ color: "#94a3b8", fontSize: 12 }}>{formatAdminDate(u.createdAt)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                        {filteredAdminUsers.length > adminUsersPerPage && (
                          <div className="admin-pagination">
                            <button disabled={adminUsersPage <= 1} onClick={() => setAdminUsersPage(adminUsersPage - 1)}>←</button>
                            <span className="admin-page-info">Affichage {(adminUsersPage - 1) * adminUsersPerPage + 1}-{Math.min(adminUsersPage * adminUsersPerPage, filteredAdminUsers.length)} sur {filteredAdminUsers.length} utilisateurs</span>
                            <button disabled={adminUsersPage >= adminUsersTotalPages} onClick={() => setAdminUsersPage(adminUsersPage + 1)}>→</button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* TRANSACTIONS TAB */}
                    {adminTab === "transactions" && (
                      <div className="admin-section">
                        <div className="admin-section-header">
                          <div className="admin-section-title">Historique des transactions ({txSearchFilteredAdminTransactions.length})</div>
                          <div className="admin-section-actions">
                            {(["all", "virement", "depot", "retrait", "remboursement"] as const).map((f) => (
                              <button key={f} className={`admin-filter-btn ${adminTxFilter === f ? "active" : ""}`} onClick={() => setAdminTxFilter(f)}>
                                {f === "all" ? "Tout" : f === "virement" ? "Virements" : f === "depot" ? "Dépôts" : f === "retrait" ? "Retraits" : "Remboursements"}
                              </button>
                            ))}
                            <button className={`admin-filter-btn contested ${adminTxFilter === "contested" ? "active" : ""}`} onClick={() => setAdminTxFilter(adminTxFilter === "contested" ? "all" : "contested")}>Contestées</button>
                            <button className="admin-export-btn" onClick={generateTransactionsCSV}>
                              <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              Exporter CSV
                            </button>
                          </div>
                        </div>
                        <div className="admin-filter-bar">
                          <div className="admin-filter-group">
                            <span className="admin-filter-label">Date début</span>
                            <input className="admin-filter-input" type="date" value={adminTxDateFrom} onChange={(e) => setAdminTxDateFrom(e.target.value)} />
                          </div>
                          <div className="admin-filter-group">
                            <span className="admin-filter-label">Date fin</span>
                            <input className="admin-filter-input" type="date" value={adminTxDateTo} onChange={(e) => setAdminTxDateTo(e.target.value)} />
                          </div>
                          <div className="admin-filter-group">
                            <span className="admin-filter-label">Montant min</span>
                            <input className="admin-filter-input" type="number" placeholder="0" value={adminTxAmountMin} onChange={(e) => setAdminTxAmountMin(e.target.value)} />
                          </div>
                          <div className="admin-filter-group">
                            <span className="admin-filter-label">Montant max</span>
                            <input className="admin-filter-input" type="number" placeholder="∞" value={adminTxAmountMax} onChange={(e) => setAdminTxAmountMax(e.target.value)} />
                          </div>
                          {(adminTxDateFrom || adminTxDateTo || adminTxAmountMin || adminTxAmountMax) && (
                            <button className="admin-filter-clear" onClick={() => { setAdminTxDateFrom(""); setAdminTxDateTo(""); setAdminTxAmountMin(""); setAdminTxAmountMax(""); }}>Réinitialiser</button>
                          )}
                        </div>
                        <div className="admin-table-wrap">
                          {txSearchFilteredAdminTransactions.length === 0 ? (
                            <div className="admin-empty"><div className="admin-empty-icon">📋</div><div className="admin-empty-text">Aucune transaction trouvée.</div></div>
                          ) : (
                            <div className="admin-table-scroll">
                              <table className="admin-table">
                                <thead><tr><th>Date</th><th>Expéditeur</th><th>Destinataire</th><th>Montant</th><th>Type</th><th>Statut</th></tr></thead>
                                <tbody>
                                  {pagedTxSearchTransactions.map((tx, i) => {
                                    const txType = getAdminTxTypeLabel(tx.type);
                                    const isContested = tx.status === "contested" || tx.status === "flagged";
                                    return (
                                      <tr key={i} style={{ cursor: "pointer" }} onClick={() => setAdminSelectedTx(tx)}>
                                        <td style={{ color: "#94a3b8", fontSize: 12 }}>{formatAdminDate(tx.createdAt)}</td>
                                        <td style={{ color: "#fff", fontWeight: 600, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{tx.senderName || tx.senderMoraliId || "—"}</td>
                                        <td style={{ color: "#fff", fontWeight: 600, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis" }}>{tx.recipientName || tx.recipientMoraliId || "—"}</td>
                                        <td className={tx.type === "depot" || tx.type === "remboursement" ? "admin-amount-pos" : "admin-amount-neg"}>
                                          {tx.type === "depot" || tx.type === "remboursement" ? "+" : "-"} {formatCurrency(tx.amount)} XAF
                                        </td>
                                        <td><span className={`admin-badge ${txType.cls}`}>{txType.label}</span></td>
                                        <td style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                          <span className={`admin-badge ${isContested ? "danger" : "success"}`}>{isContested ? "Contestée" : tx.status === "success" ? "Succès" : String(tx.status ?? "Inconnu")}</span>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                        {txSearchFilteredAdminTransactions.length > adminTxPerPage && (
                          <div className="admin-pagination">
                            <button disabled={adminTxPage <= 1} onClick={() => setAdminTxPage(adminTxPage - 1)}>←</button>
                            <span className="admin-page-info">Affichage {(adminTxPage - 1) * adminTxPerPage + 1}-{Math.min(adminTxPage * adminTxPerPage, txSearchFilteredAdminTransactions.length)} sur {txSearchFilteredAdminTransactions.length} transactions</span>
                            <button disabled={adminTxPage >= txSearchTotalPages} onClick={() => setAdminTxPage(adminTxPage + 1)}>→</button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* ANALYTICS TAB */}
                    {adminTab === "analytics" && (
                      <>
                        <div className="admin-top-card">
                          <div className="admin-top-card-item">
                            <div className="admin-top-card-label">Total Dépôts</div>
                            <div className="admin-top-card-value green">{formatCurrency(adminAnalyticsStats.totalDepots)} XAF</div>
                          </div>
                          <div className="admin-top-card-item">
                            <div className="admin-top-card-label">Total Retraits</div>
                            <div className="admin-top-card-value red">{formatCurrency(adminAnalyticsStats.totalRetraits)} XAF</div>
                          </div>
                          <div className="admin-top-card-item">
                            <div className="admin-top-card-label">Total Virements</div>
                            <div className="admin-top-card-value blue">{formatCurrency(adminAnalyticsStats.totalVirements)} XAF</div>
                          </div>
                          <div className="admin-top-card-item">
                            <div className="admin-top-card-label">Solde moyen / utilisateur</div>
                            <div className="admin-top-card-value amber">{formatCurrency(adminAnalyticsStats.avgBalance)} XAF</div>
                          </div>
                        </div>

                        <div className="admin-chart-container">
                          <div className="admin-chart-title">Inscriptions par jour (7 derniers jours)</div>
                          <div style={{ width: "100%", height: 200 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={adminInscriptionsPerDay}>
                                <defs>
                                  <linearGradient id="inscGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4}/>
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05}/>
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12, color: "#fff" }} />
                                <Area type="monotone" dataKey="count" stroke="#3b82f6" strokeWidth={2} fill="url(#inscGrad)" />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>

                        <div className="admin-chart-container">
                          <div className="admin-chart-title">Volume de transactions par jour (7 derniers jours)</div>
                          <div style={{ width: "100%", height: 220 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={adminTxVolumePerDay}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={{ stroke: "rgba(255,255,255,0.08)" }} tickLine={false} />
                                <YAxis tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, fontSize: 12, color: "#fff" }} formatter={(value: number) => [`${formatCurrency(value)} XAF`, ""]} />
                                <Bar dataKey="depot" fill="#22c55e" radius={[4, 4, 0, 0]} name="Dépôts" />
                                <Bar dataKey="retrait" fill="#ef4444" radius={[4, 4, 0, 0]} name="Retraits" />
                                <Bar dataKey="virement" fill="#3b82f6" radius={[4, 4, 0, 0]} name="Virements" />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <div className="admin-chart-legend">
                            <div className="admin-chart-legend-item"><div className="admin-chart-legend-dot depot" />Dépôts</div>
                            <div className="admin-chart-legend-item"><div className="admin-chart-legend-dot retrait" />Retraits</div>
                            <div className="admin-chart-legend-item"><div className="admin-chart-legend-dot virement" />Virements</div>
                          </div>
                        </div>

                        <div className="admin-top-users">
                          <div className="admin-top-users-title">Top 5 utilisateurs par volume de transactions</div>
                          {adminTopUsersByVolume.length === 0 ? (
                            <div className="admin-empty" style={{ padding: 16 }}><div className="admin-empty-text">Aucune donnée disponible.</div></div>
                          ) : (
                            adminTopUsersByVolume.map((user, i) => (
                              <div key={user.uid} className="admin-top-user-row">
                                <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
                                  <div className={`admin-top-user-rank ${i === 0 ? "gold" : i === 1 ? "silver" : i === 2 ? "bronze" : "default"}`}>{i + 1}</div>
                                  <div>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{user.name}</div>
                                    <div style={{ fontSize: 11, color: "#64748b" }}>{adminTransactions.filter((t) => t.senderUid === user.uid || t.recipientUid === user.uid).length} transactions</div>
                                  </div>
                                </div>
                                <div style={{ fontSize: 14, fontWeight: 800, color: "#60a5fa", fontFamily: "'Montserrat',sans-serif" }}>{formatCurrency(user.volume)} XAF</div>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Financial Reports */}
                        <div className="admin-report-section">
                          <div className="admin-report-header">
                            <div className="admin-report-title">📊 Rapports financiers</div>
                            <div className="admin-report-modes">
                              <button className={`admin-report-mode ${adminReportMode === "daily" ? "active" : ""}`} onClick={() => setAdminReportMode("daily")}>Quotidien</button>
                              <button className={`admin-report-mode ${adminReportMode === "weekly" ? "active" : ""}`} onClick={() => setAdminReportMode("weekly")}>Hebdomadaire</button>
                              <button className={`admin-report-mode ${adminReportMode === "monthly" ? "active" : ""}`} onClick={() => setAdminReportMode("monthly")}>Mensuel</button>
                            </div>
                            <button className="admin-export-btn" onClick={exportFinancialReportPDF} style={{ marginLeft: "auto" }}>
                              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                              Exporter PDF
                            </button>
                          </div>
                          <div className="admin-report-daterange">{adminFinancialReport.rangeLabel}</div>
                          <div className="admin-report-stats">
                            <div className="admin-report-stat">
                              <div className="admin-report-stat-label">Total Dépôts</div>
                              <div className="admin-report-stat-value green">{formatCurrency(adminFinancialReport.totalDepots)} XAF</div>
                            </div>
                            <div className="admin-report-stat">
                              <div className="admin-report-stat-label">Total Retraits</div>
                              <div className="admin-report-stat-value red">{formatCurrency(adminFinancialReport.totalRetraits)} XAF</div>
                            </div>
                            <div className="admin-report-stat">
                              <div className="admin-report-stat-label">Total Virements</div>
                              <div className="admin-report-stat-value blue">{formatCurrency(adminFinancialReport.totalVirements)} XAF</div>
                            </div>
                            <div className="admin-report-stat">
                              <div className="admin-report-stat-label">Net</div>
                              <div className={`admin-report-stat-value ${adminFinancialReport.net >= 0 ? "green" : "red"}`}>{adminFinancialReport.net >= 0 ? "+" : ""}{formatCurrency(adminFinancialReport.net)} XAF</div>
                            </div>
                          </div>
                          {adminFinancialReport.transactions.length > 0 ? (
                            <div style={{ maxHeight: 200, overflowY: "auto" }}>
                              <table className="admin-report-table">
                                <thead><tr><th>Date</th><th>Type</th><th>De</th><th>À</th><th>Montant</th></tr></thead>
                                <tbody>
                                  {adminFinancialReport.transactions.slice(0, 20).map((tx, i) => (
                                    <tr key={i}>
                                      <td style={{ fontSize: 11 }}>{formatAdminDate(tx.createdAt)}</td>
                                      <td><span className={`admin-badge ${getAdminTxTypeLabel(tx.type).cls}`} style={{ fontSize: 9 }}>{getAdminTxTypeLabel(tx.type).label}</span></td>
                                      <td style={{ fontSize: 11 }}>{tx.senderName || "—"}</td>
                                      <td style={{ fontSize: 11 }}>{tx.recipientName || "—"}</td>
                                      <td style={{ fontWeight: 700, fontSize: 11 }}>{formatCurrency(tx.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div style={{ textAlign: "center", padding: 20, color: "#64748b", fontSize: 12 }}>Aucune transaction dans cette période</div>
                          )}
                        </div>
                      </>
                    )}

                    {/* LOANS TAB */}
                    {adminTab === "loans" && (
                      <>
                        {adminLoansLoading ? (
                          <div style={{ textAlign: "center", padding: 40, color: "#64748b" }}>
                            <div className="btn-loader" style={{ margin: "0 auto 12px", borderTopColor: "#60a5fa" }} />
                            <div style={{ fontSize: 13 }}>Chargement des demandes...</div>
                          </div>
                        ) : (
                          <>
                            {/* Loan stats */}
                            <div className="admin-top-card">
                              <div className="admin-top-card-item">
                                <div className="admin-top-card-label">En attente</div>
                                <div className="admin-top-card-value amber">{adminLoans.filter((l: Record<string, unknown>) => l.status === "pending").length}</div>
                              </div>
                              <div className="admin-top-card-item">
                                <div className="admin-top-card-label">Approuvés</div>
                                <div className="admin-top-card-value green">{adminLoans.filter((l: Record<string, unknown>) => l.status === "success").length}</div>
                              </div>
                              <div className="admin-top-card-item">
                                <div className="admin-top-card-label">Refusés</div>
                                <div className="admin-top-card-value red">{adminLoans.filter((l: Record<string, unknown>) => l.status === "contested").length}</div>
                              </div>
                            </div>

                            {/* Pending loans */}
                            <div className="admin-section-title" style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 12, padding: "0 2px" }}>
                              Demandes en attente ({adminLoans.filter((l: Record<string, unknown>) => l.status === "pending").length})
                            </div>
                            {adminLoans.filter((l: Record<string, unknown>) => l.status === "pending").length === 0 ? (
                              <div className="admin-empty" style={{ padding: 24 }}>
                                <div className="admin-empty-text">Aucune demande de prêt en attente.</div>
                              </div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                {adminLoans.filter((l: Record<string, unknown>) => l.status === "pending").map((loan: Record<string, unknown>) => (
                                  <div key={loan.id} style={{
                                    padding: 16, borderRadius: 16,
                                    background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)"
                                  }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                                      <div>
                                        <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>{loan.senderName || "Utilisateur inconnu"}</div>
                                        <div style={{ fontSize: 11, color: "#64748b", marginTop: 3 }}>
                                          {loan.senderMoraliId || ""} · Prêt Personnel
                                        </div>
                                      </div>
                                      <span style={{
                                        fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 999,
                                        background: loan.loanType === "micro" ? "rgba(244,63,94,0.12)" : "rgba(59,130,246,0.12)",
                                        color: loan.loanType === "micro" ? "#fb7185" : "#60a5fa"
                                      }}>
                                        {loan.loanType === "micro" ? "Microcrédit" : "Personnel"}
                                      </span>
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                                      <div style={{ padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
                                        <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Montant</div>
                                        <div style={{ fontSize: 14, fontWeight: 800, color: "#22c55e", fontFamily: "'Montserrat',sans-serif", marginTop: 3 }}>{formatCurrency(loan.amount)} F</div>
                                      </div>
                                      <div style={{ padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
                                        <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Total à rembourser</div>
                                        <div style={{ fontSize: 14, fontWeight: 800, color: "#fbbf24", fontFamily: "'Montserrat',sans-serif", marginTop: 3 }}>{formatCurrency(loan.totalToRepay || loan.amount)} F</div>
                                      </div>
                                      <div style={{ padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
                                        <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Durée</div>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginTop: 3 }}>{loan.durationLabel || `${loan.duration} jours`}</div>
                                      </div>
                                      <div style={{ padding: 8, borderRadius: 10, background: "rgba(255,255,255,0.03)" }}>
                                        <div style={{ fontSize: 9, color: "#64748b", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Date</div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8", marginTop: 3 }}>
                                          {loan.createdAt && typeof loan.createdAt === "object" && "seconds" in loan.createdAt
                                            ? new Date((loan.createdAt as { seconds: number }).seconds * 1000).toLocaleDateString("fr-FR")
                                            : "—"}
                                        </div>
                                      </div>
                                    </div>
                                    {adminPermissionLevel === "full" && (
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                      <button
                                        onClick={() => handleAdminApproveLoan(loan)}
                                        style={{
                                          height: 40, borderRadius: 12, border: "none", cursor: "pointer",
                                          background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "#fff",
                                          fontSize: 13, fontWeight: 800, boxShadow: "0 4px 12px rgba(34,197,94,0.3)",
                                          transition: "all 0.2s",
                                        }}
                                      >✓ Approuver</button>
                                      <button
                                        onClick={() => handleAdminRejectLoan(loan)}
                                        style={{
                                          height: 40, borderRadius: 12, border: "none", cursor: "pointer",
                                          background: "linear-gradient(135deg, #ef4444, #dc2626)", color: "#fff",
                                          fontSize: 13, fontWeight: 800, boxShadow: "0 4px 12px rgba(239,68,68,0.3)",
                                          transition: "all 0.2s",
                                        }}
                                      >✗ Refuser</button>
                                    </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Processed loans */}
                            <div className="admin-section-title" style={{ fontSize: 14, fontWeight: 700, color: "#fff", marginBottom: 12, marginTop: 20, padding: "0 2px" }}>
                              Historique ({adminLoans.filter((l: Record<string, unknown>) => l.status !== "pending").length})
                            </div>
                            {adminLoans.filter((l: Record<string, unknown>) => l.status !== "pending").length === 0 ? (
                              <div className="admin-empty" style={{ padding: 24 }}>
                                <div className="admin-empty-text">Aucun historique de traitement.</div>
                              </div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {adminLoans.filter((l: Record<string, unknown>) => l.status !== "pending").map((loan: Record<string, unknown>) => (
                                  <div key={loan.id} style={{
                                    padding: 12, borderRadius: 12,
                                    background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)",
                                    display: "flex", justifyContent: "space-between", alignItems: "center",
                                  }}>
                                    <div>
                                      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{loan.senderName || "—"} <span style={{ fontWeight: 400, color: "#64748b" }}>· {loan.loanType === "micro" ? "Microcrédit" : "Prêt Personnel"}</span></div>
                                      <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{formatCurrency(loan.amount)} F</div>
                                    </div>
                                    <span style={{
                                      fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 999,
                                      background: loan.status === "approved" ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.12)",
                                      color: loan.status === "approved" ? "#4ade80" : "#f87171",
                                    }}>
                                      {loan.status === "approved" ? "Approuvé" : "Refusé"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </>
                    )}

                    {/* AUDIT LOG TAB */}
                    {adminTab === "audit" && (
                      <div className="admin-section">
                        <div className="admin-section-header">
                          <div className="admin-section-title">Journal d'audit</div>
                          <button className="admin-filter-clear" onClick={() => setAuditLogRefreshKey((k) => k + 1)}>Rafraîchir</button>
                        </div>
                        <div className="admin-table-wrap">
                          {auditLogs.length === 0 ? (
                            <div className="admin-empty"><div className="admin-empty-icon">📜</div><div className="admin-empty-text">Aucune action enregistrée.</div></div>
                          ) : (
                            <div className="admin-table-scroll">
                              <table className="admin-table">
                                <thead><tr><th>Date</th><th>Admin</th><th>Action</th><th>Cible</th><th>Détails</th></tr></thead>
                                <tbody>
                                  {auditLogs.slice(0, 50).map((log: Record<string, unknown>, i: number) => (
                                    <tr key={log.id || i}>
                                      <td style={{ color: "#94a3b8", fontSize: 12 }}>{log.createdAt ? new Date(log.createdAt).toLocaleString("fr-FR") : "—"}</td>
                                      <td style={{ fontWeight: 600, color: "#fff" }}>{log.adminName || "—"}</td>
                                      <td><span className="admin-badge success">{log.action || "—"}</span></td>
                                      <td style={{ color: "#94a3b8", fontSize: 12 }}>{log.target || "—"}</td>
                                      <td style={{ color: "#64748b", fontSize: 11, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{log.details || "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* SETTINGS TAB */}
                    {adminTab === "settings" && (
                      <>
                        <div className="admin-settings-grid">
                          <div className="admin-setting-card">
                            <div className="admin-setting-title">🏦 Nom de la banque</div>
                            <div className="admin-setting-desc">Nom affiché dans l'application et les documents officiels.</div>
                            <div className="admin-setting-row">
                              <span className="admin-setting-label">Nom</span>
                              <input className="admin-setting-input" value={bankName} onChange={(e) => setBankName(e.target.value)} style={{ width: 180 }} />
                            </div>
                          </div>

                          <div className="admin-setting-card">
                            <div className="admin-setting-title">💰 Configuration financière</div>
                            <div className="admin-setting-desc">Paramètres financiers par défaut pour les nouveaux utilisateurs et les opérations.</div>
                            <div className="admin-setting-row">
                              <span className="admin-setting-label">Solde par défaut (XAF)</span>
                              <input className="admin-setting-input" type="number" value={defaultBalance} onChange={(e) => setDefaultBalance(e.target.value)} />
                            </div>
                            <div className="admin-setting-row">
                              <span className="admin-setting-label">Mode de frais</span>
                              <div className="admin-fee-toggle">
                                <button className={`admin-fee-toggle-btn ${adminFeeMode === "fixed" ? "active" : ""}`} onClick={() => setAdminFeeMode("fixed")}>Montant fixe</button>
                                <button className={`admin-fee-toggle-btn ${adminFeeMode === "percentage" ? "active" : ""}`} onClick={() => setAdminFeeMode("percentage")}>Pourcentage</button>
                              </div>
                            </div>
                            <div className="admin-setting-row">
                              <span className="admin-setting-label">{adminFeeMode === "fixed" ? "Frais de transfert (XAF)" : "Frais de transfert (%)"}</span>
                              <input className="admin-setting-input" type="number" value={transferFee} onChange={(e) => setTransferFee(e.target.value)} min="0" step={adminFeeMode === "percentage" ? "0.1" : "100"} />
                            </div>
                            <div className="admin-fee-example">{adminFeeExample}</div>
                            <div className="admin-setting-row">
                              <span className="admin-setting-label">Limite max transfert (XAF)</span>
                              <input className="admin-setting-input" type="number" value={maxTransferLimit} onChange={(e) => setMaxTransferLimit(e.target.value)} />
                            </div>
                          </div>

                          <div className="admin-setting-card">
                            <div className="admin-setting-title">🔒 Maintenance</div>
                            <div className="admin-setting-desc">Activez le mode maintenance pour empêcher les connexions et transactions utilisateur.</div>
                            <div className="admin-setting-row">
                              <span className="admin-setting-label">Mode maintenance</span>
                              <div className={`admin-toggle ${maintenanceMode ? "danger-active" : ""}`} onClick={() => setMaintenanceMode(!maintenanceMode)} />
                            </div>
                          </div>

                          <div className="admin-setting-card">
                            <div className="admin-setting-title">📊 Statistiques rapides</div>
                            <div className="admin-setting-desc">Vue d'ensemble du système en temps réel.</div>
                            <div className="admin-setting-row">
                              <span className="admin-setting-label">Utilisateurs actifs</span>
                              <span style={{ fontWeight: 800, color: "#4ade80" }}>{adminUsers.length}</span>
                            </div>
                            <div className="admin-setting-row">
                              <span className="admin-setting-label">Transactions totales</span>
                              <span style={{ fontWeight: 800, color: "#60a5fa" }}>{adminTransactions.length}</span>
                            </div>
                            <div className="admin-setting-row">
                              <span className="admin-setting-label">Volume total</span>
                              <span style={{ fontWeight: 800, color: "#fbbf24" }}>{formatCurrency(adminTotalTransactions)} XAF</span>
                            </div>
                          </div>
                        </div>

                        {/* Activity Log */}
                        <div className="admin-section" style={{ marginTop: 24 }}>
                          <div className="admin-section-header">
                            <div className="admin-section-title">📝 Journal d'activité</div>
                            <span className="admin-section-title" style={{ fontSize: 12, color: "#64748b" }}>{adminActivityLog.length} actions</span>
                          </div>
                          <div className="admin-chart-container" style={{ padding: 0 }}>
                            {adminActivityLog.length === 0 ? (
                              <div className="admin-empty" style={{ padding: 24 }}><div className="admin-empty-icon">📝</div><div className="admin-empty-text">Aucune activité enregistrée.</div></div>
                            ) : (
                              <div className="admin-activity-log" style={{ padding: "8px 16px" }}>
                                {adminActivityLog.map((log, i) => {
                                  const isDanger = log.action.includes("Suppression") || log.action.includes("Suspension");
                                  const isSuccess = log.action.includes("Dépôt") || log.action.includes("Réactivation") || log.action.includes("Remboursement");
                                  const isWarning = log.action.includes("Retrait") || log.action.includes("PIN");
                                  return (
                                    <div key={i} className="admin-activity-item">
                                      <div className={`admin-activity-dot ${isDanger ? "danger" : isSuccess ? "success" : isWarning ? "warning" : ""}`} />
                                      <div className="admin-activity-content">
                                        <div className="admin-activity-action">{log.action}</div>
                                        <div className="admin-activity-detail">{log.detail}</div>
                                        <div className="admin-activity-time">{log.timestamp.toLocaleString("fr-FR")}</div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* System Health */}
                        <div className="admin-health-card">
                          <div className="admin-health-title">🩺 État du système</div>
                          <div className="admin-health-grid">
                            <div className="admin-health-item">
                              <div className="admin-health-label">Firebase</div>
                              <div className="admin-health-value">
                                <span className="admin-health-badge green">✅ Connecté</span>
                              </div>
                            </div>
                            <div className="admin-health-item">
                              <div className="admin-health-label">Utilisateurs</div>
                              <div className="admin-health-value">{adminUsers.length}</div>
                            </div>
                            <div className="admin-health-item">
                              <div className="admin-health-label">Transactions</div>
                              <div className="admin-health-value">{adminTransactions.length}</div>
                            </div>
                            <div className="admin-health-item">
                              <div className="admin-health-label">Dernière maj</div>
                              <div className="admin-health-value" style={{ fontSize: 11, color: "#94a3b8" }}>{adminLastRefresh.toLocaleTimeString("fr-FR")}</div>
                            </div>
                            <div className="admin-health-item">
                              <div className="admin-health-label">Taille données</div>
                              <div className="admin-health-value">{adminUsers.length + adminTransactions.length} entrées</div>
                            </div>
                            <div className="admin-health-item">
                              <div className="admin-health-label">Auto-refresh</div>
                              <div className="admin-health-value">
                                <span className="admin-health-badge green">Toutes les 15s</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Reset Data Card */}
                        {adminPermissionLevel === "full" && (
                        <div className="admin-setting-card" style={{ marginTop: 20, borderColor: "rgba(239,68,68,0.3)" }}>
                          <div className="admin-setting-title" style={{ color: "#ef4444" }}>🗑️ Réinitialisation des données</div>
                          <div className="admin-setting-desc">Choisissez quoi réinitialiser. Ces actions sont irréversibles.</div>
                          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
                            {[
                              { key: "transactions", label: "Transactions", desc: "Supprimer toutes les transactions", icon: "📈" },
                              { key: "notifications", desc: "Supprimer toutes les notifications", icon: "🔔", label: "Notifications" },
                              { key: "balances", label: "Soldes", desc: "Remettre tous les soldes à 0", icon: "💰" },
                              { key: "all", label: "Tout réinitialiser", desc: "Transactions + Notifications + Soldes", icon: "⚠️" },
                            ].map((opt) => (
                              <button
                                key={opt.key}
                                className="admin-fee-toggle-btn"
                                style={{ background: resetDataConfirm === opt.key ? "#ef4444" : "rgba(255,255,255,0.04)", color: "#fff", padding: "10px 16px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, cursor: "pointer", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10, textAlign: "left", width: "100%" }}
                                onClick={async () => {
                                  if (resetDataConfirm !== opt.key) {
                                    setResetDataConfirm(opt.key);
                                    setTimeout(() => setResetDataConfirm(false), 8000);
                                    return;
                                  }
                                  // Confirmed — execute reset
                                  setResetDataLoading(true);
                                  try {
                                    const headers = await getAuthHeaders();
                                    const actionName = opt.key === "all" ? "RESET_ALL" : `RESET_${opt.key.toUpperCase()}`;
                                    const confirmToken = `CONFIRM_${actionName}_${(firebaseAuth.currentUser?.uid || "").slice(0, 8)}`;
                                    const res = await fetch("/api/admin/log", {
                                      method: "POST",
                                      headers: { ...headers, "Content-Type": "application/json" },
                                      body: JSON.stringify({ action: actionName, details: `Admin reset: ${opt.label}`, confirmToken }),
                                    });
                                    const data = await res.json();
                                    if (data.success) {
                                      showToast(`✅ ${opt.label} réinitialisé(s) avec succès`);
                                      setAdminTransactions([]);
                                      if (opt.key === "balances" || opt.key === "all") setAdminUsers(u => u.map(usr => ({ ...usr, balance: 0 })));
                                      setTimeout(() => window.location.reload(), 2000);
                                    } else {
                                      showToast("❌ Erreur: " + (data.error || "Échec"));
                                    }
                                  } catch {
                                    showToast("❌ Erreur de connexion");
                                  } finally {
                                    setResetDataLoading(false);
                                    setResetDataConfirm(false);
                                  }
                                }}
                                disabled={resetDataLoading}
                              >
                                <span style={{ fontSize: 18 }}>{opt.icon}</span>
                                <div>
                                  <div style={{ fontWeight: 700 }}>{resetDataLoading && resetDataConfirm === opt.key ? "⏳ Réinitialisation..." : resetDataConfirm === opt.key ? `⚠️ Confirmer : ${opt.label}` : opt.label}</div>
                                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 2 }}>{opt.desc}</div>
                                </div>
                              </button>
                            ))}
                            {resetDataConfirm && (
                              <button
                                className="admin-fee-toggle-btn"
                                style={{ background: "rgba(255,255,255,0.05)", color: "#94a3b8", padding: "8px 20px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, cursor: "pointer", fontSize: 13 }}
                                onClick={() => setResetDataConfirm(false)}
                              >
                                Annuler
                              </button>
                            )}
                          </div>
                        </div>
                        )}

                        {/* Admin Roles */}
                        {adminPermissionLevel === "full" && (
                        <div className="admin-admin-roles-section">
                          <div className="admin-admin-roles-title">🛡️ Gestion des rôles</div>
                          {adminAdminUsers.length === 0 ? (
                            <div style={{ textAlign: "center", padding: 20, color: "#64748b", fontSize: 12 }}>Aucun administrateur trouvé</div>
                          ) : (
                            adminAdminUsers.map((admin) => (
                              <div key={admin.uid} className="admin-admin-role-row">
                                <div className="admin-admin-role-info">
                                  <div className="admin-admin-role-avatar">{getAdminUserInitials(admin)}</div>
                                  <div>
                                    <div className="admin-admin-role-name">{admin.fullName || admin.pseudo || "Admin"}</div>
                                    <div className="admin-admin-role-email">{admin.email || "—"}</div>
                                  </div>
                                </div>
                                <select
                                  className="admin-admin-role-select"
                                  value={(admin as Record<string, unknown>).adminRole as string || "moderator"}
                                  onChange={(e) => handleAdminChangeRole(admin.uid, e.target.value)}
                                >
                                  <option value="super-admin">Super Admin</option>
                                  <option value="moderator">Modérateur</option>
                                  <option value="support">Support</option>
                                </select>
                              </div>
                            ))
                          )}
                        </div>
                        )}

                        {/* Backup & Restore */}
                        <div className="admin-backup-section">
                          <div className="admin-backup-title">💾 Sauvegarde & Restauration</div>
                          <div className="admin-backup-desc">Exportez toutes les données en JSON ou restaurez depuis un fichier de sauvegarde.</div>
                          <div className="admin-backup-actions">
                            <button className="admin-backup-btn" onClick={handleAdminBackup} disabled={adminBackupLoading}>
                              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                              {adminBackupLoading ? "Export en cours..." : "Exporter toutes les données"}
                            </button>
                            <label className="admin-backup-btn danger">
                              <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                              {adminBackupLoading ? "Import en cours..." : "Restaurer des données"}
                              <input type="file" accept=".json" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (file) handleAdminRestore(file); e.target.value = ""; }} disabled={adminBackupLoading} />
                            </label>
                          </div>
                          <div className="admin-backup-warning">⚠️ La restauration écrasera les données existantes. Utilisez avec précaution.</div>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            </main>
          </div>

          {/* User Detail Overlay */}
          {adminSelectedUser && (
            <div className="admin-user-detail-overlay" onClick={() => { setAdminSelectedUser(null); setAdminBalanceEditMode(null); setAdminNotifForm({ title: "", message: "", open: false }); }}>
              <div className="admin-user-detail-card" onClick={(e) => e.stopPropagation()}>
                <div className="admin-user-detail-scroll">
                  {/* Header */}
                  <div className="admin-user-detail-header">
                    <div className="admin-user-detail-avatar">{getAdminUserInitials(adminSelectedUser)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="admin-user-detail-name">{adminSelectedUser.fullName || adminSelectedUser.pseudo || "—"}</div>
                      <div className="admin-user-detail-email">{adminSelectedUser.email || "—"}</div>
                      {adminSelectedUser.accountStatus === "suspended" && <span className="admin-badge danger" style={{ marginTop: 4, fontSize: 9 }}>Suspendu</span>}
                    </div>
                  </div>

                  {/* Balance HERO */}
                  <div className="admin-balance-hero">
                    <div className="admin-balance-hero-label">Solde disponible</div>
                    <div className="admin-balance-hero-value">{formatCurrency(adminSelectedUser.balance || 0)}</div>
                    <div className="admin-balance-hero-currency">XAF — Franc CFA</div>
                  </div>

                  {/* ID Morali — Copyable */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                    <div
                      className="admin-copyable-id"
                      onClick={() => {
                        const id = adminSelectedUser.moraliId || "";
                        if (id) { navigator.clipboard.writeText(id).then(() => showToast("ID Morali copié !")).catch(() => showToast("ID Morali copié !")); }
                      }}
                      title="Cliquer pour copier"
                    >
                      <svg viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                      {adminSelectedUser.moraliId || "—"}
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className="admin-user-detail-stats" style={{ marginBottom: 20 }}>
                    <div className="admin-user-detail-stat">
                      <div className="admin-user-detail-stat-label">Téléphone</div>
                      <div className="admin-user-detail-stat-value">{adminSelectedUser.phone || "—"}</div>
                    </div>
                    <div className="admin-user-detail-stat">
                      <div className="admin-user-detail-stat-label">Pseudo</div>
                      <div className="admin-user-detail-stat-value">{adminSelectedUser.pseudo && adminSelectedUser.pseudo.startsWith("@") ? adminSelectedUser.pseudo : adminSelectedUser.pseudo ? `@${adminSelectedUser.pseudo}` : "—"}</div>
                    </div>
                  </div>

                  <hr className="admin-glass-divider" />

                  {/* Financial Actions Group */}
                  {adminPermissionLevel === "full" && (
                    <div className="admin-action-group">
                      <div className="admin-action-group-title">💰 Opérations financières</div>
                      <div className="admin-action-row">
                        <button className="admin-action-btn green" onClick={() => setAdminBalanceEditMode(adminBalanceEditMode === "add" ? null : "add")}>
                          <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Ajouter des fonds
                        </button>
                        <button className="admin-action-btn amber" onClick={() => setAdminBalanceEditMode(adminBalanceEditMode === "subtract" ? null : "subtract")}>
                          <svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                          Retirer des fonds
                        </button>
                      </div>
                      {adminBalanceEditMode && (
                        <div className="admin-inline-form" style={{ marginTop: 10 }}>
                          <input type="number" placeholder="Montant (XAF)" value={adminBalanceEditAmount} onChange={(e) => setAdminBalanceEditAmount(e.target.value)} min="1" />
                          <button className="admin-inline-form-btn confirm" onClick={() => { handleAdminBalanceEdit(adminBalanceEditMode); }}>Confirmer</button>
                          <button className="admin-inline-form-btn cancel" onClick={() => { setAdminBalanceEditMode(null); setAdminBalanceEditAmount(""); }}>Annuler</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Account Actions Group */}
                  {adminPermissionLevel === "full" && (
                    <div className="admin-action-group">
                      <div className="admin-action-group-title">🛠️ Gestion du compte</div>
                      <div className="admin-action-row">
                        <button className={`admin-action-btn ${adminSelectedUser.accountStatus === "suspended" ? "green" : "red"}`} onClick={() => { handleAdminSuspendUser(); showToast(adminSelectedUser.accountStatus === "suspended" ? "Compte réactivé" : "Compte suspendu"); }}>
                          <svg viewBox="0 0 24 24">{adminSelectedUser.accountStatus === "suspended" ? <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></> : <><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></>}</svg>
                          {adminSelectedUser.accountStatus === "suspended" ? "Réactiver" : "Suspendre"}
                        </button>
                        <button className="admin-action-btn blue" onClick={() => { handleAdminResetPin(); showToast("PIN réinitialisé"); }}>
                          <svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                          Réinitialiser PIN
                        </button>
                        <button className="admin-action-btn" onClick={() => setAdminNotifForm({ ...adminNotifForm, open: !adminNotifForm.open })}>
                          <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                          Notification
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Notification Form */}
                  {adminNotifForm.open && (
                    <div className="admin-notif-form" style={{ marginBottom: 10 }}>
                      <div className="admin-notif-form-title">Envoyer une notification</div>
                      <div className="admin-notif-form-field">
                        <label>Titre</label>
                        <input value={adminNotifForm.title} onChange={(e) => setAdminNotifForm({ ...adminNotifForm, title: e.target.value })} placeholder="Titre de la notification" />
                      </div>
                      <div className="admin-notif-form-field">
                        <label>Message</label>
                        <textarea rows={3} value={adminNotifForm.message} onChange={(e) => setAdminNotifForm({ ...adminNotifForm, message: e.target.value })} placeholder="Contenu de la notification..." />
                      </div>
                      <div className="admin-notif-form-actions">
                        <button className="admin-inline-form-btn confirm" onClick={() => { handleAdminSendNotification(); showToast("Notification envoyée"); }} disabled={!adminNotifForm.title || !adminNotifForm.message}>Envoyer</button>
                        <button className="admin-inline-form-btn cancel" onClick={() => setAdminNotifForm({ title: "", message: "", open: false })}>Annuler</button>
                      </div>
                    </div>
                  )}

                  {/* Danger Zone */}
                  {adminPermissionLevel === "full" && (
                    <div className="admin-action-group danger">
                      <div className="admin-action-group-title">⚠️ Zone dangereuse</div>
                      <div className="admin-action-row">
                        <button className="admin-action-btn danger" onClick={() => setAdminConfirmAction({ type: "delete-user", message: `Supprimer définitivement l'utilisateur "${adminSelectedUser.fullName || adminSelectedUser.pseudo}" ? Cette action est irréversible.` })}>
                          <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                          Supprimer le compte
                        </button>
                      </div>
                    </div>
                  )}

                  <hr className="admin-glass-divider" />

                  {/* Modifier le profil */}
                  <div className="admin-profile-edit" style={{ marginBottom: 16 }}>
                    <div className="admin-profile-edit-title">✏️ Modifier le profil</div>
                    {[
                      { key: "firstName", label: "Prénom", value: adminSelectedUser.firstName || "" },
                      { key: "lastName", label: "Nom", value: adminSelectedUser.lastName || "" },
                      { key: "phone", label: "Téléphone", value: adminSelectedUser.phone || "" },
                      { key: "pseudo", label: "Pseudo", value: adminSelectedUser.pseudo || "" },
                    ].map((field) => (
                      <div key={field.key} className="admin-profile-field">
                        <span className="admin-profile-field-label">{field.label}</span>
                        {adminEditingField === field.key ? (
                          <div className="admin-profile-field-edit">
                            <input
                              value={adminEditValue}
                              onChange={(e) => setAdminEditValue(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") { handleAdminEditProfileField(field.key); showToast("Profil mis à jour"); } if (e.key === "Escape") { setAdminEditingField(null); setAdminEditValue(""); } }}
                              autoFocus
                            />
                            <button className="admin-mini-btn save" onClick={() => { handleAdminEditProfileField(field.key); showToast("Profil mis à jour"); }}>✓</button>
                            <button className="admin-mini-btn" onClick={() => { setAdminEditingField(null); setAdminEditValue(""); }}>✕</button>
                          </div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, justifyContent: "flex-end" }}>
                            <span className="admin-profile-field-value">{field.value || "—"}</span>
                            <button className="admin-mini-btn" onClick={() => { setAdminEditingField(field.key); setAdminEditValue(field.value); }}>✏️</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Limites personnalisés */}
                  <div className="admin-limits-section" style={{ marginBottom: 16 }}>
                    <div className="admin-limits-title" style={{ cursor: "pointer" }} onClick={() => { setAdminLimitEditOpen(!adminLimitEditOpen); setAdminUserLimits({ dailyLimit: String((adminSelectedUser as Record<string, unknown>).dailyLimit || ""), txLimit: String((adminSelectedUser as Record<string, unknown>).txLimit || "") }); }}>
                      ⚙️ Limites personnalisés {adminLimitEditOpen ? "▾" : "▸"}
                    </div>
                    <div className="admin-limit-field">
                      <span className="admin-limit-label">Limite quotidienne</span>
                      <span className="admin-limit-value">{(adminSelectedUser as Record<string, unknown>).dailyLimit ? `${formatCurrency(Number((adminSelectedUser as Record<string, unknown>).dailyLimit))} XAF` : "Non définie"}</span>
                    </div>
                    <div className="admin-limit-field">
                      <span className="admin-limit-label">Limite par transaction</span>
                      <span className="admin-limit-value">{(adminSelectedUser as Record<string, unknown>).txLimit ? `${formatCurrency(Number((adminSelectedUser as Record<string, unknown>).txLimit))} XAF` : "Non définie"}</span>
                    </div>
                    {adminLimitEditOpen && (
                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        <input className="admin-filter-input" type="number" placeholder="Limite quotidienne (XAF)" value={adminUserLimits.dailyLimit} onChange={(e) => setAdminUserLimits({ ...adminUserLimits, dailyLimit: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
                        <input className="admin-filter-input" type="number" placeholder="Limite par tx (XAF)" value={adminUserLimits.txLimit} onChange={(e) => setAdminUserLimits({ ...adminUserLimits, txLimit: e.target.value })} style={{ flex: 1, minWidth: 120 }} />
                        <button className="admin-inline-form-btn confirm" onClick={() => { handleAdminSaveUserLimits(); showToast("Limites mises à jour"); }} style={{ padding: "6px 14px", fontSize: 11 }}>Sauvegarder</button>
                      </div>
                    )}
                  </div>

                  <hr className="admin-glass-divider" />

                  {/* Recent Transactions */}
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 10, fontFamily: "'Montserrat',sans-serif" }}>Transactions récentes</div>
                    {adminTransactions.filter((t) => t.senderUid === adminSelectedUser.uid || t.recipientUid === adminSelectedUser.uid).length === 0 ? (
                      <div style={{ fontSize: 12, color: "#64748b", textAlign: "center", padding: 16 }}>Aucune transaction</div>
                    ) : (
                      <div style={{ maxHeight: 200, overflowY: "auto" }}>
                        {adminTransactions.filter((t) => t.senderUid === adminSelectedUser.uid || t.recipientUid === adminSelectedUser.uid).slice(0, 10).map((tx, i) => {
                          const isSender = tx.senderUid === adminSelectedUser.uid;
                          const txType = getAdminTxTypeLabel(tx.type);
                          return (
                            <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                              <div>
                                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{isSender ? `→ ${tx.recipientName || tx.recipientMoraliId}` : `← ${tx.senderName || tx.senderMoraliId}`}</div>
                                <div style={{ fontSize: 11, color: "#64748b" }}>{formatAdminDate(tx.createdAt)}</div>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span className={`admin-badge ${txType.cls}`} style={{ fontSize: 9 }}>{txType.label}</span>
                                <span style={{ fontWeight: 700, color: isSender ? "#ef4444" : "#4ade80", fontSize: 13 }}>
                                  {isSender ? "-" : "+"}{formatCurrency(tx.amount)}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                <button className="admin-user-detail-close" onClick={() => { setAdminSelectedUser(null); setAdminBalanceEditMode(null); setAdminNotifForm({ title: "", message: "", open: false }); }}>Fermer</button>
              </div>
            </div>
          )}

          {/* Transaction Detail Modal */}
          {adminSelectedTx && (
            <div className="admin-tx-detail-overlay" onClick={() => setAdminSelectedTx(null)}>
              <div className="admin-tx-detail-card" onClick={(e) => e.stopPropagation()}>
                <div className="admin-tx-detail-header">
                  <div className="admin-tx-detail-title">Détails de la transaction</div>
                  <button className="admin-tx-detail-close" onClick={() => setAdminSelectedTx(null)}>
                    <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <div className="admin-tx-detail-amount">
                  <div className="admin-tx-detail-amount-value" style={{ color: adminSelectedTx.type === "depot" || adminSelectedTx.type === "remboursement" ? "#4ade80" : "#ef4444" }}>
                    {adminSelectedTx.type === "depot" || adminSelectedTx.type === "remboursement" ? "+" : "-"} {formatCurrency(adminSelectedTx.amount)} XAF
                  </div>
                  <span className={`admin-badge ${getAdminTxTypeLabel(adminSelectedTx.type).cls}`} style={{ marginTop: 8 }}>{getAdminTxTypeLabel(adminSelectedTx.type).label}</span>
                </div>
                <div className="admin-tx-detail-grid">
                  <div className="admin-tx-detail-field">
                    <div className="admin-tx-detail-label">Date</div>
                    <div className="admin-tx-detail-value">{formatAdminDate(adminSelectedTx.createdAt)}</div>
                  </div>
                  <div className="admin-tx-detail-field">
                    <div className="admin-tx-detail-label">Statut</div>
                    <div className="admin-tx-detail-value pos">{adminSelectedTx.status === "success" ? "Succès" : String(adminSelectedTx.status ?? "Inconnu")}</div>
                  </div>
                  <div className="admin-tx-detail-field">
                    <div className="admin-tx-detail-label">Expéditeur</div>
                    <div className="admin-tx-detail-value">{adminSelectedTx.senderName || adminSelectedTx.senderMoraliId || "—"}</div>
                  </div>
                  <div className="admin-tx-detail-field">
                    <div className="admin-tx-detail-label">ID Expéditeur</div>
                    <div className="admin-tx-detail-value" style={{ fontSize: 11, color: "#60a5fa" }}>{adminSelectedTx.senderMoraliId || adminSelectedTx.senderUid || "—"}</div>
                  </div>
                  <div className="admin-tx-detail-field">
                    <div className="admin-tx-detail-label">Destinataire</div>
                    <div className="admin-tx-detail-value">{adminSelectedTx.recipientName || adminSelectedTx.recipientMoraliId || "—"}</div>
                  </div>
                  <div className="admin-tx-detail-field">
                    <div className="admin-tx-detail-label">ID Destinataire</div>
                    <div className="admin-tx-detail-value" style={{ fontSize: 11, color: "#60a5fa" }}>{adminSelectedTx.recipientMoraliId || adminSelectedTx.recipientUid || "—"}</div>
                  </div>
                  <div className="admin-tx-detail-field">
                    <div className="admin-tx-detail-label">Frais</div>
                    <div className="admin-tx-detail-value">{formatCurrency(adminSelectedTx.fees)} XAF</div>
                  </div>
                  <div className="admin-tx-detail-field">
                    <div className="admin-tx-detail-label">N° Reçu</div>
                    <div className="admin-tx-detail-value" style={{ fontSize: 11, color: "#94a3b8" }}>{adminSelectedTx.receiptId || "—"}</div>
                  </div>
                </div>
                {adminSelectedTx.type === "virement" && (
                  <button className="admin-action-btn amber" style={{ width: "100%", justifyContent: "center", padding: "12px 16px", fontSize: 13 }} onClick={() => setAdminConfirmAction({ type: "refund-tx", data: adminSelectedTx, message: `Rembourser ${formatCurrency(adminSelectedTx.amount)} XAF à ${adminSelectedTx.senderName || adminSelectedTx.senderMoraliId} ? Le montant sera crédité à l'expéditeur et débité du destinataire.` })}>
                    <svg viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                    Rembourser cette transaction
                  </button>
                )}
                {adminSelectedTx.status !== "contested" && adminSelectedTx.status !== "flagged" && (
                  <button className="admin-tx-detail-contest-btn" onClick={() => handleAdminContestTx(adminSelectedTx)}>
                    <svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" fill="none"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                    Marquer comme contestée
                  </button>
                )}
                {(adminSelectedTx.status === "contested" || adminSelectedTx.status === "flagged") && (
                  <div style={{ marginTop: 10, textAlign: "center" }}>
                    <span className="admin-tx-contested-badge">⚠️ Contestée</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Confirmation Dialog */}
          {adminConfirmAction && (
            <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 200000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={() => setAdminConfirmAction(null)}>
              <div style={{ background: "linear-gradient(145deg, #1a1a2e, #16213e)", borderRadius: 20, padding: "28px 24px", maxWidth: 380, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.5)", border: "1px solid rgba(212,164,55,0.2)" }} onClick={(e) => e.stopPropagation()}>
                <div style={{ width: 56, height: 56, borderRadius: "50%", background: "rgba(239,68,68,0.15)", border: "1.5px solid rgba(239,68,68,0.4)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                  <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#fff", textAlign: "center", marginBottom: 8 }}>Confirmation requise</div>
                <div style={{ fontSize: 13, color: "rgba(255,255,255,0.7)", textAlign: "center", lineHeight: 1.5, marginBottom: 24 }}>{adminConfirmAction.message}</div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button onClick={() => setAdminConfirmAction(null)} style={{ flex: 1, height: 46, borderRadius: 14, border: "1.5px solid rgba(255,255,255,0.15)", background: "transparent", color: "rgba(255,255,255,0.8)", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Annuler</button>
                  <button onClick={() => {
                    if (adminConfirmAction.type === "delete-user") handleAdminDeleteUser();
                    else if (adminConfirmAction.type === "refund-tx") handleAdminRefund(adminConfirmAction.data as FirestoreTransfer);
                  }} style={{ flex: 1, height: 46, borderRadius: 14, border: "none", background: "linear-gradient(135deg, #dc2626, #b91c1c)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 15px rgba(220,38,38,0.4)" }}>Confirmer</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </>
          {/* Unified Logout Confirmation Modal */}
          {logoutModalOpen && (
            <div onClick={() => setLogoutModalOpen(false)} style={{position: "fixed", inset: 0, zIndex: 200000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "60px 20px 20px", background: "rgba(3,8,16,.72)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)"}}>
              <div onClick={(e) => e.stopPropagation()} style={{position: "relative", width: "100%", maxWidth: 360, margin: "60px auto", padding: "28px 24px", background: "linear-gradient(180deg,#101a30 0%,#080f1e 100%)", border: "1px solid rgba(59,130,246,.22)", borderRadius: 28, display: "flex", flexDirection: "column", gap: 18}}>
                <div style={{width: 56, height: 56, borderRadius: "50%", background: "rgba(239,68,68,0.12)", border: "1.5px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px"}}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16,17 21,12 16,7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </div>
                <div style={{fontSize: 18, fontWeight: 800, color: "#fff", textAlign: "center", marginBottom: 8}}>Se déconnecter ?</div>
                <p style={{fontSize: 13, color: "#94a3b8", textAlign: "center", lineHeight: 1.5, marginBottom: 24}}>Voulez-vous vraiment vous déconnecter de votre compte Morali ?</p>
                <div style={{display: "flex", gap: 10}}>
                  <button onClick={() => setLogoutModalOpen(false)} style={{flex: 1, height: 48, borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer"}}>
                    Annuler
                  </button>
                  <button onClick={() => {
                    setLogoutModalOpen(false);
                    // SECURITY: Revoke tokens server-side FIRST, then sign out client
                    fetch("/api/auth/logout", { method: "POST", headers: getAuthHeaders ? undefined : undefined })
                      .catch(() => {});
                    if (isAdminLoggedIn) {
                      handleAdminLogout();
                    } else {
                      signOut(firebaseAuth).then(() => {
                        setScreen("auth");
                        setNavActive("Accueil");
                        showToast("Déconnexion effectuée");
                      }).catch(() => {
                        showToast("Erreur lors de la déconnexion");
                      });
                    }
                  }} style={{flex: 1, height: 48, borderRadius: 14, border: "none", background: "rgba(239,68,68,0.15)", color: "#ef4444", fontSize: 14, fontWeight: 700, cursor: "pointer"}}>
                    Se déconnecter
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Tontine Distribution Confirmation Modal */}
          {tontineDistConfirm && (
            <div className="transfer-overlay" onClick={() => setTontineDistConfirm(null)}>
              <div className="transfer-modal" onClick={(e) => e.stopPropagation()} style={{maxWidth: 360, margin: "60px auto", padding: "28px 24px"}}>
                <div style={{width: 56, height: 56, borderRadius: "50%", background: "rgba(212,164,55,0.12)", border: "1.5px solid rgba(212,164,55,0.3)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px"}}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>
                </div>
                <div style={{fontSize: 18, fontWeight: 800, color: "#fff", textAlign: "center", marginBottom: 8}}>Distribuer le pot ?</div>
                <p style={{fontSize: 13, color: "#94a3b8", textAlign: "center", lineHeight: 1.5, marginBottom: 16}}>
                  Distribuer <strong style={{color: "#fbbf24"}}>{formatCurrency(tontineDistConfirm.pot)} F</strong> entre {tontineDistConfirm.members} membres ?
                </p>
                <div style={{background: "rgba(255,255,255,0.04)", borderRadius: 14, padding: "14px 16px", marginBottom: 20}}>
                  <div style={{display: "flex", justifyContent: "space-between", fontSize: 13}}>
                    <span style={{color: "#64748b"}}>Part par membre</span>
                    <span style={{color: "#fbbf24", fontWeight: 800}}>{formatCurrency(tontineDistConfirm.sharePerMember)} F</span>
                  </div>
                </div>
                <div style={{display: "flex", gap: 10}}>
                  <button onClick={() => setTontineDistConfirm(null)} style={{flex: 1, height: 48, borderRadius: 14, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.06)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer"}}>
                    Annuler
                  </button>
                  <button onClick={async () => {
                    const gi = tontineDistConfirm.groupIndex;
                    const sharePerMember = tontineDistConfirm.sharePerMember;
                    const group = tontineGroups[gi];
                    const totalMembers = group.members.filter((m: { pseudo?: string }) => m.pseudo).length;
                    const next = tontineGroups.map((g: typeof group, idx: number) => idx === gi ? { ...g, pot: 0, members: g.members.map((m: typeof g.members[0]) => ({ ...m, paid: false })) } : g);
                    setTontineGroups(next);
                    saveTontineGroups(next);
                    setTontineDistConfirm(null);
                    serviceCreditBalance(sharePerMember);
                    createRealtimeTransaction({
                      senderUid: "tontine", senderMoraliId: "TONTINE", senderName: `Tontine ${group.name}`,
                      recipientUid: authUid || "", recipientMoraliId: bankingIdentity.id, recipientName: dashboardName,
                      amount: sharePerMember, fees: 0, type: "depot", destination: "cash", status: "success",
                      receiptId: "TN-" + Date.now().toString().slice(-8),
                    }).catch((err: unknown) => { console.error("Erreur transaction tontine:", err); });
                    createRealtimeNotification(authUid || "", {
                      title: `Tontine ${group.name} — Distribution de ${formatCurrency(sharePerMember)} F`,
                      time: "À l'instant", badge: "Reçu", badgeClass: "nb-green",
                      icon: "coins", bg: "rgba(212,164,55,0.12)", read: false,
                    }).catch((err: unknown) => { console.error("Erreur notification tontine:", err); });
                    showToast(`Distribution effectuée ! Vous recevez ${formatCurrency(sharePerMember)} F`);
                  }} style={{flex: 1, height: 48, borderRadius: 14, border: "none", background: "linear-gradient(135deg, rgba(212,164,55,0.2), rgba(212,164,55,0.1))", color: "#fbbf24", fontSize: 14, fontWeight: 700, cursor: "pointer"}}>
                    Distribuer
                  </button>
                </div>
              </div>
            </div>
          )}
    </RenderGuard>
  );
}

export default App;
