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
  Wallet,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  Edit3,
  Info,
} from 'lucide-react'

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-FR').format(n)

function getAlertLevel(pct: number): {
  label: string
  color: string
  bg: string
  border: string
} {
  if (pct > 80)
    return { label: 'Danger', color: 'text-red-600', bg: 'bg-red-500/10', border: 'border-red-500/20' }
  if (pct >= 60)
    return { label: 'Attention', color: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/20' }
  return { label: 'OK', color: 'text-green-600', bg: 'bg-green-500/10', border: 'border-green-500/20' }
}

export function BudgetPage() {
  const { budget } = useAppStore()
  const [editOpen, setEditOpen] = useState(false)
  const [newTotal, setNewTotal] = useState('')

  if (!budget) {
    return (
      <div className="flex flex-col items-center justify-center px-4 pt-20 text-center">
        <Wallet className="mb-3 size-10 text-muted-foreground/50" />
        <p className="font-medium">Aucun budget défini</p>
      </div>
    )
  }

  const pct = Math.round((budget.spentAmount / budget.totalAmount) * 100)
  const remaining = budget.totalAmount - budget.spentAmount
  const alert = getAlertLevel(pct)

  // Donut chart: conic-gradient
  const donutStyle = {
    background: `conic-gradient(
      ${pct > 80 ? '#DC2626' : pct >= 60 ? '#D97706' : '#059669'} ${pct}%,
      transparent ${pct}%
    )`,
  }

  return (
    <div className="space-y-6 px-4 pb-28 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Budget</h1>
          <p className="text-muted-foreground text-sm">
            Budget de {budget.month}
          </p>
        </div>
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="gap-2">
              <Edit3 className="size-4" />
              Modifier
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Modifier le budget</DialogTitle>
              <DialogDescription>
                Modifiez le montant total de votre budget mensuel.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Montant total (FCFA)</Label>
                <Input
                  type="number"
                  placeholder={fmt(budget.totalAmount)}
                  value={newTotal}
                  onChange={(e) => setNewTotal(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setEditOpen(false)}>
                Enregistrer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Donut Chart Card */}
      <Card>
        <CardContent className="flex flex-col items-center py-8">
          {/* Donut */}
          <div className="relative mb-4">
            <div
              className="flex size-44 items-center justify-center rounded-full"
              style={donutStyle}
            >
              <div className="flex size-32 flex-col items-center justify-center rounded-full bg-card">
                <span className="text-3xl font-bold">{pct}%</span>
                <span className="text-muted-foreground text-sm">utilisé</span>
              </div>
            </div>
          </div>

          <div className="flex w-full items-center justify-around text-center">
            <div>
              <p className="text-muted-foreground text-xs">Dépensé</p>
              <p className="font-bold text-red-500">{fmt(budget.spentAmount)}</p>
              <p className="text-muted-foreground text-xs">FCFA</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <p className="text-muted-foreground text-xs">Restant</p>
              <p className="font-bold text-green-500">{fmt(remaining)}</p>
              <p className="text-muted-foreground text-xs">FCFA</p>
            </div>
            <div className="h-8 w-px bg-border" />
            <div>
              <p className="text-muted-foreground text-xs">Total</p>
              <p className="font-bold">{fmt(budget.totalAmount)}</p>
              <p className="text-muted-foreground text-xs">FCFA</p>
            </div>
          </div>

          {/* Alert Badge */}
          <Badge
            className={`mt-4 ${alert.bg} ${alert.border} ${alert.color}`}
          >
            {alert.label === 'OK' && <CheckCircle className="mr-1 size-3" />}
            {alert.label !== 'OK' && <AlertTriangle className="mr-1 size-3" />}
            {pct}% utilisé — {alert.label}
          </Badge>
        </CardContent>
      </Card>

      {/* Category Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dépenses par catégorie</CardTitle>
          <CardDescription>
            <TrendingDown className="mr-1 inline size-3" />
            Alertes : vert &lt; 60%, jaune 60-80%, rouge &gt; 80%
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {budget.categories.map((cat) => {
            const catPct = cat.limit > 0 ? Math.round((cat.spent / cat.limit) * 100) : 0
            const catAlert = getAlertLevel(catPct)

            return (
              <div key={cat.name} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                    <span className="font-medium">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>
                      {fmt(cat.spent)} / {fmt(cat.limit)} FCFA
                    </span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${catAlert.color} ${catAlert.border}`}
                    >
                      {catPct}%
                    </Badge>
                  </div>
                </div>
                {/* Horizontal bar */}
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(catPct, 100)}%`,
                      backgroundColor: cat.color,
                    }}
                  />
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Mobile Money Limits */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Info className="size-4" />
            Limites Mobile Money
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between rounded-lg bg-yellow-500/5 p-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">📱</span>
              <div>
                <p className="text-sm font-medium">MTN Mobile Money</p>
                <p className="text-muted-foreground text-xs">Dépôt maximum par jour</p>
              </div>
            </div>
            <span className="font-bold text-amber-600">300 000 FCFA</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-red-500/5 p-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">📱</span>
              <div>
                <p className="text-sm font-medium">Airtel Money</p>
                <p className="text-muted-foreground text-xs">Dépôt maximum par jour</p>
              </div>
            </div>
            <span className="font-bold text-red-600">200 000 FCFA</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
