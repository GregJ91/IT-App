"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { helpFeedbackAction } from "../actions";

export function Feedback({ articleId, answered, title }: { articleId: number; answered: "yes" | "no" | null; title: string }) {
  const [answer, setAnswer] = useState(answered);
  const [pending, start] = useTransition();
  const send = (helpful: boolean) =>
    start(async () => {
      await helpFeedbackAction(articleId, helpful);
      setAnswer(helpful ? "yes" : "no");
    });
  return (
    <section className="panel panel-body stack" style={{ gap: 10, alignItems: "center", textAlign: "center" }}>
      {answer === "yes" ? (
        <p>
          <strong>Great, glad it helped.</strong>
        </p>
      ) : answer === "no" ? (
        <>
          <p>
            <strong>Sorry it didn&apos;t help.</strong> Raise a job and IT will sort it.
          </p>
          <Link className="btn primary" href={`/my/new?title=${encodeURIComponent(title)}`}>
            Raise a job
          </Link>
        </>
      ) : (
        <>
          <p>
            <strong>Did this help?</strong>
          </p>
          <div className="actions">
            <button className="btn" disabled={pending} onClick={() => send(true)}>
              Yes
            </button>
            <button className="btn" disabled={pending} onClick={() => send(false)}>
              No
            </button>
          </div>
        </>
      )}
    </section>
  );
}
