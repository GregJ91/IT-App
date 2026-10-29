// Help articles: how-to guides staff can read, suggested while they raise a job.
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Actor } from "./roles";
import { isITRole } from "./roles";
import { saveUpload } from "./storage";

const { helpArticle, helpFeedback, helpImage, category, user } = schema;

export class HelpError extends Error {}

const requireIT = (actor: Actor) => {
  if (!isITRole(actor.role)) throw new HelpError("Only the IT team can change help articles.");
};

export type ArticleInput = { title: string; summary: string; body: string; categoryId: number | null; published: boolean };

export function slugify(title: string) {
  return (
    title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_-]+/g, "-")
      .slice(0, 60)
      .replace(/-$/, "") || "article"
  );
}

async function freeSlug(title: string, exceptId?: number) {
  const base = slugify(title);
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}-${n}`;
    const hit = await db.query.helpArticle.findFirst({ where: eq(helpArticle.slug, slug), columns: { id: true } });
    if (!hit || hit.id === exceptId) return slug;
  }
}

function check(input: ArticleInput) {
  if (!input.title.trim()) throw new HelpError("Give the article a title.");
  if (input.published && !input.body.trim()) throw new HelpError("Write something before publishing.");
}

export async function saveArticle(actor: Actor, id: number | null, input: ArticleInput) {
  requireIT(actor);
  check(input);
  const values = { ...input, title: input.title.trim(), summary: input.summary.trim(), updatedById: actor.id, updatedAt: new Date() };
  if (id) {
    const before = await db.query.helpArticle.findFirst({ where: eq(helpArticle.id, id) });
    if (!before) throw new HelpError("Article not found.");
    // Keep links working once published: only re-slug drafts.
    const slug = before.published ? before.slug : await freeSlug(values.title, id);
    const [row] = await db.update(helpArticle).set({ ...values, slug }).where(eq(helpArticle.id, id)).returning();
    return row;
  }
  const [row] = await db
    .insert(helpArticle)
    .values({ ...values, slug: await freeSlug(values.title), createdById: actor.id })
    .returning();
  return row;
}

export async function deleteArticle(actor: Actor, id: number) {
  requireIT(actor);
  await db.delete(helpArticle).where(eq(helpArticle.id, id));
}

export async function saveHelpImage(actor: Actor, file: File) {
  requireIT(actor);
  const key = await saveUpload(file);
  const [row] = await db.insert(helpImage).values({ storageKey: key, mimeType: file.type, uploadedById: actor.id }).returning();
  return row;
}

export async function getHelpImage(id: number) {
  return db.query.helpImage.findFirst({ where: eq(helpImage.id, id) });
}

/* ---------- reading ---------- */

const fields = {
  id: helpArticle.id,
  slug: helpArticle.slug,
  title: helpArticle.title,
  summary: helpArticle.summary,
  categoryId: helpArticle.categoryId,
  categoryName: category.name,
  published: helpArticle.published,
  views: helpArticle.views,
  updatedAt: helpArticle.updatedAt,
};

const doc = sql`to_tsvector('english', ${helpArticle.title} || ' ' || ${helpArticle.summary} || ' ' || ${helpArticle.body})`;

/** Words from free text as an OR search, so "printer printing blank labels" finds an article about blank labels. */
export function toOrQuery(q: string) {
  const words = [...new Set(q.toLowerCase().match(/[a-z0-9]{2,}/g) ?? [])].slice(0, 12);
  return words.length ? words.join(" | ") : null;
}

export async function searchArticles(q: string, opts: { publishedOnly?: boolean; limit?: number } = {}) {
  const published = opts.publishedOnly ? eq(helpArticle.published, true) : undefined;
  const tsq = toOrQuery(q);
  if (!tsq) {
    return db
      .select(fields)
      .from(helpArticle)
      .leftJoin(category, eq(category.id, helpArticle.categoryId))
      .where(published)
      .orderBy(asc(category.name), asc(helpArticle.title))
      .limit(opts.limit ?? 500);
  }
  // to_tsquery drops stop words ("the", "is") by itself.
  const query = sql`to_tsquery('english', ${tsq})`;
  const like = `%${q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`;
  const rank = sql<number>`ts_rank(${doc}, ${query}) + case when ${helpArticle.title} ilike ${like} then 1 else 0 end`;
  return db
    .select({ ...fields, rank })
    .from(helpArticle)
    .leftJoin(category, eq(category.id, helpArticle.categoryId))
    .where(and(published, sql`(${doc} @@ ${query} or ${helpArticle.title} ilike ${like})`))
    .orderBy(desc(rank), asc(helpArticle.title))
    .limit(opts.limit ?? 50);
}

/** Up to three published articles that match what someone is typing into a new job. */
export async function suggestArticles(text: string) {
  if (text.trim().length < 4) return [];
  const rows = await searchArticles(text, { publishedOnly: true, limit: 3 });
  const full = rows.length ? await db.select({ id: helpArticle.id, body: helpArticle.body }).from(helpArticle).where(inArray(helpArticle.id, rows.map((r) => r.id))) : [];
  const body = new Map(full.map((r) => [r.id, r.body]));
  return rows.map((r) => ({ id: r.id, slug: r.slug, title: r.title, summary: r.summary, body: body.get(r.id) ?? "" }));
}

export async function getArticle(by: { id?: number; slug?: string }) {
  const [row] = await db
    .select({ a: helpArticle, categoryName: category.name, updatedBy: user.name })
    .from(helpArticle)
    .leftJoin(category, eq(category.id, helpArticle.categoryId))
    .leftJoin(user, eq(user.id, helpArticle.updatedById))
    .where(by.id ? eq(helpArticle.id, by.id) : eq(helpArticle.slug, by.slug ?? ""));
  return row ? { ...row.a, categoryName: row.categoryName, updatedBy: row.updatedBy } : null;
}

export async function countView(id: number) {
  await db.update(helpArticle).set({ views: sql`${helpArticle.views} + 1` }).where(eq(helpArticle.id, id));
}

export async function hasPublishedArticles() {
  return (await db.$count(helpArticle, eq(helpArticle.published, true))) > 0;
}

/* ---------- feedback ---------- */

/** One answer per person per article; answering again changes it. A "solved" answer is never downgraded by a later plain yes. */
export async function recordFeedback(userId: string, articleId: number, helpful: boolean, solvedJob = false) {
  await db
    .insert(helpFeedback)
    .values({ articleId, userId, helpful, solvedJob })
    .onConflictDoUpdate({
      target: [helpFeedback.articleId, helpFeedback.userId],
      set: { helpful, solvedJob: helpful ? sql`${helpFeedback.solvedJob} or ${solvedJob}` : false, at: new Date() },
    });
}

export async function myFeedback(userId: string, articleId: number) {
  return db.query.helpFeedback.findFirst({ where: and(eq(helpFeedback.userId, userId), eq(helpFeedback.articleId, articleId)) });
}

/** Per article: helpful / not helpful answers and jobs that didn't need raising. */
export async function feedbackStats() {
  const rows = await db
    .select({
      articleId: helpFeedback.articleId,
      yes: sql<number>`count(*) filter (where ${helpFeedback.helpful})`,
      no: sql<number>`count(*) filter (where not ${helpFeedback.helpful})`,
      solved: sql<number>`count(*) filter (where ${helpFeedback.solvedJob})`,
    })
    .from(helpFeedback)
    .groupBy(helpFeedback.articleId);
  return new Map(rows.map((r) => [r.articleId, { yes: Number(r.yes), no: Number(r.no), solved: Number(r.solved) }]));
}
