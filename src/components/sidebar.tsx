'use client'

import { useState } from 'react'
import { useAppStore, type PageId, type ThemeMode } from '@/lib/store'
import {
  LayoutDashboard,
  ArrowLeftRight,
  Send,
  Download,
  Link2,
  Split,
  CreditCard,
  QrCode,
  PiggyBank,
  Wallet,
  Landmark,
  TrendingUp,
  BarChart3,
  Users,
  Building2,
  Network,
  Trophy,
  MessageCircle,
  Bell,
  Receipt,
  Phone,
  LineChart,
  Settings,
  ChevronRight,
  Menu,
  Home,
  Moon,
  Sun,
  Palette,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from '@/components/ui/sheet'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

interface NavItem {
  id: PageId
  label: string
  icon: React.ElementType
}

interface NavSection {
  title: string
  items: NavItem[]
}

const navSections: NavSection[] = [
  {
    title: 'Principal',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { id: 'transactions', label: 'Transactions', icon: ArrowLeftRight },
      { id: 'send', label: 'Envoyer', icon: Send },
      { id: 'receive', label: 'Recevoir', icon: Download },
    ],
  },
  {
    title: 'Services',
    items: [
      { id: 'paylink', label: 'Pay Link', icon: Link2 },
      { id: 'split-bill', label: 'Split Bill', icon: Split },
      { id: 'cards', label: 'Cartes', icon: CreditCard },
      { id: 'qr-payment', label: 'QR Paiement', icon: QrCode },
      { id: 'cagnotte', label: 'Cagnotte', icon: PiggyBank },
    ],
  },
  {
    title: 'Finance',
    items: [
      { id: 'savings', label: 'Épargne', icon: Landmark },
      { id: 'budget', label: 'Budget', icon: BarChart3 },
      { id: 'wallets', label: 'Portefeuilles', icon: Wallet },
      { id: 'credit', label: 'Crédit', icon: TrendingUp },
      { id: 'score', label: 'Score', icon: LineChart },
      { id: 'tontine', label: 'Tontine', icon: Users },
    ],
  },
  {
    title: 'Business',
    items: [
      { id: 'business', label: 'MOARLI Business', icon: Building2 },
      { id: 'agents', label: 'Réseau Agents', icon: Network },
    ],
  },
  {
    title: 'Social',
    items: [
      { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
      { id: 'chat', label: 'Chat Support', icon: MessageCircle },
    ],
  },
  {
    title: 'Autres',
    items: [
      { id: 'notifications', label: 'Notifications', icon: Bell },
      { id: 'receipts', label: 'Reçus', icon: Receipt },
      { id: 'ussd', label: 'USSD', icon: Phone },
      { id: 'invest', label: 'Investir', icon: LineChart },
    ],
  },
]

interface ThemeOption {
  id: ThemeMode
  label: string
  icon: React.ElementType
}

const themeOptions: ThemeOption[] = [
  { id: 'default', label: 'Classique', icon: Palette },
  { id: 'moarli-dark', label: 'MOARLI Sombre', icon: Moon },
  { id: 'moarli-light', label: 'MOARLI Clair', icon: Sun },
]

function activeBg(theme: ThemeMode) {
  switch (theme) {
    case 'moarli-dark': return 'bg-emerald-600/20 text-emerald-400'
    case 'moarli-light': return 'bg-emerald-100 text-emerald-700'
    default: return 'bg-primary/10 text-primary'
  }
}

function activeIndicator(theme: ThemeMode) {
  switch (theme) {
    case 'moarli-dark': return 'bg-emerald-500'
    case 'moarli-light': return 'bg-emerald-600'
    default: return 'bg-primary'
  }
}

function themeBtnActive(theme: ThemeMode, optId: ThemeMode) {
  if (optId === 'default') return theme === 'default' ? 'border-2 border-primary bg-primary/10' : 'hover:bg-muted'
  if (optId === 'moarli-dark') return theme === 'moarli-dark' ? 'border-2 border-emerald-500 bg-emerald-500/20' : 'hover:bg-muted'
  return theme === 'moarli-light' ? 'border-2 border-emerald-600 bg-emerald-100' : 'hover:bg-muted'
}

function themeIconColor(theme: ThemeMode, optId: ThemeMode) {
  if (optId === theme) return theme === 'default' ? 'text-primary' : 'text-emerald-500'
  return 'text-muted-foreground'
}

function accentText(theme: ThemeMode) {
  switch (theme) {
    case 'moarli-dark': return 'text-emerald-400'
    case 'moarli-light': return 'text-emerald-700'
    default: return 'text-primary'
  }
}

function accentDot(theme: ThemeMode) {
  return theme === 'moarli-dark' || theme === 'moarli-light' ? 'bg-emerald-500' : 'bg-primary'
}

function SidebarNavItem({ item, isActive, theme, onClick }: { item: NavItem; isActive: boolean; theme: ThemeMode; onClick: () => void }) {
  const unreadCount = useAppStore((s) => s.unreadCount)
  const showBadge = item.id === 'notifications' && unreadCount > 0
  return (
    <button onClick={onClick} className={cn(
      'group relative flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
      isActive ? activeBg(theme) : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    )}>
      {isActive && <span className={cn('absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full', activeIndicator(theme))} />}
      <item.icon className="h-5 w-5 shrink-0" />
      <span className="flex-1 text-left">{item.label}</span>
      {showBadge && <Badge variant="destructive" className="ml-auto h-5 min-w-[20px] justify-center rounded-full px-1.5 text-[10px] font-bold">{unreadCount}</Badge>}
      {isActive && <ChevronRight className="h-3.5 w-3.5 opacity-60" />}
    </button>
  )
}

function DesktopSidebar() {
  const { currentPage, setCurrentPage, theme, setTheme, userName } = useAppStore()
  const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  const sidebarBg = theme === 'moarli-dark' ? 'border-border/50 bg-card' : theme === 'moarli-light' ? 'border-emerald-200 bg-white' : 'bg-background'
  const logoGreen = theme === 'moarli-dark' || theme === 'moarli-light' ? 'text-emerald-500' : 'text-emerald-600'
  const logoGold = theme === 'moarli-dark' ? 'text-amber-400' : theme === 'moarli-light' ? 'text-amber-600' : 'text-amber-500'

  return (
    <TooltipProvider delayDuration={0}>
      <aside className={cn('fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r md:flex', sidebarBg)}>
        <div className="flex flex-col items-center gap-3 px-4 pt-6 pb-4">
          <div className="flex items-baseline gap-0.5">
            <span className={cn('text-2xl font-extrabold tracking-tight', logoGreen)}>MOARLI</span>
            <span className={cn('text-lg font-semibold', logoGold)}>Bank</span>
          </div>
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10 border-2 border-emerald-500/30">
              <AvatarFallback className="text-xs font-bold bg-emerald-900 text-emerald-300">{initials}</AvatarFallback>
            </Avatar>
            <div className="flex flex-col">
              <span className="text-sm font-semibold leading-tight">{userName}</span>
              <span className="text-[11px] text-muted-foreground">Compte Personnel</span>
            </div>
          </div>
        </div>
        <Separator />
        <ScrollArea className="flex-1 px-3 py-2">
          <nav className="flex flex-col gap-1">
            {navSections.map((section) => (
              <div key={section.title} className="mb-2">
                <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{section.title}</p>
                {section.items.map((item) => (
                  <SidebarNavItem key={item.id} item={item} isActive={currentPage === item.id} theme={theme} onClick={() => setCurrentPage(item.id)} />
                ))}
              </div>
            ))}
          </nav>
        </ScrollArea>
        <Separator />
        <div className="px-3 py-3">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Thème</p>
          <div className="flex flex-col gap-1">
            {themeOptions.map((opt) => {
              const Icon = opt.icon
              return (
                <button key={opt.id} onClick={() => setTheme(opt.id)} className={cn('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200', themeBtnActive(theme, opt.id))}>
                  <Icon className={cn('h-4 w-4', themeIconColor(theme, opt.id))} />
                  <span className={cn('flex-1 text-left', opt.id === theme ? 'font-semibold' : 'text-muted-foreground')}>{opt.label}</span>
                  {opt.id === theme && <span className={cn('h-2 w-2 rounded-full', opt.id === 'default' ? 'bg-primary' : 'bg-emerald-500')} />}
                </button>
              )
            })}
          </div>
        </div>
        <Separator />
        <div className="px-3 py-3">
          <button onClick={() => setCurrentPage('settings')} className={cn('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200', currentPage === 'settings' ? activeBg(theme) : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            <Settings className="h-5 w-5 shrink-0" />
            <span className="flex-1 text-left">Paramètres</span>
          </button>
        </div>
      </aside>
    </TooltipProvider>
  )
}

const bottomNavItems: { id: PageId; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Accueil', icon: Home },
  { id: 'send', label: 'Envoyer', icon: Send },
  { id: 'qr-payment', label: 'QR', icon: QrCode },
]

function MobileBottomNav() {
  const { currentPage, setCurrentPage, theme, setTheme, unreadCount } = useAppStore()
  const [menuOpen, setMenuOpen] = useState(false)
  const handleNav = (pageId: PageId) => { setCurrentPage(pageId); setMenuOpen(false) }
  const navBarBg = theme === 'moarli-dark' ? 'border-border/50 bg-card/95 backdrop-blur-lg' : theme === 'moarli-light' ? 'border-emerald-200 bg-white/95 backdrop-blur-lg' : 'border-border bg-background/95 backdrop-blur-lg'

  return (
    <>
      <nav className={cn('fixed inset-x-0 bottom-0 z-40 flex h-16 items-center justify-around border-t md:hidden', navBarBg)}>
        {bottomNavItems.map((item) => {
          const Icon = item.icon
          const isActive = currentPage === item.id
          return (
            <button key={item.id} onClick={() => handleNav(item.id)} className={cn('flex flex-col items-center gap-0.5 px-3 py-1 transition-colors duration-200', isActive ? accentText(theme) : 'text-muted-foreground')}>
              <Icon className="h-5 w-5" />
              <span className="text-[10px] font-medium">{item.label}</span>
              {isActive && <span className={cn('h-0.5 w-4 rounded-full', accentDot(theme))} />}
            </button>
          )
        })}
        <button onClick={() => handleNav('notifications')} className={cn('relative flex flex-col items-center gap-0.5 px-3 py-1 transition-colors duration-200', currentPage === 'notifications' ? accentText(theme) : 'text-muted-foreground')}>
          <div className="relative">
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && <Badge variant="destructive" className="absolute -right-2 -top-1.5 h-4 min-w-[16px] justify-center rounded-full px-1 text-[9px] font-bold">{unreadCount > 9 ? '9+' : unreadCount}</Badge>}
          </div>
          <span className="text-[10px] font-medium">Alertes</span>
          {currentPage === 'notifications' && <span className={cn('h-0.5 w-4 rounded-full', accentDot(theme))} />}
        </button>
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <button className="flex flex-col items-center gap-0.5 px-3 py-1 text-muted-foreground transition-colors duration-200">
              <Menu className="h-5 w-5" />
              <span className="text-[10px] font-medium">Plus</span>
            </button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl">
            <SheetHeader className="pb-2">
              <SheetTitle className="flex items-center gap-2 text-left">
                <span className={cn('text-xl font-extrabold', theme === 'moarli-dark' || theme === 'moarli-light' ? 'text-emerald-500' : 'text-emerald-600')}>MOARLI</span>
                <span className={cn('text-base font-semibold', theme === 'moarli-dark' ? 'text-amber-400' : 'text-amber-500')}>Bank</span>
              </SheetTitle>
            </SheetHeader>
            <ScrollArea className="h-[calc(85vh-80px)] pr-2">
              {navSections.map((section) => (
                <div key={section.title} className="mb-4">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{section.title}</p>
                  <div className="flex flex-col gap-0.5">
                    {section.items.map((item) => {
                      const Icon = item.icon
                      const isActive = currentPage === item.id
                      return (
                        <SheetClose asChild key={item.id}>
                          <button onClick={() => handleNav(item.id)} className={cn('flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200', isActive ? activeBg(theme) : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                            <Icon className="h-5 w-5 shrink-0" />
                            <span className="flex-1 text-left">{item.label}</span>
                            {item.id === 'notifications' && unreadCount > 0 && <Badge variant="destructive" className="h-5 min-w-[20px] justify-center rounded-full px-1.5 text-[10px] font-bold">{unreadCount}</Badge>}
                          </button>
                        </SheetClose>
                      )
                    })}
                  </div>
                </div>
              ))}
              <SheetClose asChild>
                <button onClick={() => handleNav('settings')} className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-200 mb-4', currentPage === 'settings' ? activeBg(theme) : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
                  <Settings className="h-5 w-5 shrink-0" />
                  <span className="flex-1 text-left">Paramètres</span>
                </button>
              </SheetClose>
              <div className="mb-4 rounded-xl border p-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Thème</p>
                <div className="flex gap-2">
                  {themeOptions.map((opt) => {
                    const Icon = opt.icon
                    return (
                      <button key={opt.id} onClick={() => setTheme(opt.id)} className={cn('flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-[11px] font-medium transition-all duration-200', themeBtnActive(theme, opt.id))}>
                        <Icon className={cn('h-5 w-5', themeIconColor(theme, opt.id))} />
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </ScrollArea>
          </SheetContent>
        </Sheet>
      </nav>
    </>
  )
}

interface AppShellProps { children: React.ReactNode }

export function AppShell({ children }: AppShellProps) {
  const theme = useAppStore((s) => s.theme)
  return (
    <div className="min-h-screen">
      <DesktopSidebar />
      <MobileBottomNav />
      <main className="min-h-screen transition-colors duration-300 md:ml-64">
        <div className="h-16 md:hidden" />
        <div className="p-4 md:p-6">{children}</div>
      </main>
    </div>
  )
}

export { DesktopSidebar, MobileBottomNav }
export default AppShell
