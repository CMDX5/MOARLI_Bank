'use client'

import { useState, useMemo } from 'react'
import {
  Search,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowLeftRight,
  CreditCard,
  QrCode,
  Clock,
  ChevronRight,
  Inbox,
} from 'lucide-react'
import { useAppStore, type Transaction } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

const fmt = new Intl.NumberFormat('fr-FR')
const fmtTime = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
})
const fmtDate = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

type FilterTab = 'all' | 'deposit' | 'withdrawal' | 'transfer' | 'payment'

const tabConfig: { value: FilterTab; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'deposit', label: 'Dépôts' },
  { value: 'withdrawal', label: 'Retraits' },
  { value: 'transfer', label: 'Transferts' },
  { value: 'payment', label: 'Paiements' },
]

function getTypeIcon(type: Transaction['type']) {
  switch (type) {
    case 'deposit':
      return <ArrowDownLeft className="size-5 text-emerald-500" />
    case 'withdrawal':
      return <ArrowUpRight className="size-5 text-red-400" />
    case 'transfer':
      return <ArrowLeftRight className="size-5 text-blue-400" />
    case 'payment':
      return <CreditCard className="size-5 text-orange-400" />
    case 'qr_payment':
      return <QrCode className="size-5 text-violet-400" />
    case 'credit':
      return <ArrowDownLeft className="size-5 text-emerald-500" />
    default:
      return <Clock className="size-5 text-muted-foreground" />
  }
}

function getTypeLabel(type: Transaction['type']) {
  switch (type) {
    case 'deposit':
      return 'Dépôt'
    case 'withdrawal':
      return 'Retrait'
    case 'transfer':
      return 'Transfert'
    case 'payment':
      return 'Paiement'
    case 'qr_payment':
      return 'Paiement QR'
    case 'credit':
      return 'Crédit'
    default:
      return 'Autre'
  }
}

function getStatusLabel(status: Transaction['status']) {
  switch (status) {
    case 'completed':
      return 'Terminé'
    case 'pending':
      return 'En attente'
    case 'failed':
      return 'Échoué'
    case 'queued':
      return 'En file'
    default:
      return status
  }
}

function getStatusClasses(status: Transaction['status']) {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500/15 text-emerald-500 border-emerald-500/25'
    case 'pending':
    case 'queued':
      return 'bg-amber-500/15 text-amber-500 border-amber-500/25'
    case 'failed':
      return 'bg-red-500/15 text-red-500 border-red-500/25'
    default:
      return ''
  }
}

function getDateGroup(dateStr: string): string {
  const txDate = new Date(dateStr)
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)

  const txDay = new Date(txDate.getFullYear(), txDate.getMonth(), txDate.getDate())

  if (txDay.getTime() === today.getTime()) return "Aujourd'hui"
  if (txDay.getTime() === yesterday.getTime()) return 'Hier'
  if (txDay >= weekAgo) return 'Cette semaine'
  return 'Plus ancien'
}

