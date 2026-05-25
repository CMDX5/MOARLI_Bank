'use client'

import { useAppStore } from '@/lib/store'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Trophy,
  TrendingUp,
  Lightbulb,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Star,
  Zap,
} from 'lucide-react'

function getScoreLevel(score: number): {
  label: string
  color: string
  textColor: string
  bg: string
  border: string
} {
  if (score >= 800)
    return {
      label: 'Excellent',
      color: '#EAB308',
      textColor: 'text-yellow-500',
      bg: 'bg-yellow-500/10',
      border: 'border-yellow-500/20',
    }
  if (score >= 600)
    return {
      label: 'Bon',
      color: '#059669',
      textColor: 'text-green-500',
      bg: 'bg-green-500/10',
      border: 'border-green-500/20',
    }
  if (score >= 400)
    return {
      label: 'Moyen',
      color: '#D97706',
      textColor: 'text-amber-500',
      bg: 'bg-amber-500/10',
      border: 'border-amber-500/20',
    }
  return {
    label: 'Faible',
    color: '#DC2626',
    textColor: 'text-red-500',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
  }
}

const FACTORS = [
  {
    icon: CheckCircle,
    status: 'good' as const,
    text: 'Historique de transactions régulier',
    detail: '12 transactions le mois dernier',
  },
  {
    icon: CheckCircle,
    status: 'good' as const,
    text: 'Aucun retard de paiement',
    detail: '100% des paiements à temps',
  },
  {
    icon: AlertTriangle,
    status: 'warn' as const,
    text: 'Augmenter les dépôts mensuels',
    detail: 'Dépôts variables ces 3 derniers mois',
  },
  {
    icon: XCircle,
    status: 'bad' as const,
    text: 'Limiter les retraits fréquents',
    detail: '4 retraits cette semaine',
  },
]

const TIPS = [
  {
    icon: Zap,
    text: 'Effectuez des dépôts réguliers chaque semaine pour montrer votre stabilité financière.',
  },
  {
    icon: Star,
    text: 'Remboursez vos crédits avant l\'échéance pour gagner des points bonus.',
  },
  {
    icon: TrendingUp,
    text: 'Utilisez vos cartes virtuelles régulièrement pour maintenir un historique actif.',
  },
  {
    icon: Lightbulb,
    text: 'Participez à des tontines : les contributions régulières améliorent votre score.',
  },
]

