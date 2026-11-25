import { describe, expect, it, vi } from "vitest"
import { screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { App } from "@/App"
import { mockApi } from "@/test/apiRoutes"
import { detail } from "@/test/fixtures"
import { renderWithProviders } from "@/test/renderWithProviders"

vi.mock("@/components/MermaidDiagram", () => ({
  MermaidDiagram: () => <div>Sequence diagram content</div>,
}))

const sectionNames = [
  "Risky areas",
  "Changed files",
  "High-level summary",
  "Sequence diagram",
  "Linked issues",
  "Possibly related issues",
]

async function openOverview(id = detail.id) {
  const review = {
    ...detail,
    id,
    result: {
      ...detail.result!,
      walkthrough: {
        ...detail.result!.walkthrough!,
        fileSummaries: [{ path: "src/app.ts", summary: "Updates the application" }],
        highLevelSummary: "A detailed summary",
        sequenceDiagram: "graph TD; A-->B",
        riskyAreas: [{ kind: "auth" as const, path: "src/app.ts", reason: "Changes an authorization check" }],
        linkedIssues: [{ ref: "#10", title: "Original request", assessment: "addressed" as const }],
        relatedIssues: [{ ref: "#11", title: "Related request", reason: "Same component" }],
      },
    },
  }
  mockApi({ [`GET /api/reviews/${id}`]: { review } })
  const rendered = renderWithProviders(<App />, { route: `/reviews/${id}?view=overview` })
  await screen.findByText("Adds b and c.")
  return rendered
}

function triggers() {
  return [
    ...sectionNames.map((name) =>
      within(screen.getByRole("region", { name })).getByRole("button", { name: new RegExp(`^${name}`) }),
    ),
    ...["SQL injection in search", "Rename c", "Caller ignores result"].map((name) =>
      screen.getByRole("button", { name: new RegExp(name) }),
    ),
  ]
}

function expectAllExpanded(expanded: boolean) {
  for (const trigger of triggers()) expect(trigger).toHaveAttribute("aria-expanded", String(expanded))
}

function globalButton(name: "Expand all" | "Collapse all") {
  return within(screen.getByRole("toolbar", { name: "Overview sections" })).getByRole("button", { name })
}

describe("Overview expansion", () => {
  it("starts every walkthrough section and finding collapsed", async () => {
    await openOverview()
    expectAllExpanded(false)
  })

  it("expands and collapses every section, including after individual changes", async () => {
    await openOverview()
    await userEvent.click(globalButton("Expand all"))
    expectAllExpanded(true)

    await userEvent.click(triggers()[0])
    await userEvent.click(screen.getByRole("button", { name: /SQL injection in search/ }))
    await userEvent.click(globalButton("Expand all"))
    expectAllExpanded(true)

    await userEvent.click(globalButton("Collapse all"))
    expectAllExpanded(false)
    await userEvent.click(triggers()[0])
    await userEvent.click(globalButton("Collapse all"))
    expectAllExpanded(false)
  })

  it("remembers the global choice across reviews and reloads, not individual toggles", async () => {
    const first = await openOverview()
    await userEvent.click(globalButton("Expand all"))
    await userEvent.click(triggers()[0])
    await userEvent.click(screen.getByRole("button", { name: /SQL injection in search/ }))
    first.unmount()

    const second = await openOverview("another-review")
    expectAllExpanded(true)
    await userEvent.click(globalButton("Collapse all"))
    await userEvent.click(triggers()[0])
    second.unmount()

    await openOverview("another-review")
    expectAllExpanded(false)
  })

  it("applies the global choice to findings hidden by a filter too", async () => {
    await openOverview()
    const toolbar = screen.getByRole("toolbar", { name: "Filter findings" })
    await userEvent.click(within(toolbar).getByRole("button", { name: /critical/ }))
    await userEvent.click(globalButton("Expand all"))
    await userEvent.click(within(toolbar).getByRole("button", { name: "Clear filters" }))
    expectAllExpanded(true)
  })

  it("keeps the findings toolbar scoped to visible findings without changing the saved choice", async () => {
    const first = await openOverview()
    const toolbar = screen.getByRole("toolbar", { name: "Filter findings" })
    await userEvent.click(within(toolbar).getByRole("button", { name: /critical/ }))
    await userEvent.click(within(toolbar).getByRole("button", { name: "Expand all" }))
    expect(screen.getByRole("button", { name: /SQL injection in search/ })).toHaveAttribute("aria-expanded", "true")
    expect(triggersForWalkthrough()).toEqual(Array(6).fill("false"))
    await userEvent.click(within(toolbar).getByRole("button", { name: "Clear filters" }))
    expect(screen.getByRole("button", { name: /Rename c/ })).toHaveAttribute("aria-expanded", "false")
    first.unmount()

    await openOverview()
    expectAllExpanded(false)
  })

  it("still changes the current view when saving the preference is unavailable", async () => {
    await openOverview()
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage is unavailable", "SecurityError")
    })
    await userEvent.click(globalButton("Expand all"))
    expectAllExpanded(true)
    await userEvent.click(globalButton("Collapse all"))
    expectAllExpanded(false)
  })
})

function triggersForWalkthrough() {
  return sectionNames.map((name) =>
    within(screen.getByRole("region", { name }))
      .getByRole("button", { name: new RegExp(`^${name}`) })
      .getAttribute("aria-expanded"),
  )
}
