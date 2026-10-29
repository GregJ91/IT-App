import http from "node:http";
import https from "node:https";
import { SourceError } from "./types";

/**
 * GET a JSON document. `trustCert` accepts a console's own (self-signed) certificate;
 * it's only ever used for the address the admin typed in for that console.
 */
export function getJson<T>(url: string, headers: Record<string, string>, opts: { trustCert?: boolean; timeoutMs?: number } = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return reject(new SourceError(`"${url}" isn't a web address.`));
    }
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request(
      u,
      { method: "GET", headers: { Accept: "application/json", ...headers }, timeout: opts.timeoutMs ?? 8000, ...(u.protocol === "https:" ? { rejectUnauthorized: !opts.trustCert } : {}) },
      (res) => {
        let body = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (body += c));
        res.on("end", () => {
          const status = res.statusCode ?? 0;
          if (status === 401 || status === 403) return reject(new SourceError("UniFi turned down the API key. Check it was copied in full and hasn't been deleted."));
          if (status === 404) return reject(new SourceError(`UniFi says ${u.pathname} doesn't exist. Check the address, and that the console's Network app is version 9 or newer.`));
          if (status === 429) return reject(new SourceError("UniFi says we're asking too often. It'll try again shortly."));
          if (status < 200 || status >= 300) return reject(new SourceError(`UniFi answered with an error (HTTP ${status}).`));
          try {
            resolve(JSON.parse(body) as T);
          } catch {
            reject(new SourceError("UniFi's answer wasn't readable. Check the address points at the console itself."));
          }
        });
      },
    );
    req.on("timeout", () => req.destroy(new SourceError("UniFi didn't answer in time. Is the address right, and can the server reach it?")));
    req.on("error", (e) => {
      if (e instanceof SourceError) return reject(e);
      const code = (e as NodeJS.ErrnoException).code ?? "";
      if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY/.test(code) || /certificate/i.test(e.message)) {
        return reject(new SourceError("The console's security certificate isn't trusted. Tick \"Trust this console's own certificate\" if this is your console's address."));
      }
      if (code === "ENOTFOUND") return reject(new SourceError(`Couldn't find ${u.hostname}. Check the address.`));
      if (code === "ECONNREFUSED" || code === "EHOSTUNREACH" || code === "ETIMEDOUT") return reject(new SourceError(`Couldn't reach ${u.host} from the server. It has to be on the same network, or reachable over a VPN.`));
      reject(new SourceError(`Couldn't connect: ${e.message}`));
    });
    req.end();
  });
}
