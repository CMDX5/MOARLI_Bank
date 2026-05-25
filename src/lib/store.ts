import { create } from 'zustand'

export type ThemeMode = 'default' | 'moarli-dark' | 'moarli-light'

export type PageId =
  | 'dashboard'
  | 'transactions'
  | 'send'
  | 'receive'
  | 'paylink'
  | 'split-bill'
  | 'cards'
  | 'cagnotte'
  | 'savings'
  | 'budget'
  | 'business'
  | 'credit'
  | 'score'
  | 'agents'
  | 'tontine'
  | 'wallets'
  | 'leaderboard'
  | 'notifications'
  | 'chat'
  | 'ussd'
  | 'invest'
  | 'onboarding'
  | 'settings'
  | 'receipts'
  | 'qr-payment'

export interface Transaction {
  id: string
  type: 'deposit' | 'withdrawal' | 'transfer' | 'payment' | 'credit' | 'qr_payment'
  amount: number
  currency: string
  status: 'pending' | 'completed' | 'failed' | 'queued'
  description: string
  category?: string
  reference: string
  recipientPhone?: string
  recipientName?: string
  createdAt: string
}

export interface Notification {
  id: string
  type: string
  title: string
  message: string
  isRead: boolean
  createdAt: string
}

export interface VirtualCard {
  id: string
  last4: string
  maskedNumber: string
  expiry: string
  type: 'one_time' | 'recurring'
  amountLimit: number
  amountUsed: number
  status: 'active' | 'expired' | 'blocked' | 'used'
  validUntil: string
}

export interface SavingsGoal {
  id: string
  title: string
  emoji: string
  targetAmount: number
  currentAmount: number
  deadline?: string
  status: 'active' | 'completed' | 'abandoned'
}

export interface BudgetData {
  id: string
  month: string
  totalAmount: number
  spentAmount: number
  categories: { name: string; spent: number; limit: number; color: string }[]
}

export interface PayLinkData {
  id: string
  amount: number
  currency: string
  description?: string
  linkCode: string
  status: 'active' | 'paid' | 'expired' | 'cancelled'
  expiresAt: string
  createdAt: string
}

export interface Badge {
  id: string
  badgeType: string
  earnedAt: string
  label: string
  emoji: string
  description: string
}

export interface TontineData {
  id: string
  name: string
  amount: number
  frequency: 'weekly' | 'monthly'
  maxMembers: number
  currentTurn: number
  memberCount: number
  status: 'active' | 'completed'
  inviteLink: string
}

interface AppState {
  // Navigation
  currentPage: PageId
  previousPages: PageId[]
  setCurrentPage: (page: PageId) => void
  goBack: () => void

  // Theme
  theme: ThemeMode
  setTheme: (theme: ThemeMode) => void

  // User
  userName: string
  userPhone: string
  userAvatar: string | null

  // Balances
  balanceXAF: number
  balanceEUR: number
  balanceUSD: number

  // Transactions
  transactions: Transaction[]
  addTransaction: (tx: Transaction) => void

  // Notifications
  notifications: Notification[]
  unreadCount: number
  addNotification: (n: Notification) => void
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void

  // Cards
  cards: VirtualCard[]
  addCard: (card: VirtualCard) => void
  blockCard: (id: string) => void

  // Savings Goals
  savingsGoals: SavingsGoal[]
  addSavingsGoal: (goal: SavingsGoal) => void
  updateSavingsGoal: (id: string, amount: number) => void

  // Budget
  budget: BudgetData | null
  setBudget: (budget: BudgetData) => void

  // Pay Links
  payLinks: PayLinkData[]
  addPayLink: (link: PayLinkData) => void

  // Badges
  badges: Badge[]

  // Credit Score
  creditScore: number
  scoreHistory: { date: string; score: number }[]

  // Leaderboard
  leaderboard: { rank: number; name: string; score: number; badges: number }[]

  // Tontines
  tontines: TontineData[]
  addTontine: (t: TontineData) => void

  // Onboarding
  onboardingStep: number
  onboardingComplete: boolean
  setOnboardingStep: (step: number) => void
  completeOnboarding: () => void

  // Offline
  isOnline: boolean
  pendingTransactions: Transaction[]
  setOnlineStatus: (status: boolean) => void
  addPendingTransaction: (tx: Transaction) => void
  clearPendingTransactions: () => void

  // Savings round-up
  savingsRoundUp: boolean
  toggleSavingsRoundUp: () => void

  // Chat
  chatMessages: { id: string; sender: 'user' | 'bot'; message: string; timestamp: string }[]
  addChatMessage: (msg: { sender: 'user' | 'bot'; message: string }) => void
}

