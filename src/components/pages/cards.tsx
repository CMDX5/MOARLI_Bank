'use client'

import { useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
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
  Plus,
  CreditCard,
  Copy,
  ShieldBan,
  Wallet,
  Check,
  QrCode,
  Sparkles,
} from 'lucide-react'
import { useAppStore, type VirtualCard } from '@/lib/store'

const fmt = new Intl.NumberFormat('fr-FR')

function statusBadge(status: VirtualCard['status']) {
  switch (status) {
    case 'active':
      return (
        <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/25 hover:bg-emerald-500/20">
          Active
        </Badge>
      )
    case 'expired':
      return (
        <Badge className="bg-gray-500/15 text-gray-500 border-gray-500/25 hover:bg-gray-500/20">
          Expirée
        </Badge>
      )
    case 'blocked':
      return (
        <Badge className="bg-red-500/15 text-red-600 border-red-500/25 hover:bg-red-500/20">
          Bloquée
        </Badge>
      )
    case 'used':
      return (
        <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/25 hover:bg-amber-500/20">
          Utilisée
        </Badge>
      )
  }
}

function typeBadge(type: VirtualCard['type']) {
  switch (type) {
    case 'one_time':
      return (
        <Badge variant="outline" className="gap-1 text-xs">
          <QrCode className="size-3" />
          Usage unique
        </Badge>
      )
    case 'recurring':
      return (
        <Badge variant="outline" className="gap-1 text-xs">
          <Wallet className="size-3" />
          Récurrente
        </Badge>
      )
  }
}

function CardVisual({ card }: { card: VirtualCard }) {
  const gradients: Record<string, string> = {
    active: 'from-violet-600 via-purple-600 to-indigo-700',
    expired: 'from-gray-500 via-gray-600 to-gray-700',
    blocked: 'from-red-600 via-red-700 to-rose-800',
    used: 'from-amber-500 via-amber-600 to-orange-700',
  }

  return (
    <div
      className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${gradients[card.status]} p-5 text-white shadow-lg aspect-[1.586/1] flex flex-col justify-between`}
    >
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/4" />
      <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/4" />

      <div className="flex items-start justify-between relative z-10">
        <div className="flex items-center gap-2">
          <Sparkles className="size-5" />
          <span className="text-sm font-semibold tracking-wide">MOARLI</span>
        </div>
        {typeBadge(card.type)}
      </div>

      {/* Card number */}
      <div className="relative z-10">
        <p className="font-mono text-lg tracking-[0.25em]">{card.maskedNumber}</p>
      </div>

      <div className="flex items-end justify-between relative z-10">
        <div>
          <p className="text-[10px] uppercase tracking-wider opacity-70">Expire le</p>
          <p className="text-sm font-semibold">{card.expiry}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider opacity-70">Plafond</p>
          <p className="text-sm font-semibold">{fmt.format(card.amountLimit)} FCFA</p>
        </div>
      </div>
    </div>
  )
}

export function CardsPage() {
  const { cards, addCard, blockCard } = useAppStore()
  const [open, setOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [cardType, setCardType] = useState<'one_time' | 'recurring'>('one_time')
  const [amountLimit, setAmountLimit] = useState('')
  const [validity, setValidity] = useState('24h')

  const handleCreate = () => {
    const limit = parseInt(amountLimit) || 0
    if (limit <= 0) return

    const now = new Date()
    let validUntil: Date
    let expiryStr: string

    switch (validity) {
      case '24h':
        validUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000)
        expiryStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getFullYear()).slice(-2)}`
        break
      case '1sem':
        validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
        expiryStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getFullYear()).slice(-2)}`
        break
      case '1mois':
        validUntil = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate(), 23, 59, 59)
        expiryStr = `${String(now.getMonth() + 2 > 12 ? 1 : now.getMonth() + 2).padStart(2, '0')}/${String(now.getMonth() + 2 > 12 ? now.getFullYear() + 1 : now.getFullYear()).slice(-2)}`
        break
      default:
        validUntil = new Date(now.getTime() + 24 * 60 * 60 * 1000)
        expiryStr = `${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getFullYear()).slice(-2)}`
    }

    const last4 = String(Math.floor(1000 + Math.random() * 9000))
    const newCard: VirtualCard = {
      id: Date.now().toString(),
      last4,
      maskedNumber: `**** **** **** ${last4}`,
      expiry: expiryStr,
      type: cardType,
      amountLimit: limit,
      amountUsed: 0,
      status: 'active',
      validUntil: validUntil.toISOString(),
    }

    addCard(newCard)
    setOpen(false)
    setCardType('one_time')
    setAmountLimit('')
    setValidity('24h')
  }

  const handleCopy = (card: VirtualCard) => {
    setCopiedId(card.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <div className="flex flex-col gap-6 p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cartes Virtuelles</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Créez et gérez vos cartes de paiement sécurisées
          </p>
        </div>
      </div>

      {/* Create button */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="w-full gap-2" size="lg">
            <Plus className="size-4" />
            Créer une carte
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="size-5 text-primary" />
              Nouvelle carte virtuelle
            </DialogTitle>
            <DialogDescription>
              Configurez votre carte selon vos besoins
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* Type */}
            <div className="flex flex-col gap-2">
              <Label>Type de carte</Label>
              <Select
                value={cardType}
                onValueChange={(v) => setCardType(v as 'one_time' | 'recurring')}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="one_time">Usage unique</SelectItem>
                  <SelectItem value="recurring">Récurrente</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Amount limit */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="card-limit">Plafond (FCFA)</Label>
              <Input
                id="card-limit"
                type="number"
                placeholder="Ex: 50 000"
                value={amountLimit}
                onChange={(e) => setAmountLimit(e.target.value)}
                min={1000}
              />
            </div>

            {/* Validity */}
            <div className="flex flex-col gap-2">
              <Label>Durée de validité</Label>
              <Select value={validity} onValueChange={setValidity}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">24 heures</SelectItem>
                  <SelectItem value="1sem">1 semaine</SelectItem>
                  <SelectItem value="1mois">1 mois</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={!amountLimit || parseInt(amountLimit) <= 0}>
              Créer la carte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cards List */}
      <div className="flex flex-col gap-5">
        {cards.map((card) => {
          const usagePercent = card.amountLimit > 0
            ? Math.min(Math.round((card.amountUsed / card.amountLimit) * 100), 100)
            : 0

          return (
            <Card key={card.id}>
              <CardContent className="pt-0 flex flex-col gap-4">
                {/* Card visual */}
                <CardVisual card={card} />

                {/* Status & badges */}
                <div className="flex items-center gap-2 flex-wrap">
                  {statusBadge(card.status)}
                  {typeBadge(card.type)}
                </div>

                {/* Usage progress */}
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Utilisation</span>
                    <span className="font-medium">
                      {fmt.format(card.amountUsed)} / {fmt.format(card.amountLimit)} FCFA
                    </span>
                  </div>
                  <Progress value={usagePercent} className="h-2.5" />
                  <p className="text-xs text-muted-foreground text-right">{usagePercent}%</p>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {card.status === 'active' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5 text-destructive hover:text-destructive"
                      onClick={() => blockCard(card.id)}
                    >
                      <ShieldBan className="size-3.5" />
                      Bloquer
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleCopy(card)}
                  >
                    {copiedId === card.id ? (
                      <>
                        <Check className="size-3.5 text-emerald-500" />
                        Copié !
                      </>
                    ) : (
                      <>
                        <Copy className="size-3.5" />
                        Copier le numéro
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
