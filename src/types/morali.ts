// ── MORALI PAY — Shared Types ──
// Extracted from MoraliApp.tsx for component reusability

export type AuthTab = "login" | "register" | "forgot";
export type ForgotStep = "email" | "code" | "newPassword" | "success";
export type Screen =
  | "auth" | "dashboard" | "payments" | "cards" | "profile"
  | "privileges" | "transaction" | "services" | "merchant"
  | "microcredit" | "personalloan" | "loans" | "currency"
  | "credit" | "internet" | "canalplus" | "electricity"
  | "water" | "tontine" | "crypto" | "savings" | "wallet" | "admin"
  | "eurWallet" | "usdWallet"
  | "goalSavings" | "budget" | "leaderboard" | "payLinks"
  | "business" | "chat" | "onboarding";
export type AdminTab = "overview" | "users" | "transactions" | "analytics" | "settings" | "loans" | "audit" | "kyc";
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
  | "receipt" | "headset" | "document" | "chevronRight" | "eye-off"
  | "refresh" | "arrow-down"
  | "target" | "chart" | "trophy" | "link" | "palette"
  | "messageCircle" | "check-circle" | "trending-up" | "download"
  | "sun" | "moon" | "monitor" | "star" | "crown" | "gift";

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
  status?: "success" | "pending" | "failed" | "contested" | "flagged";
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
  type: "depot" | "retrait" | "virement" | "remboursement" | "recharge";
  destination?: "cash" | "airtime" | "loan_request" | "loan_granted" | "savings";
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

// ── Theme System ──
export type ThemeMode = "base" | "light";

// ── Goal Savings ──
export type SavingsGoal = {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadline: string;
  icon: IconName;
  color: string;
  createdAt: unknown;
};

// ── Monthly Budget ──
export type BudgetCategory = {
  id: string;
  name: string;
  icon: IconName;
  allocated: number;
  spent: number;
 color: string;
};
export type MonthlyBudget = {
  id: string;
  month: string;
  totalBudget: number;
  totalSpent: number;
  categories: BudgetCategory[];
  alertsEnabled: boolean;
  mtnLimit: number;
  airtelLimit: number;
};

// ── Leaderboard / Gamification ──
export type LeaderboardEntry = {
  uid: string;
  name: string;
  avatar: string;
  score: number;
  level: number;
  badge: string;
};
export type UserAchievement = {
  id: string;
  name: string;
  description: string;
  icon: IconName;
  unlockedAt?: unknown;
  progress?: number;
};

// ── Pay Links ──
export type PayLink = {
  id: string;
  amount: number;
  currency: string;
  description: string;
  shortCode: string;
  active: boolean;
  createdAt: unknown;
  totalPaid: number;
  payerCount: number;
};

// ── Business Dashboard ──
export type BusinessStats = {
  totalRevenue: number;
  totalTransactions: number;
  avgTransaction: number;
 topProducts: Array<{ name: string; count: number; revenue: number }>;
};

// ── Chat Support ──
export type ChatMessage = {
  id: string;
  sender: "user" | "support";
  text: string;
  timestamp: unknown;
  read: boolean;
  imageUrl?: string;
};

// ── Onboarding ──
export type OnboardingStep = {
  id: number;
  title: string;
  description: string;
  icon: IconName;
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
