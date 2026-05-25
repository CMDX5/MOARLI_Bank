'use client'

import { useState } from 'react'
import { useAppStore, type ThemeMode } from '@/lib/store'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  User,
  Phone,
  Mail,
  Camera,
  Shield,
  Lock,
  Bell,
  Globe,
  Moon,
  Sun,
  Monitor,
  Trash2,
  Info,
  ChevronRight,
  Eye,
  EyeOff,
  AlertTriangle,
  Palette,
  Languages,
  FileText,
  ExternalLink,
} from 'lucide-react'

const themes: { value: ThemeMode; label: string; icon: React.ReactNode; description: string; preview: string }[] = [
  {
    value: 'moarli-dark',
    label: 'MOARLI Dark',
    icon: <Moon className="h-4 w-4" />,
    description: 'Thème sombre par défaut',
    preview: 'bg-gray-900 border-gray-700',
  },
  {
    value: 'moarli-light',
    label: 'MOARLI Light',
    icon: <Sun className="h-4 w-4" />,
    description: 'Thème clair',
    preview: 'bg-white border-gray-200',
  },
  {
    value: 'default',
    label: 'Système',
    icon: <Monitor className="h-4 w-4" />,
    description: 'Suivre les paramètres système',
    preview: 'bg-gradient-to-r from-gray-900 to-white border-gray-400',
  },
]

const languages = [
  { value: 'fr', label: 'Français', flag: '🇫🇷' },
  { value: 'ln', label: 'Lingala', flag: '🇨🇬' },
  { value: 'kt', label: 'Kituba', flag: '🇨🇬' },
]

