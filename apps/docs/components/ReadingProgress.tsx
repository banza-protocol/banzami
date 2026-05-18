'use client'

import { useEffect } from 'react'

export function ReadingProgress() {
  useEffect(() => {
    const bar = document.getElementById('reading-progress')
    if (!bar) return

    function update() {
      const scrollTop = window.scrollY
      const docHeight = document.documentElement.scrollHeight - window.innerHeight
      const progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0
      if (bar) bar.style.width = `${Math.min(100, progress)}%`
    }

    window.addEventListener('scroll', update, { passive: true })
    update()
    return () => window.removeEventListener('scroll', update)
  }, [])

  return <div id="reading-progress" style={{ width: '0%' }} />
}
