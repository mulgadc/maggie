import { Pencil, Plus, X } from "lucide-react";
import { useId, useState } from "react";

import type { DepType, Issue, Status, UpdatePayload } from "@/api";
import { LabelChip } from "@/components/badges";
import { ALL_STATUSES, allActors, allLabels } from "@/lib/filter";
import { useAddComment, useAddDep, useUpdateIssue } from "@/queries";

const INPUT =
  "rounded-md border border-line bg-bg px-2 py-1 text-sm focus:border-accent focus:outline-none disabled:opacity-50";
const BTN =
  "rounded-md border border-line px-2 py-1 text-muted text-xs hover:border-accent hover:text-text disabled:opacity-50";

interface Ctx {
  issue: Issue;
  actor: string;
  issues: Issue[];
}

// patch is the shared write helper: no-op when no actor is set.
function usePatch(issue: Issue, actor: string) {
  const m = useUpdateIssue();
  const disabled = !actor || m.isPending;
  const patch = (p: UpdatePayload) => {
    if (actor) {
      m.mutate({ id: issue.id, actor, patch: p });
    }
  };
  return { patch, disabled, error: m.error };
}

export function StatusEditor({ issue, actor }: Ctx) {
  const { patch, disabled } = usePatch(issue, actor);
  return (
    <select
      className={INPUT}
      value={issue.status}
      disabled={disabled}
      onChange={(e) => patch({ status: e.target.value as Status })}
    >
      {ALL_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s.replace("_", " ")}
        </option>
      ))}
    </select>
  );
}

export function PriorityEditor({ issue, actor }: Ctx) {
  const { patch, disabled } = usePatch(issue, actor);
  return (
    <select
      className={INPUT}
      value={String(issue.priority)}
      disabled={disabled}
      onChange={(e) => patch({ priority: e.target.value })}
    >
      {[0, 1, 2, 3, 4].map((p) => (
        <option key={p} value={p}>
          P{p}
        </option>
      ))}
    </select>
  );
}

export function AssigneeEditor({ issue, actor, issues }: Ctx) {
  const { patch, disabled } = usePatch(issue, actor);
  const [draft, setDraft] = useState(issue.assignee ?? "");
  const listId = useId();
  const current = issue.assignee ?? "";
  const commit = () => {
    if (draft.trim() !== current) {
      patch({ assignee: draft.trim() });
    }
  };
  return (
    <form
      className="flex gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        commit();
      }}
    >
      <input
        className={`${INPUT} min-w-0 flex-1`}
        list={listId}
        value={draft}
        disabled={disabled}
        placeholder="unassigned"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
      />
      <datalist id={listId}>
        {allActors(issues).map((a) => (
          <option key={a} value={a} />
        ))}
      </datalist>
    </form>
  );
}

