// Runs once when the server starts. Starts the UniFi poller (every NETWORK_POLL_SECONDS, default 60; 0 turns it off).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const seconds = Number(process.env.NETWORK_POLL_SECONDS ?? 60);
  if (!Number.isFinite(seconds) || seconds <= 0) return;
  const { pollAll } = await import("./lib/network/poll");
  const g = globalThis as unknown as { netTimer?: NodeJS.Timeout };
  if (g.netTimer) return;
  g.netTimer = setInterval(() => {
    pollAll().catch((e) => console.error("[network] poll failed", e));
  }, Math.max(15, seconds) * 1000);
  g.netTimer.unref();
}
