import { Check, UserCircle2, X } from "lucide-react";
import { useState } from "react";

import { useActor } from "@/lib/actor";
import { useActors } from "@/queries";

// ActorMenu is the header identity picker. It sets the GitHub username sent as
// bd --actor on writes, chosen from the org roster (/api/actors). maggie has no
// login; this is a self-asserted audit label persisted locally.
export function ActorMenu() {
  const [actor, setActor] = useActor();
  const [open, setOpen] = useState(false);
  const { data } = useActors();
  const roster = data ?? [];

  const pick = (v: string) => {
    setActor(v);
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 py-1.5 text-xs hover:border-accent"
        title="who you are acting as for edits"
      >
        <UserCircle2 size={15} className={actor ? "text-accent" : "text-muted"} />
        <span className="text-muted">acting as</span>
        <span className="font-medium text-text">{actor || "— set identity"}</span>
      </button>

      {open ? (
        <>
          <button
            type="button"
            aria-label="close"
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-30 mt-1 flex w-56 flex-col gap-0.5 rounded-lg border border-line bg-panel p-1.5 shadow-2xl">
            {roster.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => pick(a)}
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
                onClick={() => pick("")}
                className="mt-0.5 flex items-center gap-1 border-line border-t px-2 pt-1.5 text-muted text-xs hover:text-text"
              >
                <X size={12} /> clear
              </button>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
