"use client";
import { useActionState } from "react";
import { refreshNow, type RefreshState } from "./actions";

export function RefreshButton() {
  const [state, action, pending] = useActionState<RefreshState>(refreshNow, undefined);
  return (
    <form action={action} className="actions">
      {state?.error && <span className="error" style={{ padding: "4px 8px" }}>{state.error}</span>}
      <button className="btn" disabled={pending}>
        {pending ? "Checking…" : "Refresh now"}
      </button>
    </form>
  );
}
