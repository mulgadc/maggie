import { Pencil, Plus, X } from "lucide-react"
import { type MouseEvent, type ReactNode, useId, useState } from "react"

import type { DepType, Issue, Status, UpdatePayload } from "@/api"
import { LabelChip, PriorityBadge, StatusBadge } from "@/components/badges"
import { Markdown } from "@/components/markdown"
import { ALL_STATUSES, allLabels } from "@/lib/filter"
import { cn } from "@/lib/utils"
import { useActors, useAddComment, useAddDep, useUpdateIssue } from "@/queries"

const INPUT =
  "rounded-md border border-line bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none disabled:opacity-50"
const BTN =
  "rounded-md border border-line px-2 py-1 text-muted text-xs hover:border-accent hover:text-text disabled:opacity-50"

interface Ctx {
  issue: Issue
  actor: string
  issues: Issue[]
}

// usePatch is the shared write helper; a no-op when no actor is set.
function usePatch(issue: Issue, actor: string) {
  const m = useUpdateIssue()
  const disabled = !actor || m.isPending
  const patch = (p: UpdatePayload) => {
    if (actor) {
      m.mutate({ id: issue.id, actor, patch: p })
    }
  }
  return { patch, disabled }
}

// ChipEditor shows a chip in view mode and swaps to a select on click, so the
// drawer keeps its read-only look until you choose to change something.
function ChipEditor({
  value,
  options,
  disabled,
  onChange,
  children,
}: {
  value: string
  options: { value: string; label: string }[]
  disabled: boolean
  onChange: (v: string) => void
  children: ReactNode
}) {
  const [editing, setEditing] = useState(false)
  if (editing && !disabled) {
    return (
      <select
        // biome-ignore lint/a11y: transient inline editor
        autoFocus
        className={INPUT}
        value={value}
        onChange={(e) => {
          setEditing(false)
          onChange(e.target.value)
        }}
        onBlur={() => {
          setEditing(false)
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        setEditing(true)
      }}
      className={disabled ? "cursor-default" : "cursor-pointer"}
      title={disabled ? undefined : "click to change"}
    >
      {children}
    </button>
  )
}

// InlineText renders a value that becomes an input/textarea on click; saves on
// blur or Enter (Cmd/Ctrl+Enter for multiline), cancels on Escape.
function InlineText({
  value,
  placeholder,
  multiline,
  disabled,
  suggestions,
  label,
  onSave,
}: {
  value: string
  placeholder?: string
  multiline?: boolean
  disabled: boolean
  suggestions?: string[]
  label?: string
  onSave: (v: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const listId = useId()

  const start = () => {
    if (disabled) {
      return
    }
    setDraft(value)
    setEditing(true)
  }
  const commit = () => {
    setEditing(false)
    if (draft !== value) {
      onSave(draft)
    }
  }

  if (editing) {
    if (multiline) {
      return (
        <textarea
          // biome-ignore lint/a11y: transient inline editor
          autoFocus
          className={`${INPUT} min-h-24 w-full resize-y`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setEditing(false)
            } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              commit()
            }
          }}
        />
      )
    }
    return (
      <>
        <input
          // biome-ignore lint/a11y: transient inline editor
          autoFocus
          list={suggestions ? listId : undefined}
          className={`${INPUT} w-full`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setEditing(false)
            } else if (e.key === "Enter") {
              commit()
            }
          }}
        />
        {suggestions ? (
          <datalist id={listId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        ) : null}
      </>
    )
  }

  const empty = !value.trim()

  // Multiline read mode renders markdown, so it can't live inside a <button>
  // (block elements/links inside a button are invalid and swallow clicks).
  // Click-to-edit is a div handler that bails on links/code/selection; a
  // hover/focus-revealed pencil button keeps editing reachable by keyboard.
  if (multiline) {
    if (disabled) {
      return empty ? (
        <span className="text-muted italic">{placeholder ?? "—"}</span>
      ) : (
        <Markdown text={value} />
      )
    }
    const onClick = (e: MouseEvent<HTMLDivElement>) => {
      if ((e.target as HTMLElement).closest("a, pre")) {
        return
      }
      if (window.getSelection()?.toString()) {
        return
      }
      start()
    }
    return (
      <div
        onClick={onClick}
        className="group relative -mx-1 cursor-text rounded px-1 hover:bg-surface2/40"
      >
        {empty ? (
          <span className="text-muted italic">{placeholder ?? "—"}</span>
        ) : (
          <Markdown text={value} />
        )}
        <button
          type="button"
          onClick={start}
          aria-label={`edit ${label ?? "text"}`}
          className="absolute top-0 right-0 hidden items-center gap-1 rounded bg-panel px-1 text-xs text-muted group-focus-within:flex group-hover:flex hover:text-text"
        >
          <Pencil size={12} /> edit
        </button>
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={start}
      disabled={disabled}
      className={cn(
        "-mx-1 w-full rounded px-1 text-left",
        disabled ? "cursor-default" : "cursor-text hover:bg-surface2/40",
      )}
      title={disabled ? undefined : "click to edit"}
    >
      {empty ? (
        <span className="text-muted italic">{placeholder ?? "—"}</span>
      ) : (
        <span className="break-words">{value}</span>
      )}
    </button>
  )
}

