import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { select } from "d3-selection";
import { zoom, type ZoomTransform, zoomIdentity } from "d3-zoom";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Issue, Status } from "@/api";
import { labelHue } from "@/components/badges";
import { useGraph, useIssues } from "@/queries";

const STATUS_VAR: Record<Status, string> = {
  open: "var(--color-st-open)",
  in_progress: "var(--color-st-in_progress)",
  blocked: "var(--color-st-blocked)",
  deferred: "var(--color-st-deferred)",
  closed: "var(--color-st-closed)",
};

interface Node extends SimulationNodeDatum {
  id: string;
  title: string;
  status: Status;
  label?: string; // primary label, drives cluster placement
}

interface Link extends SimulationLinkDatum<Node> {
  key: string;
  dashed: boolean;
}

export const Route = createFileRoute("/graph")({
  component: Graph,
});

function Graph() {
  const navigate = useNavigate();
  const { data: issues, isLoading: li } = useIssues();
  const { data: edges, isLoading: le, error } = useGraph();

  const hasLabels = useMemo(
    () => (issues ?? []).some((i) => (i.labels ?? []).length > 0),
    [issues],
  );
  const [pref, setPref] = useState<boolean | null>(null);
  const clustered = pref === null ? hasLabels : pref;

  // Default graph shows only beads that carry an edge. Cluster mode instead
  // shows every labelled bead grouped into its label's bubble, so beads that
  // share a feature clump together even without a direct dependency.
  const { nodes, links } = useMemo(() => {
    const byId = new Map<string, Issue>((issues ?? []).map((i) => [i.id, i]));
    let nodes: Node[];
    if (clustered) {
      nodes = (issues ?? [])
        .filter((i) => (i.labels ?? []).length > 0)
        .map((i) => ({ id: i.id, title: i.title, status: i.status, label: i.labels?.[0] }));
    } else {
      const ids = new Set<string>();
      for (const e of edges ?? []) {
        ids.add(e.from);
        ids.add(e.to);
      }
      nodes = [...ids].map((id) => {
        const i = byId.get(id);
        return { id, title: i?.title ?? id, status: i?.status ?? "open" };
      });
    }
    const present = new Set(nodes.map((n) => n.id));
    const links: Link[] = (edges ?? [])
      .filter((e) => present.has(e.from) && present.has(e.to))
      .map((e) => ({ key: `${e.from}->${e.to}`, source: e.from, target: e.to, dashed: e.dashed }));
    return { nodes, links };
  }, [issues, edges, clustered]);

  if (li || le) {
    return <p className="text-muted">loading…</p>;
  }
  if (error) {
    return <p className="text-st-blocked">error: {error.message}</p>;
  }
  if (nodes.length === 0) {
    return (
      <p className="text-muted">
        {clustered ? "no labelled beads to cluster" : "no dependencies to graph"}
      </p>
    );
  }

  return (
    <ForceGraph
      nodes={nodes}
      links={links}
      clustered={clustered}
      canCluster={hasLabels}
      onToggleCluster={() => setPref(!clustered)}
      onSelect={(id) => navigate({ to: ".", search: (s) => ({ ...s, issue: id }) })}
    />
  );
}

interface Bubble {
  label: string;
  cx: number;
  cy: number;
  r: number;
}

