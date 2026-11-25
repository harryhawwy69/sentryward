import type { ReactNode } from "react"
import { AlertTriangle, ShieldCheck } from "lucide-react"
import { Link } from "react-router"
import { TablePagination } from "@/components/TablePagination"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SeverityBadge } from "@/features/reviews/badges"
import { paginate, usePagination } from "@/hooks/use-pagination"
import { plural } from "@/lib/plural"
import { cn } from "@/lib/utils"
import { useFindingStats } from "./api"
import { CATEGORY_LABEL } from "./options"
import type { FalsePositiveRow, FindingCategory } from "./types"

// Below this a rate is mostly noise: one dismissal out of two reads as 50%.
export const MIN_FOUND = 5
// At or above this a row earns a hint at the setting that would quiet it.
export const NOISY_RATE = 30

// Only the model and rule tables paginate: they get a row per model and per
// .sentryward.yaml rule seen, with no upper bound. Category (at most 10 values)
// and severity (5) always fit the smallest page, where controls would only
// ever read "Page 1 of 1". The prefixes stay clear of the list's ?fp params.
// Exported for the repository filter, which scopes these tables and so resets them.
export const MODEL_PAGINATION = "fpModel"
export const RULE_PAGINATION = "fpRule"

type Hint = { text: string; to: string }

interface Group<K> {
  label: string
  // Pages the table under ?<prefix>Page= and ?<prefix>Size=; without one it lists every row.
  prefix?: string
  rows: FalsePositiveRow<K>[]
  name: (key: K) => ReactNode
  hint: (key: K) => Hint | null
}

type TableProps<K> = Omit<Group<K>, "prefix">

function hintLink(hint: Hint | null) {
  if (!hint) return null
  return (
    <Link to={hint.to} className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
      {hint.text}
    </Link>
  )
}

