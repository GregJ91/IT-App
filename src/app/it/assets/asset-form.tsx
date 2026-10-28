"use client";
import { useActionState } from "react";
import { FilePicker } from "@/components/file-picker";
import { saveAsset, type AssetFormState } from "./actions";

type Opt = { id: number; name: string };
type Values = {
  id?: number;
  tag?: string;
  name?: string;
  typeId?: number | null;
  make?: string;
  model?: string;
  serial?: string;
  status?: string;
  siteId?: number | null;
  location?: string;
  ipAddress?: string;
  macAddress?: string;
  purchaseDate?: string | null;
  purchaseCostPence?: number | null;
  supplier?: string;
  warrantyUntil?: string | null;
  notes?: string;
};

export function AssetForm({ types, sites, values = {}, nextTag }: { types: Opt[]; sites: Opt[]; values?: Values; nextTag?: string }) {
  const [state, action, pending] = useActionState<AssetFormState, FormData>(saveAsset, undefined);
  const editing = !!values.id;
  return (
    <form action={action} className="stack">
      {state?.error && <p className="error">{state.error}</p>}
      {editing && <input type="hidden" name="id" value={values.id} />}
      <section className="panel panel-body form">
        <h2>What is it?</h2>
        <div className="two">
          <div className="field">
            <label htmlFor="a-name">Name</label>
            <input className="input" id="a-name" name="name" required maxLength={160} defaultValue={values.name} placeholder="e.g. Dell Latitude 5440" />
          </div>
          <div className="field">
            <label htmlFor="a-type">Type</label>
            <select id="a-type" name="typeId" defaultValue={values.typeId ?? ""}>
              <option value="">Choose a type</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="three">
          <div className="field">
            <label htmlFor="a-make">Make</label>
            <input className="input" id="a-make" name="make" defaultValue={values.make} placeholder="Dell" />
          </div>
          <div className="field">
            <label htmlFor="a-model">Model</label>
            <input className="input" id="a-model" name="model" defaultValue={values.model} placeholder="Latitude 5440" />
          </div>
          <div className="field">
            <label htmlFor="a-serial">Serial number</label>
            <input className="input mono" id="a-serial" name="serial" defaultValue={values.serial} />
          </div>
        </div>
        <div className="two">
          <div className="field">
            <label htmlFor="a-status">Status</label>
            <select id="a-status" name="status" defaultValue={values.status ?? "spare"}>
              <option value="in_use">In use</option>
              <option value="spare">Spare</option>
              <option value="repair">In repair</option>
              <option value="retired">Retired</option>
            </select>
          </div>
          {!editing && (
            <div className="field">
              <label htmlFor="a-tag">Asset tag</label>
              <input className="input mono" id="a-tag" name="tag" placeholder={nextTag} />
              <span className="hint">Leave blank to use {nextTag}. Fill in if it already has a label.</span>
            </div>
          )}
        </div>
      </section>

      <section className="panel panel-body form">
        <h2>Where is it?</h2>
        <div className="two">
          <div className="field">
            <label htmlFor="a-site">Site</label>
            <select id="a-site" name="siteId" defaultValue={values.siteId ?? ""}>
              <option value="">Choose a site</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="a-loc">Location</label>
            <input className="input" id="a-loc" name="location" defaultValue={values.location} placeholder="e.g. Dispatch, IT cupboard" />
          </div>
        </div>
        <div className="two">
          <div className="field">
            <label htmlFor="a-ip">IP address</label>
            <input className="input mono" id="a-ip" name="ipAddress" defaultValue={values.ipAddress} placeholder="10.20.1.31" inputMode="decimal" />
          </div>
          <div className="field">
            <label htmlFor="a-mac">MAC address</label>
            <input className="input mono" id="a-mac" name="macAddress" defaultValue={values.macAddress} placeholder="3C:52:82:1A:7F:04" />
          </div>
        </div>
        <p className="hint">IP and MAC are for printers, scanners, Raspberry Pis and anything else on the network.</p>
      </section>

      <section className="panel panel-body form">
        <h2>Purchase and warranty</h2>
        <div className="two">
          <div className="field">
            <label htmlFor="a-pdate">Bought on</label>
            <input className="input" id="a-pdate" name="purchaseDate" type="date" defaultValue={values.purchaseDate ?? ""} />
          </div>
          <div className="field">
            <label htmlFor="a-cost">Cost (£)</label>
            <input
              className="input"
              id="a-cost"
              name="cost"
              inputMode="decimal"
              defaultValue={values.purchaseCostPence != null ? (values.purchaseCostPence / 100).toFixed(2) : ""}
              placeholder="849.00"
            />
          </div>
        </div>
        <div className="two">
          <div className="field">
            <label htmlFor="a-supplier">Supplier</label>
            <input className="input" id="a-supplier" name="supplier" defaultValue={values.supplier} />
          </div>
          <div className="field">
            <label htmlFor="a-warranty">Warranty until</label>
            <input className="input" id="a-warranty" name="warrantyUntil" type="date" defaultValue={values.warrantyUntil ?? ""} />
            <span className="hint">IT gets a reminder 14, 7 and 1 days before.</span>
          </div>
        </div>
        <div className="field">
          <label htmlFor="a-notes">Notes</label>
          <textarea id="a-notes" name="notes" defaultValue={values.notes} placeholder="Accessories, quirks, where the charger lives. Never put passwords here." />
        </div>
      </section>

      {!editing && (
        <section className="panel panel-body form">
          <h2>Photos</h2>
          <FilePicker />
        </section>
      )}
      <div className="actions">
        <button className="btn primary" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Add to inventory"}
        </button>
      </div>
    </form>
  );
}
