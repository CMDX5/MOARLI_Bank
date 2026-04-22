'use client';
import React, { useEffect, useRef, useState } from "react";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  query,
  runTransaction,
  serverTimestamp,
  where,
} from "firebase/firestore";
import { firebaseAuth, firebaseDb } from "@/lib/firebase";
import type { MoraliUser, FirestoreMoraliUser, FirestoreTransfer, FirestoreNotification } from "@/types/morali";
import { sanitizeInput, formatCurrency } from "@/lib/helpers";
import { AppIcon } from "./Icons";

/* ─────────────────────────────────────────────
   Props
   ───────────────────────────────────────────── */
export interface TransferViewProps {
  open: boolean;
  onClose: () => void;
  onNavigate?: (screen: string) => void;
  authUid: string;
  dashboardName: string;
  bankingIdentity: { id: string; rib: string };
  balance: number;
  securitySettings: { biometrics: boolean; faceId: boolean; transactionValidation: boolean };
  showToast: (msg: string) => void;
  showQuickNotif: (type: string, label: string, amount: string, icon: string, color: string) => void;
  promptBiometric: () => Promise<boolean>;
  getAuthHeaders: () => Promise<Record<string, string>>;
  findMoraliUser: (rawValue: string) => Promise<{ user: MoraliUser | null; isSelf: boolean }>;
  createRealtimeNotification: (targetUid: string, item: FirestoreNotification) => Promise<void>;
  createRealtimeTransaction: (payload: FirestoreTransfer) => Promise<void>;
  openCameraScanner?: () => void;
  initialRecipientQuery?: string;
}

/* ─────────────────────────────────────────────
   Component
   ───────────────────────────────────────────── */
