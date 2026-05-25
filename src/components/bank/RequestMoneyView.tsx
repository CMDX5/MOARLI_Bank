'use client';
import React, { useEffect, useRef, useState } from "react";
import { serverTimestamp } from "firebase/firestore";
import { firebaseDb } from "@/lib/firebase";
import type { MoraliUser, FirestoreNotification, IconName } from "@/types/morali";
import { sanitizeInput, formatCurrency } from "@/lib/helpers";
import { AppIcon } from "./Icons";

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */
export interface MoneyRequest {
  id: string;
  senderUid: string;
  senderName: string;
  senderMoraliId: string;
  recipientUid: string;
  recipientName?: string;
  amount: number;
  message?: string;
  status: "pending" | "paid" | "cancelled";
  createdAt?: unknown;
}

export interface RequestMoneyViewProps {
  open: boolean;
  onClose: () => void;
  authUid: string;
  dashboardName: string;
  bankingIdentity: { id: string; rib: string };
  balance: number;
  showToast: (msg: string) => void;
  getAuthHeaders: () => Promise<Record<string, string>>;
  findMoraliUser: (rawValue: string) => Promise<{ user: MoraliUser | null; isSelf: boolean }>;
  createRealtimeNotification: (targetUid: string, item: FirestoreNotification) => Promise<void>;
}

/* ─────────────────────────────────────────────
   Component
   ───────────────────────────────────────────── */