export function StatusEditor({ issue, actor }: Ctx) {
  const { patch, disabled } = usePatch(issue, actor)
  return (
    <ChipEditor
      value={issue.status}
      disabled={disabled}
      onChange={(v) => {
        patch({ status: v as Status })
      }}
      options={ALL_STATUSES.map((s) => ({
        value: s,
        label: s.replace("_", " "),
      }))}
    >
      <StatusBadge status={issue.status} />
    </ChipEditor>
  )
}

export function PriorityEditor({ issue, actor }: Ctx) {
  const { patch, disabled } = usePatch(issue, actor)
  return (
    <ChipEditor
      value={String(issue.priority)}
      disabled={disabled}
      onChange={(v) => {
        patch({ priority: v })
      }}
      options={[0, 1, 2, 3, 4].map((p) => ({
        value: String(p),
        label: `P${p}`,
      }))}
    >
      <PriorityBadge priority={issue.priority} />
    </ChipEditor>
  )
}

export function AssigneeEditor({ issue, actor }: Ctx) {
  const { patch, disabled } = usePatch(issue, actor)
  const { data: roster } = useActors()
  return (
    <InlineText
      value={issue.assignee ?? ""}
      placeholder="unassigned"
      disabled={disabled}
      suggestions={roster ?? []}
      onSave={(v) => {
        patch({ assignee: v.trim() })
      }}
    />
  )
}

export function EditableText({
  issue,
  actor,
  title,
  field,
}: Ctx & { title: string; field: "description" | "notes" | "acceptance" }) {
  const { patch, disabled } = usePatch(issue, actor)
  const value =
    (field === "acceptance" ? issue.acceptance_criteria : issue[field]) ?? ""
  return (
    <section className="mt-5">
      <h4 className="mb-1.5 text-xs font-semibold tracking-wider text-muted uppercase">
        {title}
      </h4>
      <div className="text-sm leading-relaxed text-text/90">
        <InlineText
          value={value}
          multiline
          disabled={disabled}
          placeholder="—"
          label={title}
          onSave={(v) => {
            patch({ [field]: v } as UpdatePayload)
          }}
        />
      </div>
    </section>
  )
}

