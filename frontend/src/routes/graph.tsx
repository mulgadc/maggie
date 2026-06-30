import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import { select } from "d3-selection";
import { zoom, type ZoomTransform, zoomIdentity } from "d3-zoom";
import { useEffect, useMemo, useRef, useState } from "react";

import type { Issue, Status } from "@/api";
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

  const { nodes, links } = useMemo(() => {
    const byId = new Map<string, Issue>((issues ?? []).map((i) => [i.id, i]));
    const ids = new Set<string>();
    for (const e of edges ?? []) {
      ids.add(e.from);
      ids.add(e.to);
    }
    const nodes: Node[] = [...ids].map((id) => {
      const i = byId.get(id);
      return { id, title: i?.title ?? id, status: i?.status ?? "open" };
    });
    const links: Link[] = (edges ?? []).map((e) => ({
      key: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      dashed: e.dashed,
    }));
    return { nodes, links };
  }, [issues, edges]);

  if (li || le) {
    return <p className="text-muted">loading…</p>;
  }
  if (error) {
    return <p className="text-st-blocked">error: {error.message}</p>;
  }
  if (nodes.length === 0) {
    return <p className="text-muted">no dependencies to graph</p>;
  }

  return (
    <ForceGraph
      nodes={nodes}
      links={links}
      onSelect={(id) => navigate({ to: ".", search: (s) => ({ ...s, issue: id }) })}
    />
  );
}

function ForceGraph({
  nodes,
  links,
  onSelect,
}: {
  nodes: Node[];
  links: Link[];
  onSelect: (id: string) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const simRef = useRef<Simulation<Node, Link>>(null);
  const [, setTick] = useState(0);
  const [tf, setTf] = useState<ZoomTransform>(zoomIdentity);
  const [size, setSize] = useState({ w: 800, h: 600 });

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
          .distance(90),
      )
      .force("charge", forceManyBody().strength(-320))
      .force("center", forceCenter(size.w / 2, size.h / 2))
      .force("collide", forceCollide(28));
    sim.on("tick", () => setTick((t) => t + 1));
    simRef.current = sim;
    return () => {
      sim.stop();
    };
  }, [nodes, links, size.w, size.h]);

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
      <button
        type="button"
        onClick={() => setTf(zoomIdentity)}
        className="absolute bottom-3 left-3 rounded-md border border-line bg-bg/80 px-2 py-1 text-muted text-xs hover:text-text"
      >
        reset view
      </button>
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
