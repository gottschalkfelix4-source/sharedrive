import { Link, useLocation, Outlet } from 'react-router-dom'
import { Settings, HardDrive, Mail, Lock, Palette, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

const settingsNav = [
  { to: '/admin/settings', label: 'General', icon: <Settings size={16} />, exact: true, desc: 'App name, description' },
  { to: '/admin/settings/storage', label: 'Storage', icon: <HardDrive size={16} />, desc: 'Limits & retention' },
  { to: '/admin/settings/email', label: 'Email', icon: <Mail size={16} />, desc: 'SMTP configuration' },
  { to: '/admin/settings/security', label: 'Security', icon: <Lock size={16} />, desc: 'Registration & access' },
  { to: '/admin/settings/appearance', label: 'Appearance', icon: <Palette size={16} />, desc: 'Colors & branding' },
]

export function SettingsLayout() {
  const location = useLocation()

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text-primary">Settings</h1>
        <p className="text-text-muted text-sm mt-1">Configure your ShareDrive instance</p>
      </div>

      <div className="flex gap-6 flex-col md:flex-row">
        {/* Settings sidebar */}
        <aside className="md:w-52 flex-shrink-0">
          <nav className="bg-bg-card border border-border rounded-2xl overflow-hidden">
            {settingsNav.map((item, i) => {
              const active = item.exact
                ? location.pathname === item.to
                : location.pathname === item.to
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 text-sm transition-all duration-200',
                    i > 0 && 'border-t border-border',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'text-text-secondary hover:text-text-primary hover:bg-white/5'
                  )}
                >
                  <div className={cn('flex-shrink-0', active ? 'text-primary' : 'text-text-muted')}>
                    {item.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{item.label}</p>
                    <p className="text-xs text-text-muted truncate">{item.desc}</p>
                  </div>
                  {active && <ChevronRight size={14} className="flex-shrink-0 text-primary" />}
                </Link>
              )
            })}
          </nav>
        </aside>

        {/* Settings content */}
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
