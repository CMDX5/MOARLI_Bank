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
import {
  MapPin,
  Search,
  Navigation,
  UserPlus,
  DollarSign,
  ArrowDownToLine,
  ArrowUpFromLine,
  Wifi,
  WifiOff,
  Star,
  Phone,
  Clock,
  Zap,
  Shield,
  Banknote,
} from 'lucide-react'

const fmt = new Intl.NumberFormat('fr-FR')

interface Agent {
  id: string
  name: string
  location: string
  distance: string
  status: 'online' | 'offline'
  services: string[]
  rating: number
  phone: string
  hours: string
}

const mockAgents: Agent[] = [
  {
    id: '1',
    name: 'Papa Jean Agent',
    location: 'Centre-ville, Ave Amilcar Cabral',
    distance: '0.3 km',
    status: 'online',
    services: ['dépôt', 'retrait'],
    rating: 4.8,
    phone: '+242 06 511 22 33',
    hours: '07:00 - 21:00',
  },
  {
    id: '2',
    name: 'Boutique Maman Sophie',
    location: 'Bacongo, Rue du Commerce',
    distance: '0.8 km',
    status: 'online',
    services: ['dépôt', 'retrait'],
    rating: 4.5,
    phone: '+242 06 522 33 44',
    hours: '08:00 - 20:00',
  },
  {
    id: '3',
    name: 'Kiosque MOARLI Poto-Poto',
    location: 'Poto-Poto, Carrefour Matsiona',
    distance: '1.2 km',
    status: 'offline',
    services: ['dépôt'],
    rating: 4.2,
    phone: '+242 06 533 44 55',
    hours: '09:00 - 18:00',
  },
  {
    id: '4',
    name: 'Agent Frederic',
    location: 'Brazzaville, Ave de la Paix',
    distance: '1.5 km',
    status: 'online',
    services: ['dépôt', 'retrait'],
    rating: 4.9,
    phone: '+242 06 544 55 66',
    hours: '06:30 - 22:00',
  },
  {
    id: '5',
    name: 'Point MOARLI Djiri',
    location: 'Djiri, Route de l&apos;aéroport',
    distance: '3.2 km',
    status: 'online',
    services: ['dépôt', 'retrait'],
    rating: 4.3,
    phone: '+242 06 555 66 77',
    hours: '07:00 - 19:00',
  },
]

