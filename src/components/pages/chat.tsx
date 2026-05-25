'use client'

import { useState, useRef, useEffect } from 'react'
import { useAppStore } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Send, Bot, User, MessageCircle, Circle } from 'lucide-react'

const botResponses: { keywords: string[]; response: string }[] = [
  {
    keywords: ['solde', 'balance', 'compte', 'combien'],
    response: 'Votre solde actuel est de 342 500 FCFA 💰\n\nDernière mise à jour : il y a 5 min',
  },
  {
    keywords: ['transfert', 'envoyer', 'virement'],
    response: 'Pour effectuer un transfert, allez dans la section **Envoyer** 📤\n\n1. Entrez le numéro du destinataire\n2. Saisissez le montant\n3. Confirmez avec votre PIN',
  },
  {
    keywords: ['agent', 'humain', 'personne', 'parler'],
    response: 'Un agent humain sera bientôt disponible. Merci de patienter 🙏\n\nTemps d\'attente estimé : ~5 min',
  },
  {
    keywords: ['retrait', 'retirer', 'argent'],
    response: 'Pour retirer de l\'argent :\n\n1. Allez chez un agent MOARLI 🏪\n2. Ou utilisez un distributeur agréé\n3. Montant max : 500 000 FCFA/jour',
  },
  {
    keywords: ['epargne', 'épargne', 'savings'],
    response: 'Vos objectifs d\'épargne :\n\n✈️ Vacances : 75 000 / 100 000 FCFA (75%)\n📚 Scolarité : 120 000 / 200 000 FCFA (60%)\n🛡️ Fonds d\'urgence : 185 000 / 300 000 FCFA (62%)',
  },
  {
    keywords: ['carte', 'virtuelle'],
    response: 'Vos cartes MOARLI :\n\n💳 **** 4829 - Active (32 500 / 50 000 FCFA)\n💳 **** 7156 - Active (45 000 / 200 000 FCFA)\n💳 **** 3391 - Utilisée',
  },
  {
    keywords: ['aide', 'help', 'comment'],
    response: 'Comment puis-je vous aider ? 🤔\n\n• Solde de votre compte\n• Transferts & paiements\n• Cartes virtuelles\n• Épargne\n• Parler à un agent',
  },
]

const quickQuestions = [
  'Mon solde',
  'Faire un transfert',
  'Problème de transaction',
  'Parler à un agent',
]

function getBotResponse(message: string): string {
  const lower = message.toLowerCase()
  for (const rule of botResponses) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      return rule.response
    }
  }
  return 'Merci pour votre message. Un agent vous répondra sous peu. 😊\n\nEn attendant, consultez notre FAQ dans les paramètres.'
}

export function ChatPage() {
  const { chatMessages, addChatMessage } = useAppStore()
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatMessages, isTyping])

  const handleSend = (text?: string) => {
    const message = text || input.trim()
    if (!message) return

    addChatMessage({ sender: 'user', message })
    setInput('')
    setIsTyping(true)

    setTimeout(() => {
      const response = getBotResponse(message)
      addChatMessage({ sender: 'bot', message: response })
      setIsTyping(false)
    }, 1000 + Math.random() * 1000)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Chat Header */}
      <div className="flex-shrink-0 border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <Bot className="h-5 w-5 text-primary" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-background" />
          </div>
          <div>
            <p className="font-medium text-sm">Support MOARLI</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              🤖 Bot MOARLI • <span className="text-emerald-500">En ligne</span>
            </p>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1 px-1">
          Disponible bientôt : Agent humain 🧑‍💼
        </p>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 px-4" ref={scrollRef}>
        <div className="space-y-3 py-4">
          {chatMessages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}
            >
              <div
                className={`flex h-7 w-7 items-center justify-center rounded-full shrink-0 ${
                  msg.sender === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
              >
                {msg.sender === 'user' ? (
                  <User className="h-3.5 w-3.5" />
                ) : (
                  <Bot className="h-3.5 w-3.5" />
                )}
              </div>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  msg.sender === 'user'
                    ? 'bg-primary text-primary-foreground rounded-tr-md'
                    : 'bg-muted rounded-tl-md'
                }`}
              >
                <p className="text-sm whitespace-pre-line leading-relaxed">{msg.message}</p>
                <p
                  className={`text-[10px] mt-1 ${
                    msg.sender === 'user'
                      ? 'text-primary-foreground/70'
                      : 'text-muted-foreground'
                  }`}
                >
                  {new Date(msg.timestamp).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          ))}

          {/* Typing indicator */}
          {isTyping && (
            <div className="flex gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-muted shrink-0">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-md px-4 py-3">
                <div className="flex gap-1">
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce" />
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0.15s]" />
                  <div className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0.3s]" />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Quick Questions */}
      <div className="flex-shrink-0 px-4 py-2 border-t">
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {quickQuestions.map((q) => (
            <Button
              key={q}
              variant="outline"
              size="sm"
              className="text-xs whitespace-nowrap rounded-full h-7 px-3 shrink-0"
              onClick={() => handleSend(q)}
            >
              <MessageCircle className="h-3 w-3 mr-1" />
              {q}
            </Button>
          ))}
        </div>
      </div>

      {/* Input */}
      <div className="flex-shrink-0 border-t px-4 py-3">
        <div className="flex gap-2">
          <Input
            placeholder="Tapez votre message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="flex-1 rounded-full"
          />
          <Button
            size="icon"
            className="rounded-full h-10 w-10 shrink-0"
            onClick={() => handleSend()}
            disabled={!input.trim() || isTyping}
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
