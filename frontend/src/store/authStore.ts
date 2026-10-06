import { create } from 'zustand'
import type { User } from '../types'
// Only a non-secret presence flag is retained. The JWT lives in an HttpOnly cookie.
localStorage.removeItem('token')
interface AuthState {
  user: User | null
  token: string | null
  setAuth: (user: User, token: string) => void
  clearAuth: () => void
}
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('session') ? 'cookie-session' : null,
  setAuth: (user, _token) => {
    localStorage.setItem('session', '1')
    set({ user, token: 'cookie-session' })
  },
  clearAuth: () => {
    localStorage.removeItem('session')
    const csrf =
      document.cookie
        .split('; ')
        .find((v) => v.startsWith('csrf='))
        ?.slice(5) || ''
    void fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'x-csrf-token': decodeURIComponent(csrf) },
    }).catch(() => {})
    set({ user: null, token: null })
  },
}))
