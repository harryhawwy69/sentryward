import { act, render, renderHook, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { MemoryRouter } from "react-router"
import { FindingsSection } from "./FindingsSection"
import { WalkthroughCard } from "./WalkthroughCard"
import {
  OVERVIEW_EXPANDED_KEY, readOverviewExpanded, saveOverviewExpanded, useOverviewExpanded,
} from "./overviewExpanded"
import type { Finding, ReviewResult } from "../types"
import { result as baseResult } from "@/test/fixtures"

beforeEach(() => localStorage.clear())
afterEach(() => localStorage.clear())

const walkthrough = (): NonNullable<ReviewResult["walkthrough"]> => ({
  overview: "Two files change.",
  fileSummaries: [{ path: "src/a.ts", summary: "Adds a helper." }],
  labels: [],
  estimatedEffort: 1,
  highLevelSummary: "Adds a helper and uses it.",
})

const finding = (fingerprint: string, bucket: Finding["bucket"] = "actionable"): Finding => ({
  file: "src/a.ts", startLine: 1, endLine: 2, severity: "major", category: "bug", kind: "finding",
  effort: "small", title: `Finding ${fingerprint}`, body: "Body", confidence: 0.8,
  evidence: "", evidenceNote: "", evidenceFiles: [], source: "llm", fingerprint, bucket,
})

// The shared fixture keeps every required ReviewResult field in one place.
const result = (findings: Finding[]): ReviewResult => ({ ...baseResult, findings })

function walkthroughTrigger() {
  return screen.getByRole("button", { name: /High-level summary/ })
}

describe("overview expand preference", () => {
  it("defaults to collapsed and round-trips a saved choice", () => {
    expect(readOverviewExpanded()).toBe(false)
    saveOverviewExpanded(true)
    expect(localStorage.getItem(OVERVIEW_EXPANDED_KEY)).toBe("true")
    expect(readOverviewExpanded()).toBe(true)
  })

  it("persists changes made through the hook", () => {
    const { result: hook } = renderHook(() => useOverviewExpanded())
    expect(hook.current[0]).toBe(false)
    act(() => hook.current[1](true))
    expect(hook.current[0]).toBe(true)
    expect(readOverviewExpanded()).toBe(true)
  })
})

describe("WalkthroughCard follows the global choice", () => {
  it("starts collapsed, opens with the global toggle and closes again", () => {
    const { rerender } = render(
      <WalkthroughCard walkthrough={walkthrough()} provider="github" files={[]} expanded={false} />,
    )
    expect(walkthroughTrigger()).toHaveAttribute("aria-expanded", "false")

    rerender(<WalkthroughCard walkthrough={walkthrough()} provider="github" files={[]} expanded />)
    expect(walkthroughTrigger()).toHaveAttribute("aria-expanded", "true")

    rerender(<WalkthroughCard walkthrough={walkthrough()} provider="github" files={[]} expanded={false} />)
    expect(walkthroughTrigger()).toHaveAttribute("aria-expanded", "false")
  })
})

describe("FindingsSection follows the global choice", () => {
  const renderSection = (expanded: boolean) =>
    render(
      <MemoryRouter>
        <FindingsSection result={result([finding("one"), finding("two", "nitpick")])} expanded={expanded} />
      </MemoryRouter>,
    )

  it("starts collapsed and opens every card with the global toggle", () => {
    const { rerender } = renderSection(false)
    const triggers = () => screen.getAllByRole("button", { name: /Finding (one|two)/ })
    expect(triggers().every((button) => button.getAttribute("aria-expanded") === "false")).toBe(true)

    rerender(
      <MemoryRouter>
        <FindingsSection result={result([finding("one"), finding("two", "nitpick")])} expanded />
      </MemoryRouter>,
    )
    expect(triggers().every((button) => button.getAttribute("aria-expanded") === "true")).toBe(true)
  })
})
