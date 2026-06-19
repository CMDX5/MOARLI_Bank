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
import type { MoraliUser, FirestoreMoraliUser, FirestoreTransfer, FirestoreNotification, IconName } from "@/types/morali";
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
  securitySettings: { faceId: boolean; deviceAlerts: boolean; transactionValidation: boolean };
  showToast: (msg: string) => void;
  showQuickNotif: (type: string, label: string, amount: string, icon: IconName, color: string) => void;
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
  // "choice" = écran de sélection Banque/Morali (étape initiale)
  // "bank" = formulaire de virement bancaire (IBAN/BIC)
  const [transferStage, setTransferStage] = useState<"choice" | "search" | "amount" | "pin" | "processing" | "success" | "error" | "bank">("choice");
  const [bankForm, setBankForm] = useState({
    iban: "",
    bic: "",
    holderName: "",
    bankName: "",
    amount: "",
    motif: "",
  });
  const [bankProcessing, setBankProcessing] = useState(false);
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
  const transferPinInputRef = useRef<HTMLInputElement | null>(null);
  const transferDragRef = useRef({ active: false, startX: 0, startProgress: 0 });
  const transferSearchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref vers le conteneur scrollable du formulaire Banque — utilisé pour
  // empêcher le restoreScrollPositions de MoraliApp de ramener le scroll à 0
  // pendant que l'utilisateur consulte le formulaire.
  const bankScrollRef = useRef<HTMLDivElement | null>(null);

  /* ── Sync initialRecipientQuery from QR scanner or saved contact click ── */
  useEffect(() => {
    if (open && initialRecipientQuery) {
      setTransferRecipientQuery(initialRecipientQuery);
      const timer = setTimeout(() => searchMoraliRecipient(initialRecipientQuery), 150);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialRecipientQuery]);

  /* ── Focus input when opening ── */
  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => transferInputRef.current?.focus(), 60);
      return () => clearTimeout(timer);
    }
  }, [open]);

  /* ── BUG FIX: préserver la position de scroll du formulaire Banque ──
     Sur l'étape Banque (plein écran), le scroll "rebondit" et revient à la
     position initiale à cause du blockScroll listener de MoraliApp qui
     appelle preventDefault() sur les scrolls qui bouillonnent jusqu'au
     document. Solution :
     1) stopPropagation sur les événements scroll/touchmove/wheel au niveau
        du conteneur pour qu'ils n'atteignent jamais le document.
     2) history.scrollRestoration = "manual" pour désactiver la restauration
        auto du navigateur.
     3) Sauvegarder/restaurer la position autour des resize du visualViewport
        (ouverture/fermeture du clavier). */
  useEffect(() => {
    if (!open || transferStage !== "bank") return;
    const el = bankScrollRef.current;
    if (!el) return;

    // 1) Désactiver la restauration auto du navigateur
    const prevRestoration = "scrollRestoration" in history ? history.scrollRestoration : "auto";
    if ("scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }

    // 2) Empêcher les événements de scroll de bouillonner vers le document
    //    (le blockScroll de MoraliApp les annulerait sinon → effet élastique)
    const stopProp = (e: Event) => {
      e.stopPropagation();
    };
    el.addEventListener("scroll", stopProp, { passive: true });
    el.addEventListener("touchmove", stopProp, { passive: true });
    el.addEventListener("wheel", stopProp, { passive: true });

    // 3) Sauvegarder/restaurer la position autour des resize du visualViewport
    let savedTop = el.scrollTop;
    const capturePos = () => {
      if (bankScrollRef.current && bankScrollRef.current.scrollTop > 0) {
        savedTop = bankScrollRef.current.scrollTop;
      }
    };
    const restorePos = () => {
      if (bankScrollRef.current && savedTop > 0) {
        requestAnimationFrame(() => {
          if (bankScrollRef.current) bankScrollRef.current.scrollTop = savedTop;
        });
      }
    };
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", capturePos);
      window.visualViewport.addEventListener("resize", restorePos);
    }

    // 4) Capturer la position en continu pendant le scroll (best-effort)
    const captureOnScroll = () => {
      if (bankScrollRef.current && bankScrollRef.current.scrollTop > 0) {
        savedTop = bankScrollRef.current.scrollTop;
      }
    };
    el.addEventListener("scroll", captureOnScroll, { passive: true });

    return () => {
      if ("scrollRestoration" in history) {
        history.scrollRestoration = prevRestoration;
      }
      el.removeEventListener("scroll", stopProp);
      el.removeEventListener("touchmove", stopProp);
      el.removeEventListener("wheel", stopProp);
      el.removeEventListener("scroll", captureOnScroll);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", capturePos);
        window.visualViewport.removeEventListener("resize", restorePos);
      }
    };
  }, [open, transferStage]);

  /* ─────────────────────────────────────────────
     Transfer Functions
     ───────────────────────────────────────────── */

  const resetTransferFlow = () => {
    setTransferStage("choice");
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
    setBankForm({ iban: "", bic: "", holderName: "", bankName: "", amount: "", motif: "" });
    setBankProcessing(false);
    if (transferSearchDebounceRef.current) {
      clearTimeout(transferSearchDebounceRef.current);
    }
    // Force cleanup any stuck pointer-events or scroll locks
    document.body.style.pointerEvents = '';
    document.body.style.overflow = '';
    document.body.style.touchAction = '';
    document.body.classList.remove('lock-scroll');
    // Chrome: force repaint pour éliminer le ghost layer backdrop-filter
    requestAnimationFrame(() => {
      document.body.style.transform = 'translateZ(0)';
      requestAnimationFrame(() => { document.body.style.transform = ''; });
    });
  };

  // Global body cleanup helper — removes ALL stuck styles
  const forceCleanupBody = () => {
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
    document.body.style.pointerEvents = "";
    document.documentElement.style.pointerEvents = "";
    document.body.classList.remove('lock-scroll');
    // Also remove any stuck scroll listeners
    if (scrollLockFnRef.current) {
      window.removeEventListener("scroll", scrollLockFnRef.current);
      if (window.visualViewport) window.visualViewport.removeEventListener("resize", scrollLockFnRef.current);
      if (window.visualViewport) window.visualViewport.removeEventListener("scroll", scrollLockFnRef.current);
      scrollLockFnRef.current = null;
    }
  };

  const closeTransferModal = () => {
    // Immediately restore body styles
    forceCleanupBody();
    // Defer state cleanup to next tick to prevent UI freeze
    window.setTimeout(() => {
      onClose();
      resetTransferFlow();
      // Double-check cleanup after React re-renders
      window.setTimeout(() => forceCleanupBody(), 100);
    }, 0);
  };

  /* ── Submit bank transfer (IBAN/BIC) ──
     Crée une transaction "retrait" avec destination="banque:IBAN:BIC" pour
     débiter le solde Morali du wallet vers un compte bancaire externe. */
  const submitBankTransfer = async () => {
    const numericAmount = parseInt(bankForm.amount.replace(/\D/g, ""), 10);
    if (!bankForm.iban.trim() || !bankForm.holderName.trim() || !numericAmount || numericAmount <= 0) {
      showToast("Veuillez remplir tous les champs obligatoires");
      return;
    }
    if (numericAmount > balance) {
      showToast("Solde insuffisant pour ce virement");
      return;
    }

    setBankProcessing(true);
    try {
      const receiptId = `bnk-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const headers = await getAuthHeaders();
      const res = await fetch("/api/transactions/create", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({
          receiptId,
          senderUid: authUid,
          senderMoraliId: bankingIdentity?.id || "",
          senderName: dashboardName,
          recipientUid: authUid, // self-transaction (retrait du wallet Morali)
          recipientMoraliId: bankingIdentity?.id || "",
          recipientName: `${bankForm.holderName} (${bankForm.bankName || "Banque"})`,
          amount: numericAmount,
          fees: 0,
          type: "retrait",
          destination: `banque:${bankForm.iban}:${bankForm.bic || ""}`,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showToast(data.error || "Virement bancaire échoué");
        setBankProcessing(false);
        return;
      }

      // Notification temps réel (best-effort)
      try {
        await createRealtimeNotification(authUid, {
          title: `Virement bancaire — FCFA ${formatCurrency(numericAmount)}`,
          time: "À l'instant",
          badge: "Banque",
          badgeClass: "nb-blue",
          icon: "send",
          bg: "rgba(59,130,246,0.12)",
          read: false,
        });
      } catch { /* best-effort */ }

      showToast(`Virement bancaire de ${formatCurrency(numericAmount)} FCFA effectué`);
      setBankProcessing(false);
      closeTransferModal();
      onNavigate?.("dashboard");
    } catch (err) {
      console.error("[bank-transfer] error:", err);
      showToast("Erreur réseau. Réessayez.");
      setBankProcessing(false);
    }
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
    const safetyTimer = window.setTimeout(() => {
      setTransferProcessing(false);
      setTransferStage("error");
      setTransferErrorMsg("Délai dépassé. Vérifiez votre connexion.");
    }, 30000);

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
    let transferDone = true; // default: skip post-balance if block not entered
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
      // Defer success state updates to next tick so React can yield and the UI stays responsive
      window.setTimeout(() => {
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
      }, 50);
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
      // Defer error state to next tick to prevent UI freeze
      window.setTimeout(() => {
        setTransferStage("error");
      }, 50);
    } finally {
      // Always clear safety timer and clear processing flag — wrap in setTimeout to yield
      clearTimeout(safetyTimer);
      window.setTimeout(() => {
        setTransferProcessing(false);
      }, 0);
    }
  };

  // PIN input via system keyboard (same as depot/retrait)
  const handleTransferPinInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (transferProcessing || transferSuccess || pinVerifying) return;
    const raw = e.target.value.replace(/\D/g, "").slice(0, 4);
    setTransferPin(raw);
    if (raw.length === 4) {
      setPinVerifying(true);
      try {
        const res = await fetch("/api/verify-pin", {
          method: "POST",
          headers: await getAuthHeaders(),
          body: JSON.stringify({
            pin: raw,
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
        setTransferStage("processing");
        setPinVerifying(false);
        window.setTimeout(() => executeTransfer(), 150);
      } catch {
        showToast("Erreur de connexion");
        setTransferPin("");
        setPinVerifying(false);
      } finally {
        if (transferStage !== "processing") setPinVerifying(false);
      }
    }
  };

  // Auto-focus PIN input when stage changes to pin
  useEffect(() => {
    if (transferStage === "pin") {
      const timer = window.setTimeout(() => transferPinInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [transferStage]);

  // Helper: transition to PIN stage with slide animation
  const goToPinStage = () => {
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

  // Helper: go directly to processing (after successful Face ID)
  const goToProcessing = () => {
    setTransferPinOpen(true);
    setTransferStage("processing");
    // Use setTimeout to let React render the processing stage first
    window.setTimeout(() => executeTransfer(), 150);
  };

  const startTransferAuth = async () => {
    if (!transferRecipient) {
      showToast("Entrez un Pseudo, ID ou RIB Morali valide");
      return;
    }
    if (!transferAmountInput || Number(transferAmountInput) <= 0) {
      showToast("Saisissez un montant");
      return;
    }

    // ── Transaction validation for large amounts (confirmation screen) ──
    const amount = Number(transferAmountInput || 0);
    if (securitySettings.transactionValidation && amount >= 50000) {
      setTransferConfirmOpen(true);
      return;
    }

    // ── Authentication: Face ID first, then PIN fallback ──
    if (securitySettings.faceId) {
      const faceOk = await promptBiometric();
      if (faceOk) {
        // Face ID succeeded → go directly to processing
        goToProcessing();
      } else {
        // Face ID failed/cancelled/unrecognised → fall back to PIN
        showToast("Face ID non reconnu — saisissez votre PIN");
        goToPinStage();
      }
    } else {
      // No Face ID → PIN directly
      goToPinStage();
    }
  };

  const confirmTransferAndProceed = async () => {
    setTransferConfirmOpen(false);

    // ── Authentication: Face ID first, then PIN fallback ──
    if (securitySettings.faceId) {
      const faceOk = await promptBiometric();
      if (faceOk) {
        // Face ID succeeded → go directly to processing
        goToProcessing();
        return;
      }
      // Face ID failed → fall back to PIN
      showToast("Face ID non reconnu — saisissez votre PIN");
    }

    // Go to PIN (either Face ID disabled or failed)
    goToPinStage();
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
      startTransferAuth();
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
  // Keep ref to the lock function so we can clean it up from closeTransferModal too
  const scrollLockFnRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!open) return;
    const lock = () => { window.scrollTo(0, 0); document.documentElement.scrollTop = 0; document.body.scrollTop = 0; };
    scrollLockFnRef.current = lock;
    window.addEventListener("scroll", lock, { passive: true });
    if (window.visualViewport) window.visualViewport.addEventListener("resize", lock);
    if (window.visualViewport) window.visualViewport.addEventListener("scroll", lock);
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      scrollLockFnRef.current = null;
      window.removeEventListener("scroll", lock);
      if (window.visualViewport) window.visualViewport.removeEventListener("resize", lock);
      if (window.visualViewport) window.visualViewport.removeEventListener("scroll", lock);
      document.body.style.overflow = "";
      document.documentElement.style.overflow = "";
      document.body.style.pointerEvents = "";
      document.documentElement.style.pointerEvents = "";
    };
  }, [open]);

  /* ─────────────────────────────────────────────
     Render
     ───────────────────────────────────────────── */

  if (!open && !transferConfirmOpen) return null;

  // Shared input style for the bank transfer form (matches the app theme)
  const bankInputStyle: React.CSSProperties = {
    width: "100%",
    height: 48,
    padding: "0 14px",
    borderRadius: 14,
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    color: "#fff",
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "'Montserrat',sans-serif",
    outline: "none",
    transition: "border-color .2s ease, background .2s ease",
  };

  return (
    <>
      {/* ── Transfer modal ── */}
      {open && (
        <>
        {/* CRITICAL FIX: Backdrop with blur SEPARATE from content — Chrome fix */}
        <div className="transfer-overlay" onClick={closeTransferModal} />
        {/* Content layer — NO backdrop-filter */}
        <div className={`transfer-overlay-content${transferStage === "bank" ? " bank-fullscreen-overlay" : ""}`} onClick={closeTransferModal}>
          <div className={`transfer-modal${transferStage === "bank" ? " bank-fullscreen" : ""}`} onClick={(event) => event.stopPropagation()}>

            {/* ====== HEADER ====== */}
            <div className="transaction-flow-head">
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                {transferStage !== "choice" && transferStage !== "processing" && transferStage !== "error" && (
                  <button className="contact-modal-close" onClick={() => {
                    if (transferStage === "pin") setTransferStage("amount");
                    else if (transferStage === "amount") { setTransferStage("search"); setTransferRecipient(null); }
                    else if (transferStage === "bank") setTransferStage("choice");
                    else if (transferStage === "search") setTransferStage("choice");
                    else if (transferStage === "success") { closeTransferModal(); onNavigate?.("dashboard"); }
                  }} aria-label="Retour" style={{ width: 38, height: 38 }}>
                    <span style={{ fontSize: 18, lineHeight: 1 }}>←</span>
                  </button>
                )}
                <div>
                  <div className="transaction-flow-title">
                    {transferStage === "choice" && "Nouveau virement"}
                    {transferStage === "search" && "Vers Morali"}
                    {transferStage === "amount" && "Montant"}
                    {transferStage === "pin" && "Code PIN"}
                    {transferStage === "processing" && "Traitement..."}
                    {transferStage === "success" && "Virement envoyé"}
                    {transferStage === "error" && "Échec"}
                    {transferStage === "bank" && "Vers Banque"}
                  </div>
                  <div className="transaction-flow-sub">
                    {transferStage === "choice" && "Choisissez la destination du virement."}
                    {transferStage === "search" && "Entrez un Pseudo, ID ou RIB Morali pour commencer le virement."}
                    {transferStage === "amount" && `Vers ${transferRecipient?.name || ""}`}
                    {transferStage === "pin" && (securitySettings.faceId ? "Face ID non reconnu. Saisissez votre code PIN pour confirmer." : "Saisissez votre code secret à 4 chiffres pour sécuriser l'opération.")}
                    {transferStage === "processing" && "Virement en cours de traitement..."}
                    {transferStage === "success" && "Fonds transférés avec succès"}
                    {transferStage === "error" && "Le virement n'a pas pu aboutir"}
                    {transferStage === "bank" && "Virement vers un compte bancaire externe (IBAN). Délai 1 à 3 jours ouvrés."}
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

            {/* ====== ÉTAPE 0 : CHOIX DE LA DESTINATION (Banque ou Morali) ====== */}
            {transferStage === "choice" && (
              <div style={{ padding: "8px 4px 4px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={{ padding: "0 2px" }}>
                  <p style={{ fontSize: 11, color: "var(--dim)", textTransform: "uppercase", fontWeight: 900, letterSpacing: "0.18em", margin: 0 }}>
                    Sélectionnez le type de virement
                  </p>
                </div>

                {/* Option : Vers Morali */}
                <button
                  onClick={() => { setTransferStage("search"); setTimeout(() => transferInputRef.current?.focus(), 60); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 16, width: "100%",
                    padding: 20, borderRadius: 24, cursor: "pointer",
                    background: "linear-gradient(135deg, rgba(59,130,246,0.10), rgba(37,99,235,0.05))",
                    border: "1px solid rgba(59,130,246,0.25)",
                    textAlign: "left", transition: "all .25s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(59,130,246,0.5)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(59,130,246,0.25)")}
                >
                  <div style={{
                    width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                    background: "rgba(59,130,246,0.18)",
                    border: "1px solid rgba(59,130,246,0.35)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <AppIcon name="send" size={22} stroke="#60a5fa" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", fontFamily: "'Montserrat',sans-serif" }}>
                      Vers Morali
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.4 }}>
                      Virement instantané vers un autre compte Morali Pay (ID, pseudo ou RIB).
                    </div>
                  </div>
                  <span style={{ fontSize: 22, color: "var(--dim)", flexShrink: 0 }}>›</span>
                </button>

                {/* Option : Vers Banque */}
                <button
                  onClick={() => setTransferStage("bank")}
                  style={{
                    display: "flex", alignItems: "center", gap: 16, width: "100%",
                    padding: 20, borderRadius: 24, cursor: "pointer",
                    background: "linear-gradient(135deg, rgba(212,164,55,0.10), rgba(212,164,55,0.04))",
                    border: "1px solid rgba(212,164,55,0.25)",
                    textAlign: "left", transition: "all .25s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "rgba(212,164,55,0.5)")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "rgba(212,164,55,0.25)")}
                >
                  <div style={{
                    width: 52, height: 52, borderRadius: 16, flexShrink: 0,
                    background: "rgba(212,164,55,0.18)",
                    border: "1px solid rgba(212,164,55,0.35)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#D4A437" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 21h18" /><path d="M3 10h18" /><path d="M5 6l7-3 7 3" /><path d="M4 10v11" /><path d="M20 10v11" /><path d="M8 10v11" /><path d="M12 10v11" /><path d="M16 10v11" />
                    </svg>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", fontFamily: "'Montserrat',sans-serif" }}>
                      Vers Banque
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, lineHeight: 1.4 }}>
                      Virement vers un compte bancaire externe (IBAN / BIC). Délai 1 à 3 jours ouvrés.
                    </div>
                  </div>
                  <span style={{ fontSize: 22, color: "var(--dim)", flexShrink: 0 }}>›</span>
                </button>

                <div style={{
                  marginTop: 4, padding: "14px 16px", borderRadius: 16,
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
                  </svg>
                  <span style={{ fontSize: 11, color: "var(--dim)", lineHeight: 1.5 }}>
                    Solde disponible : <strong style={{ color: "var(--muted)" }}>{formatCurrency(balance)} FCFA</strong>
                  </span>
                </div>
              </div>
            )}

            {/* ====== ÉTAPE BANQUE : formulaire IBAN/BIC (plein écran) ====== */}
            {transferStage === "bank" && (
              <div ref={bankScrollRef} style={{ padding: "8px 4px 4px", display: "flex", flexDirection: "column", gap: 14, flex: 1, minHeight: 0, overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain", touchAction: "pan-y" }}>
                {/* Solde disponible */}
                <div style={{
                  padding: "16px 18px", borderRadius: 20,
                  background: "linear-gradient(135deg, rgba(212,164,55,0.08), rgba(212,164,55,0.02))",
                  border: "1px solid rgba(212,164,55,0.18)",
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                }}>
                  <div>
                    <div style={{ fontSize: 10, color: "var(--dim)", textTransform: "uppercase", fontWeight: 900, letterSpacing: "0.15em" }}>
                      Solde disponible
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 900, color: "#fff", fontFamily: "'Montserrat',sans-serif", marginTop: 4 }}>
                      {formatCurrency(balance)} <span style={{ fontSize: 13, color: "var(--muted)" }}>FCFA</span>
                    </div>
                  </div>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#D4A437" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 21h18" /><path d="M3 10h18" /><path d="M5 6l7-3 7 3" /><path d="M4 10v11" /><path d="M20 10v11" />
                  </svg>
                </div>

                {/* Bénéficiaire */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Nom du bénéficiaire *
                  </label>
                  <input
                    type="text" autoComplete="off" placeholder="Jean Dupont"
                    value={bankForm.holderName}
                    onChange={(e) => setBankForm({ ...bankForm, holderName: e.target.value })}
                    style={bankInputStyle}
                  />
                </div>

                {/* IBAN */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    IBAN *
                  </label>
                  <input
                    type="text" autoComplete="off" placeholder="CG 12 30002 00012 3456789012345 67"
                    value={bankForm.iban}
                    onChange={(e) => setBankForm({ ...bankForm, iban: e.target.value.toUpperCase() })}
                    style={{ ...bankInputStyle, fontFamily: "'Courier New', monospace", letterSpacing: "0.05em" }}
                  />
                </div>

                {/* BIC + Banque */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      BIC / SWIFT
                    </label>
                    <input
                      type="text" autoComplete="off" placeholder="BICAFRCG"
                      value={bankForm.bic}
                      onChange={(e) => setBankForm({ ...bankForm, bic: e.target.value.toUpperCase() })}
                      style={{ ...bankInputStyle, fontFamily: "'Courier New', monospace" }}
                    />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                      Nom de la banque
                    </label>
                    <input
                      type="text" autoComplete="off" placeholder="Banque Congolaise"
                      value={bankForm.bankName}
                      onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                      style={bankInputStyle}
                    />
                  </div>
                </div>

                {/* Montant */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Montant (FCFA) *
                  </label>
                  <input
                    type="text" inputMode="numeric" autoComplete="off" placeholder="50 000"
                    value={bankForm.amount}
                    onChange={(e) => {
                      const digits = e.target.value.replace(/\D/g, "");
                      setBankForm({ ...bankForm, amount: digits ? parseInt(digits, 10).toLocaleString("fr-FR") : "" });
                    }}
                    style={{ ...bankInputStyle, fontSize: 18, fontWeight: 800 }}
                  />
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                    {[5000, 10000, 25000, 50000, 100000].map((amt) => (
                      <button
                        key={amt}
                        onClick={() => setBankForm({ ...bankForm, amount: amt.toLocaleString("fr-FR") })}
                        style={{
                          padding: "6px 12px", borderRadius: 10, fontSize: 11, fontWeight: 700,
                          background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)",
                          color: "var(--muted)", cursor: "pointer", transition: "all .2s",
                        }}
                      >
                        {amt.toLocaleString("fr-FR")}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Motif */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <label style={{ fontSize: 11, fontWeight: 800, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    Motif du virement
                  </label>
                  <input
                    type="text" autoComplete="off" placeholder="Paiement facture / don / etc."
                    value={bankForm.motif}
                    onChange={(e) => setBankForm({ ...bankForm, motif: e.target.value.slice(0, 100) })}
                    style={bankInputStyle}
                  />
                </div>

                {/* Frais + délai */}
                <div style={{
                  padding: "14px 16px", borderRadius: 16,
                  background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)",
                  display: "flex", flexDirection: "column", gap: 8,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "var(--dim)" }}>Frais bancaires</span>
                    <span style={{ color: "#22c55e", fontWeight: 700 }}>Gratuit</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12 }}>
                    <span style={{ color: "var(--dim)" }}>Délai d'exécution</span>
                    <span style={{ color: "var(--muted)", fontWeight: 700 }}>1 à 3 jours ouvrés</span>
                  </div>
                  {bankForm.amount && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, paddingTop: 8, marginTop: 4, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                      <span style={{ color: "var(--muted)", fontWeight: 700 }}>Total à débiter</span>
                      <span style={{ color: "#fff", fontWeight: 900 }}>
                        {parseInt(bankForm.amount.replace(/\D/g, ""), 10).toLocaleString("fr-FR")} FCFA
                      </span>
                    </div>
                  )}
                </div>

                {/* Bouton confirmer */}
                <button
                  onClick={submitBankTransfer}
                  disabled={bankProcessing || !bankForm.iban.trim() || !bankForm.holderName.trim() || !bankForm.amount}
                  style={{
                    width: "100%", height: 54, borderRadius: 16, border: "none",
                    background: bankProcessing || !bankForm.iban.trim() || !bankForm.holderName.trim() || !bankForm.amount
                      ? "rgba(59,130,246,0.3)"
                      : "linear-gradient(135deg, #D4A437, #f0d98a)",
                    color: "#0a0e17", fontSize: 15, fontWeight: 900,
                    fontFamily: "'Montserrat',sans-serif", cursor: bankProcessing ? "wait" : "pointer",
                    transition: "all .25s ease", marginTop: 4,
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  }}
                >
                  {bankProcessing ? (
                    <>
                      <span style={{ width: 16, height: 16, border: "2px solid rgba(10,14,23,0.3)", borderTopColor: "#0a0e17", borderRadius: "50%", animation: "spin 0.8s linear infinite", display: "inline-block" }} />
                      Traitement...
                    </>
                  ) : (
                    <>Confirmer le virement bancaire</>
                  )}
                </button>
              </div>
            )}

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
                    placeholder="Pseudo, ID ou RIB du compte"
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
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", lineHeight: 1.4 }}>Vérifiez l'ID ou le RIB Morali et réessayez.</span>
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

            {/* ====== ÉTAPE 3 : PIN (same style as depot/retrait) ====== */}
            {transferStage === "pin" && (
              <>
                {/* Summary section */}
                <div className="pin-summary">
                  <div>
                    <span>Opération</span>
                    <strong>Virement</strong>
                  </div>
                  <div>
                    <span>Destinataire</span>
                    <strong>{transferRecipient?.name || ""}</strong>
                  </div>
                  <div>
                    <small>Montant</small>
                    <strong>FCFA {formatCurrency(Number(transferAmountInput || 0))}</strong>
                  </div>
                </div>

                {/* PIN input */}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
                  <input
                    ref={transferPinInputRef}
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={4}
                    value={transferPin}
                    onChange={handleTransferPinInput}
                    placeholder="••••"
                    style={{
                      width: '100%',
                      maxWidth: 200,
                      height: 56,
                      padding: '0 16px',
                      background: 'rgba(255,255,255,0.04)',
                      border: '1.5px solid rgba(59,130,246,0.35)',
                      borderRadius: 16,
                      color: '#fff',
                      fontSize: 24,
                      fontWeight: 900,
                      textAlign: 'center',
                      letterSpacing: '0.35em',
                      outline: 'none',
                      fontFamily: "'Montserrat', sans-serif",
                      transition: 'all .2s',
                      WebkitAppearance: 'none',
                      MozAppearance: 'textfield',
                    }}
                  />
                  {pinVerifying ? (
                    <div className="pin-helper" style={{ color: "#60a5fa" }}>Vérification du code PIN…</div>
                  ) : (
                    <div className="pin-helper">La vérification démarre automatiquement.</div>
                  )}
                </div>
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
        </>
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
.transfer-overlay{position:fixed;inset:0;z-index:10029;background:rgba(3,8,16,.72);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);animation:fadeIn .3s ease}
.transfer-overlay-content{position:fixed;inset:0;z-index:10030;display:flex;align-items:flex-start;justify-content:center;padding:60px 20px 20px;animation:fadeIn .3s ease;pointer-events:none}
.transfer-overlay-content .transfer-modal{pointer-events:auto}
.transfer-modal{position:relative;width:100%;max-width:100%;max-height:100%;overflow:hidden;margin:0;flex-shrink:0;background:linear-gradient(180deg,#101a30 0%,#080f1e 100%);border:1px solid rgba(59,130,246,.22);border-radius:28px;padding:22px 20px calc(4px + env(safe-area-inset-bottom,0px));display:flex;flex-direction:column;gap:18px;opacity:1}
.transfer-modal::-webkit-scrollbar{width:4px}.transfer-modal::-webkit-scrollbar-track{background:transparent}.transfer-modal::-webkit-scrollbar-thumb{background:rgba(96,165,250,.45);border-radius:4px}
.transfer-overlay-content.bank-fullscreen-overlay{padding:0 !important;align-items:stretch !important}
.transfer-modal.bank-fullscreen{max-width:100% !important;width:100% !important;height:100dvh !important;min-height:100dvh !important;border-radius:0 !important;border:none !important;padding:calc(20px + env(safe-area-inset-top,0px)) 20px calc(20px + env(safe-area-inset-bottom,0px)) !important;gap:14px !important}
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
