import { useEffect, useState } from 'react'
import { useSearchParams, Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle, XCircle, Loader2 } from 'lucide-react'
import { verifyEmail } from '@/api/auth'
import { useAuthStore } from '@/store/authStore'
import { Button } from '@/components/ui/Button'

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const token = searchParams.get('token')
    if (!token) {
      setErrorMessage('Missing verification token.')
      setStatus('error')
      return
    }

    verifyEmail(token)
      .then(({ token: jwt, user }) => {
        setAuth(user, jwt)
        setStatus('success')
        setTimeout(() => navigate('/dashboard'), 2500)
      })
      .catch((err: any) => {
        setErrorMessage(err?.response?.data?.error || 'This link is invalid or has expired.')
        setStatus('error')
      })
  }, [])

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-sm text-center"
      >
        {status === 'loading' && (
          <>
            <Loader2 size={40} className="text-primary animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-bold text-text-primary">Verifying your email…</h1>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto mb-6">
              <CheckCircle size={32} className="text-emerald-400" />
            </div>
            <h1 className="text-2xl font-bold text-text-primary mb-2">Email verified!</h1>
            <p className="text-text-muted text-sm">Your account is now active. Redirecting to your dashboard…</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto mb-6">
              <XCircle size={32} className="text-red-400" />
            </div>
            <h1 className="text-2xl font-bold text-text-primary mb-2">Verification failed</h1>
            <p className="text-text-muted text-sm mb-6">{errorMessage}</p>
            <Button variant="secondary" onClick={() => navigate('/register')}>
              Back to register
            </Button>
            <p className="text-sm text-text-muted mt-4">
              Already verified?{' '}
              <Link to="/login" className="text-primary hover:underline">Sign in</Link>
            </p>
          </>
        )}
      </motion.div>
    </div>
  )
}
