import { startTransition, useEffect, useRef, useState } from 'react'

type QueryResult<TData> = { ok: true; data: TData } | { ok: false; error: string } | null

type VisibleState<TData> = {
  key: string
  value: TData
}

type QueryError = {
  key: string
  message: string
}

export function useStaleCachedQuery<TData>({
  cacheKey,
  cachedValue,
  refresh,
}: {
  cacheKey: string
  cachedValue: TData | null
  refresh: () => Promise<QueryResult<TData>>
}): {
  error: string | null
  isInitialLoading: boolean
  isQueryLoading: boolean
  isStaleLoading: boolean
  isShowingStaleValue: boolean
  visibleValue: TData | null
} {
  const [visible, setVisible] = useState<VisibleState<TData> | null>(() =>
    cachedValue === null ? null : { key: cacheKey, value: cachedValue },
  )
  const [loadingKey, setLoadingKey] = useState<string | null>(null)
  const [error, setError] = useState<QueryError | null>(null)
  const requestSeq = useRef(0)

  useEffect(() => {
    if (cachedValue === null) return
    setError((current) => (current?.key === cacheKey ? null : current))
    startTransition(() => {
      setVisible((current) =>
        current?.key === cacheKey && current.value === cachedValue
          ? current
          : { key: cacheKey, value: cachedValue },
      )
    })
  }, [cacheKey, cachedValue])

  useEffect(() => {
    let alive = true
    const seq = requestSeq.current + 1
    requestSeq.current = seq
    setError((current) => (current?.key === cacheKey ? null : current))
    setLoadingKey(cacheKey)

    refresh()
      .then((result) => {
        if (!alive || seq !== requestSeq.current || result === null) return
        if (!result.ok) {
          setError((current) =>
            current?.key === cacheKey && current.message === result.error
              ? current
              : { key: cacheKey, message: result.error },
          )
        }
      })
      .catch((err) => {
        if (!alive || seq !== requestSeq.current) return
        const message = String(err)
        setError((current) =>
          current?.key === cacheKey && current.message === message
            ? current
            : { key: cacheKey, message },
        )
      })
      .finally(() => {
        if (alive && seq === requestSeq.current) {
          setLoadingKey((current) => (current === cacheKey ? null : current))
        }
      })

    return () => {
      alive = false
    }
  }, [cacheKey, refresh])

  const currentError = error?.key === cacheKey ? error.message : null
  const isQueryLoading = loadingKey === cacheKey
  const isShowingStaleValue = visible !== null && visible.key !== cacheKey
  const isStaleLoading = isQueryLoading && isShowingStaleValue && cachedValue === null

  return {
    error: currentError,
    isInitialLoading: visible === null && currentError === null,
    isQueryLoading,
    isStaleLoading,
    isShowingStaleValue,
    visibleValue: visible?.value ?? null,
  }
}
