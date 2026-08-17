import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'

const margin = 12
const mobileBreakpoint = 640

/**
 * Places a context menu next to the pointer without letting it run off the screen.
 *
 * The menu is measured after it renders rather than assumed: a hard-coded height guess is
 * wrong the moment the menu gains or loses an item, and the menu then gets clipped at the
 * bottom of the window. Below the breakpoint the menu becomes a bottom sheet instead.
 */
export function useAnchoredMenu(x: number, y: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [placement, setPlacement] = useState<{ left: number; top: number } | null>(null)
  const isDesktop = typeof window === 'undefined' || window.innerWidth >= mobileBreakpoint

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || !isDesktop) return
    const { offsetWidth: width, offsetHeight: height } = element
    const left = Math.max(margin, Math.min(x, window.innerWidth - width - margin))
    // Prefer opening downwards, flip above the pointer when that would overflow, and clamp
    // for the case where the menu is taller than the viewport in both directions.
    const opensDownward = y + height + margin <= window.innerHeight
    const top = opensDownward ? y : Math.max(margin, Math.min(y - height, window.innerHeight - height - margin))
    setPlacement({ left, top })
  }, [x, y, isDesktop])

  const style: CSSProperties = isDesktop
    ? { position: 'fixed', left: placement?.left ?? x, top: placement?.top ?? y, visibility: placement ? 'visible' : 'hidden' }
    : { position: 'fixed', insetInline: '0.75rem', bottom: '0.75rem' }

  return { ref, style }
}
