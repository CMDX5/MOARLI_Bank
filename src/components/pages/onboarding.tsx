'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  Wallet,
  Send,
  CreditCard,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Check,
} from 'lucide-react'

const steps = [
  {
    icon: Sparkles,
    emoji: '🏦',
    title: 'Bienvenue sur MOARLI',
    description:
      'Votre banque digitale au Congo. Transférez, épargnez et gérez votre argent en toute simplicité.',
    bgGradient: 'from-emerald-500 to-teal-600',
    iconBg: 'bg-emerald-500/20',
    iconColor: 'text-emerald-500',
  },
  {
    icon: Wallet,
    emoji: '💰',
    title: 'Voici votre solde',
    description:
      'Consultez votre solde en temps réel, vos portefeuilles multi-devises et suivez chaque transaction.',
    bgGradient: 'from-amber-500 to-orange-500',
    iconBg: 'bg-amber-500/20',
    iconColor: 'text-amber-500',
    mockBalance: true,
  },
  {
    icon: Send,
    emoji: '📲',
    title: 'Envoyez de l\'argent',
    description:
      'Transférez à vos proches en un clic, payez par QR code ou partagez un lien de paiement.',
    bgGradient: 'from-blue-500 to-cyan-500',
    iconBg: 'bg-blue-500/20',
    iconColor: 'text-blue-500',
    mockSend: true,
  },
  {
    icon: CreditCard,
    emoji: '💳',
    title: 'Découvrez vos cartes',
    description:
      'Créez des cartes virtuelles sécurisées pour vos achats en ligne. Usage unique ou récurrent.',
    bgGradient: 'from-purple-500 to-violet-500',
    iconBg: 'bg-purple-500/20',
    iconColor: 'text-purple-500',
    mockCards: true,
  },
]

export function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(0)
  const [isTransitioning, setIsTransitioning] = useState(false)
  const completeOnboarding = useAppStore((s) => s.completeOnboarding)
  const addNotification = useAppStore((s) => s.addNotification)

  const step = steps[currentStep]
  const isLastStep = currentStep === steps.length - 1
  const Icon = step.icon

  const goNext = () => {
    if (isLastStep) {
      handleComplete()
      return
    }
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentStep((s) => s + 1)
      setIsTransitioning(false)
    }, 200)
  }

  const goPrev = () => {
    if (currentStep === 0) return
    setIsTransitioning(true)
    setTimeout(() => {
      setCurrentStep((s) => s - 1)
      setIsTransitioning(false)
    }, 200)
  }

  const handleComplete = () => {
    completeOnboarding()
    addNotification({
      id: 'onboarding-badge',
      type: 'system',
      title: '🎉 Badge obtenu !',
      message:
        'Félicitations ! Vous avez obtenu le badge "Premiers pas complétés".',
      isRead: false,
      createdAt: new Date().toISOString(),
    })
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background p-4">
      {/* Step indicators */}
      <div className="mb-8 flex gap-2">
        {steps.map((_, idx) => (
          <div
            key={idx}
            className={cn(
              'h-2 rounded-full transition-all duration-500',
              idx === currentStep
                ? 'w-8 bg-primary'
                : idx < currentStep
                  ? 'w-2 bg-primary/50'
                  : 'w-2 bg-muted-foreground/30'
            )}
          />
        ))}
      </div>

      {/* Main card */}
      <Card
        className={cn(
          'w-full max-w-sm overflow-hidden transition-all duration-300',
          isTransitioning
            ? 'translate-x-4 opacity-0'
            : 'translate-x-0 opacity-100'
        )}
      >
        <CardContent className="p-0">
          {/* Hero illustration area */}
          <div
            className={cn(
              'relative flex h-56 flex-col items-center justify-center bg-gradient-to-br px-6',
              step.bgGradient
            )}
          >
            <div className="absolute inset-0 bg-black/5" />
            <div
              className={cn(
                'relative mb-4 flex h-24 w-24 items-center justify-center rounded-3xl',
                step.iconBg
              )}
            >
              <Icon className={cn('h-12 w-12', step.iconColor)} />
            </div>
            <span className="absolute bottom-4 right-4 text-6xl opacity-20">
              {step.emoji}
            </span>

            {/* Mock content per step */}
            {step.mockBalance && (
              <div className="absolute bottom-4 left-4 right-4 rounded-xl bg-black/20 p-3 backdrop-blur-sm">
                <p className="text-xs text-white/70">Solde disponible</p>
                <p className="text-2xl font-bold text-white">342 500 FCFA</p>
                <div className="mt-2 flex gap-2">
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] text-white">
                    🇪🇺 85 €
                  </span>
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] text-white">
                    🇺🇸 $120
                  </span>
                </div>
              </div>
            )}

            {step.mockSend && (
              <div className="absolute bottom-4 left-4 right-4 rounded-xl bg-black/20 p-3 backdrop-blur-sm">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                    <Send className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <p className="text-xs font-medium text-white">
                      À Jean Mukendi
                    </p>
                    <p className="text-sm font-bold text-white">12 000 FCFA</p>
                  </div>
                </div>
              </div>
            )}

            {step.mockCards && (
              <div className="absolute bottom-4 left-4 right-4 rounded-xl bg-black/20 p-3 backdrop-blur-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] text-white/70">MOARLI</p>
                    <p className="font-mono text-sm font-bold text-white">
                      •••• •••• •••• 4829
                    </p>
                  </div>
                  <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] text-white">
                    Usage unique
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Text content */}
          <div className="p-6 text-center">
            <h2 className="mb-2 text-xl font-bold">{step.title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {step.description}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Navigation buttons */}
      <div className="mt-6 flex w-full max-w-sm items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          onClick={goPrev}
          disabled={currentStep === 0}
          className="text-muted-foreground"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Précédent
        </Button>

        <span className="text-xs text-muted-foreground">
          {currentStep + 1} / {steps.length}
        </span>

        <Button
          size="sm"
          onClick={goNext}
          className={cn(
            'min-w-[120px]',
            isLastStep && 'bg-primary text-primary-foreground'
          )}
        >
          {isLastStep ? (
            <>
              <Check className="mr-1 h-4 w-4" />
              Commencer
            </>
          ) : (
            <>
              Suivant
              <ChevronRight className="ml-1 h-4 w-4" />
            </>
          )}
        </Button>
      </div>

      {/* Skip button */}
      {!isLastStep && (
        <button
          onClick={handleComplete}
          className="mt-3 text-xs text-muted-foreground underline-offset-4 hover:underline"
        >
          Passer le tutoriel
        </button>
      )}
    </div>
  )
}
