"use client";
import { useEffect, useRef, useState } from "react";
import { Icon } from "./icons";

const MAX = 5;

/**
 * Screenshot/photo picker. Keeps the chosen files in a real <input name="files">
 * so the surrounding form posts them normally. Supports tap-to-choose, the camera
 * on phones, drag and drop, and pasting a screenshot.
 */
export function FilePicker({ compact = false, resetKey }: { compact?: boolean; resetKey?: unknown }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const [over, setOver] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const u = files.map((f) => URL.createObjectURL(f));
    setUrls(u);
    const dt = new DataTransfer();
    files.forEach((f) => dt.items.add(f));
    if (input.current) input.current.files = dt.files;
    return () => u.forEach((x) => URL.revokeObjectURL(x));
  }, [files]);

  useEffect(() => setFiles([]), [resetKey]);

  const add = (list: FileList | File[] | null) => {
    if (!list) return;
    const images = Array.from(list).filter((f) => f.type.startsWith("image/"));
    setNote(images.length < Array.from(list).length ? "Only images can be added." : null);
    setFiles((prev) => {
      const next = [...prev, ...images].slice(0, MAX);
      if (prev.length + images.length > MAX) setNote(`You can add up to ${MAX} images.`);
      return next;
    });
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = Array.from(e.clipboardData?.files ?? []);
      if (items.length) add(items);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div className="stack" style={{ gap: 8 }}>
      <input ref={input} type="file" name="files" accept="image/*" multiple hidden id="files" onChange={(e) => add(e.target.files)} />
      {compact ? (
        <button type="button" className="btn" onClick={() => input.current?.click()} aria-label="Attach screenshot or photo">
          <Icon name="clip" />
          {files.length ? files.length : ""}
        </button>
      ) : (
        <label
          htmlFor="files"
          className={`drop ${over ? "over" : ""}`}
          onClick={(e) => {
            e.preventDefault();
            input.current?.click();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            add(e.dataTransfer.files);
          }}
        >
          <Icon name="camera" />
          <strong>Add screenshots or take a photo</strong>
          <span style={{ fontSize: ".8rem" }}>Paste, drag in, or tap to choose. Up to {MAX} images, 10 MB each.</span>
        </label>
      )}
      {note && <p className="hint">{note}</p>}
      {files.length > 0 && !compact && (
        <div className="previews">
          {files.map((f, i) => (
            <figure key={i}>
              <img src={urls[i]} alt={f.name} />
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>
                ×
              </button>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
