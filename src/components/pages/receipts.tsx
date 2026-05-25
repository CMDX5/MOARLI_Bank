'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import {
  Download,
  Share2,
  FileText,
  Receipt,
  ArrowDownCircle,
  ArrowUpCircle,
  ArrowRightCircle,
  CreditCard,
  QrCode,
  CheckCircle2,
  Clock,
  Calendar,
  Hash,
  Copy,
  Check,
} from 'lucide-react'

const fmt = new Intl.NumberFormat('fr-FR')

function getTransactionIcon(type: string) {
  switch (type) {
    case 'deposit':
      return { icon: ArrowDownCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Dépôt' }
    case 'withdrawal':
      return { icon: ArrowUpCircle, color: 'text-red-500', bg: 'bg-red-500/10', label: 'Retrait' }
    case 'transfer':
      return { icon: ArrowRightCircle, color: 'text-blue-500', bg: 'bg-blue-500/10', label: 'Transfert' }
    case 'payment':
      return { icon: CreditCard, color: 'text-violet-500', bg: 'bg-violet-500/10', label: 'Paiement' }
    case 'qr_payment':
      return { icon: QrCode, color: 'text-amber-500', bg: 'bg-amber-500/10', label: 'Paiement QR' }
    case 'credit':
      return { icon: CreditCard, color: 'text-emerald-500', bg: 'bg-emerald-500/10', label: 'Crédit' }
    default:
      return { icon: FileText, color: 'text-muted-foreground', bg: 'bg-muted', label: type }
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case 'completed':
      return <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px]">Terminé</Badge>
    case 'pending':
      return <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 text-[10px]">En attente</Badge>
    case 'failed':
      return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/20 text-[10px]">Échoué</Badge>
    case 'queued':
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-500 border-blue-500/20 text-[10px]">En file</Badge>
    default:
      return <Badge variant="outline" className="text-[10px]">{status}</Badge>
  }
}

export function ReceiptsPage() {
  const { transactions } = useAppStore()
  const [selectedTx, setSelectedTx] = useState<string | null>(null)
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set())
  const [shared, setShared] = useState<Set<string>>(new Set())

  const selectedTransaction = transactions.find((t) => t.id === selectedTx)

  const handleDownload = (id: string) => {
    setDownloaded((prev) => new Set(prev).add(id))
    setTimeout(() => setDownloaded((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    }), 3000)
  }

  const handleShare = (id: string) => {
    setShared((prev) => new Set(prev).add(id))
    setTimeout(() => setShared((prev) => {
      const next = new Set(prev)
      next.delete(id)
      return next
    }), 3000)
  }

  const handleDownloadAll = () => {
    transactions.forEach((t) => {
      setDownloaded((prev) => new Set(prev).add(t.id))
    })
    setTimeout(() => {
      setDownloaded(new Set())
    }, 3000)
  }

  return (
    <div className="space-y-4 p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Mes Reçus</h1>
          <p className="text-sm text-muted-foreground">
            {transactions.length} transactions
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleDownloadAll}>
          <Download className="h-4 w-4 mr-1" />
          Tout télécharger
        </Button>
      </div>

      {/* Download All Feedback */}
      {downloaded.size === transactions.length && transactions.length > 0 && (
        <div className="p-2 rounded-lg bg-emerald-500/10 text-center">
          <p className="text-xs text-emerald-500 font-medium">
            ✅ Tous les reçus sont en cours de téléchargement
          </p>
        </div>
      )}

      {/* Receipts List */}
      <div className="space-y-2">
        {transactions.map((tx) => {
          const { icon: Icon, color, bg, label } = getTransactionIcon(tx.type)
          const date = new Date(tx.createdAt)
          const isDownloaded = downloaded.has(tx.id)
          const isShared = shared.has(tx.id)

          return (
            <Card
              key={tx.id}
              className="cursor-pointer hover:border-primary/30 transition-colors"
              onClick={() => setSelectedTx(tx.id)}
            >
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg shrink-0 ${bg}`}>
                    <Icon className={`h-5 w-5 ${color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium truncate">{tx.description}</p>
                      <p className={`text-sm font-bold shrink-0 ${
                        tx.type === 'deposit' || tx.type === 'credit' ? 'text-emerald-500' : ''
                      }`}>
                        {tx.type === 'deposit' || tx.type === 'credit' ? '+' : '-'}
                        {fmt.format(tx.amount)}
                      </p>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{label}</span>
                        <span>•</span>
                        <span>{date.toLocaleDateString('fr-FR')}</span>
                        <span>•</span>
                        <span className="font-mono text-[10px]">{tx.reference}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1.5">
                      {getStatusBadge(tx.status)}
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDownload(tx.id)
                          }}
                        >
                          {isDownloaded ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Download className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 w-7 p-0"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleShare(tx.id)
                          }}
                        >
                          {isShared ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          ) : (
                            <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Receipt Detail Dialog */}
      <Dialog open={!!selectedTx} onOpenChange={() => setSelectedTx(null)}>
        <DialogContent className="sm:max-w-md">
          {selectedTransaction && (() => {
            const tx = selectedTransaction
            const { icon: Icon, color, bg, label } = getTransactionIcon(tx.type)
            const date = new Date(tx.createdAt)

            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Receipt className="h-5 w-5 text-primary" />
                    Reçu de transaction
                  </DialogTitle>
                  <DialogDescription>Détails de votre opération</DialogDescription>
                </DialogHeader>

                {/* MOARLI Logo Placeholder */}
                <div className="flex justify-center py-3">
                  <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
                    <span className="text-xl font-bold text-primary">M</span>
                  </div>
                </div>
                <p className="text-center text-sm font-medium">MOARLI Bank</p>
                <p className="text-center text-xs text-muted-foreground">Reçu officiel de transaction</p>

                <Separator />

                <div className="space-y-3">
                  {/* Amount */}
                  <div className="text-center py-3">
                    <p className={`text-2xl font-bold ${
                      tx.type === 'deposit' || tx.type === 'credit' ? 'text-emerald-500' : ''
                    }`}>
                      {tx.type === 'deposit' || tx.type === 'credit' ? '+' : '-'}
                      {fmt.format(tx.amount)} FCFA
                    </p>
                    {getStatusBadge(tx.status)}
                  </div>

                  <Separator />

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" /> Date
                      </p>
                      <p className="font-medium">{date.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" /> Heure
                      </p>
                      <p className="font-medium">{date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Hash className="h-3 w-3" /> Référence
                      </p>
                      <p className="font-medium font-mono text-xs">{tx.reference}</p>
                    </div>
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Icon className={`h-3 w-3 ${color}`} /> Type
                      </p>
                      <p className="font-medium">{label}</p>
                    </div>
                  </div>

                  {(tx.recipientName || tx.recipientPhone) && (
                    <>
                      <Separator />
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Destinataire</p>
                        <p className="text-sm font-medium">{tx.recipientName || tx.recipientPhone}</p>
                        {tx.recipientPhone && tx.recipientName && (
                          <p className="text-xs text-muted-foreground">{tx.recipientPhone}</p>
                        )}
                      </div>
                    </>
                  )}

                  {tx.description && (
                    <>
                      <Separator />
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Description</p>
                        <p className="text-sm">{tx.description}</p>
                      </div>
                    </>
                  )}

                  <Separator />

                  {/* Currency */}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Devise</span>
                    <span className="font-medium">{tx.currency}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleDownload(tx.id)}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => handleShare(tx.id)}
                  >
                    <Share2 className="h-4 w-4 mr-2" />
                    Partager
                  </Button>
                </div>
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
