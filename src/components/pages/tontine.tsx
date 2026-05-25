'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardAction,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Users,
  Plus,
  Share2,
  Copy,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  Shield,
  Clock,
  CheckCircle2,
  XCircle,
  Coins,
} from 'lucide-react'

const fmt = new Intl.NumberFormat('fr-FR')

interface TontineMember {
  name: string
  phone: string
  paid: boolean
  trustScore: number
}

const mockMembers: Record<string, TontineMember[]> = {
  '1': [
    { name: 'Moussa Diallo', phone: '+242 06 543 21 09', paid: true, trustScore: 95 },
    { name: 'Jean Mukendi', phone: '+242 06 512 34 56', paid: true, trustScore: 88 },
    { name: 'Marie Ngoie', phone: '+242 06 667 89 01', paid: false, trustScore: 72 },
    { name: 'Patrick Mbemba', phone: '+242 06 478 23 45', paid: true, trustScore: 91 },
    { name: 'Grace Nzaba', phone: '+242 06 523 67 89', paid: true, trustScore: 85 },
    { name: 'Joel Kimbembe', phone: '+242 06 634 90 12', paid: false, trustScore: 68 },
    { name: 'Sarah Bakala', phone: '+242 06 545 12 78', paid: true, trustScore: 90 },
    { name: 'Dieu Mercie', phone: '+242 06 656 34 56', paid: true, trustScore: 82 },
  ],
  '2': [
    { name: 'Carine Taty', phone: '+242 06 567 12 34', paid: true, trustScore: 94 },
    { name: 'Herve Loemba', phone: '+242 06 578 23 45', paid: true, trustScore: 79 },
    { name: 'Fabiola Nziengui', phone: '+242 06 589 34 56', paid: true, trustScore: 87 },
    { name: 'Blaise Okombi', phone: '+242 06 590 45 67', paid: false, trustScore: 65 },
    { name: 'Prisca Massamba', phone: '+242 06 501 56 78', paid: true, trustScore: 92 },
    { name: 'Nestor Bantsimba', phone: '+242 06 512 67 89', paid: true, trustScore: 76 },
    { name: 'Yolande Mouanda', phone: '+242 06 523 78 90', paid: true, trustScore: 89 },
    { name: 'Gloire Ntsiba', phone: '+242 06 534 89 01', paid: false, trustScore: 70 },
    { name: 'Aline Bouesso', phone: '+242 06 545 90 12', paid: true, trustScore: 84 },
    { name: 'Cedric Makani', phone: '+242 06 556 01 23', paid: true, trustScore: 80 },
    { name: 'Dorcas Ngoma', phone: '+242 06 567 12 34', paid: true, trustScore: 93 },
    { name: 'Emmanuel Ngoie', phone: '+242 06 578 23 45', paid: true, trustScore: 78 },
  ],
}

function getTrustLevel(score: number) {
  if (score >= 90) return { label: 'Excellent', color: 'text-emerald-500', bg: 'bg-emerald-500/10' }
  if (score >= 75) return { label: 'Bon', color: 'text-blue-500', bg: 'bg-blue-500/10' }
  if (score >= 60) return { label: 'Moyen', color: 'text-amber-500', bg: 'bg-amber-500/10' }
  return { label: 'Faible', color: 'text-red-500', bg: 'bg-red-500/10' }
}

