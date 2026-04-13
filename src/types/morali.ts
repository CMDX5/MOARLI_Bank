// ── MORALI PAY — Shared Types ──
// Extracted from MoraliApp.tsx for component reusability

export type AuthTab = "login" | "register" | "forgot";
export type ForgotStep = "email" | "code" | "newPassword" | "success";
export type Screen =
  | "auth" | "dashboard" | "payments" | "cards" | "profile"
  | "privileges" | "transaction" | "services" | "merchant"
  | "microcredit" | "personalloan" | "loans" | "currency"
  | "credit" | "internet" | "canalplus" | "electricity"
  | "water" | "tontine" | "crypto" | "savings" | "wallet" | "admin";
export type AdminTab = "overview" | "users" | "transactions" | "analytics" | "settings" | "loans" | "audit";
export type NavItem = "Accueil" | "Cartes" | "Privilèges" | "Profil";
export type TransactionType = "depot" | "retrait";
export type OperatorKey = "mtn" | "airtel";
export type TxActionKey = "depot" | "retrait";

export type RegisterData = {
  prenom: string;
  nom: string;
  email: string;
  tel: string;
  prefix: string;
  pw: string;
};

export type IconName =
  | "send" | "receive" | "card" | "grid" | "briefcase"
  | "home" | "bolt" | "building" | "phone" | "cart"
  | "user" | "lock" | "spark" | "morali" | "bank"
  | "shield" | "wallet" | "service" | "transfer" | "bell"
  | "search" | "globe" | "tv" | "droplet" | "qr"
  | "piggy" | "coins" | "swap" | "users" | "flash"
  | "crypto" | "camera" | "request" | "pin" | "snowflake"
  | "receipt" | "headset" | "document" | "chevronRight";

export type Transaction = {
  icon: IconName;
  bg: string;
  name: string;
  date: string;
  dateTimestamp?: number;
  amount: string;
  type: "credit" | "debit";
  category: string;
  receiptId?: string;
  status?: "success" | "pending" | "failed";
  channel?: string;
};

export type NotificationItem = {
  id: string;
  icon: IconName;
  bg: string;
  title: string;
  time: string;
  badge: string;
  badgeClass: string;
  read: boolean;
};

export type PaymentContact = {
  name: string;
  tone: "grad-blue" | "grad-purple" | "grad-amber" | "grad-rose";
};

export type SearchServiceItem = {
  id: string;
  name: string;
  category: string;
  icon: IconName;
};

export type SearchContactItem = {
  name: string;
};

export type MoraliUser = {
  name: string;
  pseudo: string;
  account: string;
  uid: string;
  tone: PaymentContact["tone"];
};

export type FirestoreMoraliUser = {
  uid: string;
  fullName: string;
  firstName: string;
  lastName: string;
  pseudo: string;
  moraliId: string;
  moraliIdNormalized?: string;
  rib: string;
  phone: string;
  email: string;
  balance?: number;
  savingsBalance?: number;
  eurWallet?: number;
  usdWallet?: number;
  tontineGroups?: { name: string; contributionAmount: string; members: { name: string; paid: boolean }[]; pot?: number }[];
  passwordHint?: string;
  accountStatus?: "active" | "suspended";
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type FirestoreTransfer = {
  senderUid: string;
  senderMoraliId: string;
  senderName: string;
  recipientUid: string;
  recipientMoraliId: string;
  recipientName: string;
  amount: number;
  fees: number;
  type: "depot" | "retrait" | "virement" | "remboursement";
  destination?: "cash" | "airtime" | "loan_request" | "loan_granted";
  status: "success" | "contested" | "flagged" | "pending";
  creditPending?: boolean;
  createdAt?: unknown;
  receiptId: string;
  loanType?: "micro" | "personal";
  totalToRepay?: number;
  duration?: number;
  durationLabel?: string;
};

export type AdminActivityLog = {
  action: string;
  detail: string;
  timestamp: Date;
};

export type AdminConfirmAction = {
  type: "delete-user" | "refund-tx";
  data?: unknown;
  message: string;
};

export type FirestoreNotification = {
  title: string;
  time: string;
  badge: string;
  badgeClass: string;
  icon: IconName;
  bg: string;
  read: boolean;
  createdAt?: unknown;
};

export type VirtualCardDoc = {
  number: string;
  expiry: string;
  cvv: string;
  active: boolean;
  onlineOnly: boolean;
  frozen?: boolean;
  alias?: string;
  spendingLimit?: number;
  provider?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type BlackCardDoc = {
  tier: "black";
  eligible: boolean;
  status: "none" | "requested" | "approved";
  provider: string;
  spendingLimit: number;
  monthlyLimit: number;
  concierge: boolean;
  loungeAccess: boolean;
  prioritySupport: boolean;
  cashbackRate: number;
  requestedAt?: unknown;
  updatedAt?: unknown;
};
