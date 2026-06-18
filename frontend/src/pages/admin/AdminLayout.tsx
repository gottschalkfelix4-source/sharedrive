import { Link, useLocation, Outlet, Navigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, Files, Users, Settings, Shield, ChevronRight, Upload, ScrollText
} from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { cn } from '@/lib/utils'

const navItems = [
  { to: '/admin', label: 'Dashboard', icon: <LayoutDashboard size={17} />, exact: true },
  { to: '/admin/files', label: 'Files', icon: <Files size={17} /> },
  { to: '/admin/users', label: 'Users', icon: <Users size={17} /> },
  { to: '/admin/logs', label: 'Logs', icon: <ScrollText size={17} /> },
  { to: '/admin/settings', label: 'Settings', icon: <Settings size={17} /> },
]

export function AdminLayout() {
  const { user, token } = useAuthStore()

  // Token exists but user not yet loaded — wait
  if (token && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full border-2 border-white/10 border-t-primary w-8 h-8" />
      </div>
    )
  }

  if (!user || user.role !== 'ADMIN') return <Navigate to="/" />

  const location = useLocation()

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-56 border-r border-border bg-bg-surface flex-shrink-0 hidden md:flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-primary flex items-center justify-center flex-shrink-0">
              <Shield size={14} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-text-primary">Admin Panel</p>
              <p className="text-xs text-text-muted">@{user.username}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-200',
                  active
                    ? 'bg-primary/15 text-primary'
                    : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                )}
              >
                {item.icon}
                {item.label}
                {active && <ChevronRight size={14} className="ml-auto" />}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-border">
          <Link
            to="/"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm text-text-muted hover:text-text-primary hover:bg-white/5 transition-colors"
          >
            <Upload size={15} />
            Back to site
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {/* Mobile nav */}
        <div className="md:hidden border-b border-border bg-bg-surface px-4 py-2 flex gap-1 overflow-x-auto">
          {navItems.map((item) => {
            const active = item.exact
              ? location.pathname === item.to
              : location.pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors',
                  active ? 'bg-primary/15 text-primary' : 'text-text-secondary hover:bg-white/5'
                )}
              >
                {item.icon}
                {item.label}
              </Link>
            )
          })}
        </div>

        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="p-6 max-w-5xl mx-auto"
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  )
}
