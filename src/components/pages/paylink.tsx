'use client'

import { useState } from 'react'
import {
  Link2,
  Plus,
  Share2,
  Copy,
  Check,
  Clock,
  ExternalLink,
  Inbox,
  Loader2,
  DollarSign,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore, type PayLinkData } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

const fmt = new Intl.NumberFormat('fr-FR')
const fmtDate = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
})

const currencies = [
  { value: 'XAF', label: 'FCFA' },
  { value: 'EUR', label: 'EUR' },
  { value: 'USD', label: 'USD' },
]

function getStatusBadge(status: PayLinkData['status']) {
  switch (status) {
    case 'active':
      return (
        <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/25 hover:bg-emerald-500/20">
          Actif
        </Badge>
      )
    case 'paid':
      return (
        <Badge className="bg-blue-500/15 text-blue-500 border-blue-500/25 hover:bg-blue-500/20">
          Payé
        </Badge>
      )
    case 'expired':
      return (
        <Badge className="bg-gray-500/15 text-gray-400 border-gray-500/25 hover:bg-gray-500/20">
          Expiré
        </Badge>
      )
    case 'cancelled':
      return (
        <Badge className="bg-red-500/15 text-red-400 border-red-500/25 hover:bg-red-500/20">
          Annulé
        </Badge>
      )
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function generateLinkCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return `MOARLI-${code}`
}

export function PayLinkPage() {
  const payLinks = useAppStore((s) => s.payLinks)
  const addPayLink = useAppStore((s) => s.addPayLink)

  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [currency, setCurrency] = useState('XAF')
  const [creating, setCreating] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const numericAmount = parseInt(amount.replace(/\s/g, ''), 10) || 0
  const isValid = numericAmount >= 100 && numericAmount <= 5000000

  function handleAmountChange(val: string) {
    const cleaned = val.replace(/[^\d\s]/g, '')
    setAmount(cleaned)
  }

  async function handleCreate() {
    if (!isValid) return
    setCreating(true)
    await new Promise((r) => setTimeout(r, 1000))

    const now = new Date()
    const expiry = new Date(now)
    expiry.setHours(expiry.getHours() + 48)

    const link: PayLinkData = {
      id: Date.now().toString(),
      amount: numericAmount,
      currency,
      description: description || undefined,
      linkCode: generateLinkCode(),
      status: 'active',
      expiresAt: expiry.toISOString(),
      createdAt: now.toISOString(),
    }
    addPayLink(link)
    setCreating(false)

    // Reset form
    setAmount('')
    setDescription('')
    setCurrency('XAF')
    setShowForm(false)

    toast.success('Pay Link créé !', {
      description: `${fmt.format(numericAmount)} ${currency} — ${link.linkCode}`,
    })
  }

  function handleShare(link: PayLinkData) {
    const currencyLabel = currencies.find((c) => c.value === link.currency)?.label || link.currency
    const text = `Paiement via MOARLI\n${link.description ? link.description + ' — ' : ''}${fmt.format(link.amount)} ${currencyLabel}\nCode : ${link.linkCode}\nmoarli.app/pay/${link.linkCode}`

    if (navigator.share) {
      navigator.share({ title: 'MOARLI — Pay Link', text }).catch(() => {})
    } else {
      navigator.clipboard
        .writeText(text)
        .then(() => toast.success('Lien copié !', { description: link.linkCode }))
        .catch(() => toast.error('Impossible de copier'))
    }
  }

  function handleCopyCode(link: PayLinkData) {
    navigator.clipboard
      .writeText(link.linkCode)
      .then(() => toast.success('Code copié !', { description: link.linkCode }))
      .catch(() => toast.error('Impossible de copier'))
  }

  function getExpiryLabel(expiresAt: string, status: PayLinkData['status']) {
    if (status === 'paid') return 'Payé'
    if (status === 'expired') return 'Expiré'
    if (status === 'cancelled') return 'Annulé'
    const date = new Date(expiresAt)
    return `Expire le ${fmtDate.format(date)}`
  }

  return (
    <div className="flex flex-col gap-5 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Pay Links</h1>
          <p className="text-sm text-muted-foreground">
            Créez et gérez vos liens de paiement
          </p>
        </div>
        <Button
          onClick={() => setShowForm(!showForm)}
          size="sm"
          className={cn(
            showForm
              ? ''
              : 'bg-emerald-600 hover:bg-emerald-700'
          )}
        >
          {showForm ? (
            <>
              <Check className="size-4" />
              Fermer
            </>
          ) : (
            <>
              <Plus className="size-4" />
              Créer
            </>
          )}
        </Button>
      </div>

      {/* Create Form */}
      {showForm && (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Plus className="size-4 text-primary" />
              Créer un Pay Link
            </CardTitle>
            <CardDescription>
              Générez un lien que vos clients peuvent utiliser pour vous payer
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Amount */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="pl-amount" className="text-sm">
                Montant
              </Label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="pl-amount"
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className="pl-9 text-lg font-bold tabular-nums"
                />
              </div>
            </div>

            {/* Currency Selector */}
            <div className="flex flex-col gap-2">
              <Label className="text-sm">Devise</Label>
              <div className="flex gap-2">
                {currencies.map((c) => (
                  <button
                    key={c.value}
                    onClick={() => setCurrency(c.value)}
                    className={cn(
                      'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors text-center',
                      currency === c.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-background hover:bg-muted/50 text-foreground'
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="pl-desc" className="text-sm">
                Description (optionnel)
              </Label>
              <Input
                id="pl-desc"
                type="text"
                placeholder="Ex : Partage resto, Remboursement..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={60}
              />
            </div>

            {/* Info */}
            {isValid && (
              <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3">
                <Clock className="size-4 text-muted-foreground shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Ce lien sera valide pendant 48 heures.
                </p>
              </div>
            )}

            <Button
              onClick={handleCreate}
              disabled={!isValid || creating}
              className="h-11 bg-emerald-600 hover:bg-emerald-700"
            >
              {creating ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Link2 className="size-4" />
              )}
              {creating ? 'Création en cours...' : 'Créer le Pay Link'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Pay Links List */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Mes liens ({payLinks.length})
        </p>

        {payLinks.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-12">
              <div className="flex size-14 items-center justify-center rounded-full bg-muted">
                <Inbox className="size-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                Aucun Pay Link
              </p>
              <p className="text-xs text-muted-foreground/70 text-center">
                Créez votre premier lien de paiement en un clic
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="flex flex-col gap-3">
            {payLinks.map((link) => {
              const currencyLabel = currencies.find((c) => c.value === link.currency)?.label || link.currency
              const isActive = link.status === 'active'

              return (
                <Card key={link.id} className={cn(
                  'transition-colors',
                  !isActive && 'opacity-70'
                )}>
                  <CardContent className="flex flex-col gap-3 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            'flex size-10 shrink-0 items-center justify-center rounded-xl',
                            link.status === 'active'
                              ? 'bg-emerald-500/10'
                              : link.status === 'paid'
                                ? 'bg-blue-500/10'
                                : 'bg-muted'
                          )}
                        >
                          <Link2
                            className={cn(
                              'size-5',
                              link.status === 'active'
                                ? 'text-emerald-500'
                                : link.status === 'paid'
                                  ? 'text-blue-500'
                                  : 'text-muted-foreground'
                            )}
                          />
                        </div>
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <p className="text-sm font-semibold truncate">
                            {link.description || 'Sans description'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {fmt.format(link.amount)} {currencyLabel}
                          </p>
                        </div>
                      </div>
                      {getStatusBadge(link.status)}
                    </div>

                    <Separator />

                    <div className="flex flex-col gap-2">
                      {/* Link Code */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          Code
                        </span>
                        <button
                          onClick={() => handleCopyCode(link)}
                          className="flex items-center gap-1.5 text-sm font-mono font-medium hover:text-primary transition-colors"
                        >
                          {link.linkCode}
                          <Copy className="size-3 text-muted-foreground" />
                        </button>
                      </div>

                      {/* Expiry */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          Statut
                        </span>
                        <span className="text-xs font-medium">
                          {getExpiryLabel(link.expiresAt, link.status)}
                        </span>
                      </div>

                      {/* Created */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs text-muted-foreground">
                          Créé le
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {fmtDate.format(new Date(link.createdAt))}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    {isActive && (
                      <div className="flex gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleShare(link)}
                          className="flex-1 text-xs"
                        >
                          <Share2 className="size-3.5" />
                          Partager via WhatsApp
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyCode(link)}
                          className="shrink-0 text-xs"
                        >
                          <Copy className="size-3.5" />
                          Copier
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
