'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
import { Separator } from '@/components/ui/separator'
import {
  QrCode,
  Camera,
  Share2,
  Receipt,
  Timer,
  Copy,
  Check,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  CheckCircle2,
  XCircle,
  Smartphone,
} from 'lucide-react'

const fmt = new Intl.NumberFormat('fr-FR')

interface QrPaymentHistory {
  id: string
  description: string
  amount: number
  direction: 'sent' | 'received'
  status: 'completed' | 'failed' | 'expired'
  date: string
  merchant?: string
  reference: string
}

const mockQrHistory: QrPaymentHistory[] = [
  {
    id: 'qr1',
    description: 'Paiement Boutique Centre-ville',
    amount: 8500,
    direction: 'sent',
    status: 'completed',
    date: '2025-05-23T12:00:00Z',
    merchant: 'Boutique Mama Olivier',
    reference: 'QR-2025-001',
  },
  {
    id: 'qr2',
    description: 'Remboursement de Patrick',
    amount: 15000,
    direction: 'received',
    status: 'completed',
    date: '2025-05-22T18:30:00Z',
    merchant: 'Patrick M.',
    reference: 'QR-2025-002',
  },
  {
    id: 'qr3',
    description: 'Paiement Station Total',
    amount: 25000,
    direction: 'sent',
    status: 'completed',
    date: '2025-05-21T09:00:00Z',
    merchant: 'Station Total Bacongo',
    reference: 'QR-2025-003',
  },
  {
    id: 'qr4',
    description: 'Paiement Pharmacy',
    amount: 6200,
    direction: 'sent',
    status: 'failed',
    date: '2025-05-20T15:00:00Z',
    merchant: 'Pharmacie du Peuple',
    reference: 'QR-2025-004',
  },
  {
    id: 'qr5',
    description: 'Paiement Taxi',
    amount: 2000,
    direction: 'sent',
    status: 'expired',
    date: '2025-05-19T11:00:00Z',
    merchant: 'Taxi Express',
    reference: 'QR-2025-005',
  },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function qrHistoryStatus(status: QrPaymentHistory['status']) {
  switch (status) {
    case 'completed':
      return (
        <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/25 hover:bg-emerald-500/20">
          <CheckCircle2 className="size-3" />
          Complété
        </Badge>
      )
    case 'failed':
      return (
        <Badge className="bg-red-500/15 text-red-600 border-red-500/25 hover:bg-red-500/20">
          <XCircle className="size-3" />
          Échoué
        </Badge>
      )
    case 'expired':
      return (
        <Badge className="bg-gray-500/15 text-gray-500 border-gray-500/25 hover:bg-gray-500/20">
          <Clock className="size-3" />
          Expiré
        </Badge>
      )
  }
}

function formatCountdown(seconds: number) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function QrPaymentPage() {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [timerRunning, setTimerRunning] = useState(false)
  const [qrGenerated, setQrGenerated] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [copied, setCopied] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const EXPIRY_SECONDS = 5 * 60 // 5 minutes

  const generateQr = useCallback(() => {
    const amountNum = parseFloat(amount) || 0
    if (amountNum <= 0) return

    setTimerSeconds(EXPIRY_SECONDS)
    setTimerRunning(true)
    setQrGenerated(true)
  }, [amount])

  useEffect(() => {
    if (!timerRunning) return

    intervalRef.current = setInterval(() => {
      setTimerSeconds((prev) => {
        if (prev <= 1) {
          setTimerRunning(false)
          setQrGenerated(false)
          if (intervalRef.current) clearInterval(intervalRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [timerRunning])

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `Paiement QR - ${description || 'MOARLI'}`,
        text: `Paiement de ${fmt.format(parseFloat(amount) || 0)} FCFA via MOARLI`,
      })
    } else {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleScan = () => {
    setScanning(true)
    setTimeout(() => {
      setScanning(false)
    }, 3000)
  }

  const timerPercent = timerRunning
    ? ((EXPIRY_SECONDS - timerSeconds) / EXPIRY_SECONDS) * 100
    : 0

  return (
    <div className="flex flex-col gap-6 p-4 max-w-lg mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Paiement QR</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Scannez ou générez des codes QR pour vos paiements
        </p>
      </div>

      {/* Scanner Button */}
      <Button
        className="w-full gap-2 py-8 text-lg"
        size="lg"
        variant="outline"
        onClick={handleScan}
        disabled={scanning}
      >
        {scanning ? (
          <>
            <div className="size-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            Analyse en cours...
          </>
        ) : (
          <>
            <Camera className="size-6" />
            Scanner un QR
          </>
        )}
      </Button>

      {scanning && (
        <div className="rounded-xl border-2 border-dashed border-primary/50 bg-primary/5 p-8 flex flex-col items-center gap-3">
          <div className="relative">
            <Camera className="size-12 text-primary/40 animate-pulse" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="size-16 border-2 border-primary/30 rounded-lg animate-ping" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Pointez la caméra vers le code QR...</p>
        </div>
      )}

      <Separator />

      {/* Generate QR */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <QrCode className="size-5 text-primary" />
            Générer un QR de paiement
          </CardTitle>
          <CardDescription>Créez un code QR pour recevoir des paiements</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Amount */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="qr-amount">Montant (FCFA)</Label>
            <Input
              id="qr-amount"
              type="number"
              placeholder="Ex: 15 000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={0}
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="qr-desc">Description</Label>
            <Input
              id="qr-desc"
              placeholder="Ex: Remboursement dîner"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {!qrGenerated && (
            <Button
              className="w-full gap-2"
              onClick={generateQr}
              disabled={!amount || parseFloat(amount) <= 0}
            >
              <QrCode className="size-4" />
              Générer le QR
            </Button>
          )}

          {/* QR Display */}
          {qrGenerated && (
            <div className="flex flex-col items-center gap-4">
              {/* Timer */}
              <div className="flex items-center gap-2">
                <Timer className="size-4 text-amber-500" />
                <span className={`text-sm font-mono font-bold ${timerSeconds < 60 ? 'text-red-500 animate-pulse' : 'text-foreground'}`}>
                  {formatCountdown(timerSeconds)}
                </span>
              </div>

              {/* Progress bar for timer */}
              <div className="w-full">
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${timerSeconds < 60 ? 'bg-red-500' : 'bg-primary'}`}
                    style={{ width: `${100 - timerPercent}%` }}
                  />
                </div>
              </div>

              {/* QR Code placeholder */}
              <div className="relative w-56 h-56 rounded-xl bg-white border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-3 shadow-inner">
                <QrCode className="size-20 text-gray-800" strokeWidth={1.5} />
                <div className="absolute inset-0 grid grid-cols-5 grid-rows-5 gap-0.5 p-2 opacity-20 pointer-events-none">
                  {Array.from({ length: 25 }).map((_, i) => (
                    <div
                      key={i}
                      className={`rounded-sm ${Math.random() > 0.4 ? 'bg-gray-900' : 'bg-transparent'}`}
                    />
                  ))}
                </div>
                <div className="absolute bottom-3 left-0 right-0 flex flex-col items-center">
                  <p className="text-xs font-bold text-gray-700">MOARLI Pay</p>
                  <p className="text-xs text-gray-500">{fmt.format(parseFloat(amount) || 0)} FCFA</p>
                </div>
              </div>

              {/* Share / Copy buttons */}
              <div className="flex items-center gap-2 w-full">
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={handleShare}
                >
                  <Share2 className="size-4" />
                  Partager
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                >
                  {copied ? (
                    <Check className="size-4 text-emerald-500" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                  {copied ? 'Copié' : 'Copier'}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-primary" />
            Historique QR
          </CardTitle>
          <CardDescription>Vos dernières transactions par QR code</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {mockQrHistory.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 rounded-lg border p-3"
              >
                {/* Direction icon */}
                <div
                  className={`shrink-0 mt-0.5 size-8 rounded-full flex items-center justify-center ${
                    item.direction === 'sent'
                      ? 'bg-red-500/10 text-red-500'
                      : 'bg-emerald-500/10 text-emerald-500'
                  }`}
                >
                  {item.direction === 'sent' ? (
                    <ArrowUpRight className="size-4" />
                  ) : (
                    <ArrowDownLeft className="size-4" />
                  )}
                </div>

                {/* Details */}
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium truncate">{item.description}</p>
                    {qrHistoryStatus(item.status)}
                  </div>
                  <p className="text-xs text-muted-foreground">{item.merchant}</p>
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">{formatDate(item.date)}</span>
                    <span
                      className={`text-sm font-bold ${
                        item.direction === 'sent' ? 'text-red-500' : 'text-emerald-500'
                      }`}
                    >
                      {item.direction === 'sent' ? '-' : '+'}
                      {fmt.format(item.amount)} FCFA
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
