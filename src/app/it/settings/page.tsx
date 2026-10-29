import { asc, desc, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { inviteStatus, listInvites } from "@/lib/invites";
import { requireAdmin } from "@/lib/session";
import { formatMinutes } from "@/lib/sla";
import { getLookups } from "@/lib/tickets";
import { addRule, archiveListItem, cancelInvite, deleteRule, mapNetSite, moveRule, removeNetConnection, toggleNetConnection } from "./actions";
import { InviteForm, ListEditor, NewLinkButton, RoleSelect, SlackTest, SlaForm, WorkingHoursForm } from "./forms";
import { getSlaSettings } from "@/lib/sla-rules";
import { assetTypes } from "@/lib/assets";
import { AutoSelect } from "@/components/auto-select";
import { getNetSettings } from "@/lib/network/poll";
import { connections } from "@/lib/network/queries";
import { decryptSecret, hint } from "@/lib/network/secret";
import { AddConnectionForm, CheckNowButton, EditConnection, NetAlertsForm } from "./network-forms";
import { slackChannelName, slackMode } from "@/lib/slack";

export const metadata = { title: "Settings" };

const dateFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" });

export default async function Settings() {
  const me = await requireAdmin();
  const [lookups, rules, invites, team, staffCount, slaSettings] = await Promise.all([
    getLookups(),
    db.select().from(schema.assignmentRule).orderBy(asc(schema.assignmentRule.position), asc(schema.assignmentRule.id)),
    listInvites(),
    db
      .select({ id: schema.user.id, name: schema.user.name, email: schema.user.email, role: schema.user.role, twoFactorEnabled: schema.user.twoFactorEnabled })
      .from(schema.user)
      .where(inArray(schema.user.role, ["tech", "admin"]))
      .orderBy(desc(schema.user.role), asc(schema.user.name)),
    db.$count(schema.user, inArray(schema.user.role, ["staff"])),
    getSlaSettings(),
  ]);
  const kitTypes = await assetTypes();
  const [connRows, netSites, netSettings] = await Promise.all([connections(), db.select().from(schema.netSite).orderBy(schema.netSite.name), getNetSettings()]);
  const conns = connRows.map(({ apiKeyEnc, ...c }) => ({ ...c, keyHint: hint(decryptSecret(apiKeyEnc)) }));
  const slack = slackMode();
  const pending = invites.filter((i) => inviteStatus(i) === "pending");
  const siteName = new Map(lookups.sites.map((s) => [s.id, s.name]));
  const catName = new Map(lookups.categories.map((c) => [c.id, c.name]));
  const techName = new Map(lookups.itUsers.map((u) => [u.id, u.name]));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <p className="sub">Who gets which job, SLA targets, places and the IT team</p>
        </div>
      </div>

      <div className="grid cols-2" style={{ alignItems: "start" }}>
        <section className="panel">
          <div className="panel-head">
            <h2>IT team</h2>
          </div>
          <div className="panel-body stack" style={{ gap: 14 }}>
            <div>
              {team.map((u) => (
                <div className="setting" key={u.id}>
                  <span>
                    <strong>{u.name}</strong>
                    <span className="muted"> · {u.email}</span>
                    {!u.twoFactorEnabled && <span className="chip s-waiting" style={{ marginLeft: 6 }}>Setup not finished</span>}
                  </span>
                  <RoleSelect userId={u.id} role={u.role} self={u.id === me.id} />
                </div>
              ))}
            </div>
            {pending.length > 0 && (
              <div>
                <span className="label">Waiting to accept</span>
                {pending.map((i) => (
                  <div className="setting" key={i.id}>
                    <span>
                      <strong>{i.name}</strong> · {i.role === "admin" ? "IT admin" : "IT tech"}
                      <br />
                      <span className="muted" style={{ fontSize: ".8rem" }}>
                        {i.email} · link expires {dateFmt.format(i.expiresAt)}
                      </span>
                    </span>
                    <span className="actions">
                      <NewLinkButton id={i.id} />
                      <form action={cancelInvite}>
                        <input type="hidden" name="id" value={i.id} />
                        <button className="btn small danger">Cancel</button>
                      </form>
                    </span>
                  </div>
                ))}
              </div>
            )}
            <InviteForm />
            <p className="note">
              Staff ({staffCount}) sign in with their work email and only see their own jobs. IT tech can work tickets. IT admin can also change
              settings and invite people. Invite links work once and expire after 7 days.
            </p>
          </div>
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Working hours</h2>
            <span className="muted" style={{ fontSize: ".78rem" }}>For priorities set to &ldquo;Working hours&rdquo;</span>
          </div>
          <WorkingHoursForm hours={slaSettings.hours} pause={slaSettings.pauseWhileWaiting} />
        </section>
      </div>

      <section className="panel">
        <div className="panel-head">
          <h2>SLA targets</h2>
          <span className="muted" style={{ fontSize: ".78rem" }}>UK time</span>
        </div>
        <SlaForm policies={lookups.policies} />
        <div className="panel-body" style={{ paddingTop: 0 }}>
          <p className="note">
            Now: {lookups.policies.map((p) => `P${p.priority} respond ${formatMinutes(p.responseMinutes)}, fix ${formatMinutes(p.resolveMinutes)}`).join(" · ")}.
            &ldquo;Any time&rdquo; counts day and night. &ldquo;Working hours&rdquo; only counts the times set under Working hours, so a job logged after hours starts counting
            the next morning.
          </p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Assignment rules</h2>
          <span className="muted" style={{ fontSize: ".78rem" }}>Checked top to bottom. The first match picks who gets a new job.</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th>
                <th>Category</th>
                <th>Site</th>
                <th>Assign to</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rules.map((r, i) => (
                <tr key={r.id}>
                  <td className="num">
                    <span className="actions" style={{ flexWrap: "nowrap" }}>
                      {i + 1}
                      <form action={moveRule}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="dir" value="up" />
                        <button className="btn small" disabled={i === 0} aria-label="Move up">↑</button>
                      </form>
                      <form action={moveRule}>
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="dir" value="down" />
                        <button className="btn small" disabled={i === rules.length - 1} aria-label="Move down">↓</button>
                      </form>
                    </span>
                  </td>
                  <td>{r.categoryId ? (catName.get(r.categoryId) ?? "Archived category") : "Any"}</td>
                  <td>{r.siteId ? (siteName.get(r.siteId) ?? "Archived site") : "Any"}</td>
                  <td>{r.assigneeId ? (techName.get(r.assigneeId) ?? <span className="muted">No longer in IT</span>) : <span className="muted">Leave unassigned</span>}</td>
                  <td>
                    <form action={deleteRule}>
                      <input type="hidden" name="id" value={r.id} />
                      <button className="btn small danger">Remove</button>
                    </form>
                  </td>
                </tr>
              ))}
              {rules.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No rules yet, so every new job starts unassigned. Add your table below.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <form action={addRule} className="toolbar" style={{ borderTop: "1px solid var(--line)", borderBottom: 0 }}>
          <select className="filter" name="categoryId" aria-label="Category">
            <option value="">Any category</option>
            {lookups.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select className="filter" name="siteId" aria-label="Site">
            <option value="">Any site</option>
            {lookups.sites.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select className="filter" name="assigneeId" aria-label="Assign to">
            <option value="">Leave unassigned</option>
            {lookups.itUsers.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <button className="btn primary">Add rule</button>
        </form>
      </section>

      <section className="panel" id="network">
        <div className="panel-head">
          <h2>Network (UniFi)</h2>
          <span className="muted" style={{ fontSize: ".78rem" }}>Read-only</span>
        </div>
        <div className="panel-body stack" style={{ gap: 14 }}>
          {conns.length === 0 && <p className="muted">Not connected. Nothing is read from your network until a connection is added here.</p>}
          {conns.map((c) => (
            <div key={c.id} className="setting" style={{ alignItems: "flex-start" }}>
              <span style={{ minWidth: 0, flex: "1 1 260px" }}>
                <strong>{c.name}</strong>{" "}
                <span className="muted">· {c.kind === "console" ? "On-site console" : c.kind === "cloud" ? "UniFi cloud" : "Example network"}</span>
                <br />
                <span className="muted" style={{ fontSize: ".8rem" }}>
                  {[c.url, c.keyHint && `key ${c.keyHint}`, c.lastOkAt ? `last worked ${c.lastOkAt.toLocaleString("en-GB", { timeZone: "Europe/London", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}` : "not read yet"]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {c.lastError && <span className="error" style={{ display: "block", marginTop: 6 }}>{c.lastError}</span>}
              </span>
              <span className="actions">
                <span className={`chip ${!c.enabled ? "s-closed" : c.lastError ? "s-bad" : c.lastOkAt ? "s-ok" : "s-waiting"}`}>
                  {!c.enabled ? "Off" : c.lastError ? "Problem" : c.lastOkAt ? "Working" : "Waiting"}
                </span>
                <CheckNowButton id={c.id} />
                {c.kind !== "example" && <EditConnection id={c.id} url={c.url} trustCert={c.trustCert} isConsole={c.kind === "console"} />}
                <form action={toggleNetConnection}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="btn small">{c.enabled ? "Turn off" : "Turn on"}</button>
                </form>
                <form action={removeNetConnection}>
                  <input type="hidden" name="id" value={c.id} />
                  <button className="btn small danger">Remove</button>
                </form>
              </span>
            </div>
          ))}
          {netSites.length > 0 && (
            <div>
              <span className="label">Which site is which</span>
              {netSites.map((n) => (
                <form key={n.id} action={mapNetSite} className="setting">
                  <input type="hidden" name="netSiteId" value={n.id} />
                  <span>
                    UniFi site <strong>{n.name}</strong>
                  </span>
                  <span className="actions">
                    <AutoSelect name="siteId" defaultValue={n.siteId ?? ""} label={`Our site for ${n.name}`} className="filter">
                      <option value="">Not one of ours</option>
                      {lookups.sites.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </AutoSelect>
                  </span>
                </form>
              ))}
            </div>
          )}
          <NetAlertsForm alertAfterMin={netSettings.alertAfterMin} autoTicket={netSettings.autoTicket} addKit={netSettings.addKitToInventory} />
          <AddConnectionForm />
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Slack</h2>
          <span className={`chip ${slack === "off" ? "s-closed" : "s-ok"}`}>{slack === "bot" ? "Connected" : slack === "webhook" ? "Connected (webhook)" : "Not connected"}</span>
        </div>
        <div className="panel-body stack" style={{ gap: 12 }}>
          {slack === "bot" && (
            <div className="list">
              <div>
                <span>New jobs are posted to the IT channel</span>
                <span className="mono muted">{slackChannelName()}</span>
              </div>
              <div>
                <span>Status changes, assignments, replies and ratings go in each job&apos;s thread</span>
                <span className="chip s-ok">On</span>
              </div>
              <div>
                <span>People get a direct message about their own jobs, and when a job is assigned to them</span>
                <span className="chip s-ok">On</span>
              </div>
              <div>
                <span>Internal notes</span>
                <span className="muted">Never sent to Slack</span>
              </div>
            </div>
          )}
          {slack === "webhook" && (
            <p className="muted">New jobs are posted to one channel. Add a bot token to also get threads and direct messages.</p>
          )}
          {slack === "off" && (
            <p className="muted">
              Connect a Slack app to post new jobs to your IT channel and message people about their jobs. The steps are in{" "}
              <span className="mono">docs/slack-setup.md</span>.
            </p>
          )}
          <SlackTest />
          <p className="muted" style={{ fontSize: ".78rem" }}>
            Slack messages go to people whose Slack account uses the same email address as their IT Hub account.
          </p>
        </div>
      </section>

      <div className="grid cols-2" style={{ alignItems: "start" }}>
        <ListEditor kind="site" title="Sites" items={lookups.sites} archive={archiveListItem} />
        <ListEditor kind="category" title="Job categories" items={lookups.categories} archive={archiveListItem} />
        <ListEditor kind="type" title="Kit types" items={kitTypes} archive={archiveListItem} />
      </div>
    </div>
  );
}
