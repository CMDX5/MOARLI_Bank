'use client'

import { useState } from 'react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  TrendingUp,
  Building2,
  Landmark,
  Rocket,
  Briefcase,
  Wallet,
  Clock,
  Sparkles,
  Mail,
  CheckCircle2,
  BarChart3,
  ArrowUpRight,
  PieChart,
  Lock,
} from 'lucide-react'

const fmt = new Intl.NumberFormat('fr-FR')

interface InvestmentOption {
  id: string
  title: string
  icon: React.ReactNode
  description: string
  minAmount: number
  expectedReturn: number
  duration: string
  risk: string
  riskColor: string
  riskBg: string
  location: string
  investors: number
}

const investmentOptions: InvestmentOption[] = [
  {
    id: '1',
    title: 'Immobilier fractionnel',
    icon: <Building2 className="h-6 w-6" />,
    description: 'Investissez dans l\'immobilier à partir de 10 000 FCFA. Appartement au Poto-Poto, Brazzaville.',
    minAmount: 10000,
    expectedReturn: 8,
    duration: '12 mois',
    risk: 'Faible',
    riskColor: 'text-emerald-500',
    riskBg: 'bg-emerald-500/10',
    location: 'Poto-Poto, Brazzaville',
    investors: 124,
  },
  {
    id: '2',
    title: 'Obligations locales',
    icon: <Landmark className="h-6 w-6" />,
    description: 'Obligations d\'État congolais. Investissement sécurisé avec rendement garanti.',
    minAmount: 5000,
    expectedReturn: 5,
    duration: '6 mois',
    risk: 'Très faible',
    riskColor: 'text-blue-500',
    riskBg: 'bg-blue-500/10',
    location: 'République du Congo',
    investors: 342,
  },
  {
    id: '3',
    title: 'Startup equity',
    icon: <Rocket className="h-6 w-6" />,
    description: 'Investissez dans des startups locales congolaises à fort potentiel de croissance.',
    minAmount: 25000,
    expectedReturn: 15,
    duration: '24 mois',
    risk: 'Élevé',
    riskColor: 'text-red-500',
    riskBg: 'bg-red-500/10',
    location: 'Brazzaville & Pointe-Noire',
    investors: 67,
  },
]

const mockPortfolio = {
  totalInvested: 45000,
  currentValue: 47250,
  returns: 2250,
  returnsPercent: 5.0,
  assets: [
    { name: 'Immobilier', value: 10000, returnPercent: 3.2, color: 'bg-emerald-500' },
    { name: 'Obligations', value: 20000, returnPercent: 2.1, color: 'bg-blue-500' },
    { name: 'Startups', value: 15000, returnPercent: 8.5, color: 'bg-violet-500' },
  ],
}

export function InvestPage() {
  const [email, setEmail] = useState('')
  const [subscribed, setSubscribed] = useState(false)

  const handleSubscribe = () => {
    if (email && email.includes('@')) {
      setSubscribed(true)
    }
  }

  return (
    <div className="space-y-4 p-4 pb-24">
      {/* Header */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 mb-2">
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/20">
            <Sparkles className="h-3 w-3 mr-1" />
            Coming Soon
          </Badge>
        </div>
        <h1 className="text-xl font-bold">Investir avec MOARLI</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Tokenisation d&apos;actifs • À partir de 10 000 FCFA
        </p>
      </div>

      {/* Concept Explanation */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent>
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="font-medium text-sm">Nouveau : Investissements tokenisés</p>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                MOARLI lance bientôt la tokenisation d&apos;actifs au Congo. Investissez dans l&apos;immobilier, 
                les obligations gouvernementales et des startups locales directement depuis votre portefeuille.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Investment Options */}
      <div>
        <h2 className="text-base font-semibold mb-3">Opportunités d&apos;investissement</h2>
        <div className="space-y-3">
          {investmentOptions.map((option) => (
            <Card key={option.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                    {option.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-sm">{option.title}</p>
                      <Badge variant="outline" className={`${option.riskColor} ${option.riskBg} text-[10px]`}>
                        {option.risk}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{option.description}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      <Badge variant="secondary" className="text-[10px]">
                        <Wallet className="h-3 w-3 mr-0.5" />
                        Min: {fmt.format(option.minAmount)} FCFA
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        <ArrowUpRight className="h-3 w-3 mr-0.5" />
                        {option.expectedReturn}%/an
                      </Badge>
                      <Badge variant="secondary" className="text-[10px]">
                        <Clock className="h-3 w-3 mr-0.5" />
                        {option.duration}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-[10px] text-muted-foreground">
                        {option.investors} investisseurs
                      </span>
                      <Button size="sm" className="h-7 text-xs" disabled>
                        <Lock className="h-3 w-3 mr-1" />
                        Bientôt
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Portfolio Tracker Mockup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <PieChart className="h-5 w-5 text-primary" />
            Mon Portefeuille
          </CardTitle>
          <CardDescription>Aperçu de vos investissements</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="p-3 rounded-lg bg-muted/30">
              <p className="text-xs text-muted-foreground">Total investi</p>
              <p className="text-lg font-bold">{fmt.format(mockPortfolio.totalInvested)} FCFA</p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-500/10">
              <p className="text-xs text-muted-foreground">Valeur actuelle</p>
              <p className="text-lg font-bold text-emerald-500">{fmt.format(mockPortfolio.currentValue)} FCFA</p>
            </div>
          </div>

          <div className="space-y-3">
            {mockPortfolio.assets.map((asset) => (
              <div key={asset.name} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className={`h-2 w-2 rounded-full ${asset.color}`} />
                    <span>{asset.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{fmt.format(asset.value)} FCFA</span>
                    <span className="text-xs text-emerald-500">+{asset.returnPercent}%</span>
                  </div>
                </div>
                <Progress value={(asset.value / mockPortfolio.totalInvested) * 100} className="h-1.5" />
              </div>
            ))}
          </div>

          <div className="mt-4 p-2 rounded-lg bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
              <BarChart3 className="h-3 w-3" />
              Gains totaux : <span className="text-emerald-500 font-medium">+{fmt.format(mockPortfolio.returns)} FCFA</span>
              ({mockPortfolio.returnsPercent}%)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Waitlist */}
      <Card className="border-violet-500/20 bg-violet-500/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-5 w-5 text-violet-500" />
            Liste d&apos;attente
          </CardTitle>
          <CardDescription>Soyez parmi les premiers à investir</CardDescription>
        </CardHeader>
        <CardContent>
          {subscribed ? (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-500/10">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              <div>
                <p className="text-sm font-medium text-emerald-500">Vous êtes inscrit !</p>
                <p className="text-xs text-muted-foreground">Vous serez notifié au lancement.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Inscrivez-vous pour être parmi les premiers à accéder aux investissements tokenisés au Congo.
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="sr-only">Email</Label>
                  <Input
                    type="email"
                    placeholder="votre@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <Button onClick={handleSubscribe} size="sm">
                  S&apos;inscrire
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
