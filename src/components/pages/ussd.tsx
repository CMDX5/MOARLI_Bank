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
import {
  Phone,
  ArrowLeft,
  Signal,
  WifiOff,
  Smartphone,
  Zap,
  Clock,
  Info,
  ChevronRight,
  Check,
} from 'lucide-react'

interface UssdStep {
  items: { key: string; label: string }[]
  title?: string
}

const ussdMenu: Record<string, UssdStep> = {
  main: {
    title: 'MOARLI Mobile',
    items: [
      { key: '1', label: 'Consulter solde' },
      { key: '2', label: 'Transférer' },
      { key: '3', label: 'Retrait' },
      { key: '4', label: 'Historique' },
      { key: '5', label: 'Aide' },
    ],
  },
  '1': {
    title: 'Consulter Solde',
    items: [
      { key: '0', label: 'Votre solde : 342 500 FCFA' },
    ],
  },
  '2': {
    title: 'Transférer',
    items: [
      { key: '1', label: 'Vers numéro MOARLI' },
      { key: '2', label: 'Vers Mobile Money' },
      { key: '3', label: 'Vers compte bancaire' },
      { key: '0', label: 'Retour' },
    ],
  },
  '3': {
    title: 'Retrait',
    items: [
      { key: '1', label: 'Retrait Agent MOARLI' },
      { key: '2', label: 'Retrait DAB' },
      { key: '0', label: 'Retour' },
    ],
  },
  '4': {
    title: 'Historique',
    items: [
      { key: '1', label: '5 dernières transactions' },
      { key: '2', label: 'Transactions du mois' },
      { key: '0', label: 'Retour' },
    ],
  },
  '5': {
    title: 'Aide',
    items: [
      { key: '1', label: 'Contacter le support' },
      { key: '2', label: 'FAQ' },
      { key: '3', label: 'Tarifs' },
      { key: '0', label: 'Retour' },
    ],
  },
}

