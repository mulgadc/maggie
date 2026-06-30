import { createRootRoute, Link, Outlet, useNavigate, useSearch } from "@tanstack/react-router";

import { IssueDetail } from "@/components/issue-detail";

interface RootSearch {
  issue?: string;
}

export const Route = createRootRoute({
  validateSearch: (search: Record<string, unknown>): RootSearch => ({
    issue: typeof search.issue === "string" ? search.issue : undefined,
  }),
  component: RootLayout,
});

const TABS = [
  { to: "/", label: "Board" },
  { to: "/ready", label: "Ready" },
  { to: "/graph", label: "Graph" },
] as const;

function RootLayout() {
  const navigate = useNavigate();
  const { issue } = useSearch({ from: Route.id });

  const closeDetail = () => navigate({ to: ".", search: (s) => ({ ...s, issue: undefined }) });
  const openIssue = (open: string) => navigate({ to: ".", search: (s) => ({ ...s, issue: open }) });

  return (
    <div className="flex h-full flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-4 border-line border-b bg-bg px-5 py-3">
        <h1 className="font-semibold text-accent tracking-wide">⚘ WARATAH</h1>
        <nav className="flex gap-2">
          {TABS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              search={(s: RootSearch) => s}
              className="rounded-md border border-line px-3 py-1.5 text-muted text-sm hover:text-text [&.active]:border-accent [&.active]:bg-accent [&.active]:text-bg"
              activeOptions={{ exact: t.to === "/" }}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="flex-1 overflow-auto p-5">
        <Outlet />
      </main>
      <IssueDetail id={issue ?? ""} onSelect={openIssue} onClose={closeDetail} />
    </div>
  );
}
