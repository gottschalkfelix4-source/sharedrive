import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState, lazy, Suspense } from 'react'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'
const HomePage = lazy(() =>
  import('@/pages/HomePage').then((module) => ({ default: module.HomePage }))
)
const DownloadPage = lazy(() =>
  import('@/pages/DownloadPage').then((module) => ({
    default: module.DownloadPage,
  }))
)
const PrivacyPage = lazy(() =>
  import('@/pages/PrivacyPage').then((module) => ({
    default: module.PrivacyPage,
  }))
)
const ImprintPage = lazy(() =>
  import('@/pages/ImprintPage').then((module) => ({
    default: module.ImprintPage,
  }))
)
const LoginPage = lazy(() =>
  import('@/pages/auth/LoginPage').then((module) => ({
    default: module.LoginPage,
  }))
)
const RegisterPage = lazy(() =>
  import('@/pages/auth/RegisterPage').then((module) => ({
    default: module.RegisterPage,
  }))
)
const VerifyEmailPage = lazy(() =>
  import('@/pages/auth/VerifyEmailPage').then((module) => ({
    default: module.VerifyEmailPage,
  }))
)
const ForgotPasswordPage = lazy(() =>
  import('@/pages/auth/ForgotPasswordPage').then((module) => ({
    default: module.ForgotPasswordPage,
  }))
)
const ResetPasswordPage = lazy(() =>
  import('@/pages/auth/ResetPasswordPage').then((module) => ({
    default: module.ResetPasswordPage,
  }))
)
const SetupPage = lazy(() =>
  import('@/pages/SetupPage').then((module) => ({ default: module.SetupPage }))
)
const DashboardPage = lazy(() =>
  import('@/pages/dashboard/DashboardPage').then((module) => ({
    default: module.DashboardPage,
  }))
)
const AccountSettingsPage = lazy(() =>
  import('@/pages/account/AccountSettingsPage').then((module) => ({
    default: module.AccountSettingsPage,
  }))
)
const AdminLayout = lazy(() =>
  import('@/pages/admin/AdminLayout').then((module) => ({
    default: module.AdminLayout,
  }))
)
const AdminDashboardPage = lazy(() =>
  import('@/pages/admin/AdminDashboardPage').then((module) => ({
    default: module.AdminDashboardPage,
  }))
)
const AdminFilesPage = lazy(() =>
  import('@/pages/admin/AdminFilesPage').then((module) => ({
    default: module.AdminFilesPage,
  }))
)
const AdminUsersPage = lazy(() =>
  import('@/pages/admin/AdminUsersPage').then((module) => ({
    default: module.AdminUsersPage,
  }))
)
const AdminLogsPage = lazy(() =>
  import('@/pages/admin/AdminLogsPage').then((module) => ({
    default: module.AdminLogsPage,
  }))
)
const SettingsLayout = lazy(() =>
  import('@/pages/admin/settings/SettingsLayout').then((module) => ({
    default: module.SettingsLayout,
  }))
)
const GeneralSettings = lazy(() =>
  import('@/pages/admin/settings/GeneralSettings').then((module) => ({
    default: module.GeneralSettings,
  }))
)
const StorageSettings = lazy(() =>
  import('@/pages/admin/settings/StorageSettings').then((module) => ({
    default: module.StorageSettings,
  }))
)
const EmailSettings = lazy(() =>
  import('@/pages/admin/settings/EmailSettings').then((module) => ({
    default: module.EmailSettings,
  }))
)
const SecuritySettings = lazy(() =>
  import('@/pages/admin/settings/SecuritySettings').then((module) => ({
    default: module.SecuritySettings,
  }))
)
const AppearanceSettings = lazy(() =>
  import('@/pages/admin/settings/AppearanceSettings').then((module) => ({
    default: module.AppearanceSettings,
  }))
)
const PrivacySettings = lazy(() =>
  import('@/pages/admin/settings/PrivacySettings').then((module) => ({
    default: module.PrivacySettings,
  }))
)
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
    <Suspense
      fallback={
        <div role="status" className="p-12 flex justify-center">
          <Spinner />
        </div>
      }
    >
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
          <Route
            path="/"
            element={
              <WithNavbar>
                <HomePage />
              </WithNavbar>
            }
          />
          <Route
            path="/d/:shortId"
            element={
              <WithNavbar>
                <DownloadPage />
              </WithNavbar>
            }
          />
          <Route
            path="/datenschutz"
            element={
              <WithNavbar>
                <PrivacyPage />
              </WithNavbar>
            }
          />
          <Route
            path="/impressum"
            element={
              <WithNavbar>
                <ImprintPage />
              </WithNavbar>
            }
          />
          <Route
            path="/login"
            element={
              <WithNavbar>
                <LoginPage />
              </WithNavbar>
            }
          />
          <Route
            path="/register"
            element={
              <WithNavbar>
                <RegisterPage />
              </WithNavbar>
            }
          />
          <Route
            path="/verify-email"
            element={
              <WithNavbar>
                <VerifyEmailPage />
              </WithNavbar>
            }
          />
          <Route
            path="/forgot-password"
            element={
              <WithNavbar>
                <ForgotPasswordPage />
              </WithNavbar>
            }
          />
          <Route
            path="/reset-password"
            element={
              <WithNavbar>
                <ResetPasswordPage />
              </WithNavbar>
            }
          />
          <Route
            path="/dashboard"
            element={
              <WithNavbar>
                <RequireAuth>
                  <DashboardPage />
                </RequireAuth>
              </WithNavbar>
            }
          />
          <Route
            path="/account"
            element={
              <WithNavbar>
                <RequireAuth>
                  <AccountSettingsPage />
                </RequireAuth>
              </WithNavbar>
            }
          />
          <Route
            path="*"
            element={
              <WithNavbar>
                <NotFoundPage />
              </WithNavbar>
            }
          />
        </Routes>
      </div>
    </Suspense>
  )
}
