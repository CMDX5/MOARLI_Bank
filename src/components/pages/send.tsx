'use client'

import { useState, useMemo } from 'react'
import {
  Send,
  Phone,
  Banknote,
  MessageSquare,
  ChevronRight,
  Check,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore, type Transaction } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'

const fmt = new Intl.NumberFormat('fr-FR')

const quickAmounts = [1000, 5000, 10000, 25000, 50000]

export function SendPage() {
  const transactions = useAppStore((s) => s.transactions)
  const addTransaction = useAppStore((s) => s.addTransaction)
  const balanceXAF = useAppStore((s) => s.balanceXAF)

  const [phone, setPhone] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [sending, setSending] = useState(false)

  const numericAmount = parseInt(amount.replace(/\s/g, ''), 10) || 0
  const isValidPhone = /^\+242\s?\d{2}\s?\d{2}\s?\d{2}\s?\d{2}$/.test(phone) || /^\d{9}$/.test(phone)
  const isValidAmount = numericAmount >= 100 && numericAmount <= balanceXAF
  const canSend = isValidPhone && isValidAmount && !sending

  // Recent recipients from transfer transactions
  const recentRecipients = useMemo(() => {
    const seen = new Map<string, { name: string; phone: string }>()
    for (const tx of transactions) {
      if (tx.recipientPhone && tx.recipientName) {
        if (!seen.has(tx.recipientPhone)) {
          seen.set(tx.recipientPhone, {
            name: tx.recipientName,
            phone: tx.recipientPhone,
          })
        }
      }
      if (seen.size >= 4) break
    }
    return Array.from(seen.values())
  }, [transactions])

  function handleQuickAmount(val: number) {
    setAmount(fmt.format(val).replace(/\u00a0/g, ' '))
  }

  function formatPhoneInput(val: string) {
    // Strip everything except digits and +
    let cleaned = val.replace(/[^\d+]/g, '')
    // Auto-add prefix
    if (cleaned.length > 0 && !cleaned.startsWith('+242')) {
      cleaned = '+242 ' + cleaned.replace(/^242/, '')
    }
    // Format as +242 06 543 21 09
    const digits = cleaned.replace(/\D/g, '').slice(3) // Remove 242
    if (digits.length === 0) return '+242 '
    if (digits.length <= 2) return `+242 ${digits}`
    if (digits.length <= 4) return `+242 ${digits.slice(0, 2)} ${digits.slice(2)}`
    if (digits.length <= 6)
      return `+242 ${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4)}`
    return `+242 ${digits.slice(0, 2)} ${digits.slice(2, 4)} ${digits.slice(4, 6)} ${digits.slice(6, 8)}`
  }

  function handlePhoneChange(val: string) {
    setPhone(formatPhoneInput(val))
  }

  function handleAmountChange(val: string) {
    // Only allow digits and spaces
    const cleaned = val.replace(/[^\d\s]/g, '')
    setAmount(cleaned)
  }

  function openConfirm() {
    if (!canSend) return
    setConfirmOpen(true)
  }

  async function handleSend() {
    setSending(true)
    // Simulate network delay
    await new Promise((r) => setTimeout(r, 1500))

    const ref = `TRF-${Date.now().toString(36).toUpperCase()}`
    const tx: Transaction = {
      id: Date.now().toString(),
      type: 'transfer',
      amount: numericAmount,
      currency: 'XAF',
      status: 'completed',
      description: note
        ? `Transfert à ${phone} — ${note}`
        : `Transfert à ${phone}`,
      category: 'transfers',
      reference: ref,
      recipientPhone: phone,
      recipientName: phone,
      createdAt: new Date().toISOString(),
    }
    addTransaction(tx)
    setSending(false)
    setConfirmOpen(false)

    // Reset form
    setPhone('+242 ')
    setAmount('')
    setNote('')

    toast.success('Transfert envoyé !', {
      description: `${fmt.format(numericAmount)} FCFA envoyés à ${phone}`,
    })
  }

  return (
    <div className="flex flex-col gap-5 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Envoyer de l'argent</h1>
        <p className="text-sm text-muted-foreground">
          Solde disponible : <span className="font-semibold text-foreground">{fmt.format(balanceXAF)} FCFA</span>
        </p>
      </div>

      {/* Recent Recipients */}
      {recentRecipients.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">
              Destinataires récents
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1 pt-0">
            {recentRecipients.map((r) => (
              <button
                key={r.phone}
                onClick={() => setPhone(formatPhoneInput(r.phone))}
                className="flex items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-muted/50"
              >
                <div className="flex size-9 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Phone className="size-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  <p className="text-xs text-muted-foreground">{r.phone}</p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground" />
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Form */}
      <Card>
        <CardContent className="flex flex-col gap-5">
          {/* Phone Number */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="phone" className="text-sm">
              Numéro du destinataire
            </Label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="phone"
                type="tel"
                placeholder="+242 06 543 21 09"
                value={phone}
                onChange={(e) => handlePhoneChange(e.target.value)}
                className="pl-9 text-base"
                autoComplete="tel"
              />
            </div>
            {phone.replace(/\D/g, '').length > 4 && !isValidPhone && (
              <p className="text-xs text-red-400">
                Numéro invalide. Format : +242 06 543 21 09
              </p>
            )}
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="amount" className="text-sm">
              Montant (FCFA)
            </Label>
            <div className="relative">
              <Banknote className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="amount"
                type="text"
                inputMode="numeric"
                placeholder="0"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="pl-9 pr-16 text-xl font-bold tabular-nums"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground">
                FCFA
              </span>
            </div>
            {numericAmount > balanceXAF && (
              <p className="text-xs text-red-400">
                Solde insuffisant. Maximum : {fmt.format(balanceXAF)} FCFA
              </p>
            )}

            {/* Quick Amounts */}
            <div className="flex flex-wrap gap-2 pt-1">
              {quickAmounts.map((val) => (
                <button
                  key={val}
                  onClick={() => handleQuickAmount(val)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                    numericAmount === val
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background hover:bg-muted/50 text-foreground'
                  )}
                >
                  {fmt.format(val)}
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="note" className="text-sm">
              Note (optionnel)
            </Label>
            <div className="relative">
              <MessageSquare className="absolute left-3 top-3 size-4 text-muted-foreground" />
              <textarea
                id="note"
                placeholder="Ajouter un motif..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={100}
                rows={2}
                className="flex w-full min-h-[72px] rounded-md border border-input bg-transparent px-3 py-2 pl-9 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:border-ring resize-none"
              />
            </div>
            <p className="text-right text-xs text-muted-foreground">
              {note.length}/100
            </p>
          </div>

          {/* Summary */}
          {numericAmount > 0 && (
            <>
              <Separator />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Frais</span>
                <span className="font-medium text-emerald-500">Gratuit</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="text-lg font-bold tabular-nums">
                  {fmt.format(numericAmount)} FCFA
                </span>
              </div>
            </>
          )}

          {/* Send Button */}
          <Button
            onClick={openConfirm}
            disabled={!canSend}
            className="h-12 w-full bg-emerald-600 text-base font-semibold hover:bg-emerald-700"
            size="lg"
          >
            <Send className="size-5" />
            Envoyer {numericAmount > 0 ? fmt.format(numericAmount) + ' FCFA' : ''}
          </Button>
        </CardContent>
      </Card>

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmer l'envoi</DialogTitle>
            <DialogDescription>
              Vérifiez les informations avant d'envoyer.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 rounded-xl bg-muted/50 p-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Destinataire</span>
              <span className="text-sm font-medium">{phone}</span>
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Montant</span>
              <span className="text-lg font-bold tabular-nums text-emerald-500">
                {fmt.format(numericAmount)} FCFA
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Frais</span>
              <span className="text-sm font-medium text-emerald-500">Gratuit</span>
            </div>
            {note && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Note</span>
                  <span className="text-sm font-medium">{note}</span>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="flex gap-3 sm:gap-3">
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={sending}
              className="flex-1"
            >
              Annuler
            </Button>
            <Button
              onClick={handleSend}
              disabled={sending}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              {sending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              {sending ? 'Envoi en cours...' : 'Confirmer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
