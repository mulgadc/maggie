import type { Status } from "@/api"

const STATUS_STYLE = {
  open: "text-st-open bg-st-open/12 ring-st-open/25",
  in_progress:
    "text-st-in_progress bg-st-in_progress/12 ring-st-in_progress/25",
  blocked: "text-st-blocked bg-st-blocked/12 ring-st-blocked/25",
  deferred: "text-st-deferred bg-st-deferred/12 ring-st-deferred/25",
  closed: "text-st-closed bg-st-closed/12 ring-st-closed/25",
} satisfies Record<Status, string>

const STATUS_DOT = {
  open: "bg-st-open",
  in_progress: "bg-st-in_progress",
  blocked: "bg-st-blocked",
  deferred: "bg-st-deferred",
  closed: "bg-st-closed",
} satisfies Record<Status, string>

// Indexed by priority; anything outside P0-P4 falls back to the last entry.
const PRIORITY_STYLE = [
  "text-pr-0 bg-pr-0/12 ring-pr-0/25",
  "text-pr-1 bg-pr-1/12 ring-pr-1/25",
  "text-pr-2 bg-pr-2/12 ring-pr-2/25",
  "text-pr-3 bg-pr-3/12 ring-pr-3/25",
  "text-pr-4 bg-pr-4/12 ring-pr-4/25",
] as const

const PILL =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 font-medium text-xs ring-1 ring-inset"

export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`${PILL} ${STATUS_STYLE[status]}`}>
      <span className={`size-1.5 rounded-full ${STATUS_DOT[status]}`} />
      {status.replace("_", " ")}
    </span>
  )
}

export function PriorityBadge({ priority }: { priority: number }) {
  const style = PRIORITY_STYLE[priority] ?? PRIORITY_STYLE[4]
  return <span className={`${PILL} ${style}`}>P{priority}</span>
}

export function TypeBadge({ type }: { type: string }) {
  const style =
    type === "epic"
      ? "bg-accent/15 text-accent ring-accent/30"
      : "bg-surface2 text-muted ring-line"
  return <span className={`${PILL} ${style}`}>{type}</span>
}

// labelHue maps a label to a stable hue so each tag keeps one colour everywhere.
export function labelHue(label: string): number {
  let h = 0
  for (let i = 0; i < label.length; i++) {
    h = (h * 31 + (label.codePointAt(i) ?? 0)) % 360
  }
  return h
}

export function LabelChip({ label }: { label: string }) {
  const h = labelHue(label)
  return (
    <span
      className={`${PILL} ring-1 ring-inset`}
      style={{
        color: `hsl(${h} 70% 72%)`,
        backgroundColor: `hsl(${h} 70% 72% / 0.12)`,
        // biome-ignore lint: ring colour via inline style for the dynamic hue
        ["--tw-ring-color" as string]: `hsl(${h} 70% 72% / 0.3)`,
      }}
    >
      {label}
    </span>
  )
}

export function StatusDot({ status }: { status: Status }) {
  return (
    <span
      className={`inline-block size-2 shrink-0 rounded-full ${STATUS_DOT[status]}`}
      title={status}
    />
  )
}
