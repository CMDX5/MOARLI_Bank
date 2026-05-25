'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  ArrowLeftRight,
  Bell,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownLeft,
  Info,
} from 'lucide-react'

const EXCHANGE_RATES: Record<string, Record<string, number>> = {
  EUR: { XAF: 655.96, USD: 1.09 },
  USD: { XAF: 602.50, EUR: 0.92 },
  XAF: { EUR: 0.00152, USD: 0.00166 },
}

const SPREAD_FEE = 0.015

const CURRENCIES = [
  { code: 'XAF', flag: '🇨🇬', label: 'FCFA' },
  { code: 'EUR', flag: '🇪🇺', label: '€' },
  { code: 'USD', flag: '🇺🇸', label: '$' },
]

function fmtXaf(n: number) {
  return new Intl.NumberFormat('fr-FR').format(Math.round(n))
}
function fmtEur(n: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(n)
}
function fmtUsd(n: number) {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'USD',
  }).format(n)
}

function fmtCur(n: number, code: string) {
  if (code === 'XAF') return `${fmtXaf(n)} FCFA`
  if (code === 'EUR') return fmtEur(n)
  return fmtUsd(n)
}

// Mock transactions per wallet
const WALLET_TX: Record<string, { description: string; amount: number; type: 'credit' | 'debit'; date: string }[]> = {
  XAF: [
    { description: 'Dépôt MTN Cash', amount: 50000, type: 'credit', date: '23/05' },
    { description: 'Transfert à Jean', amount: 12000, type: 'debit', date: '23/05' },
    { description: 'Paiement Total Energies', amount: 2500, type: 'debit', date: '22/05' },
    { description: 'Dépôt Airtel Money', amount: 100000, type: 'credit', date: '21/05' },
  ],
  EUR: [
    { description: 'Réception virement', amount: 50, type: 'credit', date: '20/05' },
    { description: 'Achat en ligne', amount: 15, type: 'debit', date: '18/05' },
  ],
  USD: [
    { description: 'Réception PayPal', amount: 70, type: 'credit', date: '15/05' },
    { description: 'Paiement Abonnement', amount: 10, type: 'debit', date: '10/05' },
  ],
}

