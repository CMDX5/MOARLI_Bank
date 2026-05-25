'use client'

import { useMemo } from 'react'
import {
  Send,
  Download,
  QrCode,
  ScanLine,
  Bell,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  ShoppingCart,
  Lightbulb,
  ChevronRight,
  Wallet,
} from 'lucide-react'

import { useAppStore, type PageId } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'

// ── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(n)

const txIcon = (type: string) => {
  switch (type) {
    case 'deposit':
      return <ArrowDownLeft className="size-4" />
    case 'withdrawal':
      return <ArrowUpRight className="size-4" />
    case 'transfer':
      return <ArrowLeftRight className="size-4" />
    case 'payment':
    case 'qr_payment':
      return <ShoppingCart className="size-4" />
    default:
      return <Wallet className="size-4" />
  }
}

const txColor = (type: string) => {
  switch (type) {
    case 'deposit':
      return 'bg-emerald-500/15 text-emerald-500'
    case 'withdrawal':
      return 'bg-red-500/15 text-red-500'
    case 'transfer':
      return 'bg-blue-500/15 text-blue-500'
    case 'payment':
    case 'qr_payment':
      return 'bg-amber-500/15 text-amber-500'
    default:
      return 'bg-muted text-muted-foreground'
  }
}

const txAmountColor = (type: string) =>
  type === 'deposit' ? 'text-emerald-500' : 'text-red-500'

