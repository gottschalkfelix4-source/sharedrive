import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface LockAnimationProps {
  show: boolean
  onComplete?: () => void
}

export function LockAnimation({ show, onComplete }: LockAnimationProps) {
  const [phase, setPhase] = useState<'idle' | 'open' | 'closing' | 'locked'>('idle')

  useEffect(() => {
    if (!show) return
    setPhase('open')
    const t1 = setTimeout(() => setPhase('closing'), 400)
    const t2 = setTimeout(() => setPhase('locked'),  730)
    const t3 = setTimeout(() => onComplete?.(),      2300)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [show])

  const shackleClosed = phase === 'closing' || phase === 'locked'
  const locked        = phase === 'locked'

  return (
    // phase stays 'locked' while exit plays — no text flicker
    <AnimatePresence onExitComplete={() => setPhase('idle')}>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5, delay: 0.05 } }}
          style={{ background: 'rgba(4, 4, 18, 0.94)', backdropFilter: 'blur(16px)' }}
          className="absolute inset-0 z-20 flex flex-col items-center justify-center rounded-2xl select-none"
        >
          <div className="relative flex items-center justify-center" style={{ width: 148, height: 148 }}>

            {/* Ripple rings on impact */}
            <AnimatePresence>
              {locked && [0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="absolute inset-0 rounded-full border border-violet-400/50"
                  initial={{ scale: 0.55, opacity: 0.75 }}
                  animate={{ scale: 2.5 + i * 0.45, opacity: 0 }}
                  transition={{ duration: 1.0, delay: i * 0.13, ease: 'easeOut' }}
                />
              ))}
            </AnimatePresence>

            {/* Soft glow */}
            <motion.div
              className="absolute rounded-full bg-violet-500/55 blur-2xl"
              style={{ inset: 22 }}
              animate={{ opacity: locked ? 1 : 0, scale: locked ? 1.5 : 0.1 }}
              transition={{ duration: 0.4 }}
            />

            {/* Lock body — scale-bounce "click" on impact */}
            <motion.div
              animate={locked ? { scale: [1, 0.86, 1.07, 1] } : { scale: 1 }}
              transition={locked ? { duration: 0.36, times: [0, 0.25, 0.65, 1] } : {}}
            >
              <svg width="92" height="92" viewBox="0 0 24 24" fill="none" strokeLinecap="round" strokeLinejoin="round">

                {/* Shackle — drops from raised position, spring gives natural swing/wobble */}
                <motion.g
                  animate={{ y: shackleClosed ? 0 : -9 }}
                  transition={{ type: 'spring', stiffness: 580, damping: 14, mass: 0.65 }}
                >
                  <motion.path
                    d="M7 11V7a5 5 0 0 1 10 0v4"
                    strokeWidth={1.85}
                    animate={{ stroke: shackleClosed ? '#a78bfa' : '#6b7280' }}
                    transition={{ duration: 0.22 }}
                  />
                </motion.g>

                {/* Opaque body fill — hides shackle posts inside body */}
                <rect x="3" y="11" width="18" height="11" rx="2" fill="#040412" />

                {/* Body glow fill */}
                <motion.rect
                  x="3" y="11" width="18" height="11" rx="2"
                  fill="rgba(139,92,246,0)"
                  animate={{ fill: locked ? 'rgba(139,92,246,0.13)' : 'rgba(139,92,246,0)' }}
                  transition={{ duration: 0.35 }}
                />

                {/* Body stroke */}
                <motion.rect
                  x="3" y="11" width="18" height="11" rx="2"
                  strokeWidth={1.85} fill="none"
                  animate={{ stroke: shackleClosed ? '#a78bfa' : '#6b7280' }}
                  transition={{ duration: 0.22 }}
                />

                {/* White flash ring on impact */}
                <AnimatePresence>
                  {shackleClosed && (
                    <motion.rect
                      key="flash"
                      x="3" y="11" width="18" height="11" rx="2"
                      fill="none"
                      initial={{ stroke: 'rgba(255,255,255,0.85)', strokeWidth: 3.5, opacity: 1 }}
                      animate={{ stroke: 'rgba(167,139,250,0)',    strokeWidth: 7,   opacity: 0 }}
                      transition={{ duration: 0.42, ease: 'easeOut' }}
                    />
                  )}
                </AnimatePresence>

                {/* Keyhole pops in */}
                <AnimatePresence>
                  {locked && (
                    <motion.g
                      initial={{ opacity: 0, scale: 0 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.07 }}
                      style={{ transformOrigin: '12px 16px', transformBox: 'fill-box' }}
                    >
                      <circle cx="12" cy="15.2" r="1.6" fill="#a78bfa" />
                      <rect x="10.9" y="16.1" width="2.2" height="2.4" rx="0.6" fill="#a78bfa" />
                    </motion.g>
                  )}
                </AnimatePresence>
              </svg>
            </motion.div>
          </div>

          {/* Text — phase stays 'locked' through exit, so text fades with the overlay */}
          <motion.div
            className="text-center mt-3 px-6"
            animate={{ opacity: locked ? 1 : 0, y: locked ? 0 : 10 }}
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