export function LabelEditor({ issue, actor, issues }: Ctx) {
  const { patch, disabled } = usePatch(issue, actor)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState("")
  const listId = useId()
  const labels = issue.labels ?? []
  const add = () => {
    const l = draft.trim()
    if (l && !labels.includes(l)) {
      patch({ add_labels: [l] })
    }
    setDraft("")
    setAdding(false)
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {labels.map((l) => (
        <span key={l} className="group relative inline-flex items-center">
          <LabelChip label={l} />
          {disabled ? null : (
            <button
              type="button"
              onClick={() => {
                patch({ remove_labels: [l] })
              }}
              className="absolute -top-1 -right-1 hidden size-3.5 items-center justify-center rounded-full bg-st-blocked text-white group-hover:flex"
              aria-label={`remove ${l}`}
            >
              <X size={9} />
            </button>
          )}
        </span>
      ))}
      {disabled ? null : adding ? (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            add()
          }}
        >
          <input
            // biome-ignore lint/a11y: transient inline editor
            autoFocus
            list={listId}
            className={`${INPUT} w-32`}
            value={draft}
            placeholder="label"
            onChange={(e) => {
              setDraft(e.target.value)
            }}
            onBlur={add}
            onKeyDown={(e) => e.key === "Escape" && setAdding(false)}
          />
          <datalist id={listId}>
            {allLabels(issues).map((l) => (
              <option key={l} value={l} />
            ))}
          </datalist>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => {
            setAdding(true)
          }}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-line px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-text"
        >
          <Plus size={11} /> label
        </button>
      )}
    </div>
  )
}

const DEP_TYPES: { value: DepType; label: string }[] = [
  { value: "blocks", label: "blocked by" },
  { value: "relates-to", label: "relates to" },
  { value: "parent", label: "parent" },
]

export function DepAdder({ issue, actor, issues }: Ctx) {
  const m = useAddDep()
  const disabled = !actor || m.isPending
  const [openForm, setOpenForm] = useState(false)
  const [type, setType] = useState<DepType>("blocks")
  const [target, setTarget] = useState("")
  const listId = useId()
  const add = () => {
    const t = target.trim()
    if (actor && t && t !== issue.id) {
      m.mutate({ id: issue.id, actor, dependsOn: t, type })
      setTarget("")
      setOpenForm(false)
    }
  }
  if (disabled && !openForm) {
    return null
  }
  if (!openForm) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpenForm(true)
        }}
        className="mt-3 inline-flex items-center gap-0.5 text-xs text-muted hover:text-text"
      >
        <Plus size={12} /> add dependency
      </button>
    )
  }
  return (
    <form
      className="mt-3 flex flex-wrap gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        add()
      }}
    >
      <select
        className={INPUT}
        value={type}
        disabled={disabled}
        onChange={(e) => {
          setType(e.target.value as DepType)
        }}
      >
        {DEP_TYPES.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>
      <input
        // biome-ignore lint/a11y: transient inline editor
        autoFocus
        className={`${INPUT} min-w-0 flex-1`}
        list={listId}
        value={target}
        disabled={disabled}
        placeholder="target id"
        onChange={(e) => {
          setTarget(e.target.value)
        }}
      />
      <datalist id={listId}>
        {issues.map((i) => (
          <option key={i.id} value={i.id}>
            {i.title}
          </option>
        ))}
      </datalist>
      <button
        type="submit"
        className={BTN}
        disabled={disabled || !target.trim()}
      >
        add
      </button>
      <button
        type="button"
        className={BTN}
        onClick={() => {
          setOpenForm(false)
        }}
      >
        cancel
      </button>
    </form>
  )
}

export function CommentForm({ issue, actor }: Ctx) {
  const m = useAddComment()
  const disabled = !actor || m.isPending
  const [text, setText] = useState("")
  const submit = () => {
    if (actor && text.trim()) {
      m.mutate({ id: issue.id, actor, text: text.trim() })
      setText("")
    }
  }
  return (
    <form
      className="mt-3 flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <textarea
        className={`${INPUT} min-h-16 w-full resize-y`}
        value={text}
        disabled={disabled}
        placeholder={actor ? "add a comment…" : "set your identity to comment"}
        onChange={(e) => {
          setText(e.target.value)
        }}
      />
      <button
        type="submit"
        className={`${BTN} self-start`}
        disabled={disabled || !text.trim()}
      >
        comment
      </button>
    </form>
  )
}