const timeAgo = (dateStr: string) => {
  const now = Date.now()
  const then = new Date(dateStr).getTime()
  const mins = Math.floor((now - then) / 60_000)
  if (mins < 60) return `Il y a ${mins} min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `Il y a ${hours}h`
  const days = Math.floor(hours / 24)
  return `Il y a ${days}j`
}

// ── Component ────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const {
    theme,
    isOnline,
    unreadCount,
    balanceXAF,
    balanceEUR,
    balanceUSD,
    transactions,
    savingsGoals,
    budget,
    setCurrentPage,
  } = useAppStore()

  const recentTx = useMemo(() => transactions.slice(0, 5), [transactions])

  const activeGoals = useMemo(
    () => savingsGoals.filter((g) => g.status === 'active'),
    [savingsGoals],
  )

  const budgetPercent = budget
    ? Math.round((budget.spentAmount / budget.totalAmount) * 100)
    : 0

  const isDark = theme === 'moarli-dark'

  const navigate = (page: PageId) => () => setCurrentPage(page)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 pb-28">
      {/* ─── 1. Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-3">
          <Avatar className="size-10">
            <AvatarFallback className="bg-emerald-600 text-white text-sm font-bold">
              MD
            </AvatarFallback>
          </Avatar>

          <div>
            <p className="text-sm text-muted-foreground">Bonjour,</p>
            <h1 className="text-lg font-bold leading-tight">
              Moussa{' '}
              <span role="img" aria-label="wave">
                👋
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Online / Offline indicator */}
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={`inline-block size-2 rounded-full ${
                isOnline ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,.6)]' : 'bg-red-500 shadow-[0_0_6px_rgba(239,68,68,.6)]'
              }`}
            />
            {isOnline ? 'En ligne' : 'Hors ligne'}
          </span>

          {/* Notification bell */}
          <Button
            variant="ghost"
            size="icon"
            className="relative"
            onClick={navigate('notifications')}
            aria-label="Notifications"
          >
            <Bell className="size-5" />
            {unreadCount > 0 && (
              <Badge className="absolute -top-1 -right-1 size-5 items-center justify-center rounded-full p-0 text-[10px] bg-red-500 text-white border-0">
                {unreadCount > 9 ? '9+' : unreadCount}
              </Badge>
            )}
          </Button>
        </div>
      </div>

      {/* ─── 2. Balance Card (Hero) ───────────────────────────────────────── */}
      <Card
        className={`relative overflow-hidden border-0 py-0 gap-0 ${
          isDark
            ? 'bg-gradient-to-br from-emerald-600 via-emerald-700 to-gray-900'
            : 'bg-gradient-to-br from-emerald-500 via-emerald-400 to-teal-300'
        }`}
      >
        {/* Decorative circles */}
        <div className="pointer-events-none absolute -top-12 -right-12 size-48 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 size-56 rounded-full bg-white/5 blur-3xl" />

        <CardContent className="relative z-10 px-6 py-7">
          <p className="text-sm font-medium text-white/70">Solde principal</p>
          <p className="mt-1 text-3xl font-extrabold tracking-tight text-white">
            {fmt(balanceXAF)}{' '}
            <span className="text-lg font-semibold text-white/80">FCFA</span>
          </p>

          {/* Mini wallets */}
          <div className="mt-5 flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 backdrop-blur-sm">
              <span className="text-xs font-bold text-white/60">EUR</span>
              <span className="text-sm font-semibold text-white">
                {fmt(balanceEUR)} €
              </span>
            </div>
            <div className="flex items-center gap-2 rounded-lg bg-white/15 px-3 py-2 backdrop-blur-sm">
              <span className="text-xs font-bold text-white/60">USD</span>
              <span className="text-sm font-semibold text-white">
                ${fmt(balanceUSD)}
              </span>
            </div>
          </div>

          <Button
            variant="ghost"
            className="mt-5 h-auto p-0 text-sm font-medium text-white/80 hover:text-white hover:bg-transparent"
            onClick={navigate('wallets')}
          >
            Voir tout <ChevronRight className="ml-1 size-4" />
          </Button>
        </CardContent>
      </Card>

      {/* ─── 3. Quick Actions ─────────────────────────────────────────────── */}
      <div>
        <div className="grid grid-cols-4 gap-3">
          <QuickAction
            icon={<Send className="size-5 text-white" />}
            label="Envoyer"
            bg="bg-emerald-500 hover:bg-emerald-600"
            onClick={navigate('send')}
          />
          <QuickAction
            icon={<Download className="size-5 text-white" />}
            label="Recevoir"
            bg="bg-blue-500 hover:bg-blue-600"
            onClick={navigate('receive')}
          />
          <QuickAction
            icon={<QrCode className="size-5 text-white" />}
            label="QR Code"
            bg="bg-amber-500 hover:bg-amber-600"
            onClick={navigate('qr-payment')}
          />
          <QuickAction
            icon={<ScanLine className="size-5 text-white" />}
            label="Scanner"
            bg="bg-purple-500 hover:bg-purple-600"
            onClick={navigate('qr-payment')}
          />
        </div>
      </div>

      {/* ─── 4. Savings Goals Preview ─────────────────────────────────────── */}
      {activeGoals.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-base font-bold">Objectifs d'épargne</h2>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
              onClick={navigate('savings')}
            >
              Voir tout <ChevronRight className="ml-0.5 size-4" />
            </Button>
          </div>

          <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
            {activeGoals.map((goal) => {
              const pct = Math.round(
                (goal.currentAmount / goal.targetAmount) * 100,
              )
              return (
                <Card
                  key={goal.id}
                  className="min-w-[200px] flex-shrink-0 gap-3 border-0 shadow-md"
                >
                  <CardContent className="px-4 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-2xl" role="img">
                        {goal.emoji}
                      </span>
                      <span className="text-sm font-semibold leading-tight line-clamp-1">
                        {goal.title}
                      </span>
                    </div>

                    <div className="mt-3">
                      <Progress value={pct} className="h-2" />
                      <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                        <span>
                          {fmt(goal.currentAmount)} / {fmt(goal.targetAmount)}{' '}
                          FCFA
                        </span>
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {pct}%
                        </span>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      )}

      {/* ─── 5. Latest Transactions ───────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center justify-between px-1">
          <h2 className="text-base font-bold">Transactions récentes</h2>
          <Button
            variant="ghost"
            size="sm"
            className="h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
            onClick={navigate('transactions')}
          >
            Voir tout <ChevronRight className="ml-0.5 size-4" />
          </Button>
        </div>

        <Card className="gap-0 divide-y divide-border overflow-hidden border-0 shadow-sm">
          {recentTx.map((tx) => (
            <div
              key={tx.id}
              className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted/50 cursor-pointer"
            >
              {/* Icon */}
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-full ${txColor(tx.type)}`}
              >
                {txIcon(tx.type)}
              </div>

              {/* Description & time */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{tx.description}</p>
                <p className="text-xs text-muted-foreground">{timeAgo(tx.createdAt)}</p>
              </div>

              {/* Amount */}
              <p
                className={`shrink-0 text-sm font-bold tabular-nums ${txAmountColor(tx.type)}`}
              >
                {tx.type === 'deposit' ? '+' : '-'}
                {fmt(tx.amount)} FCFA
              </p>
            </div>
          ))}
        </Card>
      </section>

      {/* ─── 6. AI Insight Card ───────────────────────────────────────────── */}
      <Card className="border-0 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-fuchsia-500/10 dark:from-indigo-500/20 dark:via-purple-500/20 dark:to-fuchsia-500/20 gap-0">
        <CardContent className="px-5 py-5">
          <div className="flex items-start gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-purple-500/20 text-lg">
              💡
            </span>
            <div>
              <p className="text-sm font-bold text-purple-700 dark:text-purple-300">
                Conseil du jour
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Vous économisez 15% de plus que le mois dernier. Continuez !
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ─── 7. Budget Progress ───────────────────────────────────────────── */}
      {budget && (
        <section>
          <Card className="gap-0 border-0 shadow-sm">
            <CardContent className="px-5 py-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold">Budget {budget.month}</h2>
                <span className="text-xs text-muted-foreground">
                  {fmt(budget.spentAmount)} / {fmt(budget.totalAmount)} FCFA
                </span>
              </div>

              <div className="mt-3">
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                  <span>
                    <span className="text-base font-bold text-foreground">
                      {budgetPercent}%
                    </span>{' '}
                    du budget utilisé
                  </span>
                  <span
                    className={`font-semibold ${
                      budgetPercent >= 80
                        ? 'text-red-500'
                        : budgetPercent >= 50
                          ? 'text-amber-500'
                          : 'text-emerald-500'
                    }`}
                  >
                    {budgetPercent >= 80
                      ? 'Attention'
                      : budgetPercent >= 50
                        ? 'Modéré'
                        : 'Bien'}
                  </span>
                </div>
                <Progress value={budgetPercent} className="h-3" />
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="mt-3 h-auto p-0 text-sm text-muted-foreground hover:text-foreground"
                onClick={navigate('budget')}
              >
                Voir le budget <ChevronRight className="ml-0.5 size-4" />
              </Button>
            </CardContent>
          </Card>
        </section>
      )}
    </div>
  )
}

// ── Quick Action Sub-component ──────────────────────────────────────────────

function QuickAction({
  icon,
  label,
  bg,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  bg: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-2"
    >
      <div
        className={`flex size-14 items-center justify-center rounded-full shadow-md transition-transform active:scale-95 ${bg}`}
      >
        {icon}
      </div>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </button>
  )
}
