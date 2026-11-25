import { useState } from "react"

const STORAGE_KEY = "sentryward:review-overview-expanded"

export type OverviewExpansion = {
  isExpanded: (key: string) => boolean
  setExpanded: (keys: readonly string[], expanded: boolean) => void
}

function readPreference() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true"
  } catch {
    return false
  }
}

export function useOverviewExpansion() {
  const [state, setState] = useState(() => ({
    expanded: readPreference(),
    overrides: new Map<string, boolean>(),
  }))

  const expansion: OverviewExpansion = {
    isExpanded: (key) => state.overrides.get(key) ?? state.expanded,
    setExpanded(keys, expanded) {
      setState((previous) => {
        const overrides = new Map(previous.overrides)
        for (const key of keys) {
          if (expanded === previous.expanded) overrides.delete(key)
          else overrides.set(key, expanded)
        }
        return { ...previous, overrides }
      })
    },
  }

  function setAll(expanded: boolean) {
    // Reset local exceptions even when the global choice hasn't changed.
    // Hidden findings and sections that arrive later use this choice too.
    setState({ expanded, overrides: new Map() })
    try {
      localStorage.setItem(STORAGE_KEY, String(expanded))
    } catch {
      // Storage restrictions must not prevent changing the current view.
    }
  }

  return { expansion, setAll }
}
