import type { PrimitiveAtom } from 'jotai'
import { useAtomValue } from 'jotai'
import { useEffect, useState } from 'react'
import type { IpcChannel, IpcMethods, IpcResult } from '../../../shared/ipc-types'
import { store } from '../store'

type QueryChannel = {
  [TChannel in IpcChannel]: IpcMethods[TChannel]['args'] extends undefined ? TChannel : never
}[IpcChannel]

function invokeQuery<TChannel extends QueryChannel>(
  channel: TChannel,
): Promise<IpcResult<IpcMethods[TChannel]['result']>>
function invokeQuery(
  channel: QueryChannel,
): Promise<IpcResult<IpcMethods[QueryChannel]['result']>> {
  return window.api.invoke(channel)
}

export function useIpcQuery<TChannel extends QueryChannel>(
  channel: TChannel,
  atom: PrimitiveAtom<IpcMethods[TChannel]['result'] | null>,
  commit?: (data: IpcMethods[TChannel]['result']) => void,
): { data: IpcMethods[TChannel]['result'] | null; error: string | null; isLoading: boolean } {
  const data = useAtomValue(atom)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(data === null)

  useEffect(() => {
    let alive = true

    const fetchData = async () => {
      if (!window.api) {
        if (!alive) return
        setError('Desktop IPC is unavailable. Open VibeTime in the desktop app.')
        setIsLoading(false)
        return
      }

      try {
        const result = await invokeQuery(channel)
        if (!alive) return

        if (result.ok) {
          if (commit) {
            commit(result.data)
          } else {
            store.set(atom, result.data)
          }
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
  }, [channel, atom, commit])

  return { data, error, isLoading: isLoading && data === null }
}