export function ScorePage() {
  const { creditScore, scoreHistory } = useAppStore()
  const level = getScoreLevel(creditScore)

  // SVG ring parameters
  const radius = 70
  const circumference = 2 * Math.PI * radius
  const strokeDashoffset = circumference - (creditScore / 1000) * circumference

  // Score bar chart - simple SVG
  const maxScore = 1000
  const barWidth = 100 / scoreHistory.length

  return (
    <div className="space-y-6 px-4 pb-28 pt-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">Score Financier</h1>
        <p className="text-muted-foreground text-sm">
          Suivez votre score et améliorez votre profil
        </p>
      </div>

      {/* Big Score Display */}
      <Card>
        <CardContent className="flex flex-col items-center py-8">
          {/* Circular Progress Ring */}
          <div className="relative mb-4">
            <svg width="180" height="180" viewBox="0 0 180 180">
              {/* Background circle */}
              <circle
                cx="90"
                cy="90"
                r={radius}
                fill="none"
                stroke="currentColor"
                strokeWidth="12"
                className="text-muted/20"
              />
              {/* Progress circle */}
              <circle
                cx="90"
                cy="90"
                r={radius}
                fill="none"
                stroke={level.color}
                strokeWidth="12"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                transform="rotate(-90 90 90)"
                className="transition-all duration-1000"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-4xl font-bold">{creditScore}</span>
              <span className="text-muted-foreground text-xs">/ 1000</span>
            </div>
          </div>

          {/* Level Badge */}
          <Badge className={`${level.bg} ${level.border} ${level.textColor} px-4 py-1 text-sm`}>
            <Trophy className="mr-1 size-4" />
            {level.label}
          </Badge>

          {/* Level breakdown */}
          <div className="mt-4 flex w-full items-center justify-between rounded-lg bg-muted/50 px-4 py-3 text-xs">
            {[
              { label: 'Faible', range: '0-400', color: 'bg-red-500' },
              { label: 'Moyen', range: '400-600', color: 'bg-amber-500' },
              { label: 'Bon', range: '600-800', color: 'bg-green-500' },
              { label: 'Excellent', range: '800-1000', color: 'bg-yellow-500' },
            ].map((lvl) => (
              <div key={lvl.label} className="flex flex-col items-center gap-1">
                <div
                  className={`size-2.5 rounded-full ${
                    lvl.label.toLowerCase() === level.label.toLowerCase()
                      ? `ring-2 ring-offset-1 ring-offset-card ${lvl.color}`
                      : `${lvl.color} opacity-40`
                  }`}
                />
                <span className="font-medium">{lvl.label}</span>
                <span className="text-muted-foreground">{lvl.range}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Score History - Simple bar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historique du score</CardTitle>
          <CardDescription>
            Évolution de votre score sur les 5 derniers mois
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-2" style={{ height: '160px' }}>
            {scoreHistory.map((entry, i) => {
              const pct = (entry.score / maxScore) * 100
              const isLast = i === scoreHistory.length - 1
              return (
                <div
                  key={entry.date}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  {/* Value label */}
                  <span
                    className={`text-xs font-medium ${
                      isLast ? level.textColor : 'text-muted-foreground'
                    }`}
                  >
                    {entry.score}
                  </span>
                  {/* Bar */}
                  <div className="relative w-full" style={{ height: '120px' }}>
                    <div
                      className={`absolute bottom-0 left-1/2 w-5 -translate-x-1/2 rounded-t-md transition-all ${
                        isLast
                          ? 'bg-primary'
                          : 'bg-muted-foreground/20'
                      }`}
                      style={{ height: `${pct}%` }}
                    />
                  </div>
                  {/* Month label */}
                  <span className="text-muted-foreground text-xs">
                    {entry.date}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Trend line SVG overlay - dots connected */}
          <svg
            className="mt-2 w-full"
            viewBox="0 0 400 40"
            preserveAspectRatio="none"
            style={{ height: '40px' }}
          >
            <polyline
              fill="none"
              stroke={level.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              points={scoreHistory
                .map((s, i) => {
                  const x = scoreHistory.length === 1
                    ? 200
                    : (i / (scoreHistory.length - 1)) * 380 + 10
                  const y = 35 - (s.score / maxScore) * 30
                  return `${x},${y}`
                })
                .join(' ')}
            />
            {scoreHistory.map((s, i) => {
              const x = scoreHistory.length === 1
                ? 200
                : (i / (scoreHistory.length - 1)) * 380 + 10
              const y = 35 - (s.score / maxScore) * 30
              const isLast = i === scoreHistory.length - 1
              return (
                <circle
                  key={s.date}
                  cx={x}
                  cy={y}
                  r={isLast ? 4 : 3}
                  fill={isLast ? level.color : '#888'}
                  stroke="white"
                  strokeWidth="1.5"
                />
              )
            })}
          </svg>
        </CardContent>
      </Card>

      {/* Factors */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Facteurs de score</CardTitle>
          <CardDescription>
            Ce qui influence votre score financièrement
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {FACTORS.map((factor, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg p-3 transition-colors hover:bg-muted/50"
            >
              <factor.icon
                className={`mt-0.5 size-5 shrink-0 ${
                  factor.status === 'good'
                    ? 'text-green-500'
                    : factor.status === 'warn'
                    ? 'text-amber-500'
                    : 'text-red-500'
                }`}
              />
              <div className="flex-1">
                <p className="text-sm font-medium">{factor.text}</p>
                <p className="text-muted-foreground text-xs">{factor.detail}</p>
              </div>
              {factor.status === 'good' && (
                <Badge className="bg-green-500/15 text-green-600 border-green-500/20 text-[10px]">
                  ✅ +15 pts
                </Badge>
              )}
              {factor.status === 'warn' && (
                <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/20 text-[10px]">
                  ⚠️ -5 pts
                </Badge>
              )}
              {factor.status === 'bad' && (
                <Badge className="bg-red-500/15 text-red-600 border-red-500/20 text-[10px]">
                  ❌ -20 pts
                </Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Lightbulb className="size-4" />
            Conseils pour améliorer
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {TIPS.map((tip, i) => (
            <div key={i} className="flex items-start gap-3 rounded-lg p-3 bg-muted/30">
              <tip.icon className="mt-0.5 size-4 shrink-0 text-primary" />
              <p className="text-sm">{tip.text}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
