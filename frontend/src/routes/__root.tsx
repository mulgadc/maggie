import {
  createRootRoute,
  Link,
  Outlet,
  useLocation,
  useNavigate,
} from "@tanstack/react-router"

import { ActorMenu } from "@/components/actor-menu"
import { FilterBar } from "@/components/filter-bar"
import { IssueDetail } from "@/components/issue-detail"
import {
  type Filters,
  filtersToParams,
  type GroupMode,
  paramsToFilters,
  type TableSearch,
  toGroupMode,
  toSortDir,
  toSortKey,
} from "@/lib/filter"

interface RootSearch extends TableSearch {
  issue?: string
}

// str keeps a query param only when the URL actually carried a string.
/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof -- this is the URL parse boundary */
function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined
}
/* oxlint-enable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof */

export const Route = createRootRoute({
  // validateSearch is the parse boundary: the router hands over raw URL params
  // and every field is narrowed onto RootSearch here.
  // oxlint-disable-next-line anti-slop/no-unsafe-dictionary-type -- the router types the raw params this way
  validateSearch: (search: Record<string, unknown>): RootSearch => ({
    issue: str(search.issue),
    q: str(search.q),
    idg: str(search.idg),
    st: str(search.st),
    pri: search.pri === undefined ? undefined : Number(search.pri),
    type: str(search.type),
    asgn: str(search.asgn),
    lbl: str(search.lbl),
    sort: toSortKey(search.sort),
    dir: toSortDir(search.dir),
    group: toGroupMode(search.group),
  }),
  component: RootLayout,
})

const TABS = [
  { to: "/", label: "Dashboard" },
  { to: "/table", label: "Table" },
  { to: "/board", label: "Board" },
  { to: "/graph", label: "Graph" },
] as const

function RootLayout() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const search = Route.useSearch()
  const filters = paramsToFilters(search)

  const closeDetail = async () => {
    await navigate({ to: ".", search: (s) => ({ ...s, issue: undefined }) })
  }
  const openIssue = async (open: string) => {
    await navigate({ to: ".", search: (s) => ({ ...s, issue: open }) })
  }
  const onFilters = async (f: Filters) => {
    await navigate({
      to: ".",
      search: (s) => ({ ...s, ...filtersToParams(f) }),
    })
  }
  const groupMode: GroupMode = search.group ?? "none"
  const onGroupMode = async (m: GroupMode) => {
    await navigate({
      to: ".",
      search: (s) => ({ ...s, group: m === "none" ? undefined : m }),
    })
  }

  const showFilters = pathname !== "/"
  const isTable = pathname === "/table"

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-line bg-bg px-5 py-3">
        <div className="flex items-center gap-3">
          <img
            src="/maggie.png"
            alt="maggie"
            className="h-20 w-auto rounded-lg object-contain"
          />
          <div className="flex flex-col leading-none">
            <h1 className="font-display text-4xl text-accent lowercase">
              maggie
            </h1>
            <span className="mt-1.5 text-xs tracking-[0.2em] text-muted lowercase [text-align-last:justify]">
              bead enthusiast
            </span>
          </div>
        </div>
        <nav className="-mb-3 ml-auto flex items-stretch gap-1 self-stretch">
          {TABS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              search={(s: RootSearch) => s}
              className="flex items-center border-b-2 border-transparent px-4 text-sm font-medium text-muted transition-colors hover:text-text [&.active]:border-accent [&.active]:text-accent"
              activeOptions={{ exact: t.to === "/" }}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <div className="self-center">
          <ActorMenu />
        </div>
      </header>
      {showFilters ? (
        <FilterBar
          filters={filters}
          onChange={onFilters}
          groupMode={isTable ? groupMode : undefined}
          onGroupMode={isTable ? onGroupMode : undefined}
        />
      ) : null}
      <main className="flex-1 overflow-auto p-5">
        <Outlet />
      </main>
      <IssueDetail
        id={search.issue ?? ""}
        onSelect={openIssue}
        onClose={closeDetail}
      />
    </div>
  )
}
