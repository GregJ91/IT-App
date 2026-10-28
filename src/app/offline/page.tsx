export const metadata = { title: "Offline" };

export default function Offline() {
  return (
    <main style={{ display: "grid", placeItems: "center", minHeight: "100%", padding: 24 }}>
      <div className="panel panel-body stack" style={{ maxWidth: 420, textAlign: "center" }}>
        <h1>You&apos;re offline</h1>
        <p className="muted">Pages you&apos;ve opened recently still work. Raising or updating jobs needs a connection, so try again when you&apos;re back online.</p>
        <a className="btn primary" href="/">
          Try again
        </a>
      </div>
    </main>
  );
}