function TransactionItem({
  tx,
  onClick,
}: {
  tx: Transaction
  onClick: () => void
}) {
  const isDeposit = tx.type === 'deposit' || tx.type === 'credit'

  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-muted/50 active:bg-muted/80"
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
        {getTypeIcon(tx.type)}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{tx.description}</span>
        </div>
        <div className="flex items-center gap-2">
          {tx.category && (
            <span className="text-xs text-muted-foreground capitalize">
              {tx.category}
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {fmtTime.format(new Date(tx.createdAt))}
          </span>
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span
          className={cn(
            'text-sm font-semibold tabular-nums',
            isDeposit ? 'text-emerald-500' : 'text-red-400'
          )}
        >
          {isDeposit ? '+' : '-'} {fmt.format(tx.amount)} {tx.currency}
        </span>
        {tx.status === 'pending' && (
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 border-amber-500/30 text-amber-500"
          >
            En attente
          </Badge>
        )}
      </div>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
    </button>
  )
}

export function TransactionsPage() {
  const transactions = useAppStore((s) => s.transactions)
  const [search, setSearch] = useState('')
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null)

  const filtered = useMemo(() => {
    let list = [...transactions]

    // Filter by tab
    if (activeTab !== 'all') {
      if (activeTab === 'payment') {
        list = list.filter(
          (tx) => tx.type === 'payment' || tx.type === 'qr_payment'
        )
      } else {
        list = list.filter((tx) => tx.type === activeTab)
      }
    }

    // Filter by search
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (tx) =>
          tx.description.toLowerCase().includes(q) ||
          tx.reference.toLowerCase().includes(q) ||
          (tx.recipientName && tx.recipientName.toLowerCase().includes(q)) ||
          (tx.recipientPhone && tx.recipientPhone.includes(q))
      )
    }

    return list
  }, [transactions, activeTab, search])

  const grouped = useMemo(() => {
    const groups: Record<string, Transaction[]> = {}
    for (const tx of filtered) {
      const group = getDateGroup(tx.createdAt)
      if (!groups[group]) groups[group] = []
      groups[group].push(tx)
    }

    const order = ["Aujourd'hui", 'Hier', 'Cette semaine', 'Plus ancien']
    const result: { label: string; items: Transaction[] }[] = []
    for (const key of order) {
      if (groups[key]) {
        result.push({ label: key, items: groups[key] })
      }
    }
    return result
  }, [filtered])

  return (
    <div className="flex flex-col gap-4 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Transactions</h1>
        <p className="text-sm text-muted-foreground">
          Historique de vos opérations
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Rechercher une transaction..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Filter Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as FilterTab)}
      >
        <TabsList className="w-full overflow-x-auto">
          {tabConfig.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="text-xs">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* Content for all tabs shares the same list (filtered above) */}
        {tabConfig.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-3">
            {grouped.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-3 py-12">
                  <div className="flex size-14 items-center justify-center rounded-full bg-muted">
                    <Inbox className="size-7 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Aucune transaction trouvée
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    Essayez de modifier vos filtres ou votre recherche
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="flex flex-col gap-1">
                {grouped.map((group) => (
                  <div key={group.label}>
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.label}
                      <span className="ml-2 text-muted-foreground/60">
                        ({group.items.length})
                      </span>
                    </p>
                    <Card>
                      <CardContent className="divide-y divide-border/50 p-1">
                        {group.items.map((tx) => (
                          <div key={tx.id}>
                            <TransactionItem
                              tx={tx}
                              onClick={() => setSelectedTx(tx)}
                            />
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        ))}
      </Tabs>

      {/* Transaction Detail Dialog */}
      <Dialog
        open={!!selectedTx}
        onOpenChange={(open) => !open && setSelectedTx(null)}
      >
        <DialogContent className="max-w-sm">
          {selectedTx && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <div className="flex size-8 items-center justify-center rounded-full bg-muted">
                    {getTypeIcon(selectedTx.type)}
                  </div>
                  Détails de la transaction
                </DialogTitle>
                <DialogDescription>
                  {getTypeLabel(selectedTx.type)} —{' '}
                  {fmtDate.format(new Date(selectedTx.createdAt))}
                </DialogDescription>
              </DialogHeader>

              <div className="flex flex-col gap-4">
                {/* Amount */}
                <div className="flex flex-col items-center gap-1 rounded-xl bg-muted/50 p-4">
                  <span
                    className={cn(
                      'text-2xl font-bold tabular-nums',
                      selectedTx.type === 'deposit' || selectedTx.type === 'credit'
                        ? 'text-emerald-500'
                        : 'text-red-400'
                    )}
                  >
                    {selectedTx.type === 'deposit' || selectedTx.type === 'credit' ? '+' : '-'}{' '}
                    {fmt.format(selectedTx.amount)} {selectedTx.currency}
                  </span>
                  <Badge
                    variant="outline"
                    className={cn('text-xs', getStatusClasses(selectedTx.status))}
                  >
                    {getStatusLabel(selectedTx.status)}
                  </Badge>
                </div>

                <Separator />

                {/* Details */}
                <div className="flex flex-col gap-3">
                  <DetailRow label="Description" value={selectedTx.description} />
                  <DetailRow label="Référence" value={selectedTx.reference} mono />
                  <DetailRow
                    label="Type"
                    value={getTypeLabel(selectedTx.type)}
                  />
                  <DetailRow label="Devise" value={selectedTx.currency} />
                  {selectedTx.recipientName && (
                    <DetailRow
                      label="Bénéficiaire"
                      value={selectedTx.recipientName}
                    />
                  )}
                  {selectedTx.recipientPhone && (
                    <DetailRow
                      label="Téléphone"
                      value={selectedTx.recipientPhone}
                    />
                  )}
                  {selectedTx.category && (
                    <DetailRow
                      label="Catégorie"
                      value={selectedTx.category.charAt(0).toUpperCase() + selectedTx.category.slice(1)}
                    />
                  )}
                  <DetailRow
                    label="Date"
                    value={fmtDate.format(new Date(selectedTx.createdAt)) +
                      ' à ' +
                      fmtTime.format(new Date(selectedTx.createdAt))}
                  />
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <span className="shrink-0 text-sm text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-right text-sm font-medium',
          mono && 'font-mono text-xs'
        )}
      >
        {value}
      </span>
    </div>
  )
}
