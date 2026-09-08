import { Check, UserCircle2, X } from "lucide-react"
import { useState } from "react"

import { useActor } from "@/lib/actor"
import { useActors } from "@/queries"

// ACTOR_RE mirrors the server's actor validation, so a name the backend would
// reject never reaches it.
const ACTOR_RE = /^[A-Za-z0-9-]{1,39}$/

// ActorMenu is the header identity picker. It sets the username sent as
// bd --actor on writes, either typed or chosen from the roster (/api/actors).
// maggie has no login; this is a self-asserted audit label persisted locally.
export function ActorMenu() {
  const [actor, setActor] = useActor()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState("")
  const { data } = useActors()
  const roster = data ?? []

  const pick = (v: string) => {
    setActor(v)
    setOpen(false)
  }

  const submitDraft = () => {
    const v = draft.trim()
    if (ACTOR_RE.test(v)) {
      setDraft("")
      pick(v)
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o)
        }}
        className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs hover:border-accent"
        title="who you are acting as for edits"
      >
        <UserCircle2
          size={15}
          className={actor ? "text-accent" : "text-muted"}
        />
        <span className="text-muted">acting as</span>
        <span className="font-medium text-text">
          {actor || "— set identity"}
        </span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="close"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => {
              setOpen(false)
            }}
          />
          <div className="absolute right-0 z-30 mt-1 flex w-56 flex-col gap-0.5 rounded-lg border border-line bg-panel p-1.5 shadow-2xl">
            <input
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value)
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  submitDraft()
                }
              }}
              onBlur={submitDraft}
              placeholder="type a username"
              aria-label="identity"
              className="mb-1 rounded border border-line bg-surface2 px-2 py-1 text-sm outline-none placeholder:text-muted focus:border-accent"
            />
            {roster.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => {
                  pick(a)
                }}
                className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-surface2"
              >
                {a === actor ? (
                  <Check size={13} className="text-accent" />
                ) : (
                  <span className="w-[13px]" />
                )}
                {a}
              </button>
            ))}
            {actor ? (
              <button
                type="button"
                onClick={() => {
                  pick("")
                }}
                className="mt-0.5 flex items-center gap-1 border-t border-line px-2 pt-1.5 text-xs text-muted hover:text-text"
              >
                <X size={12} /> clear
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
