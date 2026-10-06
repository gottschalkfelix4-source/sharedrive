import axios from 'axios'

export const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
})

api.interceptors.request.use((config) => {
  const csrf = document.cookie
    .split('; ')
    .find((v) => v.startsWith('csrf='))
    ?.slice(5)
  if (csrf) config.headers['x-csrf-token'] = decodeURIComponent(csrf)
  const setupToken = sessionStorage.getItem('setup-token')
  if (setupToken && config.url?.startsWith('/setup'))
    config.headers['x-setup-token'] = setupToken
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const path = window.location.pathname
      // Don't redirect on download pages — they handle 401 (password prompt) themselves
      const isDownloadPage =
        path.startsWith('/d/') ||
        path.startsWith('/setup') ||
        path.startsWith('/reset-password') ||
        path.startsWith('/verify-email')
      if (!isDownloadPage) {
        localStorage.removeItem('session')
        if (!path.includes('/login')) {
          window.location.href = '/login'
        }
      }
    }
    return Promise.reject(err)
  }
)
