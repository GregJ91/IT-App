"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addAssetPhotos, AssetError, checkIn, checkOut, createAsset, deleteAssetPhoto, isAssetStatus, updateAsset, type AssetInput } from "@/lib/assets";
import { requireIT } from "@/lib/session";
import { UploadError } from "@/lib/storage";

export type AssetFormState = { error?: string; ok?: string } | undefined;

const text = (f: FormData, k: string, max = 200) => String(f.get(k) ?? "").trim().slice(0, max);
const optId = (f: FormData, k: string) => Number(f.get(k)) || null;
const optDate = (f: FormData, k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(text(f, k)) ? text(f, k) : null);

function parse(form: FormData): AssetInput {
  const name = text(form, "name", 160);
  if (!name) throw new AssetError("Give it a name, e.g. Dell Latitude 5440.");
  const status = text(form, "status");
  const costText = text(form, "cost").replace(/[£,\s]/g, "");
  if (costText && !/^\d+(\.\d{1,2})?$/.test(costText)) throw new AssetError("Enter the cost as a number, e.g. 849.99.");
  return {
    name,
    typeId: optId(form, "typeId"),
    make: text(form, "make"),
    model: text(form, "model"),
    serial: text(form, "serial"),
    status: isAssetStatus(status) ? status : "spare",
    siteId: optId(form, "siteId"),
    location: text(form, "location"),
    ipAddress: text(form, "ipAddress", 45),
    macAddress: text(form, "macAddress", 40),
    purchaseDate: optDate(form, "purchaseDate"),
    purchaseCostPence: costText ? Math.round(parseFloat(costText) * 100) : null,
    supplier: text(form, "supplier"),
    warrantyUntil: optDate(form, "warrantyUntil"),
    notes: text(form, "notes", 5000),
  };
}

const photos = (form: FormData) => form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 10);

function failure(e: unknown): AssetFormState {
  if (e instanceof AssetError || e instanceof UploadError) return { error: e.message };
  throw e;
}

export async function saveAsset(_: AssetFormState, form: FormData): Promise<AssetFormState> {
  const u = await requireIT();
  const id = Number(form.get("id")) || null;
  let saved: number;
  try {
    const input = parse(form);
    saved = id ? (await updateAsset(u, id, input)).id : (await createAsset(u, input, photos(form), text(form, "tag") || undefined)).id;
  } catch (e) {
    return failure(e);
  }
  revalidatePath("/it/assets");
  redirect(`/it/assets/${saved}${id ? "" : "?added=1"}`);
}

export async function checkOutAction(_: AssetFormState, form: FormData): Promise<AssetFormState> {
  const u = await requireIT();
  const id = Number(form.get("id"));
  try {
    await checkOut(u, id, { userId: text(form, "userId") || null, name: text(form, "toName", 100) }, text(form, "note", 500));
  } catch (e) {
    return failure(e);
  }
  revalidatePath(`/it/assets/${id}`);
  return { ok: "Checked out" };
}

export async function checkInAction(_: AssetFormState, form: FormData): Promise<AssetFormState> {
  const u = await requireIT();
  const id = Number(form.get("id"));
  try {
    await checkIn(u, id, { siteId: optId(form, "siteId"), location: text(form, "location") }, text(form, "note", 500));
  } catch (e) {
    return failure(e);
  }
  revalidatePath(`/it/assets/${id}`);
  return { ok: "Checked in" };
}

export async function addPhotosAction(_: AssetFormState, form: FormData): Promise<AssetFormState> {
  const u = await requireIT();
  const id = Number(form.get("id"));
  try {
    await addAssetPhotos(u, id, photos(form));
  } catch (e) {
    return failure(e);
  }
  revalidatePath(`/it/assets/${id}`);
  return { ok: "Photo added" };
}

export async function deletePhotoAction(form: FormData) {
  const u = await requireIT();
  const row = await deleteAssetPhoto(u, Number(form.get("photoId")));
  if (row) revalidatePath(`/it/assets/${row.assetId}`);
}