function ForceGraph({
  nodes,
  links,
  clustered,
  canCluster,
  onToggleCluster,
  onSelect,
}: {
  nodes: Node[];
  links: Link[];
  clustered: boolean;
  canCluster: boolean;
  onToggleCluster: () => void;
  onSelect: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<Simulation<Node, Link>>(null);
  const [, setTick] = useState(0);
  const [tf, setTf] = useState<ZoomTransform>(zoomIdentity);
  const [size, setSize] = useState({ w: 800, h: 600 });

  // Distinct primary labels become the cluster anchors, laid out on a ring.
  const clusterLabels = useMemo(
    () => [...new Set(nodes.map((n) => n.label).filter((l): l is string => !!l))].sort(),
    [nodes],
  );
  const centers = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    const cx = size.w / 2;
    const cy = size.h / 2;
    const r = Math.min(size.w, size.h) * 0.34;
    clusterLabels.forEach((l, i) => {
      if (clusterLabels.length === 1) {
        m.set(l, { x: cx, y: cy });
        return;
      }
      const a = (i / clusterLabels.length) * 2 * Math.PI - Math.PI / 2;
      m.set(l, { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    });
    return m;
  }, [clusterLabels, size.w, size.h]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) {
      return;
    }
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const sim = forceSimulation(nodes)
      .force(
        "link",
        forceLink<Node, Link>(links)
          .id((d) => d.id)
          .distance(clustered ? 55 : 90),
      )
      .force("charge", forceManyBody().strength(clustered ? -140 : -320))
      .force("collide", forceCollide(clustered ? 20 : 28));
    if (clustered) {
      const at = (n: Node, k: "x" | "y") =>
        centers.get(n.label ?? "")?.[k] ?? size[k === "x" ? "w" : "h"] / 2;
      sim
        .force("x", forceX<Node>((n) => at(n, "x")).strength(0.25))
        .force("y", forceY<Node>((n) => at(n, "y")).strength(0.25));
    } else {
      sim.force("center", forceCenter(size.w / 2, size.h / 2));
    }
    sim.on("tick", () => setTick((t) => t + 1));
    simRef.current = sim;
    return () => {
      sim.stop();
    };
  }, [nodes, links, size.w, size.h, clustered, centers]);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) {
      return;
    }
    const z = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.2, 4])
      .on("zoom", (e) => setTf(e.transform));
    select(el).call(z);
    return () => {
      select(el).on(".zoom", null);
    };
  }, []);

  const drag = (n: Node) => (e: React.PointerEvent) => {
    e.stopPropagation();
    const sim = simRef.current;
    if (!sim) {
      return;
    }
    const move = (ev: PointerEvent) => {
      n.fx = tf.invertX(ev.offsetX);
      n.fy = tf.invertY(ev.offsetY);
      sim.alpha(0.3).restart();
    };
    const up = () => {
      n.fx = null;
      n.fy = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  // Bubbles are recomputed each tick from live node positions: a circle that
  // encloses every node sharing the primary label.
  const bubbles: Bubble[] = clustered
    ? clusterLabels.map((label) => {
        const members = nodes.filter((n) => n.label === label && n.x != null && n.y != null);
        if (!members.length) {
          return { label, cx: 0, cy: 0, r: 0 };
        }
        const cx = members.reduce((s, n) => s + (n.x ?? 0), 0) / members.length;
        const cy = members.reduce((s, n) => s + (n.y ?? 0), 0) / members.length;
        const r = Math.max(46, ...members.map((n) => Math.hypot((n.x ?? 0) - cx, (n.y ?? 0) - cy)));
        return { label, cx, cy, r: r + 34 };
      })
    : [];

  return (
    <div className="relative h-[calc(100vh-9rem)] w-full overflow-hidden rounded-lg border border-line bg-panel">
      <svg ref={svgRef} className="h-full w-full">
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="20"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,0 L10,5 L0,10 z" fill="var(--color-muted)" />
          </marker>
        </defs>
        <g transform={tf.toString()}>
          {bubbles.map((b) => {
            const h = labelHue(b.label);
            return (
              <g key={`bubble:${b.label}`} className="pointer-events-none">
                <circle
                  cx={b.cx}
                  cy={b.cy}
                  r={b.r}
                  fill={`hsl(${h} 70% 60% / 0.06)`}
                  stroke={`hsl(${h} 70% 65% / 0.4)`}
                  strokeWidth={1.5}
                />
                <text
                  x={b.cx}
                  y={b.cy - b.r - 6}
                  textAnchor="middle"
                  fontSize={13}
                  fontWeight={600}
                  fill={`hsl(${h} 70% 72%)`}
                  className="select-none"
                >
                  {b.label}
                </text>
              </g>
            );
          })}
          {links.map((l) => {
            const s = l.source as Node;
            const t = l.target as Node;
            return (
              <line
                key={l.key}
                x1={s.x}
                y1={s.y}
                x2={t.x}
                y2={t.y}
                stroke="var(--color-muted)"
                strokeOpacity={0.5}
                strokeWidth={1.2}
                strokeDasharray={l.dashed ? "4 3" : undefined}
                markerEnd="url(#arrow)"
              />
            );
          })}
          {nodes.map((n) => (
            <g
              key={n.id}
              transform={`translate(${n.x ?? 0},${n.y ?? 0})`}
              className="cursor-pointer"
              onPointerDown={drag(n)}
              onClick={() => onSelect(n.id)}
            >
              <circle r={9} fill={STATUS_VAR[n.status]} stroke="var(--color-bg)" strokeWidth={2} />
              <text
                x={12}
                y={4}
                fontSize={11}
                fill="var(--color-text)"
                className="select-none font-mono"
              >
                {n.id}
              </text>
            </g>
          ))}
        </g>
      </svg>
      <Legend />
      <div className="absolute bottom-3 left-3 flex gap-2">
        <button
          type="button"
          onClick={() => setTf(zoomIdentity)}
          className="rounded-md border border-line bg-bg/80 px-2 py-1 text-muted text-xs hover:text-text"
        >
          reset view
        </button>
        {canCluster ? (
          <button
            type="button"
            onClick={onToggleCluster}
            className={`rounded-md border px-2 py-1 text-xs ${
              clustered
                ? "border-accent bg-accent/15 text-accent"
                : "border-line bg-bg/80 text-muted hover:text-text"
            }`}
          >
            cluster by label
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Legend() {
  const items: Status[] = ["open", "in_progress", "blocked", "deferred", "closed"];
  return (
    <div className="absolute top-3 right-3 rounded-md border border-line bg-bg/80 px-3 py-2 text-xs">
      {items.map((s) => (
        <div key={s} className="flex items-center gap-2 py-0.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: STATUS_VAR[s] }}
          />
          <span className="text-muted">{s.replace("_", " ")}</span>
        </div>
      ))}
    </div>
  );
}