export default function TransferView({
  open,
  onClose,
  onNavigate,
  authUid,
  dashboardName,
  bankingIdentity,
  balance,
  securitySettings,
  showToast,
  showQuickNotif,
  promptBiometric,
  getAuthHeaders,
  findMoraliUser,
  createRealtimeNotification,
  createRealtimeTransaction,
  openCameraScanner,
  initialRecipientQuery,
}: TransferViewProps) {
  /* ── Transfer state ── */
  const [transferStage, setTransferStage] = useState<"search" | "amount" | "pin" | "processing" | "success" | "error">("search");
  const [transferRecipientQuery, setTransferRecipientQuery] = useState("");
  const [transferRecipient, setTransferRecipient] = useState<MoraliUser | null>(null);
  const [transferAmountInput, setTransferAmountInput] = useState("");
  const [transferPinOpen, setTransferPinOpen] = useState(false);
  const [transferPin, setTransferPin] = useState("");
  const [transferProcessing, setTransferProcessing] = useState(false);
  const [transferSuccess, setTransferSuccess] = useState(false);
  const [transferReceiptId, setTransferReceiptId] = useState("");
  const [transferSliding, setTransferSliding] = useState(false);
  const [transferSlideProgress, setTransferSlideProgress] = useState(0);
  const [transferSearching, setTransferSearching] = useState(false);
  const [transferNotFound, setTransferNotFound] = useState(false);
  const [transferSelfMatch, setTransferSelfMatch] = useState(false);
  const [transferPostBalance, setTransferPostBalance] = useState<number | null>(null);
  const [transferErrorMsg, setTransferErrorMsg] = useState("");
  const [transferConfirmOpen, setTransferConfirmOpen] = useState(false);
  const [pinVerifying, setPinVerifying] = useState(false);

  /* ── Transfer refs ── */
  const transferTrackRef = useRef<HTMLDivElement | null>(null);
  const transferHandleRef = useRef<HTMLDivElement | null>(null);
  const transferInputRef = useRef<HTMLInputElement | null>(null);
  const transferAmountRef = useRef<HTMLInputElement | null>(null);
  const transferDragRef = useRef({ active: false, startX: 0, startProgress: 0 });
  const transferSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Sync initialRecipientQuery from QR scanner ── */
  useEffect(() => {
    if (open && initialRecipientQuery) {
      setTransferRecipientQuery(initialRecipientQuery);
    }
  }, [open, initialRecipientQuery]);

  /* ── Focus input when opening ── */
  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => transferInputRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    }
  }, [open]);

  /* ─────────────────────────────────────────────
     Transfer Functions
     ───────────────────────────────────────────── */

  const resetTransferFlow = () => {
    setTransferStage("search");
    setTransferRecipientQuery("");
    setTransferRecipient(null);
    setTransferAmountInput("");
    setTransferPinOpen(false);
    setTransferPin("");
    setTransferProcessing(false);
    setTransferSuccess(false);
    setTransferReceiptId("");
    setTransferSliding(false);
    setTransferSlideProgress(0);
    setTransferSearching(false);
    setTransferNotFound(false);
    setTransferSelfMatch(false);
    setTransferPostBalance(null);
    setTransferErrorMsg("");
    setPinVerifying(false);
    if (transferSearchDebounceRef.current) {
      clearTimeout(transferSearchDebounceRef.current);
    }
  };

  const closeTransferModal = () => {
    onClose();
    resetTransferFlow();
  };

  const searchMoraliRecipient = async (rawValue?: string) => {
    const source = (rawValue ?? transferRecipientQuery).trim();
    if (!source || source.length < 2) {
      setTransferRecipient(null);
      setTransferNotFound(false);
      setTransferSelfMatch(false);
      setTransferSearching(false);
      return;
    }

    setTransferSearching(true);
    setTransferNotFound(false);
    setTransferSelfMatch(false);
    setTransferRecipient(null);

    // Small artificial delay for UX feedback
    await new Promise((r) => setTimeout(r, 350));

    try {
      const result = await findMoraliUser(source);
      if (result.isSelf) {
        setTransferSelfMatch(true);
        setTransferNotFound(false);
        setTransferRecipient(null);
      } else if (!result.user) {
        setTransferNotFound(true);
        setTransferSelfMatch(false);
        setTransferRecipient(null);
      } else {
        setTransferNotFound(false);
        setTransferSelfMatch(false);
        setTransferRecipient(result.user);
        setTransferStage("amount");
        window.setTimeout(() => {
          transferInputRef.current?.blur();
          const active = document.activeElement as HTMLElement | null;
          active?.blur?.();
        }, 80);
      }
    } catch {
      setTransferNotFound(true);
    } finally {
      setTransferSearching(false);
    }
  };

  const handleTransferRecipientQuery = (value: string) => {
    setTransferRecipientQuery(value);
    setTransferRecipient(null);
    setTransferNotFound(false);
    setTransferSelfMatch(false);
    setTransferSearching(false);

    if (transferSearchDebounceRef.current) {
      clearTimeout(transferSearchDebounceRef.current);
    }

    if (!value.trim() || value.trim().length < 2) {
      return;
    }

    // Auto-search after 800ms debounce
    transferSearchDebounceRef.current = setTimeout(() => {
      searchMoraliRecipient(value);
    }, 800);
  };

  const handleTransferPad = (value: string) => {
    if (!transferRecipient) {
      showToast("Validez d'abord le destinataire");
      return;
    }
    if (value === "back") {
      setTransferAmountInput((current) => current.slice(0, -1));
      return;
    }
    if (value === "max") {
      setTransferAmountInput(String(balance));
      return;
    }
    if (transferAmountInput.length >= 9) return;
    setTransferAmountInput((current) => (current === "0" ? value : `${current}${value}`));
  };

  const executeTransfer = async () => {
    const amount = Number(transferAmountInput || 0);
    const TRANSFER_CAP = 1000000;

    if (amount <= 0) {
      showToast("Montant invalide");
      return;
    }
    if (amount > TRANSFER_CAP) {
      showToast("Limite Standard : 1 000 000 FCFA max");
      return;
    }
    if (amount > balance) {
      showToast("Solde insuffisant pour ce virement");
      setTransferProcessing(true);
      setTimeout(() => setTransferProcessing(false), 100);
      return;
    }

    setTransferProcessing(true);
    const ms = Date.now().toString();
    const receiptId = `TRX-${ms.slice(-8)}`;
    try {
      if (authUid && transferRecipient) {
        const recipientUid = transferRecipient.uid || transferRecipient.account;
        if (recipientUid === authUid) {
          showToast("Transfert vers vous-même impossible");
          setTransferProcessing(false);
          return;
        }
        const senderRef = doc(firebaseDb, "moraliUsers", authUid);

        // Pre-flight: check sender suspension
        const senderSnapBefore = await getDoc(senderRef);
        if (senderSnapBefore.exists() && senderSnapBefore.data().accountStatus === "suspended") {
          showToast("Votre compte est suspendu. Opération impossible.");
          setTransferProcessing(false);
          return;
        }

        // ── PRIMARY: Atomic transfer via Admin SDK API ──
        // Debits sender + credits recipient + creates record in one Firestore transaction
        let transferDone = false;
        let apiError: string | null = null;
        try {
          const atomicRes = await fetch("/api/transfer/execute", {
            method: "POST",
            headers: await getAuthHeaders(),
            body: JSON.stringify({
              recipientUid,
              amount,
              senderName: dashboardName || "Utilisateur",
              senderMoraliId: bankingIdentity.id || "",
              receiptId,
            }),
          });
          const atomicData = await atomicRes.json().catch(() => ({}));
          if (atomicData.success) {
            transferDone = true;
            setTransferPostBalance(atomicData.newSenderBalance ?? (balance - amount));
          } else if (atomicRes.status === 400 || atomicRes.status === 403) {
            // Business logic error — show to user, don't fall through
            apiError = atomicData.error || "Erreur lors du virement";
          }
          // 500/503 errors — fall through to client-side fallback
        } catch {
          // Network error — fall through to client-side fallback
        }

        if (apiError) {
          showToast(apiError);
          setTransferProcessing(false);
          return;
        }

        // ── FALLBACK: Client-side Phase 1 + 2 + 3 ──
        if (!transferDone) {
          // Phase 1: Atomically debit sender (own doc — allowed by rules)
          await runTransaction(firebaseDb, async (tx) => {
            const senderDoc = await tx.get(senderRef);
            if (!senderDoc.exists()) throw new Error("SENDER_NOT_FOUND");
            const currentBalance = senderDoc.data().balance || 0;
            if (amount > currentBalance) throw new Error("INSUFFICIENT_BALANCE");
            tx.update(senderRef, { balance: currentBalance - amount, updatedAt: serverTimestamp() });
          });

          // Phase 2: Create transaction record in Firestore
          await addDoc(collection(firebaseDb, "transactions"), {
            senderUid: authUid, senderMoraliId: bankingIdentity.id, senderName: dashboardName,
            recipientUid, recipientMoraliId: transferRecipient.account, recipientName: transferRecipient.name,
            amount, fees: 0, type: "virement", status: "success", receiptId,
            createdAt: serverTimestamp(),
          });
          await createRealtimeTransaction({
            senderUid: authUid, senderMoraliId: bankingIdentity.id, senderName: dashboardName,
            recipientUid, recipientMoraliId: transferRecipient.account, recipientName: transferRecipient.name,
            amount, fees: 0, type: "virement", status: "success", receiptId,
          });

          // Phase 3: Credit recipient — create pending credit (recipient auto-claims via onSnapshot)
          try {
            await fetch("/api/directory/pending-credit", {
              method: "POST",
              headers: await getAuthHeaders(),
              body: JSON.stringify({
                recipientUid,
                amount,
                senderName: dashboardName || "Utilisateur",
                senderMoraliId: bankingIdentity.id || "",
                receiptId,
              }),
            });
          } catch {
            // Best-effort — recipient will auto-claim pending credits on next login/snapshot
          }
        }

        // Phase 4: Notify sender
        await createRealtimeNotification(authUid, {
          title: `Virement envoyé — FCFA ${formatCurrency(amount)}`,
          time: "À l'instant",
          badge: "Envoyé", badgeClass: "nb-blue", icon: "send", bg: "rgba(59,130,246,0.12)", read: false,
        });

        // Phase 5: Notify recipient immediately
        await createRealtimeNotification(recipientUid, {
          title: `Virement reçu — FCFA ${formatCurrency(amount)}`,
          time: "À l'instant",
          badge: "Reçu", badgeClass: "nb-green", icon: "receive", bg: "rgba(34,197,94,0.12)", read: false,
        });
      }
      // Calculate post-transfer balance (atomic API may have already set it)
      if (!transferDone) {
        setTransferPostBalance(balance - Number(transferAmountInput || 0));
      }
      setTransferReceiptId(receiptId);
      setTransferSuccess(true);
      setTransferStage("success");
      showQuickNotif(
        "debit",
        `Virement vers ${transferRecipient?.name || "utilisateur"}`,
        formatCurrency(Number(transferAmountInput || 0)),
        "send",
        "#D4A437"
      );
    } catch (err: unknown) {
      // Compensating transaction — refund sender if any phase after debit fails
      const msg = err instanceof Error ? err.message : "";
      if (msg !== "SENDER_NOT_FOUND" && msg !== "INSUFFICIENT_BALANCE") {
        try {
          const senderRef = doc(firebaseDb, "moraliUsers", authUid);
          await runTransaction(firebaseDb, async (tx) => {
            const senderDoc = await tx.get(senderRef);
            if (senderDoc.exists()) {
              const currentBal = senderDoc.data().balance || 0;
              tx.update(senderRef, { balance: currentBal + amount, updatedAt: serverTimestamp() });
            }
          });
          showToast("Virement échoué — votre solde a été remboursé");
        } catch {
          showToast("Erreur lors du virement. Vérifiez votre solde.");
        }
      } else if (msg === "INSUFFICIENT_BALANCE") {
        setTransferErrorMsg("Solde insuffisant pour effectuer ce virement.");
      } else if (msg === "SENDER_NOT_FOUND") {
        setTransferErrorMsg("Compte introuvable. Veuillez vous reconnecter.");
      }
      setTransferStage("error");
    } finally {
      setTransferProcessing(false);
    }
  };

  const handleTransferPinKey = async (value: string) => {
    if (!transferPinOpen || transferProcessing || transferSuccess || pinVerifying) return;
    if (value === "back") {
      setTransferPin((current) => current.slice(0, -1));
      return;
    }
    if (transferPin.length >= 4) return;
    const next = `${transferPin}${value}`.slice(0, 4);
    setTransferPin(next);
    if (next.length === 4) {
      // ── SERVER-SIDE PIN VERIFICATION ──
      setPinVerifying(true);
      try {
        const res = await fetch("/api/verify-pin", {
          method: "POST",
          headers: await getAuthHeaders(),
          body: JSON.stringify({
            pin: next,
            uid: authUid || "",
          }),
        });
        const data = await res.json();
        if (res.status === 429) {
          showToast(data.error || "Trop de tentatives");
          setTransferPin("");
          setPinVerifying(false);
          return;
        }
        if (res.status === 503 || !res.ok) {
          showToast("Service indisponible. Réessayez.");
          setTransferPin("");
          setPinVerifying(false);
          return;
        } else if (!data.valid) {
          setTransferPin("");
          showToast("Code PIN incorrect");
          setPinVerifying(false);
          return;
        }
        // PIN verified — transition to animated processing stage
        setTransferStage("processing");
        setPinVerifying(false);
        // Small delay for visual transition, then execute
        setTimeout(() => executeTransfer(), 400);
      } catch {
        showToast("Erreur de connexion");
        setTransferPin("");
        setPinVerifying(false);
      } finally {
        if (transferStage !== "processing") setPinVerifying(false);
      }
    }
  };

  const startTransferPin = async () => {
    if (!transferRecipient) {
      showToast("Entrez un ID Morali valide");
      return;
    }
    if (!transferAmountInput || Number(transferAmountInput) <= 0) {
      showToast("Saisissez un montant");
      return;
    }
    // ── Biometric check if enabled ──
    if (securitySettings.biometrics || securitySettings.faceId) {
      const bioOk = await promptBiometric();
      if (!bioOk) {
        showToast("Authentification biométrique annulée");
        return;
      }
    }

    // ── Transaction validation for large amounts ──
    const amount = Number(transferAmountInput || 0);
    if (securitySettings.transactionValidation && amount >= 50000) {
      setTransferConfirmOpen(true);
      return;
    }

    setTransferSliding(true);
    setTransferSlideProgress(100);
    if (navigator.vibrate) navigator.vibrate(12);
    setTimeout(() => {
      setTransferSliding(false);
      setTransferSlideProgress(0);
      setTransferPinOpen(true);
      setTransferStage("pin");
    }, 320);
  };

  const confirmTransferAndProceed = () => {
    setTransferConfirmOpen(false);
    setTransferSliding(true);
    setTransferSlideProgress(100);
    if (navigator.vibrate) navigator.vibrate(12);
    setTimeout(() => {
      setTransferSliding(false);
      setTransferSlideProgress(0);
      setTransferPinOpen(true);
      setTransferStage("pin");
    }, 320);
  };

  const updateTransferDrag = (clientX: number) => {
    const track = transferTrackRef.current;
    const handle = transferHandleRef.current;
    const drag = transferDragRef.current;
    if (!track || !handle || !drag.active) return;
    const max = Math.max(track.offsetWidth - handle.offsetWidth - 6, 0);
    const delta = clientX - drag.startX;
    const nextPixels = Math.min(Math.max(drag.startProgress * max + delta, 0), max);
    const nextProgress = max > 0 ? (nextPixels / max) * 100 : 0;
    setTransferSlideProgress(nextProgress);
  };

  const endTransferDrag = () => {
    if (!transferDragRef.current.active) return;
    transferDragRef.current.active = false;
    if (transferSlideProgress >= 90) {
      startTransferPin();
    } else {
      setTransferSliding(false);
      setTransferSlideProgress(0);
    }
  };

  const beginTransferDrag = (clientX: number) => {
    if (transferPinOpen || transferProcessing || transferSuccess) return;
    transferDragRef.current = {
      active: true,
      startX: clientX,
      startProgress: transferSlideProgress / 100,
    };
    setTransferSliding(true);
  };

  const shareTransferReceipt = async () => {
    const text = `Reçu Morali Pay\nTransaction: ${transferReceiptId}\nDestinataire: ${transferRecipient?.name ?? "—"}\nMontant: FCFA ${formatCurrency(Number(transferAmountInput || 0))}\nFrais: Gratuit`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Reçu Morali Pay", text });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      showToast("Reçu prêt à partager");
    } catch {
      showToast("Partage annulé");
    }
  };

  /* ─────────────────────────────────────────────
     Effects
     ───────────────────────────────────────────── */

  // Drag handler listeners
  useEffect(() => {
    if (!open) return;

    const handleMouseMove = (event: MouseEvent) => updateTransferDrag(event.clientX);
    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches[0]) updateTransferDrag(event.touches[0].clientX);
    };
    const handleMouseUp = () => endTransferDrag();
    const handleTouchEnd = () => endTransferDrag();

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("touchmove", handleTouchMove, { passive: true });
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("touchend", handleTouchEnd);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [open, transferSlideProgress]);

  // Scroll lock when open
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
     Render
     ───────────────────────────────────────────── */

  if (!open && !transferConfirmOpen) return null;

  return (
    <>
      {/* ── Transfer modal ── */}
      {open && (
        <div className="transfer-overlay" onClick={closeTransferModal}>
          <div className="transfer-modal" onClick={(event) => event.stopPropagation()}>

            {/* ====== HEADER ====== */}
            <div className="transaction-flow-head">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {transferStage !== "search" && transferStage !== "processing" && transferStage !== "error" && (
                  <button className="contact-modal-close" onClick={() => {
                    if (transferStage === "pin") setTransferStage("amount");
                    else if (transferStage === "amount") { setTransferStage("search"); setTransferRecipient(null); }
                    else if (transferStage === "success") { closeTransferModal(); onNavigate?.("dashboard"); }
                  }} aria-label="Retour" style={{ width: 38, height: 38 }}>
                    <span style={{ fontSize: 18, lineHeight: 1 }}>←</span>
                  </button>
                )}
                <div>
                  <div className="transaction-flow-title">
                    {transferStage === "search" && "Nouveau virement"}
                    {transferStage === "amount" && "Montant"}
                    {transferStage === "pin" && "Confirmer"}
                    {transferStage === "processing" && "Traitement..."}
                    {transferStage === "success" && "Virement envoyé"}
                    {transferStage === "error" && "Échec"}
                  </div>
                  <div className="transaction-flow-sub">
                    {transferStage === "search" && "Entrez un ID Morali pour commencer le virement."}
                    {transferStage === "amount" && `Vers ${transferRecipient?.name || ""}`}
                    {transferStage === "pin" && "Saisissez votre code PIN pour valider."}
                    {transferStage === "processing" && "Virement en cours de traitement..."}
                    {transferStage === "success" && "Fonds transférés avec succès"}
                    {transferStage === "error" && "Le virement n'a pas pu aboutir"}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {transferStage === "search" && (
                  <button className="btn-camera-top" onClick={openCameraScanner} aria-label="Scanner" style={{ width: 38, height: 38, background: "rgba(59,130,246,.1)", borderColor: "rgba(59,130,246,.25)", boxShadow: "none" }}>
                    <AppIcon name="camera" size={16} stroke="#60a5fa" />
                  </button>
                )}
                <button className="contact-modal-close" onClick={closeTransferModal} aria-label="Fermer">
                  <span style={{ fontSize: 20, lineHeight: 1 }}>×</span>
                </button>
              </div>
            </div>

            {/* ====== ÉTAPE 1 : RECHERCHE ====== */}
            {transferStage === "search" && (
              <>
                <div className="transfer-search">
                  <input
                    id="recipientInput"
                    ref={transferInputRef}
                    type="text"
                    inputMode="text"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="MORALI54321 ou @pseudo"
                    value={transferRecipientQuery}
                    onChange={(e) => handleTransferRecipientQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        searchMoraliRecipient();
                      }
                    }}
                  />
                  <button
                    style={{
                      width: "100%", height: 52, borderRadius: 16, border: "none",
                      background: "linear-gradient(135deg, #3b82f6, #2563eb)",
                      color: "#fff", fontSize: 15, fontWeight: 800,
                      fontFamily: "'Montserrat',sans-serif", cursor: "pointer",
                      opacity: transferSearching ? 0.6 : 1,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                    }}
                    onClick={() => searchMoraliRecipient()}
                    disabled={transferSearching}
                  >
                    {transferSearching ? (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span className="transfer-search-spinner" />
                        Recherche en cours…
                      </span>
                    ) : (
                      "Rechercher"
                    )}
                  </button>
                </div>

                {transferSearching && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: "14px 16px", borderRadius: 18, background: "rgba(59,130,246,.06)", border: "1px solid rgba(59,130,246,.15)" }}>
                    <span className="transfer-search-spinner" />
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#60a5fa" }}>Recherche du compte Morali en cours…</span>
                  </div>
                )}

                {transferNotFound && !transferSearching && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "18px 16px", borderRadius: 18, background: "rgba(239,68,68,.06)", border: "1px solid rgba(239,68,68,.15)", textAlign: "center" }}>
                    <span style={{ fontSize: 24 }}>🔍</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#f87171" }}>Aucun compte trouvé</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", lineHeight: 1.4 }}>Vérifiez l'ID Morali ou le @pseudo et réessayez.</span>
                  </div>
                )}

                {transferSelfMatch && !transferSearching && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "18px 16px", borderRadius: 18, background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.15)", textAlign: "center" }}>
                    <span style={{ fontSize: 24 }}>👤</span>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "#fbbf24" }}>C'est votre compte</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", lineHeight: 1.4 }}>Vous ne pouvez pas effectuer un virement vers vous-même.<br />Entrez l'ID Morali d'un autre utilisateur.</span>
                  </div>
                )}
              </>
            )}

            {/* ====== ÉTAPE 2 : MONTANT ====== */}
            {transferStage === "amount" && transferRecipient && (
              <>
                <div className="transfer-recipient">
                  <div>
                    <div className="transfer-recipient-name">Vers : {transferRecipient.name}</div>
                    <div className="transfer-recipient-copy">{transferRecipient.pseudo} • {transferRecipient.account}</div>
                  </div>
                  <div className="transfer-verified">Vérifié</div>
                </div>

                <div className="transfer-amount-stage">
                  <div className="transfer-amount-value">
                    FCFA {formatCurrency(Number(transferAmountInput || 0))}
                  </div>
                  <div className="transfer-fee">Frais : Gratuit</div>
                  {Number(transferAmountInput || 0) > 1000000 && (
                    <div style={{ width: '100%', padding: '8px 14px', borderRadius: 12, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 11, fontWeight: 700, color: '#f87171', textAlign: 'center', lineHeight: 1.3 }}>
                      ⚠ Limite Standard : 1 000 000 FCFA max.<br />
                      <span style={{ fontSize: 10, opacity: 0.8 }}>Réduisez le montant pour continuer.</span>
                    </div>
                  )}
                  <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <input
                      ref={transferAmountRef}
                      type="number"
                      inputMode="decimal"
                      pattern="[0-9]*"
                      placeholder="0"
                      value={transferAmountInput}
                      onChange={(e) => {
                        let raw = e.target.value.replace(/[^0-9]/g, '').slice(0, 9);
                        const num = parseInt(raw || "0", 10);
                        if (num > 1000000) raw = "1000000";
                        setTransferAmountInput(raw);
                      }}
                      onFocus={() => {
                        setTimeout(() => { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; }, 100);
                        setTimeout(() => { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; }, 400);
                      }}
                      style={{
                        flex: 1, height: 48, borderRadius: 18,
                        border: Number(transferAmountInput || 0) > 1000000 ? '1px solid rgba(239,68,68,.4)' : '1px solid rgba(59,130,246,.25)',
                        background: Number(transferAmountInput || 0) > 1000000 ? 'rgba(239,68,68,.06)' : 'rgba(59,130,246,.06)',
                        padding: '0 18px', color: Number(transferAmountInput || 0) > 1000000 ? '#f87171' : '#fff',
                        fontSize: 22, fontWeight: 800, fontFamily: "'Montserrat',sans-serif", outline: 'none', textAlign: 'center', letterSpacing: '.04em', MozAppearance: 'textfield', appearance: 'textfield', WebkitAppearance: 'none',
                      }}
                    />
                    <button className="transfer-max-btn" onClick={() => setTransferAmountInput(String(1000000))} style={{ minHeight: 48, borderRadius: 18, fontSize: 13, padding: '0 14px' }}>MAX</button>
                  </div>
                </div>

                <div className="transfer-slider-wrap">
                  <div className="transfer-slider-track" ref={transferTrackRef} style={Number(transferAmountInput || 0) > 1000000 ? { opacity: 0.35, pointerEvents: 'none' } : undefined}>
                    <div className="transfer-slider-fill" style={{ width: `${transferSlideProgress}%` }} />
                    <div
                      id="sliderHandle"
                      ref={transferHandleRef}
                      className={`transfer-slider-button ${transferSliding ? "sliding" : ""}`}
                      style={{ transform: `translateX(calc(${transferSlideProgress}% - ${transferSlideProgress === 0 ? 0 : transferSlideProgress * 0.54}px))` }}
                      onMouseDown={(event) => beginTransferDrag(event.clientX)}
                      onTouchStart={(event) => beginTransferDrag(event.touches[0]?.clientX ?? 0)}
                    >
                      <AppIcon name="send" size={18} stroke="#fff" />
                    </div>
                    <div className="transfer-slider-text" style={{ opacity: Math.max(0, 1 - transferSlideProgress / 70) }}>
                      Glisser pour envoyer
                    </div>
                  </div>
                </div>
              </>
            )}

            {/* ====== ÉTAPE 3 : PIN ====== */}
            {transferStage === "pin" && (
              <>
                <div className="pin-dots">
                  {[0, 1, 2, 3].map((index) => (
                    <div key={index} className={`pin-dot ${index < transferPin.length ? (pinVerifying ? "verifying" : "filled") : ""}`} />
                  ))}
                </div>
                {pinVerifying && (
                  <div className="transaction-success-wrap">
                    <div className="pin-loader" />
                    <div className="transaction-success-copy">Vérification du code PIN…</div>
                  </div>
                )}
                {!pinVerifying && (
                  <div className="transfer-pin-keypad" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 12, width: '100%' }}>
                    {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"].map((key, index) => (
                      key ? (
                        <button key={key + index} className="transfer-pin-key" style={{ width: '100%', minHeight: 58, fontSize: 24 }} onClick={() => handleTransferPinKey(key)}>
                          {key === "back" ? "⌫" : key}
                        </button>
                      ) : <div key={`empty-${index}`} className="transfer-pin-empty" style={{ minHeight: 58 }} />
                    ))}
                  </div>
                )}
              </>
            )}

            {/* ====== ÉTAPE 4 : TRAITEMENT ANIMÉ ====== */}
            {transferStage === "processing" && (
              <div className="transaction-success-wrap" style={{ padding: "32px 20px 20px", gap: 20 }}>
                {/* Animated checkmark circle */}
                <div style={{ position: "relative", width: 80, height: 80 }}>
                  <div className="pin-loader" style={{ width: 80, height: 80, borderWidth: 3, borderColor: "rgba(96,165,250,0.18)", borderTopColor: "#60a5fa" }} />
                  <div style={{ position: "absolute", inset: 14, borderRadius: "50%", background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.15)" }} />
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.7 }}>
                      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                    </svg>
                  </div>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: "#fff", marginBottom: 4, fontFamily: "'Montserrat',sans-serif" }}>Traitement en cours</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5 }}>Votre virement est en cours de traitement.<br />Veuillez ne pas fermer cette fenêtre.</div>
                </div>
                <div style={{ width: "100%", padding: "16px 18px", borderRadius: 18, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 1 }}>Destinataire</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{transferRecipient?.name}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ fontSize: 11, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 1 }}>Montant</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa", fontFamily: "'Montserrat',sans-serif" }}>FCFA {formatCurrency(Number(transferAmountInput || 0))}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 1 }}>Frais</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#4ade80" }}>Gratuit</span>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
                  {[0, 1, 2].map((i) => (
                    <div key={i} className="transfer-processing-dot" style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", animationDelay: `${i * 0.2}s` }} />
                  ))}
                </div>
              </div>
            )}

            {/* ====== ÉTAPE 5 : SUCCÈS ====== */}
            {transferStage === "success" && (
              <div className="transaction-success-wrap" style={{ padding: "24px 20px 18px", gap: 14 }}>
                <div className="transaction-success-icon" style={{ animation: "successPop 0.5s cubic-bezier(.34,1.56,.64,1) both" }}>
                  <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "#4ade80", marginBottom: 2, fontFamily: "'Montserrat',sans-serif", letterSpacing: "-0.5px" }}>Virement Effectué</div>
                  <div style={{ fontSize: 11, color: "var(--dim)" }}>Fonds transférés avec succès</div>
                </div>
                <div style={{ width: "100%", padding: "16px 18px", borderRadius: 18, background: "linear-gradient(135deg,rgba(34,197,94,0.1),rgba(59,130,246,0.06))", border: "1px solid rgba(34,197,94,0.2)", textAlign: "center" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: "var(--dim)", letterSpacing: 1.5, textTransform: "uppercase", marginBottom: 4 }}>Montant envoyé</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: "#fff", fontFamily: "'Montserrat',sans-serif", letterSpacing: "-1px" }}>
                    {formatCurrency(Number(transferAmountInput || 0))} <span style={{ fontSize: 13, fontWeight: 600, color: "#4ade80" }}>FCFA</span>
                  </div>
                </div>
                <div style={{ width: "100%", padding: "14px 18px", borderRadius: 16, background: "rgba(59,130,246,0.08)", border: "1px solid rgba(59,130,246,0.18)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: "var(--dim)", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 }}>Nouveau solde</div>
                      <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", fontFamily: "'Montserrat',sans-serif", letterSpacing: "-0.5px" }}>
                        {formatCurrency(transferPostBalance !== null ? transferPostBalance : balance)} <span style={{ fontSize: 12, fontWeight: 600, color: "#60a5fa" }}>FCFA</span>
                      </div>
                    </div>
                    <div style={{ width: 42, height: 42, borderRadius: 12, background: "rgba(34,197,94,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#4ade80" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
                        <polyline points="17 6 23 6 23 12" />
                      </svg>
                    </div>
                  </div>
                </div>
                <div className="transfer-receipt">
                  <div className="transfer-receipt-line"><span>ID transaction</span><strong className="transfer-receipt-id">{transferReceiptId}</strong></div>
                  <div className="transfer-receipt-line"><span>Destinataire</span><strong>{transferRecipient?.name}</strong></div>
                  <div className="transfer-receipt-line"><span>Date</span><strong>{new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</strong></div>
                  <div className="transfer-receipt-line"><span>Statut</span><strong style={{ color: "#4ade80" }}>✓ Confirmé</strong></div>
                </div>
                <button className="transfer-share-btn" onClick={shareTransferReceipt} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                  Partager le reçu
                </button>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <button className="transfer-home-btn" onClick={() => { closeTransferModal(); onNavigate?.("dashboard"); showToast("Virement terminé"); }}>
                    Accueil
                  </button>
                  <button className="transfer-home-btn" onClick={() => { resetTransferFlow(); setTransferStage("search"); transferInputRef.current?.focus(); }} style={{ background: "rgba(59,130,246,0.1)", borderColor: "rgba(59,130,246,0.3)", color: "#60a5fa" }}>
                    Nouveau virement
                  </button>
                </div>
              </div>
            )}

            {/* ====== ÉTAPE 6 : ERREUR ====== */}
            {transferStage === "error" && (
              <div className="transaction-success-wrap" style={{ padding: "32px 20px 20px", gap: 18 }}>
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(239,68,68,0.1)", border: "2px solid rgba(239,68,68,0.25)", display: "flex", alignItems: "center", justifyContent: "center", animation: "successPop 0.5s cubic-bezier(.34,1.56,.64,1) both" }}>
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                </div>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 18, fontWeight: 900, color: "#ef4444", marginBottom: 4, fontFamily: "'Montserrat',sans-serif" }}>Virement échoué</div>
                  <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.6, maxWidth: "280px", margin: "0 auto" }}>{transferErrorMsg || "Une erreur est survenue. Veuillez réessayer."}</div>
                </div>
                <div style={{ width: "100%", padding: "14px 18px", borderRadius: 18, background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.12)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 11, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 1 }}>Destinataire</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{transferRecipient?.name}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 11, color: "var(--dim)", textTransform: "uppercase", letterSpacing: 1 }}>Montant</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#fff", fontFamily: "'Montserrat',sans-serif" }}>FCFA {formatCurrency(Number(transferAmountInput || 0))}</span>
                  </div>
                </div>
                <button className="transfer-share-btn" onClick={() => { setTransferErrorMsg(""); setTransferStage("pin"); setTransferPin(""); }} style={{ background: "#3b82f6" }}>
                  <span>Ressayer le virement</span>
                </button>
                <button className="transfer-home-btn" onClick={() => { closeTransferModal(); onNavigate?.("dashboard"); }}>
                  Retour à l'accueil
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Transaction validation confirmation sheet (≥50K FCFA) ── */}
      {transferConfirmOpen && (
        <div className="card-modal-overlay" onClick={() => setTransferConfirmOpen(false)}>
          <div className="confirm-sheet" onClick={(e) => e.stopPropagation()} style={{ position: "relative", top: "auto", margin: "auto" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
              <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(234,179,8,.12)", border: "1px solid rgba(234,179,8,.25)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /><path d="M12 8v4M12 16h.01" /></svg>
              </div>
              <div>
                <div className="confirm-sheet-title" style={{ marginBottom: 0 }}>Confirmer le transfert</div>
              </div>
            </div>
            <div className="confirm-sheet-copy">
              La validation des transactions est activée. Vous êtes sur le point d'envoyer un montant important.
            </div>
            <div style={{ padding: "14px 16px", borderRadius: 16, background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.06)", marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>Destinataire</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>{transferRecipient?.name || "—"}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>Montant</span>
                <span style={{ fontSize: 16, fontWeight: 900, color: "#22c55e", fontFamily: "'Montserrat',sans-serif" }}>{formatCurrency(Number(transferAmountInput || 0))} FCFA</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 12, color: "#94a3b8" }}>Frais</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#22c55e" }}>Gratuit</span>
              </div>
            </div>
            <div className="confirm-sheet-actions">
              <button className="secondary" onClick={() => setTransferConfirmOpen(false)}>Annuler</button>
              <button className="danger" onClick={confirmTransferAndProceed}>Confirmer</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Transfer-specific CSS ── */}
      <style>{`
.transfer-overlay{position:fixed;inset:0;z-index:9999;background:rgba(3,8,16,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);display:flex;align-items:flex-start;justify-content:center;padding:60px 20px 20px;animation:fadeIn .3s ease;overflow:hidden}
.transfer-modal{position:relative;width:100%;max-width:100%;max-height:100%;overflow:hidden;margin:0;flex-shrink:0;background:linear-gradient(180deg,#101a30 0%,#080f1e 100%);border:1px solid rgba(59,130,246,.22);border-radius:28px;padding:22px 20px calc(4px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:18px;opacity:1}
.transfer-modal::-webkit-scrollbar{width:4px}.transfer-modal::-webkit-scrollbar-track{background:transparent}.transfer-modal::-webkit-scrollbar-thumb{background:rgba(96,165,250,.45);border-radius:4px}
@keyframes transferModalIn{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}
.transfer-search{display:flex;flex-direction:column;gap:10px}
.transfer-search input{width:100%;height:54px;border-radius:18px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.04);color:#fff;padding:0 16px;font-size:15px;outline:none}
.transfer-search input:focus{border-color:rgba(59,130,246,.45)}
.transfer-recipient{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-radius:18px;background:rgba(34,197,94,.1);border:1px solid rgba(34,197,94,.28)}
.transfer-recipient-name{font-size:14px;font-weight:800;color:#fff}
.transfer-recipient-copy{font-size:11px;color:#4ade80;font-weight:700}
.transfer-verified{padding:4px 8px;border-radius:999px;background:rgba(34,197,94,.16);color:#4ade80;font-size:10px;font-weight:900}
.transfer-search-hint{padding:14px 16px;border-radius:18px;background:rgba(255,255,255,.03);border:1px dashed rgba(255,255,255,.08);font-size:12px;line-height:1.55;color:#8ea0c6;text-align:center}
.transfer-amount-stage{display:flex;flex-direction:column;gap:12px;align-items:center;text-align:center}
.transfer-amount-value{font-family:'Montserrat',sans-serif;font-size:40px;font-weight:900;color:#fff;line-height:1}
.transfer-amount-currency{font-size:16px;color:#60a5fa;font-weight:700;margin-left:8px}
.transfer-fee{font-size:12px;font-weight:800;color:#4ade80}
.transfer-max-btn{border:none;background:rgba(59,130,246,.12);border:1px solid rgba(59,130,246,.3);color:#60a5fa;border-radius:12px;padding:8px 12px;font-size:11px;font-weight:800;cursor:pointer}
.transfer-slider-wrap{display:flex;flex-direction:column;gap:10px}
.transfer-slider-track{position:relative;overflow:hidden;height:62px;border-radius:999px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08)}
.transfer-slider-fill{position:absolute;left:0;top:0;bottom:0;border-radius:inherit;background:linear-gradient(90deg,rgba(59,130,246,.35),rgba(59,130,246,.12));transition:width .16s ease}
.transfer-slider-button{position:absolute;left:5px;top:4px;width:50px;height:50px;border-radius:50%;background:#3b82f6;display:flex;align-items:center;justify-content:center;color:#fff;box-shadow:0 10px 24px rgba(37,99,235,.32);transition:all .3s ease;touch-action:none;user-select:none;will-change:transform}
.transfer-slider-button.sliding{left:calc(100% - 56px);transition:none}
.transfer-slider-text{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:800;color:#cbd5e1;letter-spacing:.03em;pointer-events:none}
.transfer-receipt{display:flex;flex-direction:column;gap:14px;padding:20px 18px;border-radius:24px;background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.15);border-style:dashed}
.transfer-receipt-line{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:12px;color:#94a3b8}
.transfer-receipt-line strong{color:#fff}
.transfer-receipt-amount{font-size:30px;font-weight:900;color:#fff;font-family:'Montserrat',sans-serif}
.transfer-receipt-id{font-family:'Courier New',monospace;color:#60a5fa;font-size:12px;font-weight:700}
.transfer-share-btn{width:100%;height:50px;border:none;border-radius:18px;background:#22c55e;color:#08110a;font-weight:900;cursor:pointer}
.transfer-search-spinner{display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid rgba(96,165,250,.3);border-top-color:#60a5fa;animation:spin .7s linear infinite;flex-shrink:0}
.transfer-home-btn{width:100%;height:52px;border-radius:18px;border:1.5px solid rgba(255,255,255,.18);background:transparent;color:#cbd5e1;font-size:14px;font-weight:800;font-family:'Montserrat',sans-serif;letter-spacing:.02em;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all .2s ease}
.transfer-home-btn:active{transform:scale(.97);background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.3)}
.transfer-processing-dot{animation:dotPulse 1.2s ease-in-out infinite}
@keyframes dotPulse{0%,80%,100%{opacity:.25;transform:scale(.8)}40%{opacity:1;transform:scale(1.2)}}
.pin-dot.verifying{background:rgba(96,165,250,.3);border-color:rgba(96,165,250,.4);animation:pinPulseVerify .6s ease-in-out infinite alternate}
@keyframes pinPulseVerify{from{opacity:.4;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
.transfer-keypad.locked{opacity:.42;pointer-events:none;filter:grayscale(.12)}.transfer-keypad.active{opacity:1}
.transfer-modal{gap:12px !important;padding-bottom:calc(4px + env(safe-area-inset-bottom, 0px)) !important}
.transfer-amount-stage{gap:8px !important}.transfer-amount-value{font-size:28px !important}.transfer-slider-wrap{margin-top:2px !important}
.transfer-key:disabled{cursor:not-allowed}
.transfer-pin-keypad{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:8px}
.transfer-pin-key{min-height:56px;border:none;border-radius:18px;background:rgba(255,255,255,.045);border:1px solid rgba(255,255,255,.08);color:#fff;font-size:24px;font-weight:800;box-shadow:0 10px 24px rgba(0,0,0,.18),inset 0 1px 0 rgba(255,255,255,.04);transition:all .2s ease;cursor:pointer}
.transfer-pin-key:active{transform:scale(.96);background:rgba(59,130,246,.14);border-color:rgba(59,130,246,.34)}
.transfer-pin-empty{min-height:56px}
.confirm-sheet{width:100%;max-width:360px;background:linear-gradient(180deg,#15203a 0%,#0d1629 100%);border:1px solid rgba(59,130,246,.18);border-radius:24px;padding:22px 20px;box-shadow:0 20px 60px rgba(0,0,0,.45)}
.confirm-sheet-title{font-family:'Montserrat',sans-serif;font-size:18px;font-weight:800;color:#fff;margin-bottom:8px}
.confirm-sheet-copy{font-size:13px;line-height:1.6;color:#94a3b8;margin-bottom:18px}
.confirm-sheet-actions{display:flex;gap:10px}
.confirm-sheet-actions button{flex:1;min-height:48px;border-radius:16px;border:none;font-weight:700;font-size:14px;cursor:pointer}
.confirm-sheet-actions .secondary{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);color:#cbd5e1}
.confirm-sheet-actions .danger{background:linear-gradient(135deg,#3b82f6 0%,#2563eb 100%);color:#fff;box-shadow:0 10px 24px rgba(59,130,246,.28)}
@keyframes panelSpringUp{0%{opacity:0;transform:translateY(100%)}100%{opacity:1;transform:translateY(0)}}
@keyframes successPop{0%{transform:scale(0);opacity:0}60%{transform:scale(1.1);opacity:1}100%{transform:scale(1);opacity:1}}
      `}</style>
    </>
  );
}
