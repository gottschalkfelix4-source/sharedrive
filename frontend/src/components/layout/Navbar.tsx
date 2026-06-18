import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Upload, LayoutDashboard, Shield, LogOut, LogIn, UserPlus, Menu, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'
import { getPublicSettings } from '@/api/settings'

export function Navbar() {
  const { user, clearAuth } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [appName, setAppName] = useState('ShareDrive')
  const [logoUrl, setLogoUrl] = useState('')

  useEffect(() => {
    getPublicSettings().then((s) => {
      if (s.appName) {
        setAppName(s.appName)
        document.title = s.appName
      }
      if (s.logoUrl) setLogoUrl(s.logoUrl)
    }).catch(() => {})
  }, [])

  const handleLogout = () => {
    clearAuth()
    navigate('/')
  }

  const links = [
    ...(user ? [{ to: '/dashboard', label: 'Meine Transfers', icon: <LayoutDashboard size={16} /> }] : []),
    ...(user?.role === 'ADMIN' ? [{ to: '/admin', label: 'Admin', icon: <Shield size={16} /> }] : []),
  ]

  return (
    <nav className="sticky top-0 z-40 border-b border-border backdrop-blur-xl bg-bg/80">
      <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 font-bold text-text-primary">
          {logoUrl ? (
            <img src={logoUrl} alt={appName} className="h-7 w-auto object-contain" />
          ) : (
            <>
              <div className="w-7 h-7 rounded-lg bg-gradient-primary flex items-center justify-center">
                <Upload size={14} className="text-white" />
              </div>
              <span className="hidden sm:block">{appName}</span>
            </>
          )}
        </Link>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-1">
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors
                ${location.pathname.startsWith(l.to) ? 'bg-white/10 text-text-primary' : 'text-text-secondary hover:text-text-primary hover:bg-white/5'}`}
            >
              {l.icon}
              {l.label}
            </Link>
          ))}
        </div>

        {/* Auth actions */}
        <div className="hidden sm:flex items-center gap-2">
          {user ? (
            <>
              <span className="text-sm text-text-muted">@{user.username}</span>
              <Button variant="ghost" size="sm" icon={<LogOut size={15} />} onClick={handleLogout}>
                Abmelden
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" icon={<LogIn size={15} />} onClick={() => navigate('/login')}>
                Anmelden
              </Button>
              <Button size="sm" icon={<UserPlus size={15} />} onClick={() => navigate('/register')}>
                Registrieren
              </Button>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          className="sm:hidden p-2 rounded-lg text-text-muted hover:text-text-primary hover:bg-white/5"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="sm:hidden border-t border-border bg-bg-surface px-4 py-3 flex flex-col gap-2"
        >
          {links.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-white/5"
            >
              {l.icon}
              {l.label}
            </Link>
          ))}
          {user ? (
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400 hover:bg-red-500/10"
            >
              <LogOut size={15} /> Abmelden
            </button>
          ) : (
            <>
              <Link to="/login" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:bg-white/5">
                <LogIn size={15} /> Anmelden
              </Link>
              <Link to="/register" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-primary hover:bg-primary/10">
                <UserPlus size={15} /> Registrieren
              </Link>
            </>
          )}
        </motion.div>
      )}
    </nav>
  )
}