function BreakdownTable<K>({ label, rows, name, hint }: TableProps<K>) {
  return (
    <Table aria-label={`False positives by ${label.toLowerCase()}`}>
      <TableHeader>
        <TableRow>
          <TableHead>{label}</TableHead>
          <TableHead className="text-right">Found</TableHead>
          <TableHead className="text-right">False positives</TableHead>
          <TableHead className="text-right">Rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={String(row.key)}>
            <TableCell>
              <div className="flex flex-col items-start gap-0.5">
                {name(row.key)}
                {row.rate !== null && row.rate >= NOISY_RATE && hintLink(hint(row.key))}
              </div>
            </TableCell>
            <TableCell className="text-right tabular-nums">{row.found}</TableCell>
            <TableCell className="text-right tabular-nums">{row.falsePositives}</TableCell>
            <TableCell className="text-right tabular-nums">{row.rate === null ? "-" : `${row.rate}%`}</TableCell>
          </TableRow>
        ))}
        {rows.length === 0 && (
          <TableRow>
            <TableCell colSpan={4} className="text-muted-foreground">
              Not enough findings yet
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}

// Its own component so the pagination hook only runs for the tables that page.
function PagedBreakdownTable<K>({ prefix, rows, ...table }: TableProps<K> & { prefix: string }) {
  const pagination = usePagination(prefix)
  // paginate clamps, so the page holds rows whenever there are any.
  const page = paginate(rows, pagination.page, pagination.size)
  return (
    <>
      <BreakdownTable {...table} rows={page.rows} />
      {rows.length > 0 && (
        <TablePagination
          page={page.page}
          size={pagination.size}
          total={page.total}
          onPageChange={pagination.setPage}
          onSizeChange={pagination.setSize}
        />
      )}
    </>
  )
}

function GroupTable<K>({ prefix, rows, ...table }: Group<K>) {
  // Pages hold the shown rows only; the hidden note counts the whole set.
  const shown = rows.filter((row) => row.found >= MIN_FOUND)
  const hidden = rows.length - shown.length
  return (
    <div className="flex flex-col gap-2">
      {prefix ? <PagedBreakdownTable {...table} prefix={prefix} rows={shown} /> : <BreakdownTable {...table} rows={shown} />}
      {hidden > 0 && (
        <p className="text-xs text-muted-foreground">
          {hidden} {hidden === 1 ? "row" : "rows"} with fewer than {MIN_FOUND} findings hidden
        </p>
      )}
    </div>
  )
}

// The config page opens a repository's own settings with ?repo=, so a repo
// with settings of its own gets the hint where it would take effect.
function configLink(tab: "findings" | "llm", repoId?: string) {
  const search = new URLSearchParams({ tab })
  if (repoId) search.set("repo", repoId)
  return `/configuration?${search}`
}

// Like a noisy critical, noise in these needs a better prompt, not a setting:
// turning them off would hide the findings a review exists for.
const KEEP_CATEGORIES: ReadonlySet<FindingCategory | "other"> = new Set(["security", "bug", "logic", "reliability"])

function categoryLabel(key: FindingCategory | "other") {
  return key === "other" ? "Other" : CATEGORY_LABEL[key]
}

function categoryHint(key: FindingCategory | "other", repoId?: string): Hint | null {
  // Categories the engine no longer emits have no setting to point at.
  if (key === "other") return null
  if (KEEP_CATEGORIES.has(key)) return { text: "Raise the minimum confidence", to: configLink("findings", repoId) }
  return { text: `Drop ${categoryLabel(key)} from the reviewed categories`, to: configLink("findings", repoId) }
}

interface FalsePositiveBreakdownProps {
  // Scopes the breakdown (and its hints) to one repository.
  repoId?: string
  repoName?: string | null
}

// Where the overall false-positive rate comes from, with a pointer to the
// setting that would quiet the noisiest groups. Shares the stats query with
// the cards when unscoped. It is the whole of its tab, so loading, failure
// and no data each get a state of their own rather than an empty tab.
export function FalsePositiveBreakdown({ repoId, repoName }: FalsePositiveBreakdownProps) {
  const { data, isPending, isError } = useFindingStats(repoId)
  if (isPending) return <Skeleton className="h-64 w-full" />
  if (isError)
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Could not load false-positive stats.</AlertTitle>
      </Alert>
    )
  if (data.found === 0)
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ShieldCheck />
          </EmptyMedia>
          <EmptyTitle>No findings yet</EmptyTitle>
          <EmptyDescription>
            No findings were first seen in the last {plural(data.days, "day")}{repoName ? ` in ${repoName}` : ""}, so there is
            nothing to break down.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )

  const by = data.falsePositivesBy
  return (
    <Card aria-label="False positive breakdown" role="region">
      <CardHeader>
        <CardTitle>Where false positives come from</CardTitle>
        <CardDescription>
          Findings first seen in the last {plural(data.days, "day")}{repoName ? ` in ${repoName}` : ""}, ignored ones included.
        </CardDescription>
      </CardHeader>
      {/* The rule table only appears for repositories with rules, so the grid makes room for it then. */}
      <CardContent className={cn("grid gap-6", by.rule.length > 0 ? "lg:grid-cols-2" : "lg:grid-cols-3")}>
        <GroupTable
          label="Category"
          rows={by.category}
          name={categoryLabel}
          hint={(key) => categoryHint(key, repoId)}
        />
        <GroupTable
          label="Severity"
          rows={by.severity}
          name={(key) => <SeverityBadge severity={key} />}
          // Low-severity noise is what the confidence and severity floors are for;
          // a noisy critical needs a better prompt, not a setting.
          hint={(key) =>
            key === "minor" || key === "info"
              ? { text: "Raise the minimum confidence or severity floor", to: configLink("findings", repoId) }
              : null
          }
        />
        <GroupTable
          label="Model"
          prefix={MODEL_PAGINATION}
          rows={by.model}
          name={(key) => (key === null ? <span className="text-muted-foreground">Analyzer or unrecorded</span> : <code className="text-xs">{key}</code>)}
          hint={(key) => (key === null ? null : { text: "Try another model", to: configLink("llm", repoId) })}
        />
        {by.rule.length > 0 && (
          <GroupTable
            label="Rule"
            prefix={RULE_PAGINATION}
            rows={by.rule}
            name={(key) => <code className="text-xs">{key}</code>}
            // Rules live in the repository's .sentryward.yaml, which no setting here can change.
            hint={() => null}
          />
        )}
      </CardContent>
    </Card>
  )
}
