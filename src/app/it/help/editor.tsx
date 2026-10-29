"use client";
import { useActionState, useRef, useState } from "react";
import { Markdown } from "@/components/markdown";
import { saveArticleAction, uploadHelpImage, type HelpState } from "./actions";

type Opt = { id: number; name: string };
type Values = { id?: number; title: string; summary: string; body: string; categoryId: number | null; published: boolean };

const STARTER = `Short intro: what this fixes and who it's for.

## Steps

1. First step
2. Second step

> Tip: anything worth knowing.

Still stuck? Raise a job and IT will help.`;

export function ArticleEditor({ categories, v, saved }: { categories: Opt[]; v?: Values; saved?: boolean }) {
  const [state, action, pending] = useActionState<HelpState, FormData>(saveArticleAction, saved ? { ok: "Saved." } : undefined);
  const [body, setBody] = useState(v?.body ?? STARTER);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [upload, setUpload] = useState<{ busy?: boolean; error?: string }>({});
  const area = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);

  async function addImage(f: File) {
    setUpload({ busy: true });
    const fd = new FormData();
    fd.set("file", f);
    const res = await uploadHelpImage(fd);
    if (res.error || !res.markdown) return setUpload({ error: res.error ?? "Upload failed." });
    // Insert on its own line where the cursor is.
    const el = area.current;
    const at = el ? el.selectionStart : body.length;
    const before = body.slice(0, at).replace(/\s*$/, "");
    const after = body.slice(at).replace(/^\s*/, "");
    setBody(`${before}${before ? "\n\n" : ""}${res.markdown}\n\n${after}`);
    setUpload({});
  }

  return (
    <form action={action} className="panel panel-body form">
      {v?.id && <input type="hidden" name="id" value={v.id} />}
      <div className="field">
        <label htmlFor="h-title">Title</label>
        <input className="input" id="h-title" name="title" required maxLength={140} defaultValue={v?.title} placeholder="e.g. Connect to the office Wi-Fi" />
      </div>
      <div className="two">
        <div className="field">
          <label htmlFor="h-summary">One-line summary</label>
          <input className="input" id="h-summary" name="summary" maxLength={240} defaultValue={v?.summary} placeholder="Shown in search results and suggestions" />
        </div>
        <div className="field">
          <label htmlFor="h-cat">Category</label>
          <select id="h-cat" name="categoryId" defaultValue={v?.categoryId ?? ""}>
            <option value="">None</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div className="tabs" role="group" aria-label="Editor view">
            <button type="button" className="tab" aria-pressed={tab === "write"} onClick={() => setTab("write")}>
              Write
            </button>
            <button type="button" className="tab" aria-pressed={tab === "preview"} onClick={() => setTab("preview")}>
              Preview
            </button>
          </div>
          <span className="actions">
            <input
              ref={file}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) addImage(f);
                e.target.value = "";
              }}
            />
            <button type="button" className="btn small" disabled={upload.busy} onClick={() => file.current?.click()}>
              {upload.busy ? "Uploading…" : "Add screenshot"}
            </button>
          </span>
        </div>
        {upload.error && <p className="error">{upload.error}</p>}
        <textarea
          ref={area}
          id="h-body"
          name="body"
          aria-label="Article"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onPaste={(e) => {
            const f = [...e.clipboardData.files].find((x) => x.type.startsWith("image/"));
            if (f) {
              e.preventDefault();
              addImage(f);
            }
          }}
          style={{ minHeight: 320, fontFamily: "var(--font-mono)", fontSize: ".85rem", display: tab === "write" ? undefined : "none" }}
        />
        {tab === "preview" && (
          <div className="note" style={{ background: "var(--surface)", border: "1px solid var(--line)", minHeight: 320 }}>
            <Markdown source={body} />
          </div>
        )}
        <span className="hint">
          ## heading · - bullet · 1. step · **bold** · [link](https://…) · &gt; tip. Paste a screenshot straight in.
        </span>
      </div>
      <label className="actions" style={{ fontSize: ".9rem" }}>
        <input type="checkbox" name="published" defaultChecked={v?.published ?? false} /> Published, so staff can see it and it&apos;s suggested when they raise a job
      </label>
      {state?.error && <p className="error">{state.error}</p>}
      {state?.ok && <p className="success">{state.ok}</p>}
      <div className="actions">
        <button className="btn primary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
