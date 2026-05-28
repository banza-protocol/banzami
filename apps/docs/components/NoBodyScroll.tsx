'use client'

import { useEffect } from 'react'

export function NoBodyScroll() {
  useEffect(() => {
    document.documentElement.style.overflowY = 'hidden'
    return () => { document.documentElement.style.overflowY = '' }
  }, [])
  return null
}
