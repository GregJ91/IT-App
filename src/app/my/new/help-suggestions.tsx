"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Markdown } from "@/components/markdown";
import { helpFeedbackAction, suggestHelp } from "../help/actions";

type Suggestion = Awaited<ReturnType<typeof suggestHelp>>[number];

/** Help articles matching what's been typed so far, with "This fixed it" so the job needn't be sent. */
export function HelpSuggestions({ text, onSolved }: { text: string; onSolved: () => void }) {
  const [list, setList] = useState<Suggestion[]>([]);
  useEffect(() => {
    const q = text.trim();
    if (q.length < 4) {
      setList([]);
      return;
    }
    let live = true;
    const t = setTimeout(() => {
      suggestHelp(q)
        .then((r) => live && setList(r))
        .catch(() => {});
    }, 400);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [text]);

  if (!list.length) return null;
  return (
    <div className="suggest" aria-live="polite">
      <h3>These might fix it straight away</h3>
      {list.map((a) => (
        <details key={a.id}>
          <summary>
            <strong>{a.title}</strong>
            {a.summary && <span className="muted">{a.summary}</span>}
          </summary>
          <div className="body">
            <Markdown source={a.body} />
            <div className="actions">
              <button
                type="button"
                className="btn primary small"
                onClick={async () => {
                  await helpFeedbackAction(a.id, true, true);
                  onSolved();
                }}
              >
                This fixed it
              </button>
              <Link className="btn small" href={`/my/help/${a.slug}`} target="_blank">
                Open in a new tab
              </Link>
            </div>
          </div>
        </details>
      ))}
    </div>
  );
}
