import { api } from './client'

export interface SetupEnv {
  dbPassword:    string
  dbUser:        string
  dbName:        string
  minioUser:     string
  minioPassword: string
  jwtSecret:     string
}

export async function getSetupStatus(): Promise<{ needsSetup: boolean }> {
  const res = await api.get('/setup/status')
  return res.data
}

export async function getSetupEnv(): Promise<SetupEnv> {
  const res = await api.get('/setup/env')
  return res.data
}

export async function applySSL(domain: string, acmeEmail: string): Promise<{ baseUrl: string }> {
  const res = await api.post('/setup/ssl', { domain, acmeEmail })
  return res.data
}

export async function runSetup(data: {
  email:    string
  username: string
  password: string
  baseUrl?: string
}): Promise<void> {
  await api.post('/setup', data)
}