export function WalletsPage() {
  const { balanceXAF, balanceEUR, balanceUSD } = useAppStore()

  const [convertOpen, setConvertOpen] = useState(false)
  const [fromCur, setFromCur] = useState('EUR')
  const [toCur, setToCur] = useState('XAF')
  const [convertAmt, setConvertAmt] = useState('')
  const [activeTab, setActiveTab] = useState<'XAF' | 'EUR' | 'USD'>('XAF')

  const balances: Record<string, number> = {
    XAF: balanceXAF,
    EUR: balanceEUR,
    USD: balanceUSD,
  }

  const rate =
    fromCur !== toCur ? EXCHANGE_RATES[fromCur]?.[toCur] ?? 1 : 1
  const convertedAmount = convertAmt ? parseFloat(convertAmt) * rate : 0
  const fee = convertedAmount * SPREAD_FEE
  const netAmount = convertedAmount - fee

  // Rate alert
  const [alertOpen, setAlertOpen] = useState(false)
  const [threshold, setThreshold] = useState('')

  return (
    <div className="space-y-6 px-4 pb-28 pt-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Portefeuilles</h1>
        <p className="text-muted-foreground text-sm">
          Gérez vos devises et conversions
        </p>
      </div>

      {/* Wallet Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {CURRENCIES.map((cur) => (
          <Card
            key={cur.code}
            className={`cursor-pointer transition-all ${
              activeTab === cur.code ? 'ring-2 ring-primary' : ''
            }`}
            onClick={() => setActiveTab(cur.code as 'XAF' | 'EUR' | 'USD')}
          >
            <CardContent className="py-5">
              <div className="flex items-center gap-3">
                <span className="text-3xl">{cur.flag}</span>
                <div>
                  <p className="text-muted-foreground text-xs">{cur.code} — {cur.label}</p>
                  <p className="text-xl font-bold">{fmtCur(balances[cur.code], cur.code)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Convert Button */}
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogTrigger asChild>
          <Button className="w-full gap-2" size="lg">
            <ArrowLeftRight className="size-4" />
            Convertir
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Convertir des devises</DialogTitle>
            <DialogDescription>
              Échangez entre vos portefeuilles au taux du jour.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>De</Label>
              <div className="flex gap-2">
                <Select value={fromCur} onValueChange={setFromCur}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code}>
                        {c.flag} {c.code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  placeholder="0"
                  className="flex-1"
                  value={convertAmt}
                  onChange={(e) => setConvertAmt(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Vers</Label>
              <Select value={toCur} onValueChange={setToCur}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.code} value={c.code}>
                      {c.flag} {c.code} — {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Rate display */}
            {fromCur !== toCur && (
              <div className="rounded-lg bg-muted p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Info className="size-4 text-muted-foreground" />
                  <span>
                    1 {fromCur} = {new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(rate)} {toCur}
                  </span>
                </div>
                {convertAmt && (
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p>Montant converti: {fmtCur(convertedAmount, toCur)}</p>
                    <p className="text-amber-500">
                      Frais de spread (1.5%): -{fmtCur(fee, toCur)}
                    </p>
                    <p className="font-medium text-foreground">
                      Vous recevrez: {fmtCur(netAmount, toCur)}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              onClick={() => setConvertOpen(false)}
              disabled={!convertAmt || parseFloat(convertAmt) <= 0 || fromCur === toCur}
            >
              Convertir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transaction History per Wallet */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">
                Historique — {CURRENCIES.find((c) => c.code === activeTab)?.flag}{' '}
                {activeTab}
              </CardTitle>
              <CardDescription>
                Dernières transactions
              </CardDescription>
            </div>
            {/* Tab toggles */}
            <div className="flex gap-1">
              {CURRENCIES.map((c) => (
                <Button
                  key={c.code}
                  variant={activeTab === c.code ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => setActiveTab(c.code as 'XAF' | 'EUR' | 'USD')}
                >
                  {c.code}
                </Button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {WALLET_TX[activeTab]?.length === 0 && (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Aucune transaction
            </p>
          )}
          <div className="space-y-3">
            {WALLET_TX[activeTab]?.map((tx, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg p-2 transition-colors hover:bg-muted/50"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex size-9 items-center justify-center rounded-full ${
                      tx.type === 'credit'
                        ? 'bg-green-500/10 text-green-600'
                        : 'bg-red-500/10 text-red-600'
                    }`}
                  >
                    {tx.type === 'credit' ? (
                      <ArrowDownLeft className="size-4" />
                    ) : (
                      <ArrowUpRight className="size-4" />
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium">{tx.description}</p>
                    <p className="text-muted-foreground text-xs">{tx.date}/2025</p>
                  </div>
                </div>
                <span
                  className={`text-sm font-semibold ${
                    tx.type === 'credit' ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {tx.type === 'credit' ? '+' : '-'}
                  {fmtCur(tx.amount, activeTab)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Rate Alert */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bell className="size-4" />
            Alerte de taux
          </CardTitle>
          <CardDescription>
            Recevez une notification quand le taux USD/XAF atteint votre seuil.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={alertOpen} onOpenChange={setAlertOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full gap-2">
                <TrendingUp className="size-4" />
                Définir un seuil USD/XAF
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Alerte de taux USD/XAF</DialogTitle>
                <DialogDescription>
                  Actuellement: 1 USD = 602,50 XAF
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Seuil (XAF pour 1 USD)</Label>
                  <Input
                    type="number"
                    placeholder="602.50"
                    value={threshold}
                    onChange={(e) => setThreshold(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1"
                    onClick={() => { setThreshold('590'); }}
                  >
                    <TrendingDown className="size-3" />
                    Baisse (&lt; 590)
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1"
                    onClick={() => { setThreshold('620'); }}
                  >
                    <TrendingUp className="size-3" />
                    Hausse (&gt; 620)
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => setAlertOpen(false)}>
                  Activer l'alerte
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  )
}
