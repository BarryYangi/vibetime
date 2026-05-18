'use client'

import type React from 'react'
import { createContext, useCallback, useContext, useEffect, useState } from 'react'

// Helper function to determine if a color is light or dark
function isLightColor(hex: string): boolean {
  const rgb = parseInt(hex.slice(1), 16)
  const r = (rgb >> 16) & 0xff
  const g = (rgb >> 8) & 0xff
  const b = (rgb >> 0) & 0xff
  const brightness = (r * 299 + g * 587 + b * 114) / 1000
  return brightness > 128
}

// Derive a selection highlight color from a hex background color.
// Preserves hue and saturation, adjusts lightness, and adds transparency.
// For achromatic colors (white/black/gray), returns a transparent gray.
function getSelectionColor(hex: string, isDark: boolean): string {
  const rgb = parseInt(hex.slice(1), 16)
  const r = ((rgb >> 16) & 0xff) / 255
  const g = ((rgb >> 8) & 0xff) / 255
  const b = (rgb & 0xff) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min

  let h = 0
  let s = 0

  if (d > 0) {
    s = max === 0 ? 0 : d / max
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
    else if (max === g) h = ((b - r) / d + 2) / 6
    else h = ((r - g) / d + 4) / 6
  }

  // If saturation is very low, treat as achromatic
  if (s < 0.08) {
    return isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(0, 0, 0, 0.15)'
  }

  // Compute background lightness to push selection away from it
  const bgLightness = (max + min) / 2
  const lightness = bgLightness > 0.5 ? 35 : 75
  const satPct = Math.min(Math.round(s * 100), 70)
  const hueDeg = Math.round(h * 360)
  return `hsla(${hueDeg}, ${satPct}%, ${lightness}%, 0.35)`
}

export type ThemeMode = 'light' | 'dark' | 'custom'

export interface ThemeState {
  mode: ThemeMode
  color: string
}

interface ThemeContextType {
  themeState: ThemeState
  updateTheme: (newTheme: ThemeState) => void
  shouldUseDarkText: () => boolean
  getBackgroundColor: () => string
  getTextColorClass: () => string
  getLinkColorClass: () => string
  getMutedTextClass: () => string
  getMutedHoverClass: () => string
  getBorderColorClass: () => string
  isHydrated: boolean
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

// Default theme
const DEFAULT_THEME: ThemeState = {
  mode: 'light',
  color: '#fafafa',
}

// Helper function to get initial theme (handles SSR)
function getInitialTheme(): ThemeState {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME
  }

  try {
    const savedTheme = localStorage.getItem('theme')
    if (savedTheme) {
      return JSON.parse(savedTheme)
    }
  } catch (error) {
    console.error('Failed to parse saved theme:', error)
  }

  return DEFAULT_THEME
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeState, setThemeState] = useState<ThemeState>(DEFAULT_THEME)
  const [isHydrated, setIsHydrated] = useState(false)

  // Load theme from localStorage on client-side hydration
  useEffect(() => {
    const initialTheme = getInitialTheme()
    setThemeState(initialTheme)
    setIsHydrated(true)
  }, [])

  // Helper functions for styling
  const shouldUseDarkText = useCallback(() => {
    if (themeState.mode === 'light') return true
    if (themeState.mode === 'dark') return false
    return isLightColor(themeState.color)
  }, [themeState.color, themeState.mode])

  const getBackgroundColor = useCallback(() => {
    if (themeState.mode === 'light') return '#fafafa'
    if (themeState.mode === 'dark') return '#0a0a0a'
    return themeState.color
  }, [themeState.color, themeState.mode])

  // Update document background color whenever theme changes
  useEffect(() => {
    if (typeof window !== 'undefined' && isHydrated) {
      const backgroundColor = getBackgroundColor()
      document.body.style.backgroundColor = backgroundColor

      // Also set it on html element as backup
      document.documentElement.style.backgroundColor = backgroundColor

      // Set a CSS custom property for other uses
      document.documentElement.style.setProperty('--theme-background', backgroundColor)

      // Set selection highlight color based on theme
      const selectionColor = getSelectionColor(backgroundColor, !shouldUseDarkText())
      document.documentElement.style.setProperty('--theme-selection', selectionColor)
    }
  }, [getBackgroundColor, isHydrated, shouldUseDarkText])

  // Update theme and save to localStorage
  const updateTheme = (newTheme: ThemeState) => {
    setThemeState(newTheme)
    if (typeof window !== 'undefined') {
      localStorage.setItem('theme', JSON.stringify(newTheme))
    }
  }

  const getTextColorClass = () => {
    return shouldUseDarkText() ? 'text-neutral-950' : 'text-white'
  }

  const getLinkColorClass = () => {
    return shouldUseDarkText()
      ? 'border-neutral-950/20 hover:border-neutral-950/30 focus-visible:outline-none focus-visible:bg-neutral-950/10'
      : 'border-white/20 hover:border-white/30 focus-visible:outline-none focus-visible:bg-white/20'
  }

  const getMutedTextClass = () => {
    return shouldUseDarkText() ? 'text-neutral-950/50' : 'text-white/60'
  }

  const getMutedHoverClass = () => {
    return shouldUseDarkText()
      ? 'hover:text-neutral-950 transition-colors'
      : 'hover:text-white transition-colors'
  }

  const getBorderColorClass = () => {
    return shouldUseDarkText() ? 'border-neutral-950/[7%]' : 'border-white/[7%]'
  }

  const value: ThemeContextType = {
    themeState,
    updateTheme,
    shouldUseDarkText,
    getBackgroundColor,
    getTextColorClass,
    getLinkColorClass,
    getMutedTextClass,
    getMutedHoverClass,
    getBorderColorClass,
    isHydrated,
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider')
  }
  return context
}
