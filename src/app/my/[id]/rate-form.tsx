"use client";
import { useActionState } from "react";
import { rateAction, type ActionState } from "@/app/actions-tickets";

export function RateForm({ ticketId }: { ticketId: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(rateAction, undefined);
  if (state?.ok) return <p className="success">{state.ok}</p>;
  return (
    <form action={action} className="form" style={{ gap: 10 }}>
      {state?.error && <p className="error">{state.error}</p>}
      <input type="hidden" name="ticketId" value={ticketId} />
      <fieldset className="stars" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="sr-only">Rating</legend>
        {[1, 2, 3, 4, 5].map((n) => (
          <label key={n} title={`${n} out of 5`}>
            <input type="radio" name="rating" value={n} required />★<span className="sr-only">{n} out of 5</span>
          </label>
        ))}
      </fieldset>
      <input className="input" name="comment" aria-label="Comment (optional)" placeholder="Anything to add? (optional)" maxLength={1000} />
      <div className="actions">
        <button className="btn primary" disabled={pending}>
          Send rating
        </button>
      </div>
    </form>
  );
}
