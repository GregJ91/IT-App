"use client";
import { useActionState, useEffect, useRef } from "react";
import { logTimeAction, type ActionState } from "@/app/actions-tickets";

export function TimeForm({ ticketId }: { ticketId: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(logTimeAction, undefined);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="stack" style={{ gap: 8 }}>
      {state?.error && <p className="error">{state.error}</p>}
      <input type="hidden" name="ticketId" value={ticketId} />
      <div className="actions" style={{ flexWrap: "nowrap" }}>
        <input className="input" name="hours" type="number" min={0} max={24} step={1} placeholder="Hours" aria-label="Hours" style={{ width: "50%" }} />
        <input className="input" name="minutes" type="number" min={0} max={59} step={5} placeholder="Minutes" aria-label="Minutes" style={{ width: "50%" }} />
      </div>
      <input className="input" name="note" placeholder="What did you do? (optional)" aria-label="Note" maxLength={500} />
      <button className="btn" disabled={pending}>
        <span>+ Log time</span>
      </button>
    </form>
  );
}