export function EditableText({
  issue,
  actor,
  title,
  field,
}: Ctx & { title: string; field: "description" | "notes" | "acceptance" }) {
  const { patch, disabled } = usePatch(issue, actor);
  const value = (field === "acceptance" ? issue.acceptance_criteria : issue[field]) ?? "";
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const start = () => {
    setDraft(value);
    setEditing(true);
  };
  const save = () => {
    patch({ [field]: draft } as UpdatePayload);
    setEditing(false);
  };

  return (
    <section className="mt-5">
      <div className="mb-1.5 flex items-center gap-2">
        <h4 className="font-semibold text-muted text-xs uppercase tracking-wider">{title}</h4>
        {!editing ? (
          <button
            type="button"
            onClick={start}
            disabled={disabled}
            className="text-muted hover:text-text disabled:opacity-40"
            aria-label={`edit ${title}`}
          >
            <Pencil size={13} />
          </button>
        ) : null}
      </div>
      {editing ? (
        <div className="flex flex-col gap-1.5">
          <textarea
            className={`${INPUT} min-h-24 w-full resize-y`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <div className="flex gap-1.5">
            <button type="button" className={BTN} onClick={save} disabled={disabled}>
              save
            </button>
            <button type="button" className={BTN} onClick={() => setEditing(false)}>
              cancel
            </button>
          </div>
        </div>
      ) : value.trim() ? (
        <p className="whitespace-pre-wrap break-words text-sm text-text/90 leading-relaxed">
          {value}
        </p>
      ) : (
        <p className="text-muted text-sm italic">—</p>
      )}
    </section>
  );
}

export function LabelEditor({ issue, actor, issues }: Ctx) {
  const { patch, disabled } = usePatch(issue, actor);
  const [draft, setDraft] = useState("");
  const listId = useId();
  const labels = issue.labels ?? [];
  const add = () => {
    const l = draft.trim();
    if (l && !labels.includes(l)) {
      patch({ add_labels: [l] });
    }
    setDraft("");
  };
  return (
    <section className="mt-5">
      <h4 className="mb-1.5 font-semibold text-muted text-xs uppercase tracking-wider">Labels</h4>
      <div className="flex flex-wrap items-center gap-1.5">
        {labels.map((l) => (
          <span key={l} className="inline-flex items-center gap-1">
            <LabelChip label={l} />
            <button
              type="button"
              onClick={() => patch({ remove_labels: [l] })}
              disabled={disabled}
              className="text-muted hover:text-st-blocked disabled:opacity-40"
              aria-label={`remove ${l}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <form
        className="mt-2 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          className={`${INPUT} min-w-0 flex-1`}
          list={listId}
          value={draft}
          disabled={disabled}
          placeholder="add label"
          onChange={(e) => setDraft(e.target.value)}
        />
        <datalist id={listId}>
          {allLabels(issues).map((l) => (
            <option key={l} value={l} />
          ))}
        </datalist>
        <button type="submit" className={BTN} disabled={disabled || !draft.trim()}>
          <Plus size={13} />
        </button>
      </form>
    </section>
  );
}

const DEP_TYPES: { value: DepType; label: string }[] = [
  { value: "blocks", label: "blocked by" },
  { value: "relates-to", label: "relates to" },
  { value: "parent", label: "parent" },
];

export function DepAdder({ issue, actor, issues }: Ctx) {
  const m = useAddDep();
  const disabled = !actor || m.isPending;
  const [type, setType] = useState<DepType>("blocks");
  const [target, setTarget] = useState("");
  const listId = useId();
  const add = () => {
    const t = target.trim();
    if (actor && t && t !== issue.id) {
      m.mutate({ id: issue.id, actor, dependsOn: t, type });
      setTarget("");
    }
  };
  return (
    <section className="mt-5">
      <h4 className="mb-1.5 font-semibold text-muted text-xs uppercase tracking-wider">
        Add dependency
      </h4>
      <form
        className="flex flex-wrap gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <select
          className={INPUT}
          value={type}
          disabled={disabled}
          onChange={(e) => setType(e.target.value as DepType)}
        >
          {DEP_TYPES.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <input
          className={`${INPUT} min-w-0 flex-1`}
          list={listId}
          value={target}
          disabled={disabled}
          placeholder="target id"
          onChange={(e) => setTarget(e.target.value)}
        />
        <datalist id={listId}>
          {issues.map((i) => (
            <option key={i.id} value={i.id}>
              {i.title}
            </option>
          ))}
        </datalist>
        <button type="submit" className={BTN} disabled={disabled || !target.trim()}>
          add
        </button>
      </form>
    </section>
  );
}

export function CommentForm({ issue, actor }: Ctx) {
  const m = useAddComment();
  const disabled = !actor || m.isPending;
  const [text, setText] = useState("");
  const submit = () => {
    if (actor && text.trim()) {
      m.mutate({ id: issue.id, actor, text: text.trim() });
      setText("");
    }
  };
  return (
    <form
      className="mt-3 flex flex-col gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <textarea
        className={`${INPUT} min-h-16 w-full resize-y`}
        value={text}
        disabled={disabled}
        placeholder={actor ? "add a comment…" : "set your identity to comment"}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="submit" className={`${BTN} self-start`} disabled={disabled || !text.trim()}>
        comment
      </button>
    </form>
  );
}