// Mock data
const mockTransactions: Transaction[] = [
  { id: '1', type: 'deposit', amount: 50000, currency: 'XAF', status: 'completed', description: 'Dépôt MTN Cash', category: 'deposit', reference: 'DEP-2025-001', recipientName: 'Moi', createdAt: '2025-05-23T10:00:00Z' },
  { id: '2', type: 'transfer', amount: 12000, currency: 'XAF', status: 'completed', description: 'Transfert à Jean', category: 'transfers', reference: 'TRF-2025-002', recipientPhone: '+242065123456', recipientName: 'Jean Mukendi', createdAt: '2025-05-23T09:30:00Z' },
  { id: '3', type: 'payment', amount: 2500, currency: 'XAF', status: 'completed', description: 'Paiement Total Energies', category: 'services', reference: 'PAY-2025-003', createdAt: '2025-05-22T16:00:00Z' },
  { id: '4', type: 'withdrawal', amount: 20000, currency: 'XAF', status: 'completed', description: 'Retrait Agent MOARLI', category: 'withdrawal', reference: 'RET-2025-004', createdAt: '2025-05-22T14:00:00Z' },
  { id: '5', type: 'deposit', amount: 100000, currency: 'XAF', status: 'completed', description: 'Dépôt Airtel Money', category: 'deposit', reference: 'DEP-2025-005', createdAt: '2025-05-21T11:00:00Z' },
  { id: '6', type: 'transfer', amount: 5000, currency: 'XAF', status: 'completed', description: 'Split Bill Resto', category: 'food', reference: 'SPL-2025-006', recipientName: 'Groupe Resto', createdAt: '2025-05-21T20:00:00Z' },
  { id: '7', type: 'payment', amount: 15000, currency: 'XAF', status: 'completed', description: 'Achat marché', category: 'food', reference: 'PAY-2025-007', createdAt: '2025-05-20T08:00:00Z' },
  { id: '8', type: 'deposit', amount: 75000, currency: 'XAF', status: 'completed', description: 'Dépôt MTN Cash', category: 'deposit', reference: 'DEP-2025-008', createdAt: '2025-05-20T07:00:00Z' },
  { id: '9', type: 'transfer', amount: 30000, currency: 'XAF', status: 'pending', description: 'Transfert à Marie', category: 'transfers', reference: 'TRF-2025-009', recipientPhone: '+242066789012', recipientName: 'Marie Ngoie', createdAt: '2025-05-19T15:00:00Z' },
  { id: '10', type: 'qr_payment', amount: 8500, currency: 'XAF', status: 'completed', description: 'Paiement QR Boutique Centre-ville', category: 'services', reference: 'QR-2025-010', createdAt: '2025-05-19T12:00:00Z' },
]

const mockNotifications: Notification[] = [
  { id: '1', type: 'insight', title: 'Dépenses anormales', message: 'Vous dépensez 40% de plus que d\'habitude cette semaine. Attention !', isRead: false, createdAt: '2025-05-23T11:00:00Z' },
  { id: '2', type: 'deposit', title: 'Dépôt reçu', message: '50 000 FCFA ont été déposés sur votre compte via MTN Cash.', isRead: false, createdAt: '2025-05-23T10:00:00Z' },
  { id: '3', type: 'budget', title: 'Budget mensuel', message: 'Vous avez atteint 65% de votre budget mensuel (130 000 / 200 000 FCFA).', isRead: false, createdAt: '2025-05-22T18:00:00Z' },
  { id: '4', type: 'savings', title: 'Objectif Épargne 🎯', message: 'Votre objectif "Vacances" a atteint 75% ! Plus que 25 000 FCFA !', isRead: true, createdAt: '2025-05-22T09:00:00Z' },
  { id: '5', type: 'credit', title: 'Crédit approuvé', message: 'Votre demande de micro-crédit de 50 000 FCFA a été approuvée.', isRead: true, createdAt: '2025-05-21T14:00:00Z' },
  { id: '6', type: 'tontine', title: 'Rappel Tontine', message: 'Votre contribution mensuelle de 25 000 FCFA est due dans 3 jours.', isRead: true, createdAt: '2025-05-21T08:00:00Z' },
  { id: '7', type: 'security', title: 'Nouvelle connexion', message: 'Connexion détectée depuis un nouvel appareil à Brazzaville.', isRead: false, createdAt: '2025-05-20T16:00:00Z' },
]

