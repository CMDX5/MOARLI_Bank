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
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Store,
  TrendingUp,
  Users,
  DollarSign,
  QrCode,
  Plus,
  Minus,
  UserCheck,
  Receipt,
  BarChart3,
  ArrowUpRight,
  Clock,
} from 'lucide-react'

const fmt = new Intl.NumberFormat('fr-FR')

interface Cashier {
  id: string
  name: string
  phone: string
  status: 'active' | 'inactive'
  salesToday: number
}

interface Sale {
  id: string
  time: string
  amount: number
  method: string
  customer: string
}

const mockCashiers: Cashier[] = [
  { id: '1', name: 'Arlette Mbemba', phone: '+242 06 512 34 56', status: 'active', salesToday: 185000 },
  { id: '2', name: 'Boris Loemba', phone: '+242 06 623 45 67', status: 'active', salesToday: 92000 },
  { id: '3', name: 'Christelle Ngoie', phone: '+242 06 534 56 78', status: 'inactive', salesToday: 0 },
]

const mockDailySales: Sale[] = [
  { id: '1', time: '10:32', amount: 8500, method: 'QR MOARLI', customer: 'Client Walk-in' },
  { id: '2', time: '10:15', amount: 15000, method: 'Mobile Money', customer: 'Jean M.' },
  { id: '3', time: '09:48', amount: 3200, method: 'Espèces', customer: 'Client Walk-in' },
  { id: '4', time: '09:20', amount: 25000, method: 'Carte MOARLI', customer: 'Entreprise XYZ' },
  { id: '5', time: '08:45', amount: 1200, method: 'QR MOARLI', customer: 'Passant' },
]

const mockWeeklySales: Sale[] = [
  { id: 'w1', time: 'Lun', amount: 485000, method: 'Mixte', customer: '18 clients' },
  { id: 'w2', time: 'Mar', amount: 520000, method: 'Mixte', customer: '22 clients' },
  { id: 'w3', time: 'Mer', amount: 390000, method: 'Mixte', customer: '15 clients' },
  { id: 'w4', time: 'Jeu', amount: 610000, method: 'Mixte', customer: '25 clients' },
  { id: 'w5', time: 'Ven', amount: 277000, method: 'Mixte', customer: '12 clients' },
]

export function BusinessPage() {
  const [isRegistered, setIsRegistered] = useState(true)
  const [cashiers, setCashiers] = useState(mockCashiers)
  const [reportTab, setReportTab] = useState<'daily' | 'weekly'>('daily')

  const stats = {
    salesToday: 277000,
    salesMonth: 2285000,
    clientCount: 92,
    revenue: 2285000,
  }

  const addCashier = () => {
    const newCashier: Cashier = {
      id: Date.now().toString(),
      name: 'Nouveau Caissier',
      phone: '+242 06 XXX XX XX',
      status: 'active',
      salesToday: 0,
    }
    setCashiers([...cashiers, newCashier])
  }

  const removeCashier = (id: string) => {
    setCashiers(cashiers.filter((c) => c.id !== id))
  }

  if (!isRegistered) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh] p-4">
        <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 mb-4">
          <Store className="h-10 w-10 text-primary" />
        </div>
        <h1 className="text-2xl font-bold text-center">MOARLI Business</h1>
        <p className="text-muted-foreground text-center mt-2 max-w-sm">
          Acceptez les paiements de vos clients via QR code, carte virtuelle et Mobile Money.
        </p>
        <div className="space-y-2 mt-6 w-full max-w-sm">
          <p className="text-sm font-medium">Avantages :</p>
          <div className="space-y-1 text-sm text-muted-foreground">
            <p>✅ Commissions réduites (1.2%)</p>
            <p>✅ Tableau de bord en temps réel</p>
            <p>✅ Gestion des caissiers</p>
            <p>✅ Rapports quotidiens et hebdomadaires</p>
          </div>
          <Button className="w-full mt-4" onClick={() => setIsRegistered(true)}>
            Devenir Marchand
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 p-4 pb-24">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
          <Store className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold">MOARLI Business</h1>
          <p className="text-sm text-muted-foreground">Boutique Centre-ville</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="h-4 w-4 text-emerald-500" />
              <span className="text-xs text-muted-foreground">Ventes du jour</span>
            </div>
            <p className="text-lg font-bold">{fmt.format(stats.salesToday)} <span className="text-xs font-normal text-muted-foreground">FCFA</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="h-4 w-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Ventes du mois</span>
            </div>
            <p className="text-lg font-bold">{fmt.format(stats.salesMonth)} <span className="text-xs font-normal text-muted-foreground">FCFA</span></p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Users className="h-4 w-4 text-violet-500" />
              <span className="text-xs text-muted-foreground">Nombre de clients</span>
            </div>
            <p className="text-lg font-bold">{stats.clientCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="h-4 w-4 text-amber-500" />
              <span className="text-xs text-muted-foreground">Chiffre d&apos;affaires</span>
            </div>
            <p className="text-lg font-bold">{fmt.format(stats.revenue)} <span className="text-xs font-normal text-muted-foreground">FCFA</span></p>
          </CardContent>
        </Card>
      </div>

      {/* QR Code */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mon QR Code Marchand</CardTitle>
          <CardDescription>Scannez pour payer</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center">
            <div className="w-48 h-48 bg-white rounded-xl flex flex-col items-center justify-center border-2 border-dashed border-muted-foreground/30 gap-2">
              <QrCode className="h-16 w-16 text-muted-foreground/60" />
              <span className="text-xs text-muted-foreground">MOARLI-QR-BIZ-001</span>
            </div>
          </div>
          <Button variant="outline" className="w-full mt-3" size="sm">
            Partager le QR Code
          </Button>
        </CardContent>
      </Card>

      {/* Employee Management */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Caissiers</CardTitle>
            <Button variant="outline" size="sm" onClick={addCashier}>
              <Plus className="h-4 w-4 mr-1" />
              Ajouter
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {cashiers.map((cashier) => (
            <div
              key={cashier.id}
              className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                  <UserCheck className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">{cashier.name}</p>
                  <p className="text-xs text-muted-foreground">{cashier.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  variant={cashier.status === 'active' ? 'default' : 'secondary'}
                  className={cashier.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : ''}
                >
                  {cashier.status === 'active' ? 'Actif' : 'Inactif'}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  onClick={() => removeCashier(cashier.id)}
                >
                  <Minus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Recent Sales */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ventes récentes</CardTitle>
          <CardDescription>
            <Tabs value={reportTab} onValueChange={(v) => setReportTab(v as 'daily' | 'weekly')}>
              <TabsList className="h-7">
                <TabsTrigger value="daily" className="text-xs px-3 h-6">Quotidien</TabsTrigger>
                <TabsTrigger value="weekly" className="text-xs px-3 h-6">Hebdomadaire</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(reportTab === 'daily' ? mockDailySales : mockWeeklySales).map((sale) => (
            <div key={sale.id} className="flex items-center justify-between py-2 border-b last:border-0">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10">
                  <Receipt className="h-4 w-4 text-emerald-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">{sale.customer}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span>{sale.time}</span>
                    <span>•</span>
                    <span>{sale.method}</span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-1 text-sm font-medium">
                <ArrowUpRight className="h-3 w-3 text-emerald-500" />
                {fmt.format(sale.amount)} FCFA
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