export function AgentsPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedLocation, setSelectedLocation] = useState('')

  const filteredAgents = mockAgents.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      agent.location.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesLocation = !selectedLocation || agent.location.toLowerCase().includes(selectedLocation.toLowerCase())
    return matchesSearch && matchesLocation
  })

  return (
    <div className="space-y-4 p-4 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Réseau d&apos;Agents</h1>
        <p className="text-sm text-muted-foreground">
          Trouvez un agent MOARLI près de vous
        </p>
      </div>

      {/* Map Placeholder */}
      <Card className="overflow-hidden">
        <div className="relative h-48 bg-gradient-to-br from-emerald-900/20 via-emerald-800/10 to-blue-900/20 rounded-t-xl">
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <MapPin className="h-8 w-8 mx-auto text-primary mb-2" />
              <p className="text-sm font-medium">Carte des agents</p>
              <p className="text-xs text-muted-foreground">Localisation en temps réel</p>
            </div>
          </div>
          {/* Pin markers */}
          <div className="absolute top-8 left-12">
            <div className="flex flex-col items-center">
              <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold shadow-lg animate-pulse">
                1
              </div>
              <div className="h-2 w-0.5 bg-emerald-500/50" />
            </div>
          </div>
          <div className="absolute top-16 left-1/3">
            <div className="flex flex-col items-center">
              <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold shadow-lg animate-pulse delay-300">
                2
              </div>
              <div className="h-2 w-0.5 bg-emerald-500/50" />
            </div>
          </div>
          <div className="absolute top-24 right-16">
            <div className="flex flex-col items-center">
              <div className="h-6 w-6 rounded-full bg-emerald-500 flex items-center justify-center text-white text-[10px] font-bold shadow-lg animate-pulse delay-500">
                3
              </div>
              <div className="h-2 w-0.5 bg-emerald-500/50" />
            </div>
          </div>
          <div className="absolute bottom-10 left-1/2">
            <div className="flex flex-col items-center">
              <div className="h-6 w-6 rounded-full bg-blue-500 flex items-center justify-center shadow-lg">
                <Navigation className="h-3 w-3 text-white" />
              </div>
              <div className="h-2 w-0.5 bg-blue-500/50" />
            </div>
          </div>
          <div className="absolute bottom-16 right-24">
            <div className="flex flex-col items-center">
              <div className="h-6 w-6 rounded-full bg-gray-400 flex items-center justify-center text-white text-[10px] font-bold shadow-lg">
                4
              </div>
              <div className="h-2 w-0.5 bg-gray-400/50" />
            </div>
          </div>
        </div>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par nom ou quartier..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {/* Become Agent CTA */}
      <Card className="border-primary/20 bg-primary/5">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-primary" />
            Devenir Agent MOARLI
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm text-muted-foreground mb-3">
            <p>Rejoignez le plus grand réseau d&apos;agents mobiles au Congo</p>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <span>Commissions attractives</span>
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-blue-500" />
                <span>Formation offerte</span>
              </div>
              <div className="flex items-center gap-2">
                <Banknote className="h-4 w-4 text-emerald-500" />
                <span>Gains quotidiens</span>
              </div>
              <div className="flex items-center gap-2">
                <Star className="h-4 w-4 text-violet-500" />
                <span>Programme fidélité</span>
              </div>
            </div>
          </div>
          <Button className="w-full" size="sm">
            Postuler maintenant
          </Button>
        </CardContent>
      </Card>

      {/* Commission Info */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Commissions</CardTitle>
          <CardDescription>Gagnez sur chaque transaction</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                <ArrowDownToLine className="h-4 w-4 text-emerald-500" />
                <span className="text-sm">Dépôt</span>
              </div>
              <Badge variant="outline" className="text-emerald-500 border-emerald-500/20">1.5%</Badge>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
              <div className="flex items-center gap-2">
                <ArrowUpFromLine className="h-4 w-4 text-blue-500" />
                <span className="text-sm">Retrait</span>
              </div>
              <Badge variant="outline" className="text-blue-500 border-blue-500/20">2.0%</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Agent List */}
      <div>
        <h2 className="text-base font-semibold mb-3">Agents à proximité</h2>
        <div className="space-y-3">
          {filteredAgents.map((agent) => (
            <Card key={agent.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      {agent.status === 'online' ? (
                        <Wifi className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <WifiOff className="h-5 w-5 text-gray-400" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium flex items-center gap-2">
                        {agent.name}
                        <Badge
                          variant="outline"
                          className={
                            agent.status === 'online'
                              ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20 text-[10px] px-1.5'
                              : 'bg-gray-500/10 text-gray-400 border-gray-500/20 text-[10px] px-1.5'
                          }
                        >
                          {agent.status === 'online' ? 'En ligne' : 'Hors ligne'}
                        </Badge>
                      </p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <MapPin className="h-3 w-3" />
                        <span>{agent.location}</span>
                        <span>•</span>
                        <span>{agent.distance}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1 mt-2">
                  {agent.services.map((service) => (
                    <Badge key={service} variant="secondary" className="text-[10px]">
                      {service === 'dépôt' ? (
                        <><ArrowDownToLine className="h-3 w-3 mr-0.5" /> Dépôt</>
                      ) : (
                        <><ArrowUpFromLine className="h-3 w-3 mr-0.5" /> Retrait</>
                      )}
                    </Badge>
                  ))}
                  <Badge variant="outline" className="text-[10px]">
                    <Star className="h-3 w-3 mr-0.5 text-amber-500" />
                    {agent.rating}
                  </Badge>
                  <Badge variant="outline" className="text-[10px]">
                    <Clock className="h-3 w-3 mr-0.5" />
                    {agent.hours}
                  </Badge>
                </div>

                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" className="flex-1 text-xs">
                    <Navigation className="h-3 w-3 mr-1" />
                    Itinéraire
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1 text-xs">
                    <Phone className="h-3 w-3 mr-1" />
                    Appeler
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Empty state */}
      {filteredAgents.length === 0 && (
        <Card className="text-center py-8">
          <CardContent>
            <Search className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="font-medium">Aucun agent trouvé</p>
            <p className="text-sm text-muted-foreground mt-1">
              Essayez une autre recherche
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
