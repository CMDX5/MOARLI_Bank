'use client';
import React, { useState, useRef, useMemo } from "react";
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
} from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { firebaseAuth, firebaseDb } from "@/lib/firebase";
import { hashPin, generatePinSalt, encryptPinWithPassword } from "@/lib/pin-utils";
import {
  firebaseAuthMessage,
  getIdentitySeed,
  generateMoraliIdentity,
  cacheIdentityForUid,
  sanitizeInput,
  getStrength,
} from "@/lib/helpers";
import type {
  AuthTab,
  ForgotStep,
  Screen,
  NavItem,
  RegisterData,
  FirestoreMoraliUser,
} from "@/types/morali";
import { MoraliShield, ArrowRightIcon, ArrowLeftIcon, EyeIcon } from "./Icons";

export interface AuthViewProps {
  showToast: (message: string) => void;
  setScreen: (screen: Screen) => void;
  setNavActive: (nav: NavItem) => void;
  setDashboardName: (name: string) => void;
  setProfileForm: React.Dispatch<React.SetStateAction<ProfileFormData>>;
  setBankingIdentity: (id: { id: string; rib: string }) => void;
  profileForm: ProfileFormData;
  handleAdminLongPressStart: () => void;
  handleAdminLongPressEnd: () => void;
  onAuthSuccess: (uid: string, email: string) => void;
  /** Optional: publish directory entry after account creation */
  persistMoraliProfile: (uid: string) => Promise<{ id: string; rib: string } | null>;
}

export interface ProfileFormData {
  fullName: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  bio: string;
}

