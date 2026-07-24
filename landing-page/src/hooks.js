import { useEffect, useRef, useState } from 'react'

/** True when the visitor asked the OS to cut animation. Drives every motion opt-out. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return reduced
}

/** Reveals every `[data-reveal]` once it enters the viewport, then stops watching it. */
export function useReveal() {
  useEffect(() => {
    const targets = document.querySelectorAll('[data-reveal]')
    if (!('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-in'))
      return undefined
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return
          entry.target.classList.add('is-in')
          observer.unobserve(entry.target)
        })
      },
      { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
    )

    targets.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])
}

/**
 * Single rAF-throttled scroll reader feeding the header state, the read-progress
 * bar (`--scroll-p`) and the hero parallax (`--p`). One listener for all three so
 * nothing else has to touch `scroll`.
 */
export function useScrollFx(heroRef) {
  const [scrolled, setScrolled] = useState(false)
  const frame = useRef(0)

  useEffect(() => {
    const root = document.documentElement

    const read = () => {
      frame.current = 0
      const y = window.scrollY
      const scrollable = Math.max(1, root.scrollHeight - window.innerHeight)
      root.style.setProperty('--scroll-p', String(Math.min(1, y / scrollable)))
      setScrolled(y > 40)

      const hero = heroRef.current
      if (hero) hero.style.setProperty('--p', String(Math.min(1, y / Math.max(1, window.innerHeight * 0.9))))
    }

    const onScroll = () => {
      if (frame.current) return
      frame.current = requestAnimationFrame(read)
    }

    read()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [heroRef])

  return scrolled
}

/** Index of the `[data-step]` currently crossing the middle of the viewport. */
export function useActiveStep() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const steps = Array.from(document.querySelectorAll('[data-step]'))
    if (!steps.length || !('IntersectionObserver' in window)) return undefined

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActive(Number(entry.target.dataset.step))
        })
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    )

    steps.forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return active
}

/** Feeds the cursor position into `--mx`/`--my` for the card spotlight. */
export function spotlight(event) {
  const rect = event.currentTarget.getBoundingClientRect()
  event.currentTarget.style.setProperty('--mx', `${event.clientX - rect.left}px`)
  event.currentTarget.style.setProperty('--my', `${event.clientY - rect.top}px`)
}
