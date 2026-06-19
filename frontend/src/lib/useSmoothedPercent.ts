import { useEffect, useRef, useState } from 'react'

// Continuously eases the displayed value toward `target` via requestAnimationFrame,
// so progress rings glide smoothly instead of jumping on every (possibly sparse) update.
export function useSmoothedPercent(target: number, speed = 8): number {
  const [value, setValue] = useState(target)
  const valueRef = useRef(target)
  const targetRef = useRef(target)
  targetRef.current = target

  useEffect(() => {
    let raf = 0
    let last = performance.now()

    const step = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.1)
      last = now
      const diff = targetRef.current - valueRef.current
      valueRef.current += Math.abs(diff) < 0.05 ? diff : diff * Math.min(1, speed * dt)
      setValue(valueRef.current)
      raf = requestAnimationFrame(step)
    }

    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [speed])

  return value
}
