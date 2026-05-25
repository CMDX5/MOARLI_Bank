'use client'

import { useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { Progress } from '@/components/ui/progress'
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
  Plus,
  Heart,
  Users,
  Target,
  Share2,
  Gift,
  Copy,
  Check,
  PartyPopper,
  Church,
  Briefcase,
  CalendarDays,
} from 'lucide-react'

const fmt = new Intl.NumberFormat('fr-FR')

type EventType = 'mariage' | 'deuil' | 'fete' | 'projet'

interface Cagnotte {
  id: string
  title: string
  description: string
  emoji: string
  eventType: EventType
  targetAmount: number
  collectedAmount: number
  contributorCount: number
  endDate: string
  creatorName: string
  shareLink: string
}

const EMOJI_OPTIONS = ['🎉', '💒', '🙏', '🎂', '📚', '🏠', '🚗', '🌍', '🎁', '💜', '⭐', '🔥', '💰', '🏀', '🎵', '🏥']

const eventTypeConfig: Record<EventType, { label: string; icon: React.ElementType; color: string }> = {
  mariage: { label: 'Mariage', icon: PartyPopper, color: 'bg-pink-500/15 text-pink-600 border-pink-500/25' },
  deuil: { label: 'Deuil', icon: Church, color: 'bg-gray-500/15 text-gray-500 border-gray-500/25' },
  fete: { label: 'Fête', icon: Gift, color: 'bg-amber-500/15 text-amber-600 border-amber-500/25' },
  projet: { label: 'Projet', icon: Briefcase, color: 'bg-blue-500/15 text-blue-600 border-blue-500/25' },
}

