import { api } from './client'
import type { User } from '../types'

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const res = await api.post('/auth/login', { email, password })
  return res.data
}

export async function register(
  email: string,
  username: string,
  password: string
): Promise<{ token?: string; user?: User; needsVerification?: boolean }> {
  const res = await api.post('/auth/register', { email, username, password })
  return res.data
}

export async function verifyEmail(token: string): Promise<{ token: string; user: User }> {
  const res = await api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
  return res.data
}

export async function getMe(): Promise<User> {
  const res = await api.get('/auth/me')
  return res.data.user
}
