"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { replyToTicket, type ActionState } from "@/app/actions-tickets";
import { FilePicker } from "./file-picker";

export function Composer({ ticketId, it }: { ticketId: number; it: boolean }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(replyToTicket, undefined);
  const [internal, setInternal] = useState(false);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="stack" style={{ gap: 8 }}>
      {state?.error && <p className="error">{state.error}</p>}
      <input type="hidden" name="ticketId" value={ticketId} />
      <input type="hidden" name="internal" value={internal ? "1" : "0"} />
      <div className={`composer ${internal ? "internal" : ""}`}>
        <textarea name="body" id="reply" aria-label={internal ? "Internal note" : "Reply"} placeholder={internal ? "Note for the IT team only…" : it ? "Write a reply to the requester…" : "Add a message or more detail…"} />
        <div className="foot">
          {it ? (
            <div className="tabs" role="group" aria-label="Message type">
              <button type="button" className="tab" aria-pressed={!internal} onClick={() => setInternal(false)}>
                Reply
              </button>
              <button type="button" className="tab" aria-pressed={internal} onClick={() => setInternal(true)}>
                Internal note
              </button>
            </div>
          ) : (
            <span />
          )}
          <div className="actions">
            <FilePicker compact resetKey={state} />
            <button className="btn primary" disabled={pending}>
              {pending ? "Sending…" : internal ? "Add note" : "Send"}
            </button>
          </div>
        </div>
      </div>
    </form>
  );
}
