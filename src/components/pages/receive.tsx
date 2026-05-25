'use client'

import { useState } from 'react'
import {
  QrCode,
  Phone,
  Share2,
  Copy,
  Check,
  Link2,
  ArrowRight,
  Wallet,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export function ReceivePage() {
  const userPhone = useAppStore((s) => s.userPhone)
  const userName = useAppStore((s) => s.userName)
  const [copied, setCopied] = useState(false)

  async function handleCopyPhone() {
    try {
      await navigator.clipboard.writeText(userPhone.replace(/\s/g, ''))
      setCopied(true)
      toast.success('Numéro copié !', {
        description: userPhone,
      })
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Impossible de copier')
    }
  }

  function handleSharePhone() {
    const text = `Envoyez-moi de l'argent via MOARLI au ${userPhone}`
    if (navigator.share) {
      navigator.share({ title: 'MOARLI — Recevoir', text }).catch(() => {})
    } else {
      navigator.clipboard
        .writeText(text)
        .then(() => toast.success('Texte copié dans le presse-papier'))
        .catch(() => toast.error('Impossible de partager'))
    }
  }

  function handleCreatePayLink() {
    toast.info('Redirection vers la création de Pay Link...')
    // Could use setCurrentPage('paylink') if needed
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Recevoir de l'argent</h1>
        <p className="text-sm text-muted-foreground">
          Partagez votre numéro pour recevoir des fonds
        </p>
      </div>

      {/* Phone Number Card */}
      <Card className="overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-emerald-500 via-primary to-blue-500" />
        <CardContent className="flex flex-col items-center gap-4 pt-8 pb-8">
          {/* Avatar */}
          <div className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary">
            {userName.charAt(0).toUpperCase()}
          </div>

          <div className="text-center">
            <p className="text-base font-semibold">{userName}</p>
            <p className="text-sm text-muted-foreground">Client MOARLI</p>
          </div>

          {/* Phone Number Display */}
          <div className="flex w-full items-center justify-center gap-2 rounded-xl bg-muted/50 p-4">
            <Phone className="size-5 text-muted-foreground" />
            <span className="text-xl font-bold tabular-nums tracking-wide">
              {userPhone}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex w-full gap-3">
            <Button
              variant="outline"
              onClick={handleCopyPhone}
              className="flex-1"
            >
              {copied ? (
                <Check className="size-4 text-emerald-500" />
              ) : (
                <Copy className="size-4" />
              )}
              {copied ? 'Copié !' : 'Copier'}
            </Button>
            <Button
              onClick={handleSharePhone}
              className="flex-1 bg-emerald-600 hover:bg-emerald-700"
            >
              <Share2 className="size-4" />
              Partager mon numéro
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* QR Code Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <QrCode className="size-5 text-primary" />
            Mon code QR
          </CardTitle>
          <CardDescription>
            Scannez ce code pour m'envoyer de l'argent rapidement
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* QR Placeholder */}
          <div className="mx-auto flex w-52 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/30 p-8">
            <div className="flex size-32 items-center justify-center rounded-xl bg-background shadow-sm">
              <div className="grid grid-cols-5 gap-[3px]">
                {/* Simplified QR pattern (decorative) */}
                {Array.from({ length: 25 }).map((_, i) => {
                  // Create a pseudo-QR pattern
                  const row = Math.floor(i / 5)
                  const col = i % 5
                  const isCorner =
                    (row === 0 && col === 0) ||
                    (row === 0 && col === 4) ||
                    (row === 4 && col === 0) ||
                    (row === 4 && col === 4) ||
                    (row === 2 && col === 2)
                  const filled =
                    isCorner ||
                    (i % 3 === 0) ||
                    (i === 6) ||
                    (i === 18) ||
                    (i === 7) ||
                    (i === 16)
                  return (
                    <div
                      key={i}
                      className={cn(
                        'size-[18px] rounded-[2px] transition-colors',
                        filled
                          ? 'bg-foreground'
                          : 'bg-muted-foreground/20'
                      )}
                    />
                  )
                })}
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              {userPhone}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Pay Link CTA */}
      <Card className="border-dashed">
        <CardContent className="flex items-center gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
            <Link2 className="size-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Pay Link</p>
            <p className="text-xs text-muted-foreground">
              Créez un lien de paiement à envoyer par WhatsApp
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCreatePayLink}
            className="shrink-0"
          >
            Créer
            <ArrowRight className="size-4" />
          </Button>
        </CardContent>
      </Card>

      {/* Info Note */}
      <div className="flex items-start gap-3 rounded-xl bg-muted/30 p-4">
        <Wallet className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="flex flex-col gap-1">
          <p className="text-xs font-medium text-muted-foreground">
            Comment ça marche ?
          </p>
          <p className="text-xs text-muted-foreground/80 leading-relaxed">
            Partagez votre numéro ou votre code QR avec n'importe qui. Ils
            pourront vous envoyer de l'argent instantanément via MOARLI, même
            s'ils n'ont pas de compte.
          </p>
        </div>
      </div>
    </div>
  )
}
