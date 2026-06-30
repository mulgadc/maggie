import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/graph")({
  component: Graph,
});

function Graph() {
  return (
    <iframe
      title="dependency graph"
      src="/api/graph"
      className="h-[calc(100vh-7rem)] w-full rounded-lg border border-line bg-white"
    />
  );
}
