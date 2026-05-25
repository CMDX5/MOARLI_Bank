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
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Trophy,
  Medal,
  Crown,
  Star,
  Share2,
  Lock,
  Target,
  Award,
  TrendingUp,
  User,
} from 'lucide-react'

const fmt = new Intl.NumberFormat('fr-FR')

interface AllBadge {
  id: string
  badgeType: string
  label: string
  emoji: string
  description: string
  earned: boolean
  earnedAt?: string
}

const allBadges: AllBadge[] = [
  { id: '1', badgeType: 'first_deposit', label: 'Premier Dépôt', emoji: '🎉', description: 'Effectué votre premier dépôt', earned: true, earnedAt: '2025-01-15' },
  { id: '2', badgeType: 'five_transfers', label: '5 Virements', emoji: '💸', description: 'Effectué 5 virements ou plus', earned: true, earnedAt: '2025-02-20' },
  { id: '3', badgeType: 'saver_bronze', label: 'Épargnant Bronze', emoji: '🥉', description: 'Épargné plus de 50 000 FCFA', earned: true, earnedAt: '2025-03-10' },
  { id: '4', badgeType: 'saver_silver', label: 'Épargnant Argent', emoji: '🥈', description: 'Épargné plus de 200 000 FCFA', earned: false },
  { id: '5', badgeType: 'saver_gold', label: 'Épargnant Or', emoji: '🥇', description: 'Épargné plus de 500 000 FCFA', earned: false },
  { id: '6', badgeType: 'tontine_master', label: 'Maître Tontine', emoji: '🤝', description: 'Créé 3 tontines actives', earned: false },
  { id: '7', badgeType: 'credit_star', label: 'Crédit Étoile', emoji: '⭐', description: 'Score de crédit supérieur à 750', earned: false },
  { id: '8', badgeType: 'social_butterfly', label: 'Papillon Social', emoji: '🦋', description: 'Invité 10 amis sur MOARLI', earned: false },
]

const weeklyChallenge = {
  title: 'Épargne 50K ce mois',
  description: 'Épargnez 50 000 FCFA ce mois-ci pour débloquer un badge exclusif',
  target: 50000,
  current: 32500,
  reward: 'Badge Épargnant Argent 🥈',
}