const mockCards: VirtualCard[] = [
  { id: '1', last4: '4829', maskedNumber: '**** **** **** 4829', expiry: '06/26', type: 'one_time', amountLimit: 50000, amountUsed: 32500, status: 'active', validUntil: '2025-05-24T10:00:00Z' },
  { id: '2', last4: '7156', maskedNumber: '**** **** **** 7156', expiry: '12/25', type: 'recurring', amountLimit: 200000, amountUsed: 45000, status: 'active', validUntil: '2025-12-31T23:59:59Z' },
  { id: '3', last4: '3391', maskedNumber: '**** **** **** 3391', expiry: '05/25', type: 'one_time', amountLimit: 15000, amountUsed: 15000, status: 'used', validUntil: '2025-05-20T10:00:00Z' },
]

const mockGoals: SavingsGoal[] = [
  { id: '1', title: 'Vacances à Pointe-Noire', emoji: '✈️', targetAmount: 100000, currentAmount: 75000, deadline: '2025-08-15', status: 'active' },
  { id: '2', title: 'Scolarité des enfants', emoji: '📚', targetAmount: 200000, currentAmount: 120000, deadline: '2025-09-01', status: 'active' },
  { id: '3', title: 'Fonds d\'urgence', emoji: '🛡️', targetAmount: 300000, currentAmount: 185000, status: 'active' },
]

const mockPayLinks: PayLinkData[] = [
  { id: '1', amount: 12000, currency: 'XAF', description: 'Partage resto vendredi', linkCode: 'MOARLI-7X2K9', status: 'active', expiresAt: '2025-05-24T10:00:00Z', createdAt: '2025-05-23T10:00:00Z' },
  { id: '2', amount: 50000, currency: 'XAF', description: 'Remboursement prêt', linkCode: 'MOARLI-3M8P1', status: 'paid', expiresAt: '2025-05-22T10:00:00Z', createdAt: '2025-05-20T10:00:00Z' },
  { id: '3', amount: 8500, currency: 'XAF', description: 'Cadeau anniversaire', linkCode: 'MOARLI-5N4Q7', status: 'expired', expiresAt: '2025-05-18T10:00:00Z', createdAt: '2025-05-15T10:00:00Z' },
]

const mockBadges: Badge[] = [
  { id: '1', badgeType: 'first_deposit', earnedAt: '2025-01-15', label: 'Premier Dépôt', emoji: '🎉', description: 'Effectué votre premier dépôt' },
  { id: '2', badgeType: 'five_transfers', earnedAt: '2025-02-20', label: '5 Virements', emoji: '💸', description: 'Effectué 5 virements ou plus' },
  { id: '3', badgeType: 'saver_bronze', earnedAt: '2025-03-10', label: 'Épargnant Bronze', emoji: '🥉', description: 'Épargné plus de 50 000 FCFA' },
]

const mockScoreHistory = [
  { date: 'Jan', score: 550 },
  { date: 'Fév', score: 580 },
  { date: 'Mar', score: 620 },
  { date: 'Avr', score: 665 },
  { date: 'Mai', score: 710 },
]

const mockLeaderboard = [
  { rank: 1, name: 'Patrick M.', score: 2450, badges: 12 },
  { rank: 2, name: 'Grace N.', score: 2380, badges: 10 },
  { rank: 3, name: 'Joel K.', score: 2200, badges: 9 },
  { rank: 4, name: 'Sarah B.', score: 1950, badges: 8 },
  { rank: 5, name: 'Moi', score: 1800, badges: 6 },
  { rank: 6, name: 'Dieu M.', score: 1750, badges: 7 },
  { rank: 7, name: 'Carine T.', score: 1600, badges: 5 },
  { rank: 8, name: 'Herve L.', score: 1500, badges: 5 },
]

const mockTontines: TontineData[] = [
  { id: '1', name: 'Tontine Famille Mukendi', amount: 25000, frequency: 'monthly', maxMembers: 10, currentTurn: 3, memberCount: 8, status: 'active', inviteLink: 'moarli.app/tontine/ABC123' },
  { id: '2', name: 'Cercle Épargne Femmes', amount: 10000, frequency: 'weekly', maxMembers: 15, currentTurn: 7, memberCount: 12, status: 'active', inviteLink: 'moarli.app/tontine/DEF456' },
]

