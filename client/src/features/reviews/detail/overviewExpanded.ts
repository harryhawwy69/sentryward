import { useCallback, useEffect, useState } from "react"

// One preference for the whole Overview: every walkthrough section and finding
// starts from it. A change made by hand on a single section stays local.
export const OVERVIEW_EXPANDED_KEY = "sentryward.reviewOverviewExpanded"

export function readOverviewExpanded(): boolean {
  try {
    return localStorage.getItem(OVERVIEW_EXPANDED_KEY) === "true"
  } catch {
    return false
  }
}

export function saveOverviewExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(OVERVIEW_EXPANDED_KEY, String(expanded))
  } catch {
    // Storage can be blocked; the choice still holds for this page.
  }
}

/** The saved global choice and a setter that persists it. Defaults to collapsed. */
export function useOverviewExpanded() {
  const [expanded, setExpanded] = useState(readOverviewExpanded)

  useEffect(() => {
    saveOverviewExpanded(expanded)
  }, [expanded])

  return [expanded, useCallback((next: boolean) => setExpanded(next), [])] as const
}