const mockCagnottes: Cagnotte[] = [
  {
    id: 'c1',
    title: 'Mariage de Grace & Joel',
    description: 'Cagnotte pour offrir un beau cadeau aux jeunes mariés',
    emoji: '💒',
    eventType: 'mariage',
    targetAmount: 500000,
    collectedAmount: 325000,
    contributorCount: 28,
    endDate: '2025-06-15',
    creatorName: 'Sarah B.',
    shareLink: 'moarli.app/cagnotte/MGJ2025',
  },
  {
    id: 'c2',
    title: 'Obsèques Famille Ngoie',
    description: 'Aide pour les frais d\'obsèques',
    emoji: '🙏',
    eventType: 'deuil',
    targetAmount: 800000,
    collectedAmount: 620000,
    contributorCount: 45,
    endDate: '2025-05-30',
    creatorName: 'Jean Mukendi',
    shareLink: 'moarli.app/cagnotte/FN2025',
  },
  {
    id: 'c3',
    title: 'Fête d\'anniversaire Moïse',
    description: 'Organisation de la fête pour les 30 ans de Moïse',
    emoji: '🎂',
    eventType: 'fete',
    targetAmount: 150000,
    collectedAmount: 87500,
    contributorCount: 12,
    endDate: '2025-06-01',
    creatorName: 'Dieu M.',
    shareLink: 'moarli.app/cagnotte/BD30',
  },
  {
    id: 'c4',
    title: 'Projet École Maternelle',
    description: 'Construction d\'une école dans le quartier Moukondo',
    emoji: '📚',
    eventType: 'projet',
    targetAmount: 2000000,
    collectedAmount: 750000,
    contributorCount: 63,
    endDate: '2025-12-31',
    creatorName: 'Patrick M.',
    shareLink: 'moarli.app/cagnotte/EPM2025',
  },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function EventTypeBadge({ type }: { type: EventType }) {
  const config = eventTypeConfig[type]
  const Icon = config.icon
  return (
    <Badge className={`${config.color} hover:opacity-80 gap-1`}>
      <Icon className="size-3" />
      {config.label}
    </Badge>
  )
}

function CagnotteCard({ cagnotte }: { cagnotte: Cagnotte }) {
  const [contributing, setContributing] = useState(false)
  const [contributeAmount, setContributeAmount] = useState('')
  const [copied, setCopied] = useState(false)
  const [success, setSuccess] = useState(false)

  const progressPercent = cagnotte.targetAmount > 0
    ? Math.min(Math.round((cagnotte.collectedAmount / cagnotte.targetAmount) * 100), 100)
    : 0

  const remaining = Math.max(cagnotte.targetAmount - cagnotte.collectedAmount, 0)

  const handleContribute = () => {
    const amount = parseInt(contributeAmount) || 0
    if (amount > 0) {
      setContributing(false)
      setContributeAmount('')
      setSuccess(true)
      setTimeout(() => setSuccess(false), 2500)
    }
  }

  const handleCopy = () => {
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="overflow-hidden">
      <CardContent className="pt-0 flex flex-col gap-4">
        {/* Top row: emoji + title + event badge */}
        <div className="flex items-start gap-3">
          <span className="text-3xl shrink-0 mt-0.5">{cagnotte.emoji}</span>
          <div className="flex flex-col gap-1 min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-semibold leading-tight">{cagnotte.title}</h3>
              <EventTypeBadge type={cagnotte.eventType} />
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2">
              {cagnotte.description}
            </p>
            <p className="text-xs text-muted-foreground">
              par {cagnotte.creatorName}
            </p>
          </div>
        </div>

        {/* Progress */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-primary">
              {fmt.format(cagnotte.collectedAmount)} FCFA
            </span>
            <span className="text-muted-foreground">
              / {fmt.format(cagnotte.targetAmount)} FCFA
            </span>
          </div>
          <Progress value={progressPercent} className="h-2.5" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">{progressPercent}% atteint</span>
            <span className="text-xs text-muted-foreground">
              {remaining > 0 ? `Plus que ${fmt.format(remaining)} FCFA` : 'Objectif atteint !'}
            </span>
          </div>
        </div>

        {/* Meta info */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="size-3" />
            {cagnotte.contributorCount} contributeur{cagnotte.contributorCount > 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <CalendarDays className="size-3" />
            {formatDate(cagnotte.endDate)}
          </span>
        </div>

        {/* Success message */}
        {success && (
          <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium py-1">
            <Check className="size-4" />
            Contribution envoyée avec succès !
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          {progressPercent < 100 ? (
            <Dialog open={contributing} onOpenChange={setContributing}>
              <DialogTrigger asChild>
                <Button className="flex-1 gap-1.5" size="sm">
                  <Heart className="size-3.5" />
                  Contribuer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className="text-xl">{cagnotte.emoji}</span>
                    Contribuer à {cagnotte.title}
                  </DialogTitle>
                  <DialogDescription>
                    Entrez le montant que vous souhaitez contribuer
                  </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="contrib-amount">Montant (FCFA)</Label>
                    <Input
                      id="contrib-amount"
                      type="number"
                      placeholder="Ex: 5 000"
                      value={contributeAmount}
                      onChange={(e) => setContributeAmount(e.target.value)}
                      min={100}
                    />
                  </div>
                  {/* Quick amount buttons */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {[1000, 2500, 5000, 10000, 25000].map((amt) => (
                      <Button
                        key={amt}
                        variant="outline"
                        size="sm"
                        className="text-xs h-8"
                        onClick={() => setContributeAmount(String(amt))}
                      >
                        {fmt.format(amt)}
                      </Button>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setContributing(false)}>
                    Annuler
                  </Button>
                  <Button
                    onClick={handleContribute}
                    disabled={!contributeAmount || parseInt(contributeAmount) <= 0}
                    className="gap-1.5"
                  >
                    <Heart className="size-3.5" />
                    Confirmer
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : (
            <div className="flex-1 flex items-center justify-center gap-2 text-sm font-medium text-emerald-600 py-2">
              <Check className="size-4" />
              Objectif atteint
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="size-3.5 text-emerald-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
            {copied ? 'Copié' : 'Lien'}
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => {}}>
            <Share2 className="size-3.5" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export function CagnottePage() {
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [emoji, setEmoji] = useState('🎉')
  const [targetAmount, setTargetAmount] = useState('')
  const [eventType, setEventType] = useState<EventType>('fete')
  const [endDate, setEndDate] = useState('')
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)

  const handleCreate = () => {
    setOpen(false)
    setTitle('')
    setDescription('')
    setEmoji('🎉')
    setTargetAmount('')
    setEventType('fete')
    setEndDate('')
  }

  const canCreate = title.trim() && targetAmount && parseInt(targetAmount) > 0 && endDate

  return (
    <div className="flex flex-col gap-6 p-4 max-w-lg mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Cagnotte</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Collectez des fonds ensemble pour vos événements
          </p>
        </div>
      </div>

      {/* Create button */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="w-full gap-2" size="lg">
            <Plus className="size-4" />
            Créer une cagnotte
          </Button>
        </DialogTrigger>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="size-5 text-primary" />
              Nouvelle cagnotte
            </DialogTitle>
            <DialogDescription>
              Créez une collecte de fonds pour un événement ou un projet
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            {/* Emoji */}
            <div className="flex flex-col gap-2">
              <Label>Émoji</Label>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="lg"
                  className="text-2xl h-12 w-12 p-0 shrink-0"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  {emoji}
                </Button>
                {showEmojiPicker && (
                  <div className="flex items-center gap-1 flex-wrap">
                    {EMOJI_OPTIONS.map((e) => (
                      <Button
                        key={e}
                        variant="ghost"
                        size="sm"
                        className="text-lg h-8 w-8 p-0"
                        onClick={() => {
                          setEmoji(e)
                          setShowEmojiPicker(false)
                        }}
                      >
                        {e}
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Title */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="cag-title">Titre</Label>
              <Input
                id="cag-title"
                placeholder="Ex: Mariage de Grace & Joel"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            {/* Description */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="cag-desc">Description</Label>
              <Textarea
                id="cag-desc"
                placeholder="Décrivez l'objectif de cette cagnotte..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
            </div>

            {/* Event type */}
            <div className="flex flex-col gap-2">
              <Label>Type d&apos;événement</Label>
              <Select value={eventType} onValueChange={(v) => setEventType(v as EventType)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mariage">Mariage</SelectItem>
                  <SelectItem value="deuil">Deuil</SelectItem>
                  <SelectItem value="fete">Fête</SelectItem>
                  <SelectItem value="projet">Projet</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Target amount */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="cag-target">Montant cible (FCFA)</Label>
              <Input
                id="cag-target"
                type="number"
                placeholder="Ex: 500 000"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                min={1000}
              />
            </div>

            {/* End date */}
            <div className="flex flex-col gap-2">
              <Label htmlFor="cag-date">Date de fin</Label>
              <Input
                id="cag-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button onClick={handleCreate} disabled={!canCreate}>
              Créer la cagnotte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Cagnottes list */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Target className="size-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {mockCagnottes.length} cagnotte{mockCagnottes.length > 1 ? 's' : ''} en cours
          </span>
        </div>

        {mockCagnottes.map((cagnotte) => (
          <CagnotteCard key={cagnotte.id} cagnotte={cagnotte} />
        ))}
      </div>
    </div>
  )
}
