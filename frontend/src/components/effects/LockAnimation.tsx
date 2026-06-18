import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface LockAnimationProps {
  show: boolean
  onComplete?: () => void
}

export function LockAnimation({ show, onComplete }: LockAnimationProps) {
  const [phase, setPhase] = useState<'hidden' | 'open' | 'closing' | 'locked'>('hidden')

  useEffect(() => {
    if (!show) {
      setPhase('hidden')
      return
    }
    setPhase('open')                                         // shackle raised — lock open
    const t1 = setTimeout(() => setPhase('closing'), 350)   // shackle slams shut
    const t2 = setTimeout(() => setPhase('locked'), 650)    // glow + keyhole
    const t3 = setTimeout(() => onComplete?.(), 2100)       // overlay fades out
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [show])

  const shackleClosed = phase === 'closing' || phase === 'locked'
  const locked        = phase === 'locked'

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.55, delay: 0.1 } }}
          style={{ background: 'rgba(4, 4, 18, 0.93)', backdropFilter: 'blur(14px)' }}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl select-none"
        >
          {/* ── Padlock ──────────────────────────────────────────────────── */}
          <div className="relative flex items-center justify-center" style={{ width: 130, height: 130 }}>

            {/* Expanding ripple rings on impact */}
            <AnimatePresence>
              {locked && [0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="absolute inset-0 rounded-full border border-violet-400/60"
                  initial={{ scale: 0.55, opacity: 0.85 }}
                  animate={{ scale: 2.6 + i * 0.5, opacity: 0 }}
                  transition={{ duration: 0.8, delay: i * 0.14, ease: 'easeOut' }}
                />
              ))}
            </AnimatePresence>

            {/* Soft violet glow */}
            <motion.div
              className="absolute rounded-full bg-violet-500/60 blur-2xl"
              style={{ inset: 18 }}
              animate={{ opacity: locked ? 1 : 0, scale: locked ? 1.6 : 0.3 }}
              transition={{ duration: 0.45 }}
            />

            {/* SVG Padlock */}
            <svg width="88" height="88" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">

              {/* Shackle — whole unit translates up/down.
                  Start raised (shackle open), then spring-drops to seat position. */}
              <motion.g
                initial={{ y: -6 }}
                animate={{ y: shackleClosed ? 0 : -6 }}
                transition={{ type: 'spring', stiffness: 680, damping: 22, mass: 0.75 }}
              >
                <motion.path
                  d="M7 11V7a5 5 0 0 1 10 0v4"
                  strokeWidth={1.8}
                  animate={{ stroke: shackleClosed ? '#a78bfa' : '#5b6070' }}
                  transition={{ duration: 0.28 }}
                />
              </motion.g>

              {/* Body fill — opaque dark rect hides the shackle posts inside the body
                  (fill matches the overlay background so posts appear to slide IN) */}
              <rect x="3" y="11" width="18" height="11" rx="2" fill="#040412" />

              {/* Body glow fill — appears when locked */}
              <motion.rect
                x="3" y="11" width="18" height="11" rx="2"
                fill="rgba(139,92,246,0)"
                animate={{ fill: locked ? 'rgba(139,92,246,0.10)' : 'rgba(139,92,246,0)' }}
                transition={{ duration: 0.4 }}
              />

              {/* Body stroke */}
              <motion.rect
                x="3" y="11" width="18" height="11" rx="2"
                strokeWidth={1.8}
                fill="none"
                animate={{ stroke: shackleClosed ? '#a78bfa' : '#5b6070' }}
                transition={{ duration: 0.28 }}
              />

              {/* Keyhole — pops in when fully locked */}
              <AnimatePresence>
                {locked && (
                  <motion.g
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ type: 'spring', stiffness: 420, damping: 20, delay: 0.05 }}
                    style={{ transformOrigin: '12px 16px', transformBox: 'fill-box' }}
                  >
                    <circle cx="12" cy="15.2" r="1.6" fill="#a78bfa" />
                    <rect x="10.9" y="16.1" width="2.2" height="2.4" rx="0.6" fill="#a78bfa" />
                  </motion.g>
                )}
              </AnimatePresence>
            </svg>
          </div>

          {/* ── Text ─────────────────────────────────────────────────────── */}
          <motion.div
            className="text-center mt-3 px-6"
            animate={{ opacity: locked ? 1 : 0, y: locked ? 0 : 12 }}
            transition={{ duration: 0.38 }}
          >
            <p className="text-violet-300 font-semibold text-[15px] tracking-wide">Ende-zu-Ende verschlüsselt</p>
            <p className="text-text-muted text-xs mt-1 opacity-80">AES-256-GCM · Schlüssel nur im Download-Link</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
