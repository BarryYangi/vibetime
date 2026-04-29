import { useEffect } from 'react'
import { useAtomValue } from 'jotai'
import type { Atom } from 'jotai'
import { store, handlePush } from '../store'

export function useIpcQuery<T>(channel: string, atom: Atom<T>): T {
  const data = useAtomValue(atom)

  useEffect(() => {
    // Initial fetch
    window.api.invoke(channel as never).then((result) => {
      if (result.ok) {
        store.set(atom as never, result.data)
      }
    })

    // Subscribe to push events
    const unsubscribe = window.api.onPush(handlePush)
    return unsubscribe
  }, [channel, atom])

  return data
}
