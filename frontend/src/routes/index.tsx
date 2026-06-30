import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Activity, AlertTriangle, Clock, Flame, GitMerge, ListOrdered, Tags } from "lucide-react";
import { type ReactNode, useMemo, useState } from "react";

import type { Issue, Status } from "@/api";
import { LabelChip, PriorityBadge, StatusBadge, StatusDot } from "@/components/badges";
import { allPrefixes, idPrefix, uniqueSorted } from "@/lib/filter";
import { prereqIds, suggestSequence } from "@/lib/sequence";
import { useGraph, useIssues, useReady } from "@/queries";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const STATUS_ORDER: Status[] = ["open", "in_progress", "blocked", "deferred", "closed"];

// useFocus persists the chosen identity (an assignee or an id prefix) so the
// dashboard can highlight one person's work without any login. Format is
// "asgn:<name>" or "pref:<prefix>"; "" means no focus selected.
function useFocus(): [string, (v: string) => void] {
  const [focus, setFocus] = useState(() => localStorage.getItem("maggie.focus") ?? "");
  const set = (v: string) => {
    setFocus(v);
    if (v) {
      localStorage.setItem("maggie.focus", v);
    } else {
      localStorage.removeItem("maggie.focus");
    }
  };
  return [focus, set];
}

function byUpdatedDesc(a: Issue, b: Issue): number {
  return String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? ""));
}

function byPriority(a: Issue, b: Issue): number {
  return a.priority - b.priority || byUpdatedDesc(a, b);
}

