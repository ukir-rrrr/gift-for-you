import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState, type ReactNode } from 'react'
import { Api, type Published } from '../lib/api'
import { emptyDraft, reduceDraft, type Draft, type DraftAction } from '../lib/draft'
import { loadDraft, photoDataUrl, saveDraft, type KV } from '../lib/storage'
import { API_ORIGIN } from '../native/config'
import { deviceKey } from '../native/device'
import { kv as defaultKv } from '../native/kv'

export type PublishedGift = Published & { giftId: string; toName: string }

type AppState = {
  draft: Draft
  dispatch: (action: DraftAction) => void
  /**
   * The draft as of now. Hidden stack screens are frozen and keep rendering an older draft, so
   * actions that start work (upload, publish) read it from here instead of their closure.
   */
  latestDraft: () => Draft
  /** False until the saved draft has been read, so nothing overwrites it on start. */
  loaded: boolean
  saving: boolean
  kv: KV
  api: Api
  /** The last publish result. The revoke code lives only here and on screen; it is never written to storage. */
  published: PublishedGift | null
  setPublished: (gift: PublishedGift | null) => void
}

const AppContext = createContext<AppState | null>(null)

const SAVE_DELAY_MS = 300

function reducer(draft: Draft, action: DraftAction): Draft {
  return reduceDraft(draft, action)
}

export function AppProvider({ children, kv = defaultKv }: { children: ReactNode; kv?: KV }) {
  const [draft, dispatch] = useReducer(reducer, undefined, () => emptyDraft())
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [published, setPublished] = useState<PublishedGift | null>(null)
  const api = useMemo(() => new Api(API_ORIGIN, deviceKey), [])
  const skipNextSave = useRef(true)
  const latest = useRef(draft)
  useLayoutEffect(() => {
    latest.current = draft
  }, [draft])
  const latestDraft = useCallback(() => latest.current, [])

  useEffect(() => {
    let alive = true
    void loadDraft(kv).then((saved) => {
      if (!alive) return
      if (saved) dispatch({ type: 'reset', draft: saved })
      setLoaded(true)
    })
    return () => {
      alive = false
    }
  }, [kv])

  // F2-07: every change is written to the device shortly after it happens.
  useEffect(() => {
    if (!loaded) return
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }
    setSaving(true)
    const timer = setTimeout(() => {
      void saveDraft(kv, draft)
        .catch(() => undefined)
        .finally(() => setSaving(false))
    }, SAVE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [draft, kv, loaded])

  const value = useMemo(
    () => ({ draft, dispatch, latestDraft, loaded, saving, kv, api, published, setPublished }),
    [draft, latestDraft, loaded, saving, kv, api, published],
  )
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppState {
  const state = useContext(AppContext)
  if (!state) throw new Error('useApp outside AppProvider')
  return state
}

/** Data URLs for the given photo refs, reloaded when the list changes. */
export function usePhotoUrls(refs: readonly string[]): Record<string, string> {
  const { kv } = useApp()
  const [urls, setUrls] = useState<Record<string, string>>({})
  const key = refs.join('|')
  const load = useCallback(async () => {
    const next: Record<string, string> = {}
    for (const ref of key ? key.split('|') : []) {
      const url = await photoDataUrl(kv, ref)
      if (url) next[ref] = url
    }
    return next
  }, [key, kv])
  useEffect(() => {
    let alive = true
    void load().then((next) => {
      if (alive) setUrls(next)
    })
    return () => {
      alive = false
    }
  }, [load])
  return urls
}
