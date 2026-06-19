import { api } from './client'
import type { User } from '../types'

export async function login(
  email: string,
  password: string
): Promise<{ token?: string; user?: User; requiresTwoFactor?: boolean; challengeToken?: string }> {
  const res = await api.post('/auth/login', { email, password })
  return res.data
}

export async function loginTwoFactor(challengeToken: string, code: string): Promise<{ token: string; user: User }> {
  const res = await api.post('/auth/2fa/login', { challengeToken, code })
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

export async function forgotPassword(email: string): Promise<{ message: string }> {
  const res = await api.post('/auth/forgot-password', { email })
  return res.data
}

export async function resetPassword(token: string, password: string): Promise<{ token: string; user: User }> {
  const res = await api.post('/auth/reset-password', { token, password })
  return res.data
}

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ token: string; user: User }> {
  const res = await api.post('/auth/change-password', { currentPassword, newPassword })
  return res.data
}

export async function logoutAllDevices(): Promise<{ success: boolean }> {
  const res = await api.post('/auth/logout-all')
  return res.data
}

export async function setupTwoFactor(): Promise<{ secret: string; qrCodeDataUrl: string }> {
  const res = await api.post('/auth/2fa/setup')
  return res.data
}

export async function verifyTwoFactor(code: string): Promise<{ token: string; backupCodes: string[]; user: User }> {
  const res = await api.post('/auth/2fa/verify', { code })
  return res.data
}

export async function disableTwoFactor(password: string): Promise<{ token: string; user: User }> {
  const res = await api.post('/auth/2fa/disable', { password })
  return res.data
}