export const useAppStore = create<AppState>((set) => ({
  // Navigation
  currentPage: 'dashboard',
  previousPages: [],
  setCurrentPage: (page) =>
    set((state) => ({
      currentPage: page,
      previousPages: [...state.previousPages, state.currentPage].slice(-20),
    })),
  goBack: () =>
    set((state) => {
      const prev = [...state.previousPages]
      const last = prev.pop()
      return {
        currentPage: last || 'dashboard',
        previousPages: prev,
      }
    }),

  // Theme
  theme: 'moarli-dark',
  setTheme: (theme) => set({ theme }),

  // User
  userName: 'Moussa Diallo',
  userPhone: '+242 06 543 21 09',
  userAvatar: null,

  // Balances
  balanceXAF: 342500,
  balanceEUR: 85,
  balanceUSD: 120,

  // Transactions
  transactions: mockTransactions,
  addTransaction: (tx) =>
    set((state) => ({ transactions: [tx, ...state.transactions] })),

  // Notifications
  notifications: mockNotifications,
  unreadCount: mockNotifications.filter((n) => !n.isRead).length,
  addNotification: (n) =>
    set((state) => ({
      notifications: [n, ...state.notifications],
      unreadCount: state.unreadCount + 1,
    })),
  markNotificationRead: (id) =>
    set((state) => {
      const updated = state.notifications.map((n) =>
        n.id === id ? { ...n, isRead: true } : n
      )
      return {
        notifications: updated,
        unreadCount: updated.filter((n) => !n.isRead).length,
      }
    }),
  markAllNotificationsRead: () =>
    set((state) => ({
      notifications: state.notifications.map((n) => ({ ...n, isRead: true })),
      unreadCount: 0,
    })),

  // Cards
  cards: mockCards,
  addCard: (card) => set((state) => ({ cards: [card, ...state.cards] })),
  blockCard: (id) =>
    set((state) => ({
      cards: state.cards.map((c) =>
        c.id === id ? { ...c, status: 'blocked' as const } : c
      ),
    })),

  // Savings Goals
  savingsGoals: mockGoals,
  addSavingsGoal: (goal) =>
    set((state) => ({ savingsGoals: [goal, ...state.savingsGoals] })),
  updateSavingsGoal: (id, amount) =>
    set((state) => ({
      savingsGoals: state.savingsGoals.map((g) =>
        g.id === id ? { ...g, currentAmount: Math.min(g.currentAmount + amount, g.targetAmount) } : g
      ),
    })),

  // Budget
  budget: {
    id: '1',
    month: 'Mai 2025',
    totalAmount: 200000,
    spentAmount: 130000,
    categories: [
      { name: 'Alimentation', spent: 45000, limit: 60000, color: '#059669' },
      { name: 'Transport', spent: 25000, limit: 30000, color: '#D97706' },
      { name: 'Mobile Money', spent: 20000, limit: 25000, color: '#0284C7' },
      { name: 'Services', spent: 25000, limit: 40000, color: '#DC2626' },
      { name: 'Transferts', spent: 15000, limit: 30000, color: '#7C3AED' },
      { name: 'Autres', spent: 0, limit: 15000, color: '#6B7280' },
    ],
  },
  setBudget: (budget) => set({ budget }),

  // Pay Links
  payLinks: mockPayLinks,
  addPayLink: (link) => set((state) => ({ payLinks: [link, ...state.payLinks] })),

  // Badges
  badges: mockBadges,

  // Credit Score
  creditScore: 710,
  scoreHistory: mockScoreHistory,

  // Leaderboard
  leaderboard: mockLeaderboard,

  // Tontines
  tontines: mockTontines,
  addTontine: (t) => set((state) => ({ tontines: [t, ...state.tontines] })),

  // Onboarding
  onboardingStep: 0,
  onboardingComplete: true,
  setOnboardingStep: (step) => set({ onboardingStep: step }),
  completeOnboarding: () => set({ onboardingComplete: true, onboardingStep: 0 }),

  // Offline
  isOnline: true,
  pendingTransactions: [],
  setOnlineStatus: (status) => set({ isOnline: status }),
  addPendingTransaction: (tx) =>
    set((state) => ({
      pendingTransactions: [...state.pendingTransactions, tx],
    })),
  clearPendingTransactions: () => set({ pendingTransactions: [] }),

  // Savings round-up
  savingsRoundUp: false,
  toggleSavingsRoundUp: () =>
    set((state) => ({ savingsRoundUp: !state.savingsRoundUp })),

  // Chat
  chatMessages: [
    { id: '1', sender: 'bot', message: 'Bonjour ! Je suis MOARLI Bot 🤖. Comment puis-je vous aider ?\n\nVous pouvez me poser des questions sur :\n- Vos transactions\n- Les fonctionnalités MOARLI\n- Un agent humain sera bientôt disponible.', timestamp: new Date().toISOString() },
  ],
  addChatMessage: (msg) =>
    set((state) => ({
      chatMessages: [
        ...state.chatMessages,
        { id: Date.now().toString(), sender: msg.sender, message: msg.message, timestamp: new Date().toISOString() },
      ],
    })),
}))
