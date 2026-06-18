import { useEffect, useRef } from 'react'

// Katakana + digits — angular and "digital" looking like the film
const CHARS =
  'アイウエオカキクグケゲコゴサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン' +
  '0123456789ABCDEF'

// Column speeds vary so streams feel independent
const randSpeed = () => 0.4 + Math.random() * 0.9

export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const FS = 14 // font size / column width in px
    let cols: number[] = []
    let speeds: number[] = []
    let animId: number
    let lastTime = 0

    const reset = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
      const count = Math.floor(canvas.width / FS)
      cols = Array.from({ length: count }, () =>
        // Stagger initial positions so not everything starts at once
        Math.floor(Math.random() * -(canvas.height / FS) * 2)
      )
      speeds = Array.from({ length: count }, randSpeed)
      // Paint an opaque background so first frames look correct
      ctx.fillStyle = '#07071a'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    reset()
    window.addEventListener('resize', reset)

    const draw = (time: number) => {
      animId = requestAnimationFrame(draw)
      if (time - lastTime < 55) return // ~18 fps — enough for smooth rain
      lastTime = time

      // Semi-transparent overlay creates the fading "comet tail" effect.
      // Lower alpha = longer trail; 0.065 gives ~1.5 s of visible history.
      ctx.fillStyle = 'rgba(7,7,26,0.065)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      ctx.font = `${FS}px monospace`

      for (let i = 0; i < cols.length; i++) {
        const y = Math.floor(cols[i]) * FS
        if (y < 0) {
          cols[i] += speeds[i]
          continue
        }

        const x = i * FS
        const char = CHARS[Math.floor(Math.random() * CHARS.length)]

        // Lead character: near-white violet so it "glows"
        ctx.fillStyle = '#ede9fe' // violet-100
        ctx.fillText(char, x, y)

        cols[i] += speeds[i]

        // Reset column after it leaves the screen, with a random delay
        // so columns restart at different times (makes rain feel organic)
        if (y > canvas.height && Math.random() > 0.978) {
          cols[i] = Math.floor(Math.random() * -40)
          speeds[i] = randSpeed()
        }
      }
    }

    animId = requestAnimationFrame(draw)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', reset)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        opacity: 0.28, // subtle — doesn't compete with content
      }}
    />
  )
}
