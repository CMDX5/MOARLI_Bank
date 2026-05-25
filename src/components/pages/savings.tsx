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
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
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
  Target,
  Plus,
  PiggyBank,
  CalendarDays,
  Sparkles,
  TrendingUp,
} from 'lucide-react'

const EMOJI_OPTIONS = [
  { value: '✈️', label: '✈️ Voyage' },
  { value: '📚', label: '📚 Éducation' },
  { value: '🛡️', label: '🛡️ Urgence' },
  { value: '🚗', label: '🚗 Véhicule' },
  { value: '🏠', label: '🏠 Maison' },
  { value: '🎓', label: '🎓 Études' },
]

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-FR').format(n)

function getEncouragement(pct: number): string | null {
  if (pct >= 100) return '🎉 Bravo ! Objectif atteint !'
  if (pct >= 75) return '🔥 Presque là ! Plus qu\'un petit effort !'
  if (pct >= 50) return '💪 La moitié est faite ! Continuez !'
  if (pct >= 25) return '🌟 Bon départ ! Vous êtes sur la bonne voie !'
  return null
}

export function SavingsPage() {
  const {
    savingsGoals,
    addSavingsGoal,
    updateSavingsGoal,
    savingsRoundUp,
    toggleSavingsRoundUp,
  } = useAppStore()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [addDialogOpen, setAddDialogOpen] = useState<string | null>(null)
  const [addAmount, setAddAmount] = useState('')

  // New goal form
  const [newTitle, setNewTitle] = useState('')
  const [newEmoji, setNewEmoji] = useState('✈️')
  const [newTarget, setNewTarget] = useState('')
  const [newDeadline, setNewDeadline] = useState('')

  const handleCreateGoal = () => {
    if (!newTitle || !newTarget) return
    const goal: import('@/lib/store').SavingsGoal = {
      id: Date.now().toString(),
      title: newTitle,
      emoji: newEmoji,
      targetAmount: parseInt(newTarget) || 0,
      currentAmount: 0,
      deadline: newDeadline || undefined,
      status: 'active',
    }
    addSavingsGoal(goal)
    setNewTitle('')
    setNewEmoji('✈️')
    setNewTarget('')
    setNewDeadline('')
    setDialogOpen(false)
  }

  const handleAddFunds = (goalId: string) => {
    const amount = parseInt(addAmount)
    if (!amount || amount <= 0) return
    updateSavingsGoal(goalId, amount)
    setAddAmount('')
    setAddDialogOpen(null)
  }

  const totalSaved = savingsGoals.reduce((s, g) => s + g.currentAmount, 0)
  const totalTarget = savingsGoals.reduce((s, g) => s + g.targetAmount, 0)

  return (
    <div className="space-y-6 px-4 pb-28 pt-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Épargne</h1>
          <p className="text-muted-foreground text-sm">
            {fmt(totalSaved)} / {fmt(totalTarget)} FCFA épargnés
          </p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button size="sm" className="gap-2">
              <Plus className="size-4" />
              Nouvel objectif
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nouvel objectif d'épargne</DialogTitle>
              <DialogDescription>
                Créez un objectif et commencez à épargner dès aujourd'hui.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Titre</Label>
                <Input
                  placeholder="Ex: Vacances à Pointe-Noire"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Icône</Label>
                <Select value={newEmoji} onValueChange={setNewEmoji}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EMOJI_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Montant cible (FCFA)</Label>
                <Input
                  type="number"
                  placeholder="100 000"
                  value={newTarget}
                  onChange={(e) => setNewTarget(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Date limite</Label>
                <Input
                  type="date"
                  value={newDeadline}
                  onChange={(e) => setNewDeadline(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={handleCreateGoal}
                disabled={!newTitle || !newTarget}
              >
                Créer l'objectif
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Round-up toggle */}
      <Card>
        <CardContent className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-lg bg-primary/10 p-2">
              <PiggyBank className="size-5 text-primary" />
            </div>
            <div>
              <p className="font-medium">Arrondi automatique</p>
              <p className="text-muted-foreground text-xs">
                Chaque transaction est arrondie au millier supérieur. La différence est ajoutée à votre épargne automatiquement.
              </p>
            </div>
          </div>
          <Switch
            checked={savingsRoundUp}
            onCheckedChange={toggleSavingsRoundUp}
          />
        </CardContent>
      </Card>

      {/* Savings Goals List */}
      <div className="space-y-4">
        {savingsGoals.length === 0 && (
          <Card>
            <CardContent className="flex flex-col items-center py-10 text-center">
              <Target className="mb-3 size-10 text-muted-foreground/50" />
              <p className="font-medium">Aucun objectif</p>
              <p className="text-muted-foreground text-sm">
                Créez votre premier objectif d'épargne !
              </p>
            </CardContent>
          </Card>
        )}

        {savingsGoals.map((goal) => {
          const pct = Math.min(
            Math.round((goal.currentAmount / goal.targetAmount) * 100),
            100
          )
          const encouragement = getEncouragement(pct)

          return (
            <Card key={goal.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{goal.emoji}</span>
                    <div>
                      <CardTitle className="text-base">{goal.title}</CardTitle>
                      {goal.deadline && (
                        <CardDescription className="flex items-center gap-1">
                          <CalendarDays className="size-3" />
                          {new Date(goal.deadline).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </CardDescription>
                      )}
                    </div>
                  </div>
                  <Badge
                    className={
                      goal.status === 'completed'
                        ? 'bg-yellow-500/15 text-yellow-600 border-yellow-500/20'
                        : 'bg-green-500/15 text-green-600 border-green-500/20'
                    }
                  >
                    {goal.status === 'completed' ? '✅ Atteint' : '🟢 Actif'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Progress */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold">{fmt(goal.currentAmount)} / {fmt(goal.targetAmount)} FCFA</span>
                    <span className="font-bold text-primary">{pct}%</span>
                  </div>
                  <Progress value={pct} className="h-3" />
                </div>

                {/* Encouragement */}
                {encouragement && (
                  <div className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2">
                    <Sparkles className="size-4 text-primary" />
                    <span className="text-sm font-medium">{encouragement}</span>
                  </div>
                )}

                {/* Add funds button */}
                {goal.status === 'active' && (
                  <Dialog
                    open={addDialogOpen === goal.id}
                    onOpenChange={(open) =>
                      setAddDialogOpen(open ? goal.id : null)
                    }
                  >
                    <DialogTrigger asChild>
                      <Button variant="outline" className="w-full gap-2" size="sm">
                        <TrendingUp className="size-4" />
                        Ajouter des fonds
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Ajouter des fonds</DialogTitle>
                        <DialogDescription>
                          {goal.emoji} {goal.title}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <Label>Montant (FCFA)</Label>
                          <Input
                            type="number"
                            placeholder="Entrez le montant"
                            value={addAmount}
                            onChange={(e) => setAddAmount(e.target.value)}
                          />
                          <p className="text-muted-foreground text-xs">
                            Reste: {fmt(goal.targetAmount - goal.currentAmount)} FCFA
                          </p>
                        </div>
                      </div>
                      <DialogFooter>
                        <Button
                          onClick={() => handleAddFunds(goal.id)}
                          disabled={!addAmount || parseInt(addAmount) <= 0}
                        >
                          Ajouter
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