export function TontinePage() {
  const { tontines, addTontine } = useAppStore()
  const [showCreate, setShowCreate] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [copiedLink, setCopiedLink] = useState<string | null>(null)
  const [formName, setFormName] = useState('')
  const [formAmount, setFormAmount] = useState('')
  const [formFrequency, setFormFrequency] = useState<'weekly' | 'monthly'>('monthly')
  const [formMaxMembers, setFormMaxMembers] = useState('')

  const handleCreate = () => {
    if (!formName || !formAmount || !formMaxMembers) return
    const newTontine = {
      id: Date.now().toString(),
      name: formName,
      amount: Number(formAmount),
      frequency: formFrequency,
      maxMembers: Number(formMaxMembers),
      currentTurn: 1,
      memberCount: 1,
      status: 'active' as const,
      inviteLink: `moarli.app/tontine/${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    }
    addTontine(newTontine)
    setShowCreate(false)
    setFormName('')
    setFormAmount('')
    setFormMaxMembers('')
  }

  const handleCopyLink = (link: string) => {
    navigator.clipboard?.writeText(link)
    setCopiedLink(link)
    setTimeout(() => setCopiedLink(null), 2000)
  }

  return (
    <div className="space-y-4 p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Tontines Digitales</h1>
          <p className="text-sm text-muted-foreground">
            Gérez vos tontines en toute confiance
          </p>
        </div>
        <Button size="sm" onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Créer
        </Button>
      </div>

      {/* Trust Score Explanation */}
      <Card className="border-blue-500/20 bg-blue-500/5">
        <CardContent className="flex items-start gap-3">
          <Shield className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-blue-500">Score de confiance</p>
            <p className="text-muted-foreground mt-1">
              Le score de confiance (0-100) évalue la ponctualité des paiements et l&apos;engagement de chaque membre. 
              Un score élevé garantit la fiabilité du groupe.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Penalty Warning */}
      <Card className="border-amber-500/20 bg-amber-500/5">
        <CardContent className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-amber-500">Pénalité de retard</p>
            <p className="text-muted-foreground mt-1">
              Un retard de paiement entraîne une pénalité de 5% du montant dû et réduit votre score de confiance de 10 points.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Create Tontine Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Créer une Tontine</DialogTitle>
            <DialogDescription>
              Démarrez une nouvelle tontine et invitez vos membres
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nom de la tontine</Label>
              <Input
                placeholder="Ex: Tontine Famille"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Montant par cycle (FCFA)</Label>
              <Input
                type="number"
                placeholder="25000"
                value={formAmount}
                onChange={(e) => setFormAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Fréquence</Label>
              <Select value={formFrequency} onValueChange={(v) => setFormFrequency(v as 'weekly' | 'monthly')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weekly">Hebdomadaire</SelectItem>
                  <SelectItem value="monthly">Mensuelle</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Nombre max de membres</Label>
              <Input
                type="number"
                placeholder="10"
                value={formMaxMembers}
                onChange={(e) => setFormMaxMembers(e.target.value)}
              />
            </div>
            <Button className="w-full" onClick={handleCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Créer la Tontine
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Tontines List */}
      <div className="space-y-3">
        {tontines.map((tontine) => {
          const isExpanded = expandedId === tontine.id
          const members = mockMembers[tontine.id] || []
          const paidCount = members.filter((m) => m.paid).length

          return (
            <Card key={tontine.id} className="overflow-hidden">
              <CardHeader
                className="cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : tontine.id)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Coins className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{tontine.name}</CardTitle>
                      <CardDescription className="text-xs mt-1">
                        Tour {tontine.currentTurn} • {fmt.format(tontine.amount)} FCFA / cycle
                      </CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isExpanded ? (
                      <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Badges */}
                <div className="flex flex-wrap gap-2">
                  <Badge variant={tontine.frequency === 'weekly' ? 'default' : 'secondary'}>
                    <Clock className="h-3 w-3 mr-1" />
                    {tontine.frequency === 'weekly' ? 'Hebdomadaire' : 'Mensuelle'}
                  </Badge>
                  <Badge variant="outline">
                    <Users className="h-3 w-3 mr-1" />
                    {tontine.memberCount}/{tontine.maxMembers}
                  </Badge>
                  <Badge
                    variant={tontine.status === 'active' ? 'default' : 'secondary'}
                    className={
                      tontine.status === 'active'
                        ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                        : ''
                    }
                  >
                    {tontine.status === 'active' ? '🟢 Active' : '✅ Terminée'}
                  </Badge>
                </div>

                {/* Progress */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Paiement du cycle en cours</span>
                    <span>{paidCount}/{members.length} membres</span>
                  </div>
                  <Progress value={members.length > 0 ? (paidCount / members.length) * 100 : 0} />
                </div>

                {/* Invite Link */}
                <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/50">
                  <Share2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground flex-1 truncate">
                    {tontine.inviteLink}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                    onClick={() => handleCopyLink(tontine.inviteLink)}
                  >
                    {copiedLink === tontine.inviteLink ? (
                      <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>

                {/* Contribuer Button */}
                <Button className="w-full" size="sm">
                  <Coins className="h-4 w-4 mr-2" />
                  Contribuer {fmt.format(tontine.amount)} FCFA
                </Button>

                {/* Expanded: Members List */}
                {isExpanded && members.length > 0 && (
                  <div className="space-y-2 pt-2 border-t">
                    <p className="text-sm font-medium">Membres ({members.length})</p>
                    {members.map((member, idx) => {
                      const trust = getTrustLevel(member.trustScore)
                      return (
                        <div
                          key={idx}
                          className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-xs font-medium">
                              {member.name.split(' ').map((n) => n[0]).join('').substring(0, 2)}
                            </div>
                            <div>
                              <p className="text-sm font-medium">{member.name}</p>
                              <p className="text-xs text-muted-foreground">{member.phone}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className={`text-xs ${trust.color} ${trust.bg}`}>
                              {trust.label} {member.trustScore}
                            </Badge>
                            {member.paid ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-400" />
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Empty State */}
      {tontines.length === 0 && (
        <Card className="text-center py-8">
          <CardContent>
            <Users className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="font-medium">Aucune tontine</p>
            <p className="text-sm text-muted-foreground mt-1">
              Créez votre première tontine ou rejoignez-en une via un lien d&apos;invitation
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