export function LeaderboardPage() {
  const { leaderboard, badges } = useAppStore()
  const [shared, setShared] = useState(false)

  const earnedBadges = allBadges.filter((b) => b.earned)
  const lockedBadges = allBadges.filter((b) => !b.earned)
  const top3 = leaderboard.slice(0, 3)
  const rest = leaderboard.slice(3)

  const getRankColor = (rank: number) => {
    switch (rank) {
      case 1: return 'text-amber-500'
      case 2: return 'text-gray-400'
      case 3: return 'text-amber-700'
      default: return 'text-muted-foreground'
    }
  }

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return '👑'
      case 2: return '🥈'
      case 3: return '🥉'
      default: return `#${rank}`
    }
  }

  return (
    <div className="space-y-4 p-4 pb-24">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-xl font-bold">Classement</h1>
        <p className="text-sm text-muted-foreground">
          Comparez-vous aux meilleurs utilisateurs MOARLI
        </p>
      </div>

      {/* Podium */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-end justify-center gap-4 pt-4">
            {/* 2nd Place */}
            <div className="flex flex-col items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-200 dark:bg-gray-700 mb-2">
                <User className="h-6 w-6 text-gray-500" />
              </div>
              <div className="text-2xl mb-1">🥈</div>
              <p className="text-xs font-medium text-center max-w-[80px] truncate">{top3[1]?.name}</p>
              <p className="text-xs text-muted-foreground">{fmt.format(top3[1]?.score || 0)} pts</p>
              <div className="h-16 w-16 mt-2 rounded-t-lg bg-gradient-to-t from-gray-300 to-gray-200 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center">
                <span className="text-lg font-bold text-gray-600 dark:text-gray-300">2</span>
              </div>
            </div>

            {/* 1st Place */}
            <div className="flex flex-col items-center -mt-4">
              <Crown className="h-6 w-6 text-amber-500 mb-1" />
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/30 mb-2 border-2 border-amber-500">
                <Trophy className="h-8 w-8 text-amber-500" />
              </div>
              <div className="text-3xl mb-1">🥇</div>
              <p className="text-sm font-bold text-center max-w-[80px] truncate">{top3[0]?.name}</p>
              <p className="text-xs font-medium">{fmt.format(top3[0]?.score || 0)} pts</p>
              <div className="h-24 w-16 mt-2 rounded-t-lg bg-gradient-to-t from-amber-400 to-amber-200 dark:from-amber-700 dark:to-amber-500 flex items-center justify-center">
                <span className="text-xl font-bold text-amber-800 dark:text-amber-100">1</span>
              </div>
            </div>

            {/* 3rd Place */}
            <div className="flex flex-col items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/20 mb-2">
                <User className="h-6 w-6 text-amber-700" />
              </div>
              <div className="text-2xl mb-1">🥉</div>
              <p className="text-xs font-medium text-center max-w-[80px] truncate">{top3[2]?.name}</p>
              <p className="text-xs text-muted-foreground">{fmt.format(top3[2]?.score || 0)} pts</p>
              <div className="h-12 w-16 mt-2 rounded-t-lg bg-gradient-to-t from-amber-700 to-amber-600 flex items-center justify-center">
                <span className="text-lg font-bold text-amber-100">3</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Full Ranking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Classement complet</CardTitle>
          <CardDescription>Meilleurs utilisateurs MOARLI ce mois</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {leaderboard.map((user) => {
            const isCurrentUser = user.name === 'Moi'
            return (
              <div
                key={user.rank}
                className={`flex items-center justify-between p-3 rounded-lg ${
                  isCurrentUser
                    ? 'bg-primary/10 border border-primary/20'
                    : 'bg-muted/30'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold ${
                      user.rank <= 3
                        ? 'bg-amber-500/10'
                        : 'bg-muted'
                    }`}
                  >
                    {typeof getRankIcon(user.rank) === 'string' && getRankIcon(user.rank).startsWith('#') ? (
                      <span className={getRankColor(user.rank)}>{user.rank}</span>
                    ) : (
                      <span>{getRankIcon(user.rank)}</span>
                    )}
                  </div>
                  <div>
                    <p className={`text-sm font-medium ${isCurrentUser ? 'text-primary' : ''}`}>
                      {user.name} {isCurrentUser && '(Vous)'}
                    </p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Award className="h-3 w-3" />
                      <span>{user.badges} badges</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <TrendingUp className="h-3 w-3 text-primary" />
                  <span className="text-sm font-bold">{fmt.format(user.score)}</span>
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* Weekly Challenge */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            Défi de la semaine
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-medium">{weeklyChallenge.title}</p>
          <p className="text-xs text-muted-foreground mt-1">{weeklyChallenge.description}</p>
          <div className="mt-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">
                {fmt.format(weeklyChallenge.current)} / {fmt.format(weeklyChallenge.target)} FCFA
              </span>
              <span className="font-medium">
                {Math.round((weeklyChallenge.current / weeklyChallenge.target) * 100)}%
              </span>
            </div>
            <Progress value={(weeklyChallenge.current / weeklyChallenge.target) * 100} />
          </div>
          <p className="text-xs text-muted-foreground mt-2">🎁 Récompense : {weeklyChallenge.reward}</p>
        </CardContent>
      </Card>

      {/* Earned Badges */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">Mes badges ({earnedBadges.length})</CardTitle>
            <CardDescription>Badges obtenus</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShared(true)}
            className="text-xs"
          >
            <Share2 className="h-3 w-3 mr-1" />
            Partager
          </Button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {earnedBadges.map((badge) => (
              <div
                key={badge.id}
                className="flex flex-col items-center text-center p-3 rounded-xl bg-muted/30"
              >
                <span className="text-2xl mb-1">{badge.emoji}</span>
                <p className="text-xs font-medium">{badge.label}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{badge.description}</p>
              </div>
            ))}
          </div>

          {shared && (
            <div className="mt-3 p-2 rounded-lg bg-emerald-500/10 text-center">
              <p className="text-xs text-emerald-500 font-medium">
                ✅ Lien de partage copié !
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Locked Badges */}
      {lockedBadges.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Badges à débloquer</CardTitle>
            <CardDescription>Continuez à utiliser MOARLI pour les obtenir</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              {lockedBadges.map((badge) => (
                <div
                  key={badge.id}
                  className="flex flex-col items-center text-center p-3 rounded-xl bg-muted/20 opacity-50"
                >
                  <div className="relative">
                    <span className="text-2xl mb-1 grayscale">{badge.emoji}</span>
                    <Lock className="h-3 w-3 absolute -top-1 -right-2 text-muted-foreground" />
                  </div>
                  <p className="text-xs font-medium">{badge.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{badge.description}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
