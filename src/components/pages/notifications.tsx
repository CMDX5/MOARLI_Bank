'use client'

import { useState, useMemo } from 'react'
import { useAppStore } from '@/lib/store'
import {
  Card,
  CardContent,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Bell,
  ArrowDownCircle,
  AlertTriangle,
  Shield,
  PiggyBank,
  Settings2,
  CheckCheck,
  Circle,
  ChevronDown,
  ChevronUp,
  Inbox,
} from 'lucide-react'

type FilterTab = 'all' | 'transactions' | 'budget' | 'savings' | 'security' | 'system'

function getNotificationIcon(type: string) {
  switch (type) {
    case 'deposit':
    case 'credit':
      return { icon: ArrowDownCircle, color: 'text-emerald-500', bg: 'bg-emerald-500/10' }
    case 'insight':
    case 'budget':
      return { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-500/10' }
    case 'security':
      return { icon: Shield, color: 'text-red-500', bg: 'bg-red-500/10' }
    case 'savings':
    case 'tontine':
      return { icon: PiggyBank, color: 'text-emerald-500', bg: 'bg-emerald-500/10' }
    default:
      return { icon: Bell, color: 'text-blue-500', bg: 'bg-blue-500/10' }
  }
}

function getNotificationCategory(type: string): FilterTab {
  switch (type) {
    case 'deposit':
    case 'credit':
      return 'transactions'
    case 'budget':
    case 'insight':
      return 'budget'
    case 'savings':
    case 'tontine':
      return 'savings'
    case 'security':
      return 'security'
    default:
      return 'system'
  }
}

function formatTimeAgo(dateStr: string): { label: string; group: string } {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffHours = diffMs / (1000 * 60 * 60)
  const diffDays = diffMs / (1000 * 60 * 60 * 24)

  if (diffDays < 1) {
    const hours = Math.floor(diffHours)
    return { label: hours === 0 ? 'À l\'instant' : `Il y a ${hours}h`, group: 'Aujourd\'hui' }
  } else if (diffDays < 2) {
    return { label: 'Hier', group: 'Hier' }
  } else if (diffDays < 7) {
    return { label: `Il y a ${Math.floor(diffDays)}j`, group: 'Cette semaine' }
  }
  return { label: date.toLocaleDateString('fr-FR'), group: 'Plus ancien' }
}

export function NotificationsPage() {
  const { notifications, markNotificationRead, markAllNotificationsRead } = useAppStore()
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filteredNotifications = useMemo(() => {
    if (activeFilter === 'all') return notifications
    return notifications.filter((n) => getNotificationCategory(n.type) === activeFilter)
  }, [notifications, activeFilter])

  const groupedNotifications = useMemo(() => {
    const groups: Record<string, typeof filteredNotifications> = {}
    const order = ['Aujourd\'hui', 'Hier', 'Cette semaine', 'Plus ancien']
    
    filteredNotifications.forEach((n) => {
      const { group } = formatTimeAgo(n.createdAt)
      if (!groups[group]) groups[group] = []
      groups[group].push(n)
    })

    return order
      .filter((g) => groups[g]?.length)
      .map((g) => ({ group: g, items: groups[g] }))
  }, [filteredNotifications])

  const unreadCount = notifications.filter((n) => !n.isRead).length

  const handleMarkAllRead = () => {
    markAllNotificationsRead()
  }

  const handleToggleExpand = (id: string) => {
    if (!notifications.find((n) => n.id === id)?.isRead) {
      markNotificationRead(id)
    }
    setExpandedId(expandedId === id ? null : id)
  }

  return (
    <div className="space-y-4 p-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            Notifications
            {unreadCount > 0 && (
              <Badge className="bg-primary text-primary-foreground text-xs">
                {unreadCount}
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground">
            Restez informé de votre activité
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={handleMarkAllRead} className="text-xs">
            <CheckCheck className="h-4 w-4 mr-1" />
            Tout lire
          </Button>
        )}
      </div>

      {/* Filter Tabs */}
      <Tabs value={activeFilter} onValueChange={(v) => setActiveFilter(v as FilterTab)}>
        <TabsList className="w-full overflow-x-auto flex-wrap h-auto gap-1">
          <TabsTrigger value="all" className="text-xs px-3 h-7">Tous</TabsTrigger>
          <TabsTrigger value="transactions" className="text-xs px-3 h-7">Transactions</TabsTrigger>
          <TabsTrigger value="budget" className="text-xs px-3 h-7">Budget</TabsTrigger>
          <TabsTrigger value="savings" className="text-xs px-3 h-7">Épargne</TabsTrigger>
          <TabsTrigger value="security" className="text-xs px-3 h-7">Sécurité</TabsTrigger>
          <TabsTrigger value="system" className="text-xs px-3 h-7">Système</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Notification Groups */}
      {groupedNotifications.length > 0 ? (
        <div className="space-y-4">
          {groupedNotifications.map(({ group, items }) => (
            <div key={group}>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
                {group}
              </p>
              <div className="space-y-2">
                {items.map((notification) => {
                  const { icon: Icon, color, bg } = getNotificationIcon(notification.type)
                  const { label } = formatTimeAgo(notification.createdAt)
                  const isExpanded = expandedId === notification.id

                  return (
                    <Card
                      key={notification.id}
                      className={`cursor-pointer transition-colors ${
                        !notification.isRead ? 'border-primary/20 bg-primary/5' : ''
                      }`}
                      onClick={() => handleToggleExpand(notification.id)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start gap-3">
                          <div className={`flex h-9 w-9 items-center justify-center rounded-full shrink-0 ${bg}`}>
                            <Icon className={`h-4 w-4 ${color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`text-sm ${!notification.isRead ? 'font-semibold' : 'font-medium'}`}>
                                {notification.title}
                              </p>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {!notification.isRead && (
                                  <Circle className="h-2 w-2 fill-primary text-primary" />
                                )}
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                                ) : (
                                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                                )}
                              </div>
                            </div>
                            <p className={`text-xs mt-0.5 ${isExpanded ? '' : 'line-clamp-1'}`}>
                              {notification.message}
                            </p>
                            <p className="text-[10px] text-muted-foreground mt-1">{label}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Empty State */
        <Card className="text-center py-12">
          <CardContent>
            <Inbox className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="font-medium">Tout est lu !</p>
            <p className="text-sm text-muted-foreground mt-1">
              Vous n&apos;avez pas de notifications {activeFilter !== 'all' ? 'dans cette catégorie' : ''}.
            </p>
            <Settings2 className="h-8 w-8 mx-auto mt-3 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground mt-2">
              Gérez vos préférences dans les paramètres
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