export function SettingsPage() {
  const { theme, setTheme, userName, userPhone } = useAppStore()
  const [showChangePin, setShowChangePin] = useState(false)
  const [showDeleteAccount, setShowDeleteAccount] = useState(false)
  const [currentPin, setCurrentPin] = useState('')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [language, setLanguage] = useState('fr')
  const [notifPrefs, setNotifPrefs] = useState({
    transactions: true,
    savings: true,
    budget: true,
    security: true,
    promotions: false,
    tontine: true,
  })
  const [twoFA, setTwoFA] = useState(false)

  return (
    <div className="space-y-4 p-4 pb-24">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Paramètres</h1>
        <p className="text-sm text-muted-foreground">Personnalisez votre expérience</p>
      </div>

      {/* Theme Selector */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            Thème
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {themes.map((t) => (
              <button
                key={t.value}
                className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
                  theme === t.value
                    ? 'border-primary bg-primary/5'
                    : 'border-transparent bg-muted/30 hover:bg-muted/50'
                }`}
                onClick={() => setTheme(t.value)}
              >
                <div className={`h-12 w-full rounded-lg mb-2 flex items-center justify-center ${t.preview}`}>
                  {t.icon}
                </div>
                <p className="text-xs font-medium">{t.label}</p>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Profile */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="h-5 w-5 text-primary" />
            Profil
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Avatar */}
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-bold">
                {userName.split(' ').map((n) => n[0]).join('')}
              </div>
              <button className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Camera className="h-3.5 w-3.5" />
              </button>
            </div>
            <div>
              <p className="font-medium">{userName}</p>
              <p className="text-sm text-muted-foreground">{userPhone}</p>
            </div>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Nom complet</Label>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <Input defaultValue={userName} className="h-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Téléphone</Label>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <Input defaultValue={userPhone} className="h-9" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Email</Label>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <Input type="email" placeholder="votre@email.com" className="h-9" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Security */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            Sécurité
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Change PIN */}
          <Dialog open={showChangePin} onOpenChange={setShowChangePin}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full justify-between h-10">
                <span className="flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Changer le PIN
                </span>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Changer le PIN</DialogTitle>
                <DialogDescription>Entrez votre PIN actuel et le nouveau</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label>PIN actuel</Label>
                  <div className="relative">
                    <Input
                      type={showPin ? 'text' : 'password'}
                      maxLength={4}
                      placeholder="••••"
                      value={currentPin}
                      onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ''))}
                      className="pr-10 font-mono text-center text-lg tracking-[0.5em]"
                    />
                    <button
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                      onClick={() => setShowPin(!showPin)}
                    >
                      {showPin ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Nouveau PIN</Label>
                  <Input
                    type="password"
                    maxLength={4}
                    placeholder="••••"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                    className="font-mono text-center text-lg tracking-[0.5em]"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Confirmer le PIN</Label>
                  <Input
                    type="password"
                    maxLength={4}
                    placeholder="••••"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                    className="font-mono text-center text-lg tracking-[0.5em]"
                  />
                </div>
                <Button className="w-full">Confirmer</Button>
              </div>
            </DialogContent>
          </Dialog>

          {/* 2FA Toggle */}
          <div className="flex items-center justify-between p-3 rounded-lg bg-muted/30">
            <div className="flex items-center gap-2">
              <Shield className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-medium">Authentification 2FA</p>
                <p className="text-xs text-muted-foreground">Sécurité renforcée</p>
              </div>
            </div>
            <Switch checked={twoFA} onCheckedChange={setTwoFA} />
          </div>
        </CardContent>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {[
            { key: 'transactions' as const, label: 'Transactions', desc: 'Dépôts, retraits, transferts' },
            { key: 'savings' as const, label: 'Épargne', desc: 'Objectifs et rappels' },
            { key: 'budget' as const, label: 'Budget', desc: 'Alertes de dépenses' },
            { key: 'security' as const, label: 'Sécurité', desc: 'Connexions et activités' },
            { key: 'tontine' as const, label: 'Tontine', desc: 'Rappels de contributions' },
            { key: 'promotions' as const, label: 'Promotions', desc: 'Offres et actualités' },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
              <Switch
                checked={notifPrefs[item.key]}
                onCheckedChange={(checked) =>
                  setNotifPrefs((prev) => ({ ...prev, [item.key]: checked }))
                }
              />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Language */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Languages className="h-5 w-5 text-primary" />
            Langue
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {languages.map((lang) => (
                <SelectItem key={lang.value} value={lang.value}>
                  <span className="flex items-center gap-2">
                    <span>{lang.flag}</span>
                    {lang.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {/* About */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-5 w-5 text-primary" />
            À propos
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center justify-between py-2">
            <p className="text-sm">Version de l&apos;application</p>
            <Badge variant="outline">1.0.0-beta</Badge>
          </div>
          <Separator />
          <button className="flex items-center justify-between py-2 w-full text-left hover:bg-muted/30 rounded px-1">
            <span className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Conditions d&apos;utilisation
            </span>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </button>
          <button className="flex items-center justify-between py-2 w-full text-left hover:bg-muted/30 rounded px-1">
            <span className="text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-muted-foreground" />
              Politique de confidentialité
            </span>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </button>
          <button className="flex items-center justify-between py-2 w-full text-left hover:bg-muted/30 rounded px-1">
            <span className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              Mentions légales
            </span>
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
          </button>
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-base text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Zone de danger
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Dialog open={showDeleteAccount} onOpenChange={setShowDeleteAccount}>
            <DialogTrigger asChild>
              <Button variant="destructive" className="w-full">
                <Trash2 className="h-4 w-4 mr-2" />
                Supprimer mon compte
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="text-destructive">Supprimer le compte</DialogTitle>
                <DialogDescription>
                  Cette action est irréversible. Toutes vos données, transactions et soldes seront définitivement supprimés.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                  <p className="text-sm text-destructive font-medium">⚠️ Attention</p>
                  <ul className="text-xs text-muted-foreground mt-1 space-y-1 list-disc pl-4">
                    <li>Vos soldes seront perdus</li>
                    <li>Vos tontines seront dissoutes</li>
                    <li>Vos cartes virtuelles seront annulées</li>
                    <li>Historique supprimé</li>
                  </ul>
                </div>
                <div className="space-y-1.5">
                  <Label>Tapez &quot;SUPPRIMER&quot; pour confirmer</Label>
                  <Input placeholder="SUPPRIMER" />
                </div>
                <Button variant="destructive" className="w-full">
                  Supprimer définitivement
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  )
}
