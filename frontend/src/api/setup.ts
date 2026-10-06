import { api } from './client'

export async function getSetupStatus(): Promise<{ needsSetup: boolean }> {
  const res = await api.get('/setup/status')
  return res.data
}

export async function runSetup(data: {
  email: string
  username: string
  password: string
  baseUrl?: string
}): Promise<void> {
  await api.post('/setup', data)
}

export async function getSetupReadiness(): Promise<{
  ready: boolean
  requiresRecreation: boolean
}> {
  return (await api.get('/setup/readiness')).data
}