export default function RequestMoneyView({
  open,
  onClose,
  authUid,
  dashboardName,
  bankingIdentity,
  balance,
  showToast,
  getAuthHeaders,
  findMoraliUser,
  createRealtimeNotification,
}: RequestMoneyViewProps) {
  const [stage, setStage] = useState<"search" | "amount" | "processing" | "success" | "error">("search");
  const [recipientQuery, setRecipientQuery] = useState("");
  const [recipient, setRecipient] = useState<MoraliUser | null>(null);
  const [amountInput, setAmountInput] = useState("");
  const [requestMessage, setRequestMessage] = useState("");
  const [processing, setProcessing] = useState(false);
  const [errorMsg, seterrorMsg] = useState("");
  const [searching, setSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [selfMatch, setSelfMatch] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const amountRef = useRef<HTMLInputElement | null>(null);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Reset ── */
  const resetFlow = () => {
    setStage("search");
    setRecipientQuery("");
    setRecipient(null);
    setAmountInput("");
    setRequestMessage("");
    setProcessing(false);
    seterrorMsg("");
    setSearching(false);
    setNotFound(false);
    setSelfMatch(false);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
  };

  const closeModal = () => {
    onClose();
    resetFlow();
  };

  /* ── Focus ── */
  useEffect(() => {
    if (open) {
      const t = window.setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    }
  }, [open]);

  /* ── Scroll lock ── */
  useEffect(() => {
    if (!open) return;
    const lock = () => { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; };
    window.addEventListener("scroll", lock, { passive: false });
    if (window.visualViewport) window.visualViewport.addEventListener("resize", lock);
    if (window.visualViewport) window.visualViewport.addEventListener("scroll", lock);
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("scroll", lock);
      if (window.visualViewport) window.visualViewport.removeEventListener("resize", lock);
      if (window.visualViewport) window.visualViewport.removeEventListener("scroll", lock);
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  /* ─────────────────────────────────────────────
     Search
     ───────────────────────────────────────────── */
  const searchRecipient = async (rawValue?: string) => {
    const source = (rawValue ?? recipientQuery).trim();
    if (!source || source.length < 2) {
      setRecipient(null);
      setNotFound(false);
      setSelfMatch(false);
      setSearching(false);
      return;
    }
    setSearching(true);
    setNotFound(false);
    setSelfMatch(false);
    setRecipient(null);

    await new Promise((r) => setTimeout(r, 350));

    try {
      const result = await findMoraliUser(source);
      if (result.isSelf) {
        setSelfMatch(true);
      } else if (!result.user) {
        setNotFound(true);
      } else {
        setNotFound(false);
        setSelfMatch(false);
        setRecipient(result.user);
        setStage("amount");
        setTimeout(() => {
          inputRef.current?.blur();
          (document.activeElement as HTMLElement | null)?.blur?.();
        }, 80);
      }
    } catch {
      setNotFound(true);
    } finally {
      setSearching(false);
    }
  };

  const handleQueryChange = (value: string) => {
    setRecipientQuery(value);
    setRecipient(null);
    setNotFound(false);
    setSelfMatch(false);
    setSearching(false);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (!value.trim() || value.trim().length < 2) return;
    searchDebounceRef.current = setTimeout(() => searchRecipient(value), 800);
  };

  /* ─────────────────────────────────────────────
     Submit request
     ───────────────────────────────────────────── */
  const submitRequest = async () => {
    const amount = Number(amountInput || 0);
    if (amount <= 0) { showToast("Montant invalide"); return; }
    if (amount > 1000000) { showToast("Limite : 1 000 000 FCFA max"); return; }
    if (!recipient) { showToast("Destinataire invalide"); return; }

    setProcessing(true);
    setStage("processing");

    try {
      const recipientUid = recipient.uid || recipient.account;
      const res = await fetch("/api/money-request", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({
          recipientUid,
          amount,
          message: sanitizeInput(requestMessage.trim(), 200) || undefined,
          senderUid: authUid,
          senderName: dashboardName || "Utilisateur",
          senderMoraliId: bankingIdentity.id || "",
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (data.success) {
        setStage("success");
      } else {
        showToast(data.error || "Erreur lors de l'envoi de la demande");
        seterrorMsg(data.error || "Erreur");
        setStage("error");
      }
    } catch {
      showToast("Erreur de connexion");
      seterrorMsg("Erreur de connexion");
      setStage("error");
    } finally {
      setProcessing(false);
    }
  };

  /* ─────────────────────────────────────────────
     Render
     ───────────────────────────────────────────── */
  if (!open) return null;

  return (
    <div className="transfer-overlay" onClick={closeModal}>
      <div className="transfer-modal" onClick={(e) => e.stopPropagation()}>

        {/* ── HEADER ── */}
        <div className="transaction-flow-head">
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {stage !== "search" && stage !== "processing" && (
              <button className="contact-modal-close" onClick={() => {
                if (stage === "amount") { setStage("search"); setRecipient(null); }
                else if (stage === "success" || stage === "error") { closeModal(); }
              }} aria-label="Retour" style={{ width: 38, height: 38 }}>
                <span style={{ fontSize: 18, lineHeight: 1 }}>←</span>
              </button>
            )}
            <div>
              <div className="transaction-flow-title">
                {stage === "search" && "Demander de l'argent"}
                {stage === "amount" && "Montant"}
                {stage === "processing" && "Envoi en cours..."}
                {stage === "success" && "Demande envoyée !"}
                {stage === "error" && "Échec"}
              </div>
              <div className="transaction-flow-sub">
                {stage === "search" && "Entrez l'ID Morali de la personne à qui demander."}
                {stage === "amount" && `Demande à ${recipient?.name || ""}`}
                {stage === "processing" && "Envoi de votre demande..."}
                {stage === "success" && "Votre demande a été envoyée avec succès"}
                {stage === "error" && "La demande n'a pas pu être envoyée"}
              </div>
            </div>
          </div>
          <button className="contact-modal-close" onClick={closeModal} aria-label="Fermer">
            <span style={{ fontSize: 20, lineHeight: 1 }}>×</span>
          </button>
        </div>

        {/* ── ÉTAPE 1 : RECHERCHE ── */}
        {stage === "search" && (
          <>
            <div className="transfer-search">
              <input
                ref={inputRef}
                type="text"
                inputMode="text"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="MORALI54321 ou @pseudo"
                value={recipientQuery}
                onChange={(e) => handleQueryChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); searchRecipient(); } }}
              />
              <button
                style={{
                  width: "100%", height: 52, borderRadius: 16, border: "none",
                  background: "linear-gradient(135deg, #22c55e, #16a34a)",
                  color: "#fff", fontSize: 15, fontWeight: 800,
                  fontFamily: "'Montserrat',sans-serif", cursor: "pointer",
                  opacity: searching ? 0.6 : 1,
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                }}
                onClick={() => searchRecipient()}
                disabled={searching}
              >
                {searching ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span className="transfer-search-spinner" />
                    Recherche en cours…
                  </span>
                ) : (
                  "Rechercher"
                )}
              </button>
            </div>

            {searching && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "14px 16px", borderRadius: 18, background: "rgba(34,197,94,.06)", border: "1px solid rgba(34,197,94,.15)" }}>
                <span className="transfer-search-spinner" />
                <span style={{ fontSize: 12, fontWeight: 700, color: "#4ade80" }}>Recherche du compte Morali en cours…</span>
              </div>
            )}

            {notFound && !searching && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "18px 16px", borderRadius: 18, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)", textAlign: "center" }}>
                <span style={{ fontSize: 24 }}>🔍</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#f87171" }}>Aucun compte trouvé</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", lineHeight: 1.4 }}>Vérifiez l'ID Morali ou le @pseudo et réessayez.</span>
              </div>
            )}

            {selfMatch && !searching && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "18px 16px", borderRadius: 18, background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.15)", textAlign: "center" }}>
                <span style={{ fontSize: 24 }}>👤</span>
                <span style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24" }}>C'est votre compte</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", lineHeight: 1.4 }}>Vous ne pouvez pas demander de l'argent à vous-même.<br />Entrez l'ID Morali d'un autre utilisateur.</span>
              </div>
            )}
          </>
        )}

        {/* ── ÉTAPE 2 : MONTANT + MESSAGE ── */}
        {stage === "amount" && recipient && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16, padding: "0 4px", flex: 1, overflowY: "auto" }}>
            {/* Recipient card */}
            <div className="transfer-recipient">
              <div>
                <div className="transfer-recipient-name">Demander à : {recipient.name}</div>
                <div className="transfer-recipient-copy">{recipient.pseudo} • {recipient.account}</div>
              </div>
              <div className="transfer-verified">Vérifié</div>
            </div>

            {/* Amount */}
            <div className="transfer-amount-stage">
              <div className="transfer-amount-value">
                FCFA {formatCurrency(Number(amountInput || 0))}
              </div>
              <div className="transfer-fee">Frais : Gratuit</div>
              {Number(amountInput || 0) > 1000000 && (
                <div style={{ width: '100%', padding: '8px 14px', borderRadius: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 11, fontWeight: 700, color: '#f87171', textAlign: 'center', lineHeight: 1.3 }}>
                  ⚠ Limite : 1 000 000 FCFA max.<br />
                  <span style={{ fontSize: 10, opacity: 0.8 }}>Réduisez le montant pour continuer.</span>
                </div>
              )}
              <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}>
                <input
                  ref={amountRef}
                  type="number"
                  inputMode="decimal"
                  pattern="[0-9]*"
                  placeholder="0"
                  value={amountInput}
                  onChange={(e) => {
                    let raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 9);
                    const num = parseInt(raw || "0", 10);
                    if (num > 1000000) raw = "1000000";
                    setAmountInput(raw);
                  }}
                  onFocus={() => {
                    setTimeout(() => { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; }, 100);
                    setTimeout(() => { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; }, 400);
                  }}
                  style={{
                    flex: 1, height: 48, borderRadius: 18,
                    border: Number(amountInput || 0) > 1000000 ? '1px solid rgba(239,68,68,.4)' : '1px solid rgba(34,197,94,.25)',
                    background: Number(amountInput || 0) > 1000000 ? 'rgba(239,68,68,.06)' : 'rgba(34,197,94,.06)',
                    padding: '0 18px', color: Number(amountInput || 0) > 1000000 ? '#f87171' : '#fff',
                    fontSize: 22, fontWeight: 800, fontFamily: "'Montserrat',sans-serif", outline: 'none', textAlign: 'center', letterSpacing: '.04em', MozAppearance: 'textfield', appearance: 'textfield', WebkitAppearance: 'none',
                  }}
                />
                <button className="transfer-max-btn" onClick={() => setAmountInput(String(1000000))} style={{ minHeight: 48, borderRadius: 18, fontSize: 13, padding: '0 14px' }}>MAX</button>
              </div>
            </div>

            {/* Message (optional) */}
            <div style={{ width: '100%' }}>
              <label style={{ fontSize: 11, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, display: "block" }}>
                Message (optionnel)
              </label>
              <textarea
                value={requestMessage}
                onChange={(e) => {
                  if (e.target.value.length <= 200) setRequestMessage(e.target.value);
                }}
                placeholder="Ex: Remboursement dîner, etc."
                maxLength={200}
                rows={2}
                style={{
                  width: "100%", height: 64, borderRadius: 14,
                  border: "1px solid rgba(255,255,255,.08)",
                  background: "rgba(255,255,255,.04)",
                  padding: "10px 14px", color: "#fff",
                  fontSize: 13, fontWeight: 600, fontFamily: "'Montserrat',sans-serif",
                  outline: "none", resize: "none", lineHeight: 1.4,
                }}
              />
              <div style={{ fontSize: 10, color: "var(--dim)", textAlign: "right", marginTop: 4 }}>
                {requestMessage.length}/200
              </div>
            </div>

            {/* Submit button */}
            <button
              style={{
                width: "100%", height: 52, borderRadius: 16, border: "none",
                background: Number(amountInput || 0) > 0 && Number(amountInput || 0) <= 1000000
                  ? "linear-gradient(135deg, #22c55e, #16a34a)"
                  : "rgba(255,255,255,.06)",
                color: Number(amountInput || 0) > 0 && Number(amountInput || 0) <= 1000000
                  ? "#fff"
                  : "var(--dim)",
                fontSize: 15, fontWeight: 800,
                fontFamily: "'Montserrat',sans-serif", cursor: "pointer",
                opacity: Number(amountInput || 0) > 0 && Number(amountInput || 0) <= 1000000 ? 1 : 0.5,
                pointerEvents: Number(amountInput || 0) > 0 && Number(amountInput || 0) <= 1000000 ? "auto" : "none",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}
              onClick={submitRequest}
            >
              <AppIcon name="send" size={18} stroke="#fff" />
              Envoyer la demande
            </button>
          </div>
        )}

        {/* ── ÉTAPE 3 : TRAITEMENT ── */}
        {stage === "processing" && (
          <div className="transaction-success-wrap" style={{ padding: "32px 20px 20px", gap: 20 }}>
            <div style={{ position: "relative", width: 80, height: 80 }}>
              <div className="pin-loader" style={{ width: 80, height: 80, borderWidth: 3, borderColor: "rgba(74,222,128,0.18)", borderTopColor: "#4ade80" }} />
              <div style={{ position: "absolute", inset: 14, borderRadius: "50%", background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.15)" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", marginBottom: 4, fontFamily: "'Montserrat',sans-serif" }}>Envoi en cours</div>
              <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>Votre demande est en cours d'envoi...<br />Veuillez ne pas fermer cette fenêtre.</div>
            </div>
            <div style={{ width: "100%", padding: "16px 18px", borderRadius: 18, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                <span style={{ fontSize: 11, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 1 }}>Destinataire</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{recipient?.name}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 11, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 1 }}>Montant</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#4ade80", fontFamily: "'Montserrat',sans-serif" }}>FCFA {formatCurrency(Number(amountInput || 0))}</span>
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="transfer-processing-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </div>
        )}

        {/* ── ÉTAPE 4 : SUCCÈS ── */}
        {stage === "success" && (
          <div className="transaction-success-wrap" style={{ padding: "24px 20px 18px", gap: 14 }}>
            <div className="transaction-success-icon" style={{ animation: "successPop 0.5s cubic-bezier(.34,1.56,.64,1) both" }}>
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: "#4ade80", marginBottom: 2, fontFamily: "'Montserrat',sans-serif", letterSpacing: "-0.5px" }}>Demande Envoyée</div>
              <div style={{ fontSize: 11, color: "var(--dim)" }}>{recipient?.name} recevra votre demande</div>
            </div>
            <div style={{ width: "100%", padding: "16px 18px", borderRadius: 18, background: "linear-gradient(135deg,rgba(34,197,94,0.1),rgba(34,197,94,0.04))", border: "1px solid rgba(34,197,94,0.2)", textAlign: "center" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: "var(--dim)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>Montant demandé</div>
              <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: "'Montserrat',sans-serif", letterSpacing: "-1px" }}>
                {formatCurrency(Number(amountInput || 0))} <span style={{ fontSize: 13, fontWeight: 600, color: "#4ade80" }}>FCFA</span>
              </div>
            </div>
            {requestMessage && (
              <div style={{ width: "100%", padding: "12px 16px", borderRadius: 14, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Message</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", lineHeight: 1.4 }}>{requestMessage}</div>
              </div>
            )}
            <div style={{ width: "100%", padding: "12px 16px", borderRadius: 14, background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", textAlign: "center" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#fbbf24", lineHeight: 1.4 }}>
                ⏳ En attente de confirmation<br />
                <span style={{ fontSize: 10, fontWeight: 600, color: "var(--dim)" }}>{recipient?.name} devra accepter votre demande pour recevoir les fonds.</span>
              </div>
            </div>
            <button
              style={{
                width: "100%", height: 48, borderRadius: 16, border: "none",
                background: "linear-gradient(135deg, #22c55e, #16a34a)",
                color: "#fff", fontSize: 14, fontWeight: 800,
                fontFamily: "'Montserrat',sans-serif", cursor: "pointer",
              }}
              onClick={closeModal}
            >
              Terminé
            </button>
          </div>
        )}

        {/* ── ÉTAPE 5 : ERREUR ── */}
        {stage === "error" && (
          <div className="transaction-success-wrap" style={{ padding: "24px 20px 18px", gap: 14 }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(239,68,68,0.12)", border: "2px solid rgba(239,68,68,0.3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: "#f87171", marginBottom: 2, fontFamily: "'Montserrat',sans-serif" }}>Demande échouée</div>
              <div style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.4 }}>{errorMsg || "Une erreur est survenue. Réessayez."}</div>
            </div>
            <div style={{ display: "flex", gap: 10, width: "100%" }}>
              <button
                style={{ flex: 1, height: 48, borderRadius: 16, border: "1px solid rgba(255,255,255,.1)", background: "rgba(255,255,255,.04)", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", cursor: "pointer" }}
                onClick={() => { setStage("amount"); seterrorMsg(""); }}
              >
                Réessayer
              </button>
              <button
                style={{ flex: 1, height: 48, borderRadius: 16, border: "none", background: "linear-gradient(135deg,#22c55e,#16a34a)", color: "#fff", fontSize: 13, fontWeight: 700, fontFamily: "'Montserrat',sans-serif", cursor: "pointer" }}
                onClick={closeModal}
              >
                Fermer
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
