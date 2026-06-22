import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
import { HomePage } from '@/pages/HomePage'
import { DownloadPage } from '@/pages/DownloadPage'
import { PrivacyPage } from '@/pages/PrivacyPage'
import { ImprintPage } from '@/pages/ImprintPage'
import { LoginPage } from '@/pages/auth/LoginPage'
import { RegisterPage } from '@/pages/auth/RegisterPage'
import { VerifyEmailPage } from '@/pages/auth/VerifyEmailPage'
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage'
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage'
import { SetupPage } from '@/pages/SetupPage'
import { DashboardPage } from '@/pages/dashboard/DashboardPage'
import { AccountSettingsPage } from '@/pages/account/AccountSettingsPage'
import { AdminLayout } from '@/pages/admin/AdminLayout'
import { AdminDashboardPage } from '@/pages/admin/AdminDashboardPage'
import { AdminFilesPage } from '@/pages/admin/AdminFilesPage'
import { AdminUsersPage } from '@/pages/admin/AdminUsersPage'
import { AdminLogsPage } from '@/pages/admin/AdminLogsPage'
import { SettingsLayout } from '@/pages/admin/settings/SettingsLayout'
import { GeneralSettings } from '@/pages/admin/settings/GeneralSettings'
import { StorageSettings } from '@/pages/admin/settings/StorageSettings'
import { EmailSettings } from '@/pages/admin/settings/EmailSettings'
import { SecuritySettings } from '@/pages/admin/settings/SecuritySettings'
import { AppearanceSettings } from '@/pages/admin/settings/AppearanceSettings'
import { PrivacySettings } from '@/pages/admin/settings/PrivacySettings'
import { useAuthStore } from '@/store/authStore'
import { getMe } from '@/api/auth'
import { getSetupStatus } from '@/api/setup'
import { Spinner } from '@/components/ui/Spinner'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore()
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function WithNavbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      <Navbar />
      <div className="flex-1">{children}</div>
      <Footer />
    </div>
  )
}

function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center text-center">
      <div>
        <p className="text-6xl font-bold text-text-muted">404</p>
        <p className="text-text-secondary mt-3">Seite nicht gefunden</p>
      </div>
    </div>
  )
}

export default function App() {
  const { token, setAuth, clearAuth } = useAuthStore()
  const [appReady, setAppReady] = useState(false)
  const [needsSetup, setNeedsSetup] = useState(false)

  useEffect(() => {
    async function init() {
      // Check if first-time setup is needed
      try {
        const { needsSetup: ns } = await getSetupStatus()
        setNeedsSetup(ns)
        if (ns) {
          setAppReady(true)
          return
        }
      } catch {
        // Backend not reachable — continue anyway (dev mode)
      }

      // Try to restore session from stored token
      if (token) {
        try {
          const user = await getMe()
          setAuth(user, token)
        } catch (err: any) {
          if (err?.response?.status === 401) clearAuth()
        }
      }

      setAppReady(true)
    }

    init()
  }, [])

  if (!appReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-bg">
        <Spinner size="lg" />
      </div>
    )
  }

  // Redirect to setup if no admin exists yet
  if (needsSetup && !window.location.pathname.startsWith('/setup')) {
    return <Navigate to="/setup" replace />
  }

  return (
    <div className="min-h-screen bg-bg font-sans">
      <Routes>
        {/* First-time setup (no navbar) */}
        <Route path="/setup" element={<SetupPage />} />

        {/* Admin routes — own layout, no top navbar */}
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboardPage />} />
          <Route path="files" element={<AdminFilesPage />} />
          <Route path="users" element={<AdminUsersPage />} />
          <Route path="logs" element={<AdminLogsPage />} />
          <Route path="settings" element={<SettingsLayout />}>
            <Route index element={<GeneralSettings />} />
            <Route path="storage" element={<StorageSettings />} />
            <Route path="email" element={<EmailSettings />} />
            <Route path="security" element={<SecuritySettings />} />
            <Route path="appearance" element={<AppearanceSettings />} />
            <Route path="privacy" element={<PrivacySettings />} />
          </Route>
        </Route>

        {/* Public routes with navbar */}
        <Route path="/" element={<WithNavbar><HomePage /></WithNavbar>} />
        <Route path="/d/:shortId" element={<WithNavbar><DownloadPage /></WithNavbar>} />
        <Route path="/datenschutz" element={<WithNavbar><PrivacyPage /></WithNavbar>} />
        <Route path="/impressum" element={<WithNavbar><ImprintPage /></WithNavbar>} />
        <Route path="/login" element={<WithNavbar><LoginPage /></WithNavbar>} />
        <Route path="/register" element={<WithNavbar><RegisterPage /></WithNavbar>} />
        <Route path="/verify-email" element={<WithNavbar><VerifyEmailPage /></WithNavbar>} />
        <Route path="/forgot-password" element={<WithNavbar><ForgotPasswordPage /></WithNavbar>} />
        <Route path="/reset-password" element={<WithNavbar><ResetPasswordPage /></WithNavbar>} />
        <Route
          path="/dashboard"
          element={<WithNavbar><RequireAuth><DashboardPage /></RequireAuth></WithNavbar>}
        />
        <Route
          path="/account"
          element={<WithNavbar><RequireAuth><AccountSettingsPage /></RequireAuth></WithNavbar>}
        />
        <Route path="*" element={<WithNavbar><NotFoundPage /></WithNavbar>} />
      </Routes>
    </div>
  )
}
