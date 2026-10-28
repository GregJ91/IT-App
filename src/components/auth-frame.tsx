import type { ReactNode } from "react";

export function AuthFrame(props: { title: string; blurb: string; foot?: string; children: ReactNode }) {
  return (
    <div className="auth">
      <div className="side">
        <div className="brand">
          <img className="logo-img" src="/brand/logo.png" alt="Gardeners Dream" />
          <span style={{ fontWeight: 700 }}>IT Hub</span>
        </div>
        <div>
          <h1>{props.title}</h1>
          <p style={{ marginTop: 10 }}>{props.blurb}</p>
        </div>
        <p className="hide-sm" style={{ fontSize: ".8rem" }}>
          {props.foot ?? "Gardeners Dream IT support"}
        </p>
      </div>
      <div className="form-side">
        <div className="card">{props.children}</div>
      </div>
    </div>
  );
}
