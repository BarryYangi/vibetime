import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'
import type { AppTheme } from '../../shared/ipc-types'
import { appPreferencesAtom } from './store'

export type ResolvedColorScheme = 'light' | 'dark'

const DARK_MODE_QUERY = '(prefers-color-scheme: dark)'

function systemPrefersDark(): boolean {
  return window.matchMedia(DARK_MODE_QUERY).matches
}

export function resolveColorScheme(theme: AppTheme | undefined, systemDark: boolean) {
  if (theme === 'dark') return 'dark'
  if (theme === 'light') return 'light'
  return systemDark ? 'dark' : 'light'
}

export function useResolvedColorScheme(): ResolvedColorScheme {
  const preferences = useAtomValue(appPreferencesAtom)
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    const media = window.matchMedia(DARK_MODE_QUERY)
    const onChange = () => setSystemDark(media.matches)
    onChange()
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return resolveColorScheme(preferences?.theme, systemDark)
}