export function UssdPage() {
  const [currentPath, setCurrentPath] = useState<string[]>(['main'])
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [navigating, setNavigating] = useState(false)

  const currentStep = currentPath[currentPath.length - 1]
  const menu = ussdMenu[currentStep]
  const canGoBack = currentPath.length > 1

  const handleSelect = (key: string) => {
    setSelectedKey(key)

    if (key === '0' && canGoBack) {
      setNavigating(true)
      setTimeout(() => {
        setCurrentPath((prev) => prev.slice(0, -1))
        setSelectedKey(null)
        setNavigating(false)
      }, 500)
      return
    }

    if (currentStep === 'main' && key !== '0') {
      if (key === '1' && ussdMenu['1']) {
        // Show balance, don't navigate deeper
        return
      }
      setNavigating(true)
      setTimeout(() => {
        if (ussdMenu[key]) {
          setCurrentPath((prev) => [...prev, key])
        }
        setSelectedKey(null)
        setNavigating(false)
      }, 500)
    }
  }

  const handleBack = () => {
    if (canGoBack) {
      setNavigating(true)
      setTimeout(() => {
        setCurrentPath((prev) => prev.slice(0, -1))
        setSelectedKey(null)
        setNavigating(false)
      }, 300)
    }
  }

  return (
    <div className="space-y-4 p-4 pb-24">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-xl font-bold">USSD *161#</h1>
        <p className="text-sm text-muted-foreground">
          Accédez à MOARLI sans internet
        </p>
      </div>

      {/* Explanation Card */}
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="flex items-start gap-3">
          <WifiOff className="h-5 w-5 text-primary mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium">Sans connexion internet</p>
            <p className="text-muted-foreground mt-1">
              Utilisez le code USSD <Badge variant="outline" className="font-mono text-xs mx-0.5">*161#</Badge> depuis
              n&apos;importe quel téléphone pour accéder aux services essentiels MOARLI.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Phone Mockup */}
      <div className="flex justify-center">
        <div className="w-full max-w-xs">
          {/* Phone Frame */}
          <div className="rounded-[2rem] border-2 border-muted-foreground/30 bg-background shadow-xl overflow-hidden">
            {/* Status Bar */}
            <div className="flex items-center justify-between px-6 py-2 bg-muted/50">
              <span className="text-[10px] font-medium">09:41</span>
              <div className="flex items-center gap-1">
                <Signal className="h-3 w-3" />
                <Smartphone className="h-3 w-3" />
              </div>
            </div>

            {/* USSD Screen */}
            <div className="min-h-[380px] bg-emerald-950 text-emerald-50 font-mono text-sm p-4">
              {/* USSD Header */}
              <div className="text-center mb-4 pb-3 border-b border-emerald-800">
                <p className="text-xs text-emerald-400">MOARLI Mobile</p>
                <p className="text-lg font-bold">*161#</p>
              </div>

              {/* Breadcrumb */}
              {currentPath.length > 1 && (
                <div className="flex items-center gap-1 text-xs text-emerald-400 mb-3">
                  {currentPath.map((step, idx) => (
                    <span key={idx}>
                      {ussdMenu[step]?.title || step}
                      {idx < currentPath.length - 1 && ' > '}
                    </span>
                  ))}
                </div>
              )}

              {/* Menu Items */}
              <div className={`space-y-2 transition-opacity duration-300 ${navigating ? 'opacity-0' : 'opacity-100'}`}>
                {currentStep === '1' && selectedKey === '1' ? (
                  <div className="text-center py-8">
                    <p className="text-xs text-emerald-400 mb-2">Solde disponible</p>
                    <p className="text-3xl font-bold">342 500</p>
                    <p className="text-sm text-emerald-300">FCFA</p>
                    <p className="text-xs text-emerald-600 mt-4">Appuyez sur 0 pour revenir</p>
                  </div>
                ) : (
                  menu?.items.map((item) => (
                    <button
                      key={item.key}
                      className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                        selectedKey === item.key
                          ? 'bg-emerald-800'
                          : 'hover:bg-emerald-900/50'
                      }`}
                      onClick={() => handleSelect(item.key)}
                    >
                      <span className="text-emerald-400 mr-2">{item.key}.</span>
                      <span>{item.label}</span>
                      {selectedKey === item.key && (
                        <Check className="h-3 w-3 inline-block ml-2 text-emerald-300" />
                      )}
                    </button>
                  ))
                )}
              </div>

              {/* Navigation Hint */}
              {currentStep === '1' && selectedKey === '1' ? null : (
                <div className="mt-6 pt-3 border-t border-emerald-800 text-xs text-emerald-600 text-center">
                  {canGoBack ? '0. Retour' : ''}
                </div>
              )}
            </div>

            {/* Phone Nav Bar */}
            <div className="flex items-center justify-around px-6 py-3 bg-muted/50 border-t border-muted-foreground/20">
              {canGoBack ? (
                <button
                  className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  onClick={handleBack}
                >
                  <ArrowLeft className="h-4 w-4" />
                  <span>Retour</span>
                </button>
              ) : (
                <div className="w-10" />
              )}
              <div className="h-1 w-8 rounded-full bg-muted-foreground/30" />
              <button
                className="flex flex-col items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => {
                  setCurrentPath(['main'])
                  setSelectedKey(null)
                }}
              >
                <Phone className="h-4 w-4" />
                <span>Accueil</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Supported Telecoms */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Opérateurs supportés</CardTitle>
          <CardDescription>Disponible sur tous les réseaux congolais</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10">
                <Signal className="h-5 w-5 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-medium">MTN Congo</p>
                <p className="text-xs text-muted-foreground">*161#</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-500/10">
                <Signal className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm font-medium">Airtel Congo</p>
                <p className="text-xs text-muted-foreground">*161#</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Coming Soon */}
      <Card className="border-violet-500/20 bg-violet-500/5">
        <CardContent className="flex items-start gap-3">
          <Zap className="h-5 w-5 text-violet-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <p className="font-medium text-violet-500">Bientôt disponible</p>
            <p className="text-muted-foreground mt-1">
              • Achat de crédit prépayé<br />
              • Paiement de factures<br />
              • Vérification d&apos;identité (KYC) via USSD
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
