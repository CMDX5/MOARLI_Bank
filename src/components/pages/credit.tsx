'use client'

import { useState, useMemo } from 'react'
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
import { Progress } from '@/components/ui/progress'
import {
  CreditCard,
  Calculator,
  TrendingUp,
  Shield,
  Lightbulb,
  CheckCircle,
  Info,
} from 'lucide-react'

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-FR').format(Math.round(n))

function getInterestRate(score: number): number {
  if (score > 700) return 3
  if (score > 600) return 5
  if (score > 500) return 8
  return 12
}

function getScoreColor(score: number): string {
  if (score > 800) return '#EAB308'
  if (score > 600) return '#059669'
  if (score > 400) return '#D97706'
  return '#DC2626'
}

function getRateLabel(rate: number): string {
  if (rate === 3) return 'Excellent'
  if (rate === 5) return 'Bon'
  if (rate === 8) return 'Moyen'
  return 'Élevé'
}

function getRateBadgeColor(rate: number): string {
  if (rate === 3) return 'bg-green-500/15 text-green-600 border-green-500/20'
  if (rate === 5) return 'bg-blue-500/15 text-blue-600 border-blue-500/20'
  if (rate === 8) return 'bg-amber-500/15 text-amber-600 border-amber-500/20'
  return 'bg-red-500/15 text-red-600 border-red-500/20'
}

interface AmortRow {
  month: number
  payment: number
  interest: number
  capital: number
  remaining: number
}

function computeAmortization(
  principal: number,
  months: number,
  annualRate: number
) {
  const monthlyRate = annualRate / 100 / 12
  const safeRate = monthlyRate === 0 ? 1e-6 : monthlyRate
  const payment =
    (principal * safeRate * Math.pow(1 + safeRate, months)) /
    (Math.pow(1 + safeRate, months) - 1)
  const rows: AmortRow[] = []
  let balance = principal
  for (let m = 1; m <= months; m++) {
    const interest = balance * safeRate
    const capital = payment - interest
    balance -= capital
    rows.push({
      month: m,
      payment: Math.round(payment),
      interest: Math.round(interest),
      capital: Math.round(capital),
      remaining: Math.max(0, Math.round(balance)),
    })
  }
  return { monthlyPayment: Math.round(payment), rows }
}

export function CreditPage() {
  const { creditScore } = useAppStore()

  const [amount, setAmount] = useState('')
  const [duration, setDuration] = useState('3')

  const rate = getInterestRate(creditScore)
  const scoreColor = getScoreColor(creditScore)

  const parsedAmount = parseInt(amount) || 0
  const parsedDuration = parseInt(duration) || 1

  const { monthlyPayment, rows } = useMemo(
    () => computeAmortization(parsedAmount, parsedDuration, rate),
    [parsedAmount, parsedDuration, rate]
  )

  const isValid = parsedAmount >= 10000 && parsedAmount <= 500000 && parsedDuration >= 1 && parsedDuration <= 12
  const totalCost = monthlyPayment * parsedDuration
  const totalInterest = totalCost - parsedAmount

  return (
    <div className="space-y-6 px-4 pb-28 pt-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Micro-Crédit</h1>
        <p className="text-muted-foreground text-sm">
          Simulez et demandez un crédit en quelques minutes
        </p>
      </div>

      {/* Credit Score Gauge */}
      <Card>
        <CardContent className="flex flex-col items-center py-6">
          <div className="relative mb-3">
            <svg width="160" height="90" viewBox="0 0 160 90">
              {/* Background arc */}
              <path
                d="M 15 80 A 65 65 0 0 1 145 80"
                fill="none"
                stroke="currentColor"
                strokeWidth="10"
                className="text-muted/30"
                strokeLinecap="round"
              />
              {/* Colored arc */}
              <path
                d="M 15 80 A 65 65 0 0 1 145 80"
                fill="none"
                stroke={scoreColor}
                strokeWidth="10"
                strokeLinecap="round"
                strokeDasharray={`${(creditScore / 1000) * 204} 999`}
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center pt-2">
              <span className="text-3xl font-bold">{creditScore}</span>
              <span className="text-muted-foreground text-xs">/ 1000</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm">Score de crédit</span>
            <Badge className={getRateBadgeColor(rate)}>
              Taux: {rate}% — {getRateLabel(rate)}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Simulation Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Calculator className="size-4" />
            Simuler un crédit
          </CardTitle>
          <CardDescription>
            Entrez le montant et la durée souhaitée
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Montant</Label>
              <span className="text-muted-foreground text-xs">
                10 000 — 500 000 FCFA
              </span>
            </div>
            <Input
              type="number"
              placeholder="Ex: 50 000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              min={10000}
              max={500000}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Durée</Label>
              <span className="text-muted-foreground text-xs">
                1 — 12 mois
              </span>
            </div>
            <Input
              type="number"
              placeholder="Ex: 3"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              min={1}
              max={12}
            />
            <div className="flex gap-1">
              {[3, 6, 9, 12].map((m) => (
                <Button
                  key={m}
                  variant={duration === String(m) ? 'default' : 'outline'}
                  size="sm"
                  className="flex-1 text-xs"
                  onClick={() => setDuration(String(m))}
                >
                  {m} mois
                </Button>
              ))}
            </div>
          </div>

          {/* Result */}
          {isValid && (
            <div className="rounded-xl bg-primary/5 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-center">
                <div>
                  <p className="text-muted-foreground text-xs">Mensualité</p>
                  <p className="text-xl font-bold text-primary">
                    {fmt(monthlyPayment)} FCFA
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground text-xs">Total à rembourser</p>
                  <p className="text-lg font-bold">
                    {fmt(totalCost)} FCFA
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-background px-3 py-2 text-sm">
                <span className="text-muted-foreground">Frais totaux ({rate}%)</span>
                <span className="font-semibold text-amber-600">
                  +{fmt(totalInterest)} FCFA
                </span>
              </div>
            </div>
          )}

          <Button className="w-full gap-2" size="lg" disabled={!isValid}>
            <CreditCard className="size-4" />
            Demander ce crédit
          </Button>
        </CardContent>
      </Card>

      {/* Amortization Table */}
      {isValid && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Tableau d'amortissement</CardTitle>
            <CardDescription>
              Prévisualisation de votre plan de remboursement
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="pb-2 text-left font-medium">Mois</th>
                    <th className="pb-2 text-right font-medium">Mensualité</th>
                    <th className="pb-2 text-right font-medium">Intérêt</th>
                    <th className="pb-2 text-right font-medium">Capital</th>
                    <th className="pb-2 text-right font-medium">Restant</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.month} className="border-b last:border-0">
                      <td className="py-2 font-medium">{r.month}</td>
                      <td className="py-2 text-right">{fmt(r.payment)}</td>
                      <td className="py-2 text-right text-amber-600">
                        {fmt(r.interest)}
                      </td>
                      <td className="py-2 text-right text-green-600">
                        {fmt(r.capital)}
                      </td>
                      <td className="py-2 text-right font-medium">
                        {fmt(r.remaining)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="size-4" />
            Conseils crédit
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { icon: Shield, text: 'Remboursez toujours à temps pour améliorer votre score.' },
            { icon: TrendingUp, text: 'Un score supérieur à 700 vous donne le meilleur taux (3%).' },
            { icon: CheckCircle, text: 'Les petits crédits remboursés rapidement boostent votre cote.' },
            { icon: Info, text: 'Ne demandez pas plus de 30% de vos revenus mensuels.' },
          ].map((tip, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg p-2">
              <tip.icon className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-sm">{tip.text}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
