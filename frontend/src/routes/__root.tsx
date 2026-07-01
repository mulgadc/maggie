import { createRootRoute, Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";

import { ActorMenu } from "@/components/actor-menu";
import { FilterBar } from "@/components/filter-bar";
import { IssueDetail } from "@/components/issue-detail";
import {
  type Filters,
  filtersToParams,
  type GroupMode,
  paramsToFilters,
  type TableSearch,
} from "@/lib/filter";

interface RootSearch extends TableSearch {
  issue?: string;
}

export const Route = createRootRoute({
  validateSearch: (search: Record<string, unknown>): RootSearch => ({
    issue: typeof search.issue === "string" ? search.issue : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
    idg: typeof search.idg === "string" ? search.idg : undefined,
    st: typeof search.st === "string" ? search.st : undefined,
    pri: search.pri === undefined ? undefined : Number(search.pri),
    type: typeof search.type === "string" ? search.type : undefined,
    asgn: typeof search.asgn === "string" ? search.asgn : undefined,
    lbl: typeof search.lbl === "string" ? search.lbl : undefined,
    sort: typeof search.sort === "string" ? (search.sort as TableSearch["sort"]) : undefined,
    dir: search.dir === "desc" ? "desc" : search.dir === "asc" ? "asc" : undefined,
    group:
      search.group === "epic" || search.group === "label" ? (search.group as GroupMode) : undefined,
  }),
  component: RootLayout,
});

const TABS = [
  { to: "/", label: "Dashboard" },
  { to: "/table", label: "Table" },
  { to: "/board", label: "Board" },
  { to: "/ready", label: "Ready" },
  { to: "/graph", label: "Graph" },
] as const;

function RootLayout() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const search = Route.useSearch();
  const filters = paramsToFilters(search);

  const closeDetail = () => navigate({ to: ".", search: (s) => ({ ...s, issue: undefined }) });
  const openIssue = (open: string) => navigate({ to: ".", search: (s) => ({ ...s, issue: open }) });
  const onFilters = (f: Filters) =>
    navigate({ to: ".", search: (s) => ({ ...s, ...filtersToParams(f) }) });
  const groupMode: GroupMode = search.group ?? "none";
  const onGroupMode = (m: GroupMode) =>
    navigate({ to: ".", search: (s) => ({ ...s, group: m === "none" ? undefined : m }) });

  const showFilters = pathname !== "/";
  const isTable = pathname === "/table";

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-line border-b bg-bg px-5 py-3">
        <div className="flex items-center gap-3">
          <img src="/maggie.png" alt="maggie" className="h-20 w-auto rounded-lg object-contain" />
          <div className="flex flex-col leading-none">
            <h1 className="font-display text-4xl text-accent lowercase">maggie</h1>
            <span className="mt-1.5 text-muted text-xs lowercase tracking-[0.2em] [text-align-last:justify]">
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
              className="flex items-center border-transparent border-b-2 px-4 font-medium text-muted text-sm transition-colors hover:text-text [&.active]:border-accent [&.active]:text-accent"
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
      <IssueDetail id={search.issue ?? ""} onSelect={openIssue} onClose={closeDetail} />
    </div>
  );
}