export default function AuthView({
  showToast,
  setScreen,
  setNavActive,
  setDashboardName,
  setProfileForm,
  setBankingIdentity,
  profileForm,
  handleAdminLongPressStart,
  handleAdminLongPressEnd,
  onAuthSuccess,
  persistMoraliProfile,
}: AuthViewProps) {
  // ── Auth tab state ──
  const [authTab, setAuthTab] = useState<AuthTab>("login");

  // ── Login state ──
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // ── Register state ──
  const [registerData, setRegisterData] = useState<RegisterData>({
    prenom: "", nom: "", email: "", tel: "", prefix: "+242", pw: "",
  });
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [otpValue, setOtpValue] = useState("");
  const [demoOtpCode, setDemoOtpCode] = useState("");
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState(1);
  const [showRegisterSuccess, setShowRegisterSuccess] = useState(false);

  // ── Registration PIN setup state ──
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [regPinDraft, setRegPinDraft] = useState("");
  const [regPinConfirm, setRegPinConfirm] = useState("");
  const [regPinStep, setRegPinStep] = useState<"create" | "confirm">("create");
  const [regPinSaving, setRegPinSaving] = useState(false);

  // ── Forgot password state ──
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

  const otpInputRef = useRef<HTMLInputElement | null>(null);

  // ── Computed ──
  const passwordStrength = useMemo(() => getStrength(registerData.pw), [registerData.pw]);

  const stepDot = (step: number) => {
    if (showRegisterSuccess || showPinSetup || currentStep > step) return "done";
    if (currentStep === step) return "active";
    return "";
  };

  // ── Navigation helpers ──
  const enterDashboard = (nameOverride?: string) => {
    const fallbackFromEmail = loginEmail ? `${loginEmail.split("@")[0].charAt(0).toUpperCase()}${loginEmail.split("@")[0].slice(1)}` : "";
    const savedFullName = typeof window !== "undefined" ? window.localStorage.getItem("morali_profile_full_name") || "" : "";
    const nextName = nameOverride || savedFullName || profileForm.fullName || registerData.prenom || fallbackFromEmail || "Utilisateur";
    setDashboardName(nextName);
    setScreen("dashboard");
    setNavActive("Accueil");
    showToast(`Bienvenue ${nextName}`);
  };

  // ── Auth tab switching ──
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

  // ── Registration step navigation ──
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
      try {
        const phone = `${registerData.prefix}${registerData.tel}`;
        const res = await fetch("/api/sms/send-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phone }),
        });
        const data = await res.json();
        if (data.success) {
          if (data.demoOtp) setDemoOtpCode(data.demoOtp);
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

  // ── OTP verification & account creation ──
  const handleVerify = async () => {
    if (otpValue.length < 6) {
      showToast("Entrez le code à 6 chiffres");
      return;
    }
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
      onAuthSuccess(cred.user.uid, cred.user.email || "");
    } catch (error) {
      const message = firebaseAuthMessage(error);
      showToast(message || "Création du compte impossible");
    } finally {
      setVerifyLoading(false);
    }
  };

  // ── Login ──
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
      onAuthSuccess(cred.user.uid, cred.user.email || "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connexion impossible";
      showToast(message.includes("invalid-credential") ? "Email ou mot de passe incorrect" : "Connexion impossible");
    } finally {
      setLoginLoading(false);
    }
  };

  // ── Forgot password ──
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

  // ── Social login ──
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
          uid: user.uid, fullName: displayName, firstName, lastName,
          pseudo: pseudoBase, moraliId: identity.id,
          moraliIdNormalized: identity.id.replace(/[^A-Z0-9]/g, ""),
          rib: identity.rib, phone, email: user.email || "",
          updatedAt: serverTimestamp(), createdAt: serverTimestamp(),
        },
        { merge: true },
      );

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
      onAuthSuccess(user.uid, user.email || "");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Connexion Google impossible";
      showToast(message);
    }
  };

  // ── OTP input handler ──
  const handleOtpChange = (value: string) => {
    setOtpValue(value.replace(/\D/g, "").slice(0, 6));
  };

  // ── Resend OTP ──
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
        if (data.demoOtp) setDemoOtpCode(data.demoOtp);
      } else {
        showToast(data.error || "Erreur d'envoi");
      }
    } catch {
      showToast("Erreur d'envoi du code");
    }
    window.setTimeout(() => otpInputRef.current?.focus(), 150);
  };

  // ── Registration PIN handlers ──
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
      const salt = await generatePinSalt();
      const hash = await hashPin(regPinDraft, salt);
      window.localStorage.removeItem("morali_card_pin");
      window.localStorage.removeItem("morali_card_pin_hash");
      window.localStorage.removeItem("morali_card_pin_salt");
      // Encrypt PIN with account password for later reveal
      const encrypted = await encryptPinWithPassword(regPinDraft, registerData.pw, firebaseAuth.currentUser?.uid || "");
      window.localStorage.setItem("morali_card_pin_encrypted", encrypted.encryptedPin);
      window.localStorage.setItem("morali_card_pin_iv", encrypted.pinIv);
      // Store encrypted PIN on server
      try {
        const token = await firebaseAuth.currentUser?.getIdToken();
        const storeRes = await fetch("/api/pin/store", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ pinHash: hash, salt, encryptedPin: encrypted.encryptedPin, pinIv: encrypted.pinIv }),
        });
        const storeData = await storeRes.json().catch(() => ({}));
        if (!storeData.success || storeData.fallback) {
          try {
            const uid = firebaseAuth.currentUser?.uid;
            if (uid) {
              const { setDoc: fsSetDoc, doc: fsDoc } = await import("firebase/firestore");
              await fsSetDoc(fsDoc(firebaseDb, "pinRecords", uid), {
                pinHash: hash, salt, encryptedPin: encrypted.encryptedPin, pinIv: encrypted.pinIv,
              });
            }
          } catch { /* client Firestore also failed */ }
        }
      } catch { /* server store failed */ }
      setShowPinSetup(false);
      setRegPinDraft("");
      setRegPinConfirm("");
      setRegPinStep("create");
      setShowRegisterSuccess(true);
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

  // ────────────────────────────────────────────
  // RENDER
  // ────────────────────────────────────────────
  return (
    <div className={`app-screen active`}>
      <div className="auth-scroll">
        <div className="auth-hero">
          <div
            className="auth-shield-wrap"
            onTouchStart={handleAdminLongPressStart}
            onTouchEnd={handleAdminLongPressEnd}
            onMouseDown={handleAdminLongPressStart}
            onMouseUp={handleAdminLongPressEnd}
            onMouseLeave={handleAdminLongPressEnd}
          >
            <MoraliShield />
          </div>
          <div className="auth-brand-name">MORALI</div>
          <div className="auth-brand-sub">PAY</div>
        </div>

        <div className="auth-tabs">
          <button className={`auth-tab ${authTab === "login" ? "active" : ""}`} onClick={() => switchAuthTab("login")}>
            Connexion
          </button>
          <button className={`auth-tab ${authTab === "register" ? "active" : ""}`} onClick={() => switchAuthTab("register")}>
            Inscription
          </button>
        </div>

        {/* ── Login Panel ── */}
        <div className={`auth-panel ${authTab === "login" ? "active" : ""}`}>
          <div className="form-section-title">Connexion</div>
          <div className="field">
            <label className="field-label">Email</label>
            <div className="field-wrap">
              <input
                type="email" className="field-input" placeholder="votre@email.com"
                autoComplete="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Mot de passe</label>
            <div className="field-wrap">
              <input
                type={showLoginPassword ? "text" : "password"} className="field-input has-icon"
                placeholder="••••••••" autoComplete="current-password"
                value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)}
              />
              <button type="button" className="field-icon" onClick={() => setShowLoginPassword((v) => !v)} aria-label="Afficher le mot de passe">
                <EyeIcon off={showLoginPassword} />
              </button>
            </div>
          </div>
          <div className="forgot-link" onClick={handleForgot}>Mot de passe oublié ?</div>
          <button className="btn-primary" onClick={handleLogin} disabled={loginLoading}>
            {!loginLoading ? <span>Se connecter</span> : <div className="btn-loader" />}
          </button>
          <div className="auth-link">
            Pas encore de compte ? <span onClick={() => switchAuthTab("register")}>S&apos;inscrire</span>
          </div>
        </div>

        {/* ── Forgot Password Panel ── */}
        <div className={`auth-panel ${authTab === "forgot" ? "active" : ""}`}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 20 }}>
            <div className="form-section-title" style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <button type="button" onClick={() => setAuthTab("login")} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
              </button>
              Mot de passe oublié
            </div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5, paddingLeft: 28 }}>
              {forgotStep === "email" && "Entrez votre email pour recevoir un code de vérification."}
              {forgotStep === "code" && "Saisissez le code envoyé à votre email."}
              {forgotStep === "newPassword" && "Choisissez votre nouveau mot de passe."}
              {forgotStep === "success" && "Votre mot de passe a été modifié avec succès."}
            </div>
          </div>

          {/* Step indicators */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 0, marginBottom: 22 }}>
            {["email", "code", "newPassword"].map((step, i) => (
              <React.Fragment key={step}>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 11, fontWeight: 800,
                    background: forgotStep === step || (step === "email" && forgotStep === "code") || (step !== "newPassword" && forgotStep === "newPassword")
                      ? "rgba(212,164,55,.15)" : "rgba(255,255,255,.04)",
                    border: forgotStep === step || (step === "email" && forgotStep === "code") || (step !== "newPassword" && forgotStep === "newPassword")
                      ? "1px solid rgba(212,164,55,.3)" : "1px solid rgba(255,255,255,.08)",
                    color: forgotStep === step || (step === "email" && forgotStep === "code") || (step !== "newPassword" && forgotStep === "newPassword")
                      ? "#D4A437" : "#475569",
                  }}>
                    {forgotStep === "success" || (step !== "newPassword" && forgotStep === "newPassword") || (step === "email" && forgotStep !== "email") ? "✓" : i + 1}
                  </div>
                  <div style={{ fontSize: 9, color: "#475569", fontWeight: 700 }}>{step === "email" ? "Email" : step === "code" ? "Code" : "Nv. MDP"}</div>
                </div>
                {i < 2 && (
                  <div style={{
                    width: 48, height: 2, borderRadius: 1, margin: "0 6px", marginBottom: 16,
                    background: (step === "email" && forgotStep !== "email") || (step === "code" && forgotStep === "newPassword") || forgotStep === "success"
                      ? "rgba(212,164,55,.3)" : "rgba(255,255,255,.06)",
                  }} />
                )}
              </React.Fragment>
            ))}
          </div>

          {forgotStep === "email" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label className="field-label">Adresse email</label>
                <div className="field-wrap">
                  <input type="email" className="field-input" placeholder="votre@email.com" value={forgotEmail} onChange={(e) => setForgotEmail(e.target.value)} autoFocus />
                </div>
              </div>
              <button className="btn-primary" onClick={forgotSendCode} disabled={forgotSending || !forgotEmail.trim() || !forgotEmail.includes("@")} style={forgotSending || !forgotEmail.trim() || !forgotEmail.includes("@") ? { opacity: .4 } : {}}>
                {forgotSending ? <div className="btn-loader" /> : "Envoyer le code"}
              </button>
            </div>
          )}

          {forgotStep === "code" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label className="field-label">Code de vérification</label>
                <div className="field-wrap">
                  <input type="text" className="field-input" inputMode="numeric" maxLength={6} placeholder="000000" value={forgotOtpCode} onChange={(e) => setForgotOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))} style={{ textAlign: "center", fontSize: 20, letterSpacing: ".3em", fontWeight: 900 }} autoFocus />
                </div>
              </div>
              {forgotDemoOtp && (
                <div style={{ textAlign: "center", padding: "10px 14px", borderRadius: 14, background: "rgba(212,164,55,.06)", border: "1px solid rgba(212,164,55,.12)" }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: "#D4A437", letterSpacing: ".1em", textTransform: "uppercase" }}>Mode démo</div>
                  <div style={{ fontSize: 20, fontWeight: 900, color: "#fff", letterSpacing: ".2em", marginTop: 2 }}>{forgotDemoOtp}</div>
                </div>
              )}
              <button className="btn-primary" onClick={forgotVerifyCode} disabled={forgotOtpCode.length !== 6 || forgotVerifying} style={forgotOtpCode.length !== 6 || forgotVerifying ? { opacity: .4 } : {}}>
                {forgotVerifying ? <div className="btn-loader" /> : "Vérifier le code"}
              </button>
              <div style={{ textAlign: "center" }}>
                <span style={{ fontSize: 12, color: "#64748b" }}>Pas de code ? </span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "#D4A437", cursor: "pointer" }} onClick={forgotSendCode}>Renvoyer</span>
              </div>
            </div>
          )}

          {forgotStep === "newPassword" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="field">
                <label className="field-label">Nouveau mot de passe</label>
                <div className="field-wrap">
                  <input type="password" className="field-input" placeholder="Minimum 8 caractères" value={forgotNewPw} onChange={(e) => setForgotNewPw(e.target.value)} autoFocus />
                </div>
              </div>
              <div className="field">
                <label className="field-label">Confirmer le mot de passe</label>
                <div className="field-wrap">
                  <input type="password" className="field-input" placeholder="Confirmez le mot de passe" value={forgotConfirmPw} onChange={(e) => setForgotConfirmPw(e.target.value)} />
                </div>
              </div>
              <button className="btn-primary" onClick={forgotResetPassword} disabled={forgotNewPw.length < 8 || forgotNewPw !== forgotConfirmPw || forgotResetting} style={forgotNewPw.length < 8 || forgotNewPw !== forgotConfirmPw || forgotResetting ? { opacity: .4 } : {}}>
                {forgotResetting ? <div className="btn-loader" /> : "Réinitialiser le mot de passe"}
              </button>
            </div>
          )}

          {forgotStep === "success" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, alignItems: "center", textAlign: "center", padding: "20px 0" }}>
              <div style={{ width: 64, height: 64, borderRadius: "50%", background: "rgba(34,197,94,.1)", border: "2px solid rgba(34,197,94,.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5"/></svg>
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>Mot de passe modifié !</div>
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.</div>
              <button className="btn-primary" onClick={() => { setLoginEmail(forgotEmail); setLoginPassword(""); setAuthTab("login"); }} style={{ marginTop: 4 }}>
                Se connecter
              </button>
            </div>
          )}
        </div>

        {/* ── Register Panel ── */}
        <div className={`auth-panel ${authTab === "register" ? "active" : ""}`}>
          {!showRegisterSuccess && !showPinSetup && (
            <div className="step-row">
              {[1, 2, 3].map((step, index) => (
                <React.Fragment key={step}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                    <div className={`step-dot ${stepDot(step)}`}>
                      {showPinSetup || currentStep > step ? "✓" : step}
                    </div>
                    <div className="step-label">{step === 1 ? "Identité" : step === 2 ? "Sécurité" : "Code OTP"}</div>
                  </div>
                  {index < 2 && <div className={`step-line ${currentStep > step || showPinSetup ? "done" : ""}`} />}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* PIN Setup */}
          {showPinSetup && (
            <div className="pin-setup-wrap">
              <div className="pin-setup-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" width="32" height="32">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <div className="pin-setup-title">
                {regPinStep === "create" ? "Créez votre code PIN" : "Confirmez votre code PIN"}
              </div>
              <div className="pin-setup-desc">
                {regPinStep === "create"
                  ? "Ce code à 4 chiffres sécurisera vos transactions et l'accès à vos cartes."
                  : "Entrez à nouveau votre code PIN pour confirmer."
                }
              </div>
              <div className="pin-dots-row">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={`pin-dot ${(regPinStep === "create" ? regPinDraft : regPinConfirm).length > i ? "filled" : ""}`} />
                ))}
              </div>
              <input
                type="password" inputMode="numeric" maxLength={4}
                value={regPinStep === "create" ? regPinDraft : regPinConfirm}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 4);
                  if (regPinStep === "create") setRegPinDraft(val);
                  else setRegPinConfirm(val);
                }}
                placeholder="••••" autoFocus className="reg-pin-input" data-needs-scroll
              />
              {regPinStep === "create" && regPinDraft.length === 4 && (
                <button className="btn-primary pin-confirm-btn" onClick={() => { setRegPinStep("confirm"); setRegPinConfirm(""); }} style={{ width: "100%", marginTop: 20 }}>
                  Continuer
                </button>
              )}
              {regPinStep === "confirm" && (
                <button className="pin-back-link" onClick={handleRegPinBack}>Modifier le code PIN</button>
              )}
              {regPinStep === "confirm" && regPinConfirm.length === 4 && (
                <button className="btn-primary pin-confirm-btn" onClick={handleRegPinSave} disabled={regPinSaving} style={{ width: "100%", marginTop: 20 }}>
                  {regPinSaving ? <div className="btn-loader" /> : "Confirmer le code PIN"}
                </button>
              )}
              {regPinStep === "confirm" && regPinConfirm.length === 4 && regPinDraft !== regPinConfirm && (
                <div className="pin-error-msg">Les codes PIN ne correspondent pas</div>
              )}
            </div>
          )}

          {/* Register Step 1: Identity */}
          {!showRegisterSuccess && !showPinSetup && currentStep === 1 && (
            <div>
              <div className="form-section-title">Vos informations</div>
              <div className="fields-row">
                <div className="field">
                  <label className="field-label">Prénom</label>
                  <input className="field-input" placeholder="Jean" autoComplete="given-name" value={registerData.prenom} onChange={(e) => setRegisterData((s) => ({ ...s, prenom: e.target.value }))} data-no-scroll />
                </div>
                <div className="field">
                  <label className="field-label">Nom</label>
                  <input className="field-input" placeholder="Prince" autoComplete="family-name" value={registerData.nom} onChange={(e) => setRegisterData((s) => ({ ...s, nom: e.target.value }))} data-no-scroll />
                </div>
              </div>
              <div className="field">
                <label className="field-label">Email</label>
                <input className="field-input" type="email" placeholder="votre@email.com" autoComplete="email" value={registerData.email} onChange={(e) => setRegisterData((s) => ({ ...s, email: e.target.value }))} data-needs-scroll />
              </div>
              <div className="field">
                <label className="field-label">Téléphone</label>
                <div className="phone-row">
                  <div className="prefix-select" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>+242</div>
                  <input className="field-input" type="tel" placeholder="" style={{ flex: 1 }} value={registerData.tel} onChange={(e) => setRegisterData((s) => ({ ...s, tel: e.target.value }))} data-needs-scroll />
                </div>
              </div>
              <button className="btn-primary" onClick={() => goToStep(2)}>
                Continuer
                <ArrowRightIcon />
              </button>
              <div className="auth-link">
                Déjà inscrit ? <span onClick={() => switchAuthTab("login")}>Se connecter</span>
              </div>
            </div>
          )}

          {/* Register Step 2: Security */}
          {!showRegisterSuccess && !showPinSetup && currentStep === 2 && (
            <div>
              <div className="form-section-title">Sécurité du compte</div>
              <div className="field">
                <label className="field-label">Mot de passe</label>
                <div className="field-wrap">
                  <input
                    type={showRegisterPassword ? "text" : "password"} className="field-input has-icon"
                    placeholder="Minimum 8 caractères" value={registerData.pw}
                    onChange={(e) => setRegisterData((s) => ({ ...s, pw: e.target.value }))}
                  />
                  <button type="button" className="field-icon" onClick={() => setShowRegisterPassword((v) => !v)} aria-label="Afficher le mot de passe">
                    <EyeIcon off={showRegisterPassword} />
                  </button>
                </div>
                {registerData.pw && (
                  <div className="pw-strength">
                    <div className="pw-bars">
                      {[0, 1, 2, 3].map((i) => (
                        <div key={i} className={`pw-bar ${i < passwordStrength.score ? passwordStrength.cls : ""}`} />
                      ))}
                    </div>
                    <span className="pw-label">{passwordStrength.label}</span>
                  </div>
                )}
              </div>
              <div className="field">
                <label className="field-label">Confirmer</label>
                <input type="password" className="field-input" placeholder="Répétez le mot de passe" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </div>
              <div className="check-row" onClick={() => setTermsAccepted((v) => !v)}>
                <div className={`check-box ${termsAccepted ? "checked" : ""}`}>
                  <svg viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2.5" aria-hidden="true"><polyline points="1,6 4.5,9.5 11,2" /></svg>
                </div>
                <div className="check-label">
                  J&apos;accepte les <span className="linkish">Conditions Générales</span> et la <span className="linkish">Politique de Confidentialité</span> de Morali Pay
                </div>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn-secondary" style={{ flex: "0 0 auto", width: "auto", padding: "13px 18px" }} onClick={() => goToStep(1)}>
                  <ArrowLeftIcon />
                </button>
                <button className="btn-primary" style={{ marginBottom: 0, flex: 1 }} onClick={() => goToStep(3)}>
                  Continuer
                  <ArrowRightIcon />
                </button>
              </div>
            </div>
          )}

          {/* Register Step 3: OTP Verification */}
          {!showRegisterSuccess && !showPinSetup && currentStep === 3 && (
            <div>
              <div className="form-section-title">Vérification OTP</div>
              <div className="info-box">
                <svg viewBox="0 0 24 24" fill="none" strokeLinecap="round" width="15" height="15" aria-hidden="true">
                  <circle cx="12" cy="12" r="10" stroke="#3b82f6" strokeWidth="2" />
                  <path d="M12 8v4M12 16h.01" stroke="#3b82f6" strokeWidth="2" />
                </svg>
                <div className="info-box-text">
                  Code envoyé au numéro <strong>{registerData.prefix} {registerData.tel || "--"}</strong>
                </div>
              </div>
              <div className="otp-row">
                {Array.from({ length: 6 }).map((_, i) => {
                  const active = otpValue.length === i;
                  const done = i < otpValue.length;
                  return (
                    <div key={i} className={`otp-box ${active ? "active" : ""} ${done ? "done" : ""}`} onClick={() => otpInputRef.current?.focus()}>
                      {otpValue[i] || "-"}
                    </div>
                  );
                })}
              </div>
              <input ref={otpInputRef} type="tel" maxLength={6} inputMode="numeric" value={otpValue} onChange={(e) => handleOtpChange(e.target.value)} style={{ position: "absolute", left: -9999, opacity: 0 }} />
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <span style={{ fontSize: 11, color: "var(--dim)" }}>Pas reçu ? </span>
                <span style={{ fontSize: 11, fontWeight: 700, color: "var(--blue)", cursor: "pointer" }} onClick={resendOtp}>Renvoyer</span>
              </div>
              {demoOtpCode && (
                <div style={{ textAlign: "center", marginBottom: 16, padding: "10px 16px", borderRadius: 14, background: "rgba(251,191,36,.08)", border: "1px solid rgba(251,191,36,.2)" }}>
                  <div style={{ fontSize: 9, fontWeight: 800, color: "#fbbf24", letterSpacing: 2, textTransform: "uppercase", marginBottom: 4 }}>Mode Démo</div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: "#fff", letterSpacing: 6, fontFamily: "'Montserrat',sans-serif" }}>{demoOtpCode}</div>
                </div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn-secondary" style={{ flex: "0 0 auto", width: "auto", padding: "13px 18px" }} onClick={() => goToStep(2)}>
                  <ArrowLeftIcon />
                </button>
                <button className="btn-primary" style={{ marginBottom: 0, flex: 1 }} onClick={handleVerify} disabled={verifyLoading}>
                  {!verifyLoading ? <span>Vérifier</span> : <div className="btn-loader" />}
                </button>
              </div>
            </div>
          )}

          {/* Registration Success */}
          {showRegisterSuccess && (
            <div className="success-wrap">
              <div className="success-circle">
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" width="34" height="34" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="success-title">Compte créé !</div>
              <div className="success-sub">
                Bienvenue sur <strong style={{ color: "var(--blue)" }}>Morali Pay</strong>.<br />
                Votre espace financier est prêt.
              </div>
              <button className="btn-primary" style={{ width: "100%" }} onClick={() => enterDashboard()}>
                Accéder à mon espace
                <ArrowRightIcon />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
