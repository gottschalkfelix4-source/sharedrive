import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-border mt-auto py-4 px-6">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-text-muted">
        <div className="flex items-center gap-2">
          <ShieldCheck size={13} className="text-violet-400 flex-shrink-0" />
          <span>Diese Seite verwendet ausschließlich technisch notwendige Cookies (JWT-Sitzung). Keine Tracking- oder Werbe-Cookies.</span>
        </div>
        <div className="flex items-center gap-4 flex-shrink-0">
          <Link to="/datenschutz" className="hover:text-text-primary transition-colors">Datenschutz</Link>
          <Link to="/impressum" className="hover:text-text-primary transition-colors">Impressum</Link>
        </div>
      </div>
    </footer>
  )
}
