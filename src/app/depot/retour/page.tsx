"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { firebaseAuth } from "@/lib/firebase";

type PayStatus = "loading" | "pending" | "accepted" | "refused" | "signed_out" | "missing";

export default function DepotReturnPage() {
  const [status, setStatus] = useState<PayStatus>("loading");
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState("XAF");

  useEffect(() => {
    const transactionId = new URLSearchParams(window.location.search).get("transaction_id") || "";
    const idValid = /^[A-Za-z0-9]{8,40}$/.test(transactionId);
    let stopped = false;
    let timer = 0;
    let attempts = 0;

    if (!idValid || !firebaseAuth) {
      queueMicrotask(() => {
        if (!stopped) setStatus(idValid ? "signed_out" : "missing");
      });
      return () => { stopped = true; };
    }

    const poll = async (user: { getIdToken: () => Promise<string> }) => {
      attempts += 1;
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/payments/cinetpay/status?transactionId=${encodeURIComponent(transactionId)}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (stopped) return;
        if (res.status === 401) {
          setStatus("signed_out");
          return;
        }
        if (!res.ok) {
          setStatus("missing");
          return;
        }
        const data = await res.json();
        if (typeof data.amount === "number") setAmount(data.amount);
        if (typeof data.currency === "string" && data.currency) setCurrency(data.currency);
        if (data.status === "accepted" || data.status === "refused") {
          setStatus(data.status);
          return;
        }
        setStatus("pending");
      } catch {
        if (!stopped) setStatus("pending");
      }
      if (!stopped && attempts < 12) {
        timer = window.setTimeout(() => { void poll(user); }, 4000);
      }
    };

    const unsub = onAuthStateChanged(firebaseAuth, (user) => {
      if (stopped) return;
      if (!user) {
        setStatus("signed_out");
        return;
      }
      void poll(user);
    });

    return () => {
      stopped = true;
      window.clearTimeout(timer);
      unsub();
    };
  }, []);

  const title = status === "accepted"
    ? "Dépôt confirmé"
    : status === "refused"
      ? "Paiement non abouti"
      : status === "missing"
        ? "Paiement introuvable"
        : status === "signed_out"
          ? "Confirmation en cours"
          : status === "pending"
            ? "Paiement en cours"
            : "Vérification du paiement";

  const copy = status === "accepted"
    ? "CinetPay a confirmé le paiement. Le montant a été crédité sur votre compte."
    : status === "refused"
      ? "Le paiement a été refusé ou annulé. Aucun montant n'a été crédité."
      : status === "missing"
        ? "Cette référence ne correspond pas à un dépôt de votre compte."
        : status === "signed_out"
          ? "Ouvrez Morali pour voir votre solde. Le crédit est appliqué uniquement après confirmation CinetPay."
          : "Nous attendons la confirmation de CinetPay. Votre solde sera crédité dès que le paiement est accepté.";

  const tone = status === "accepted" ? "#4ade80" : status === "refused" || status === "missing" ? "#f87171" : "#60a5fa";

  return (
    <div style={{
      position: "fixed",
      inset: 0,
      overflow: "auto",
      background: "#050a1a",
      color: "#fff",
      display: "flex",
      justifyContent: "center",
      padding: "48px 20px",
      fontFamily: "'Montserrat', system-ui, sans-serif",
    }}>
      <div style={{
        width: "100%",
        maxWidth: 420,
        alignSelf: "center",
        background: "linear-gradient(180deg,#101a30 0%,#080f1e 100%)",
        border: "1px solid rgba(59,130,246,.22)",
        borderRadius: 28,
        padding: "28px 22px",
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: "0.16em", textTransform: "uppercase", color: "#94a3b8" }}>
          Mobile Money
        </div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, letterSpacing: "-0.4px", color: tone }}>{title}</h1>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#94a3b8" }}>{copy}</p>
        {amount !== null && status !== "missing" && status !== "signed_out" && (
          <div style={{
            padding: "16px 18px",
            borderRadius: 18,
            background: "rgba(255,255,255,0.03)",
            border: "1px solid rgba(255,255,255,0.06)",
          }}>
            <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>Montant</div>
            <div style={{ marginTop: 6, fontSize: 28, fontWeight: 900 }}>
              {amount.toLocaleString("fr-FR")} <span style={{ fontSize: 14, color: "#94a3b8" }}>{currency}</span>
            </div>
          </div>
        )}
        {status === "loading" || status === "pending" ? (
          <div style={{ fontSize: 12, color: "#60a5fa", fontWeight: 700 }}>Vérification auprès de CinetPay…</div>
        ) : null}
        <a
          href="/"
          style={{
            height: 52,
            borderRadius: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            fontWeight: 800,
            color: "#0a0e17",
            background: "linear-gradient(135deg, #D4A437, #f0d98a)",
          }}
        >
          Retour à Morali
        </a>
      </div>
    </div>
  );
}
