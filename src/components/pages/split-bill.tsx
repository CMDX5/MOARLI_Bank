'use client'

import { useState, useCallback } from 'react'
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
  Plus,
  Minus,
  Send,
  Receipt,
  Users,
  Calculator,
  Trash2,
  CheckCircle2,
  Clock,
} from 'lucide-react'

const fmt = new Intl.NumberFormat('fr-FR')

interface Person {
  id: string
  name: string
}

interface SplitHistory {
  id: string
  description: string
  totalAmount: number
  personCount: number
  amountPerPerson: number
  status: 'completed' | 'pending' | 'partial'
  date: string
}

const mockHistory: SplitHistory[] = [
  {
    id: 's1',
    description: 'Dîner restaurant Le Phare',
    totalAmount: 85000,
    personCount: 5,
    amountPerPerson: 17000,
    status: 'completed',
    date: '2025-05-22T20:00:00Z',
  },
  {
    id: 's2',
    description: ' courses marché central',
    totalAmount: 32000,
    personCount: 3,
    amountPerPerson: 10667,
    status: 'pending',
    date: '2025-05-20T10:00:00Z',
  },
  {
    id: 's3',
    description: 'Transport Brazzaville-PK',
    totalAmount: 15000,
    personCount: 4,
    amountPerPerson: 3750,
    status: 'partial',
    date: '2025-05-18T08:00:00Z',
  },
  {
    id: 's4',
    description: 'Abonnement eau + électricité',
    totalAmount: 45000,
    personCount: 2,
    amountPerPerson: 22500,
    status: 'completed',
    date: '2025-05-15T14:00:00Z',
  },
]

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function statusBadge(status: SplitHistory['status']) {
  switch (status) {
    case 'completed':
      return (
        <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/25 hover:bg-emerald-500/20">
          <CheckCircle2 className="size-3" />
          Complété
        </Badge>
      )
    case 'pending':
      return (
        <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/25 hover:bg-amber-500/20">
          <Clock className="size-3" />
          En attente
        </Badge>
      )
    case 'partial':
      return (
        <Badge className="bg-blue-500/15 text-blue-600 border-blue-500/25 hover:bg-blue-500/20">
          <Clock className="size-3" />
          Partiel
        </Badge>
      )
  }
}

export function SplitBillPage() {
  const [totalAmount, setTotalAmount] = useState('')
  const [description, setDescription] = useState('')
  const [people, setPeople] = useState<Person[]>([
    { id: '1', name: '' },
    { id: '2', name: '' },
  ])
  const [sent, setSent] = useState(false)

  const amountNum = parseFloat(totalAmount) || 0
  const personCount = people.length
  const amountPerPerson = personCount > 0 ? Math.round(amountNum / personCount) : 0

  const addPerson = useCallback(() => {
    if (people.length < 20) {
      setPeople((prev) => [...prev, { id: Date.now().toString(), name: '' }])
    }
  }, [people.length])

  const removePerson = useCallback((id: string) => {
    setPeople((prev) => (prev.length > 2 ? prev.filter((p) => p.id !== id) : prev))
  }, [])

  const updatePersonName = useCallback((id: string, name: string) => {
    setPeople((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
  }, [])

  const handleSend = () => {
    if (amountNum > 0 && personCount >= 2 && description.trim()) {
      setSent(true)
      setTimeout(() => {
        setSent(false)
        setTotalAmount('')
        setDescription('')
        setPeople([
          { id: '1', name: '' },
          { id: '2', name: '' },
        ])
      }, 2500)
    }
  }

  const canSend = amountNum > 0 && personCount >= 2 && description.trim()

  return (
    <div className="flex flex-col gap-6 p-4 max-w-lg mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Split Bill</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Divisez vos dépenses facilement entre plusieurs personnes
        </p>
      </div>

      {/* New Split Form */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="size-5 text-primary" />
            Nouveau Split
          </CardTitle>
          <CardDescription>Entrez le montant total et ajoutez les participants</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Amount */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="split-amount">Montant total (FCFA)</Label>
            <Input
              id="split-amount"
              type="number"
              placeholder="Ex: 85 000"
              value={totalAmount}
              onChange={(e) => setTotalAmount(e.target.value)}
              min={0}
            />
          </div>

          {/* Description */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="split-desc">Description</Label>
            <Input
              id="split-desc"
              placeholder="Ex: Dîner restaurant"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <Separator />

          {/* People count header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-muted-foreground" />
              <Label>Participants ({personCount}/20)</Label>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={addPerson}
              disabled={people.length >= 20}
              className="h-8 gap-1"
            >
              <Plus className="size-3.5" />
              Ajouter
            </Button>
          </div>

          {/* People list */}
          <div className="flex flex-col gap-2">
            {people.map((person, index) => (
              <div key={person.id} className="flex items-center gap-2">
                <span className="text-xs font-medium text-muted-foreground w-6 text-right shrink-0">
                  {index + 1}.
                </span>
                <Input
                  placeholder={`Nom personne ${index + 1}`}
                  value={person.name}
                  onChange={(e) => updatePersonName(person.id, e.target.value)}
                  className="h-9"
                />
                {people.length > 2 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
                    onClick={() => removePerson(person.id)}
                  >
                    <Minus className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>

        <CardFooter className="flex-col gap-4">
          {/* Split Preview */}
          {amountNum > 0 && (
            <div className="w-full rounded-lg bg-muted/50 p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">Aperçu du split</span>
                <span className="text-xs text-muted-foreground">
                  {personCount} personne{personCount > 1 ? 's' : ''}
                </span>
              </div>
              <div className="space-y-2">
                {people.map((person, index) => (
                  <div key={person.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground truncate max-w-[60%]">
                      {person.name || `Personne ${index + 1}`}
                    </span>
                    <span className="font-semibold">
                      {fmt.format(amountPerPerson)} FCFA
                    </span>
                  </div>
                ))}
              </div>
              <Separator className="my-3" />
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="font-bold">{fmt.format(amountNum)} FCFA</span>
              </div>
            </div>
          )}

          {sent ? (
            <div className="flex items-center gap-2 text-emerald-600 text-sm font-medium py-2">
              <CheckCircle2 className="size-5" />
              Demandes envoyées avec succès !
            </div>
          ) : (
            <Button
              className="w-full gap-2"
              size="lg"
              disabled={!canSend}
              onClick={handleSend}
            >
              <Send className="size-4" />
              Envoyer les demandes
            </Button>
          )}
        </CardFooter>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Receipt className="size-5 text-primary" />
            Historique des splits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3">
            {mockHistory.map((split) => (
              <div
                key={split.id}
                className="flex flex-col gap-2 rounded-lg border p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <p className="text-sm font-medium truncate">{split.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(split.date)}
                    </p>
                  </div>
                  {statusBadge(split.status)}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="size-3" />
                    {split.personCount} personne{split.personCount > 1 ? 's' : ''}
                  </span>
                  <span>
                    Total : <strong className="text-foreground">{fmt.format(split.totalAmount)}</strong> FCFA
                  </span>
                  <span>
                    /pers : <strong className="text-foreground">{fmt.format(split.amountPerPerson)}</strong> FCFA
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