function Dashboard() {
  const navigate = useNavigate();
  const { data: issues, isLoading, error } = useIssues();
  const { data: readyData } = useReady();
  const { data: edgesData } = useGraph();
  const [focus, setFocus] = useFocus();

  const all = useMemo(() => issues ?? [], [issues]);
  const ready = useMemo(() => readyData ?? [], [readyData]);
  const edges = useMemo(() => edgesData ?? [], [edgesData]);

  const matchesFocus = useMemo(() => {
    if (focus.startsWith("asgn:")) {
      const a = focus.slice(5);
      return (i: Issue) => (i.assignee ?? "") === a;
    }
    if (focus.startsWith("pref:")) {
      const p = focus.slice(5);
      return (i: Issue) => idPrefix(i.id) === p;
    }
    return null;
  }, [focus]);

  // Sequence is personalised: when a focus identity is picked, only that
  // person's (or prefix's) beads are sequenced.
  const sequence = useMemo(() => {
    const pool = matchesFocus ? all.filter(matchesFocus) : all;
    return suggestSequence(pool, edges, 5);
  }, [all, edges, matchesFocus]);
  const prereqs = useMemo(() => prereqIds(sequence, edges), [sequence, edges]);

  const counts = useMemo(() => {
    const c: Record<Status, number> = {
      open: 0,
      in_progress: 0,
      blocked: 0,
      deferred: 0,
      closed: 0,
    };
    for (const i of all) {
      c[i.status]++;
    }
    return c;
  }, [all]);

  const openIssues = useMemo(() => all.filter((i) => i.status !== "closed"), [all]);

  const priBars = useMemo(() => {
    const c = [0, 0, 0, 0, 0];
    for (const i of openIssues) {
      c[Math.min(Math.max(i.priority, 0), 4)]++;
    }
    const max = Math.max(1, ...c);
    return c.map((n, p) => ({ p, n, pct: Math.round((n / max) * 100) }));
  }, [openIssues]);

  const critical = useMemo(
    () =>
      openIssues
        .filter((i) => i.priority <= 1)
        .sort(byPriority)
        .slice(0, 8),
    [openIssues],
  );
  const recent = useMemo(() => [...openIssues].sort(byUpdatedDesc).slice(0, 8), [openIssues]);
  const readyTop = useMemo(() => [...ready].sort(byPriority).slice(0, 8), [ready]);

  const labelStreams = useMemo(() => {
    const c = new Map<string, number>();
    for (const i of openIssues) {
      for (const l of i.labels ?? []) {
        c.set(l, (c.get(l) ?? 0) + 1);
      }
    }
    const max = Math.max(1, ...c.values());
    return [...c.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([label, n]) => ({ label, n, pct: Math.round((n / max) * 100) }));
  }, [openIssues]);

  const assignees = useMemo(() => uniqueSorted(all.map((i) => i.assignee)), [all]);
  const prefixes = useMemo(() => allPrefixes(all), [all]);

  const open = (id: string) => navigate({ to: ".", search: (s) => ({ ...s, issue: id }) });
  const toTable = (search: Record<string, unknown>) => navigate({ to: "/table", search });

  if (isLoading) {
    return <p className="text-muted">loading…</p>;
  }
  if (error) {
    return <p className="text-st-blocked">error: {error.message}</p>;
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Total" value={all.length} onClick={() => toTable({})} />
        {STATUS_ORDER.map((s) => (
          <StatCard
            key={s}
            label={s.replace("_", " ")}
            value={counts[s]}
            status={s}
            onClick={() => toTable({ st: s })}
          />
        ))}
      </div>

      <Panel
        title="Suggested sequence"
        icon={<ListOrdered size={15} />}
        action={
          <select
            className="rounded-md border border-line bg-bg px-2 py-1 text-text text-xs focus:border-accent focus:outline-none"
            value={focus}
            onChange={(e) => setFocus(e.target.value)}
            title="personalise the sequence"
          >
            <option value="">everyone</option>
            {assignees.length ? (
              <optgroup label="assignee">
                {assignees.map((a) => (
                  <option key={`a:${a}`} value={`asgn:${a}`}>
                    {a}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label="prefix">
              {prefixes.map((p) => (
                <option key={`p:${p}`} value={`pref:${p}`}>
                  {p}-*
                </option>
              ))}
            </optgroup>
          </select>
        }
      >
        {sequence.length ? (
          <SequenceTimeline items={sequence} prereqs={prereqs} onSelect={open} />
        ) : (
          <Empty text="nothing actionable to sequence for this selection" />
        )}
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel title="Open by priority" icon={<Activity size={15} />}>
          <div className="flex flex-col gap-2">
            {priBars.map((b) => (
              <button
                key={b.p}
                type="button"
                onClick={() => toTable({ pri: b.p, st: "open" })}
                className="flex items-center gap-2 text-left"
              >
                <span className="w-7 shrink-0">
                  <PriorityBadge priority={b.p} />
                </span>
                <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface2">
                  <span
                    className="block h-full rounded-full bg-accent/60"
                    style={{ width: `${b.pct}%` }}
                  />
                </span>
                <span className="w-8 shrink-0 text-right text-muted text-xs">{b.n}</span>
              </button>
            ))}
          </div>
        </Panel>

        <Panel title="By area" icon={<Tags size={15} />}>
          {labelStreams.length ? (
            <div className="flex flex-col gap-2">
              {labelStreams.map((l) => (
                <button
                  key={l.label}
                  type="button"
                  onClick={() => toTable({ lbl: l.label, group: "label" })}
                  className="flex items-center gap-2 text-left"
                >
                  <span className="w-28 shrink-0 truncate">
                    <LabelChip label={l.label} />
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-surface2">
                    <span
                      className="block h-full rounded-full bg-accent/60"
                      style={{ width: `${l.pct}%` }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-right text-muted text-xs">{l.n}</span>
                </button>
              ))}
            </div>
          ) : (
            <Empty text="no labelled beads yet — add labels in bd to group work by area" />
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel title="Critical & high" icon={<Flame size={15} />}>
          {critical.length ? (
            <IssueList items={critical} onSelect={open} />
          ) : (
            <Empty text="no open P0/P1 beads" />
          )}
        </Panel>
        <Panel title="Ready to start" icon={<AlertTriangle size={15} />}>
          {readyTop.length ? (
            <IssueList items={readyTop} onSelect={open} />
          ) : (
            <Empty text="nothing ready right now" />
          )}
        </Panel>
        <Panel title="Recently updated" icon={<Clock size={15} />}>
          {recent.length ? (
            <IssueList items={recent} onSelect={open} />
          ) : (
            <Empty text="no recent activity" />
          )}
        </Panel>
      </div>
    </div>
  );
}

function SequenceTimeline({
  items,
  prereqs,
  onSelect,
}: {
  items: Issue[];
  prereqs: Map<string, string[]>;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {items.map((i, idx) => {
        const deps = prereqs.get(i.id) ?? [];
        return (
          <button
            key={i.id}
            type="button"
            onClick={() => onSelect(i.id)}
            className="flex flex-col gap-1.5 rounded-lg border border-line bg-bg p-2.5 text-left transition-colors hover:border-accent"
          >
            <div className="flex items-center gap-1.5">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/15 font-semibold text-accent text-xs tabular-nums">
                {idx + 1}
              </span>
              <PriorityBadge priority={i.priority} />
              {deps.length ? (
                <span
                  className="ml-auto inline-flex items-center gap-0.5 text-muted text-xs"
                  title={`after ${deps.join(", ")}`}
                >
                  <GitMerge size={11} />
                  {deps.length}
                </span>
              ) : null}
            </div>
            <span className="font-mono text-accent text-xs">{i.id}</span>
            <span className="line-clamp-2 text-sm leading-snug">{i.title}</span>
            <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
              <StatusBadge status={i.status} />
              {i.labels?.[0] ? <LabelChip label={i.labels[0]} /> : null}
            </div>
          </button>
        );
      })}
    </div>
  );
}

function StatCard({
  label,
  value,
  status,
  onClick,
}: {
  label: string;
  value: number;
  status?: Status;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-1 rounded-lg border border-line bg-panel p-3 text-left transition-colors hover:border-accent"
    >
      <span className="text-2xl tabular-nums">{value}</span>
      <span className="flex items-center gap-1.5 text-muted text-xs lowercase">
        {status ? <StatusDot status={status} /> : null}
        {label}
      </span>
    </button>
  );
}

function Panel({
  title,
  icon,
  action,
  children,
}: {
  title: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col rounded-lg border border-line bg-panel p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-accent">{icon}</span>
        <h2 className="font-semibold text-sm">{title}</h2>
        {action ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  );
}

function IssueList({ items, onSelect }: { items: Issue[]; onSelect: (id: string) => void }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((i) => (
        <li key={i.id}>
          <button
            type="button"
            onClick={() => onSelect(i.id)}
            className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-surface2/50"
          >
            <PriorityBadge priority={i.priority} />
            <span className="shrink-0 font-mono text-accent text-xs">{i.id}</span>
            <span className="truncate text-sm">{i.title}</span>
            <span className="ml-auto shrink-0">
              <StatusBadge status={i.status} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="text-muted text-sm italic">{text}</p>;
}
