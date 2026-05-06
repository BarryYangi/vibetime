import { useEffect, useState } from 'react'
import { useAtomValue } from 'jotai'
import type { PrimitiveAtom } from 'jotai'
import { store } from '../store'

export function useIpcQuery<T>(
  channel: string,
  atom: PrimitiveAtom<T | null>,
): { data: T | null; error: string | null; isLoading: boolean } {
  const data = useAtomValue(atom)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(data === null)

  useEffect(() => {
    let alive = true

    const fetchData = async () => {
      if (!window.api) {
        if (!alive) return
        setError('Electron IPC is unavailable. Open vibetime in the desktop app.')
        setIsLoading(false)
        return
      }

      try {
        const result = await window.api.invoke(channel as never)
        if (!alive) return

        if (result.ok) {
          store.set(atom, result.data as T)
          setError(null)
        } else {
          setError(result.error)
        }
      } catch (err) {
        if (alive) setError(String(err))
      } finally {
        if (alive) setIsLoading(false)
      }
    }

    fetchData()
    return () => {
      alive = false
    }
  }, [channel, atom])

  return { data, error, isLoading: isLoading && data === null }
}
