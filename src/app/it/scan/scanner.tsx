"use client";
import jsQR from "jsqr";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** Turns what a QR code or a typed code says into a page in the app, or null. */
export function destinationFor(text: string): string | null {
  const t = text.trim();
  const m = t.match(/\/(a|s)\/([A-Za-z0-9-]+)\/?$/);
  if (m) return `/${m[1]}/${encodeURIComponent(m[2])}`;
  if (/^gd[-\s]?\d{1,7}$/i.test(t)) return `/a/${encodeURIComponent(t.replace(/\s/g, "-"))}`;
  if (/^st[-\s]?\d{1,6}$/i.test(t)) return `/s/${encodeURIComponent(t.replace(/\s/g, "-").toUpperCase())}`;
  return null;
}

export function Scanner() {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "scanning" | "blocked" | "unsupported">("starting");
  const [notOurs, setNotOurs] = useState<string | null>(null);
  const [code, setCode] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let done = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    const tick = () => {
      const v = video.current;
      if (done || !v || !ctx) return;
      if (v.readyState === v.HAVE_ENOUGH_DATA) {
        const w = 480;
        const h = Math.round((v.videoHeight / v.videoWidth) * w) || w;
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(v, 0, 0, w, h);
        const found = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
        if (found?.data) {
          const dest = destinationFor(found.data);
          if (dest) {
            done = true;
            navigator.vibrate?.(60);
            router.push(dest);
            return;
          }
          setNotOurs(found.data);
        }
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setState("unsupported");
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        setState("scanning");
        raf = requestAnimationFrame(tick);
      } catch {
        setState("blocked");
      }
    })();
    return () => {
      done = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [router]);

  return (
    <div className="stack">
      <div className="scanner">
        <video ref={video} playsInline muted aria-label="Camera view" />
        {state === "scanning" && <div className="frame" />}
      </div>
      {state === "starting" && <p className="muted" style={{ textAlign: "center" }}>Starting the camera…</p>}
      {state === "blocked" && (
        <p className="error">
          The camera is blocked. Allow camera access for this site in your browser settings, or use your phone&apos;s own camera app on the label: it
          opens the same page.
        </p>
      )}
      {state === "unsupported" && <p className="note">This browser can&apos;t use the camera here. Your phone&apos;s camera app can scan the label instead.</p>}
      {notOurs && <p className="note">That QR code isn&apos;t an IT Hub label: {notOurs.slice(0, 80)}</p>}
      <form
        className="panel panel-body actions"
        onSubmit={(e) => {
          e.preventDefault();
          const dest = destinationFor(code);
          if (dest) router.push(dest);
          else router.push(`/it/assets?q=${encodeURIComponent(code)}`);
        }}
      >
        <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Or type a tag, e.g. GD-00042 or ST-0007" aria-label="Tag or code" style={{ flex: 1, minWidth: 0 }} />
        <button className="btn primary">Open</button>
      </form>
    </div>
  );
}
