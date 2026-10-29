import type { ReactNode } from "react";

// A small Markdown subset for help articles. It builds React elements rather than HTML,
// so nothing in an article can inject markup or scripts.
//   # / ## / ### headings, paragraphs, - or * bullet lists, 1. numbered lists,
//   > tips, ``` code blocks, --- rules, ![alt](image) on its own line,
//   **bold**, *italic*, `code` and [links](https://…).

/** Links may go to the web, email, phone, or a page in the app. */
export function safeHref(href: string) {
  const h = href.trim();
  if (/^(https?:|mailto:|tel:)/i.test(h)) return h;
  if (h.startsWith("/") && !h.startsWith("//")) return h;
  return null;
}

/** Images only from our own help uploads, or https. */
export function safeImage(src: string) {
  const s = src.trim();
  if (/^\/api\/help-images\/\d+$/.test(s)) return s;
  if (/^https:\/\//i.test(s)) return s;
  return null;
}

const INLINE = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\(([^)\s]+)\))|(\*([^*\s][^*]*)\*)|(_([^_\s][^_]*)_)/;

export function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let rest = text;
  let n = 0;
  while (rest) {
    const m = INLINE.exec(rest);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index) out.push(rest.slice(0, m.index));
    const k = `${key}-${n++}`;
    if (m[1]) out.push(<strong key={k}>{inline(m[2], k)}</strong>);
    else if (m[3]) out.push(<code key={k}>{m[4]}</code>);
    else if (m[5]) {
      const href = safeHref(m[7]);
      out.push(
        href ? (
          <a key={k} href={href} {...(/^https?:/i.test(href) ? { target: "_blank", rel: "noreferrer" } : {})}>
            {inline(m[6], k)}
          </a>
        ) : (
          m[6]
        ),
      );
    } else if (m[8]) out.push(<em key={k}>{inline(m[9], k)}</em>);
    else if (m[10]) out.push(<em key={k}>{inline(m[11], k)}</em>);
    rest = rest.slice(m.index + m[0].length);
  }
  return out;
}

type Block =
  | { t: "h"; level: 2 | 3 | 4; text: string }
  | { t: "p"; text: string }
  | { t: "ul" | "ol"; items: string[] }
  | { t: "tip"; text: string }
  | { t: "code"; text: string }
  | { t: "img"; alt: string; src: string }
  | { t: "hr" };

export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) blocks.push({ t: "p", text: para.join(" ") });
    para = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("```")) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith("```"); i++) code.push(lines[i]);
      blocks.push({ t: "code", text: code.join("\n") });
      continue;
    }
    if (!trimmed) {
      flush();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = trimmed.match(/^(#{1,3})\s+(.*)$/))) {
      flush();
      blocks.push({ t: "h", level: (m[1].length + 1) as 2 | 3 | 4, text: m[2] });
    } else if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      flush();
      blocks.push({ t: "hr" });
    } else if ((m = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/))) {
      flush();
      blocks.push({ t: "img", alt: m[1], src: m[2] });
    } else if (/^[-*]\s+/.test(trimmed) || /^\d+[.)]\s+/.test(trimmed)) {
      flush();
      const kind = /^\d/.test(trimmed) ? "ol" : "ul";
      const re = kind === "ol" ? /^\d+[.)]\s+/ : /^[-*]\s+/;
      const items: string[] = [];
      for (; i < lines.length && re.test(lines[i].trim()); i++) items.push(lines[i].trim().replace(re, ""));
      i--;
      blocks.push({ t: kind, items });
    } else if (trimmed.startsWith(">")) {
      flush();
      const tip: string[] = [];
      for (; i < lines.length && lines[i].trim().startsWith(">"); i++) tip.push(lines[i].trim().replace(/^>\s?/, ""));
      i--;
      blocks.push({ t: "tip", text: tip.join(" ") });
    } else {
      para.push(trimmed);
    }
  }
  flush();
  return blocks;
}

export function Markdown({ source }: { source: string }) {
  return (
    <div className="prose">
      {parseBlocks(source).map((b, i) => {
        const k = `b${i}`;
        switch (b.t) {
          case "h": {
            const H = `h${b.level}` as "h2" | "h3" | "h4";
            return <H key={k}>{inline(b.text, k)}</H>;
          }
          case "p":
            return <p key={k}>{inline(b.text, k)}</p>;
          case "ul":
          case "ol": {
            const L = b.t;
            return (
              <L key={k}>
                {b.items.map((it, j) => (
                  <li key={j}>{inline(it, `${k}-${j}`)}</li>
                ))}
              </L>
            );
          }
          case "tip":
            return (
              <p key={k} className="tip">
                {inline(b.text, k)}
              </p>
            );
          case "code":
            return (
              <pre key={k}>
                <code>{b.text}</code>
              </pre>
            );
          case "img": {
            const src = safeImage(b.src);
            // eslint-disable-next-line @next/next/no-img-element
            return src ? <img key={k} src={src} alt={b.alt} loading="lazy" /> : null;
          }
          case "hr":
            return <hr key={k} />;
        }
      })}
    </div>
  );
}
