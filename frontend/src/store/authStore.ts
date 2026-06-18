import { create } from 'zustand'
import type { User } from '../types'

function parseJwt(token: string): Partial<User> | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return { id: payload.id, email: payload.email, username: payload.username, role: payload.role }
  } catch {
    return null
  }
}

function getInitialUser(token: string | null): User | null {
  if (!token) return null
  const parsed = parseJwt(token)
  if (!parsed?.id || !parsed?.email || !parsed?.username || !parsed?.role) return null
  return { ...parsed, storageUsed: '0', createdAt: '' } as User
}

const storedToken = localStorage.getItem('token')

interface AuthState {
  user: User | null
  token: string | null
  setAuth: (user: User, token: string) => void
  clearAuth: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: getInitialUser(storedToken),
  token: storedToken,
  setAuth: (user, token) => {
    localStorage.setItem('token', token)
    set({ user, token })
  },
  clearAuth: () => {
    localStorage.removeItem('token')
    set({ user: null, token: null })
  },
}))
