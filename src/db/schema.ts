import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/* ---------- Better Auth tables (names and columns follow its schema) ---------- */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  // "staff" | "tech" | "admin"
  role: text("role").notNull().default("staff"),
  phone: text("phone"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

export const twoFactor = pgTable(
  "two_factor",
  {
    id: text("id").primaryKey(),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    verified: boolean("verified").default(true),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("two_factor_user_idx").on(t.userId), index("two_factor_secret_idx").on(t.secret)],
);

/* ---------- App tables ---------- */

// An IT session counts only after the authenticator code was entered on it.
export const sessionCheck = pgTable("session_check", {
  sessionId: text("session_id")
    .primaryKey()
    .references(() => session.id, { onDelete: "cascade" }),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  failedAttempts: integer("failed_attempts").notNull().default(0),
});

export const invite = pgTable("invite", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  // "tech" | "admin"
  role: text("role").notNull(),
  invitedById: text("invited_by_id").references(() => user.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  acceptedById: text("accepted_by_id").references(() => user.id, { onDelete: "set null" }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const site = pgTable("site", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  position: integer("position").notNull().default(0),
  archived: boolean("archived").notNull().default(false),
});

export const category = pgTable("category", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  position: integer("position").notNull().default(0),
  archived: boolean("archived").notNull().default(false),
});

// One row per priority (1 = critical … 4 = low). Minutes of wall-clock time.
export const slaPolicy = pgTable("sla_policy", {
  priority: integer("priority").primaryKey(),
  label: text("label").notNull(),
  responseMinutes: integer("response_minutes").notNull(),
  resolveMinutes: integer("resolve_minutes").notNull(),
  // "any" counts round the clock; "hours" counts only during working hours.
  counts: text("counts").notNull().default("any"),
});

// Small app-wide settings, e.g. working hours. Values are JSON.
export const appSetting = pgTable("app_setting", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Checked in order of position; the first matching rule wins. Null category or site matches anything.
export const assignmentRule = pgTable("assignment_rule", {
  id: serial("id").primaryKey(),
  categoryId: integer("category_id").references(() => category.id, { onDelete: "cascade" }),
  siteId: integer("site_id").references(() => site.id, { onDelete: "cascade" }),
  assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
  position: integer("position").notNull().default(0),
});

export const ticket = pgTable(
  "ticket",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    description: text("description").notNull(),
    // "new" | "progress" | "waiting" | "resolved" | "closed"
    status: text("status").notNull().default("new"),
    priority: integer("priority").notNull(),
    categoryId: integer("category_id").references(() => category.id, { onDelete: "set null" }),
    siteId: integer("site_id").references(() => site.id, { onDelete: "set null" }),
    location: text("location").notNull().default(""),
    contactPhone: text("contact_phone").notNull().default(""),
    requesterId: text("requester_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    assigneeId: text("assignee_id").references(() => user.id, { onDelete: "set null" }),
    source: text("source").notNull().default("app"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    responseDueAt: timestamp("response_due_at", { withTimezone: true }).notNull(),
    resolveDueAt: timestamp("resolve_due_at", { withTimezone: true }).notNull(),
    firstResponseAt: timestamp("first_response_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    satisfaction: integer("satisfaction"),
    satisfactionComment: text("satisfaction_comment"),
    // Where the job was announced in the IT Slack channel, so updates go in its thread.
    slackChannel: text("slack_channel"),
    slackTs: text("slack_ts"),
    // Set while the fix clock is paused (waiting on the requester).
    slaPausedAt: timestamp("sla_paused_at", { withTimezone: true }),
    // The piece of kit this job is about, if any.
    assetId: integer("asset_id").references((): AnyPgColumn => asset.id, { onDelete: "set null" }),
  },
  (t) => [
    index("ticket_status_idx").on(t.status),
    index("ticket_requester_idx").on(t.requesterId),
    index("ticket_assignee_idx").on(t.assigneeId),
  ],
);

export const ticketMessage = pgTable(
  "ticket_message",
  {
    id: serial("id").primaryKey(),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => ticket.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => user.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    // Internal notes are only visible to the IT team.
    internal: boolean("internal").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ticket_message_ticket_idx").on(t.ticketId)],
);

export const attachment = pgTable(
  "attachment",
  {
    id: serial("id").primaryKey(),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => ticket.id, { onDelete: "cascade" }),
    messageId: integer("message_id").references(() => ticketMessage.id, { onDelete: "cascade" }),
    uploadedById: text("uploaded_by_id").references(() => user.id, { onDelete: "set null" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("attachment_ticket_idx").on(t.ticketId)],
);

export const timeEntry = pgTable("time_entry", {
  id: serial("id").primaryKey(),
  ticketId: integer("ticket_id")
    .notNull()
    .references(() => ticket.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  minutes: integer("minutes").notNull(),
  note: text("note").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Audit trail: created, status changes, assignment, priority changes, rating.
export const ticketEvent = pgTable(
  "ticket_event",
  {
    id: serial("id").primaryKey(),
    ticketId: integer("ticket_id")
      .notNull()
      .references(() => ticket.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ticket_event_ticket_idx").on(t.ticketId)],
);


/* ---------- Phase 2: inventory ---------- */

// Kinds of kit: Laptop, Printer, Raspberry Pi… "printer" types appear on the Printers page.
export const assetType = pgTable("asset_type", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  isPrinter: boolean("is_printer").notNull().default(false),
  position: integer("position").notNull().default(0),
  archived: boolean("archived").notNull().default(false),
});

export const asset = pgTable(
  "asset",
  {
    id: serial("id").primaryKey(),
    // The label on the kit, e.g. GD-00042. Never reused.
    tag: text("tag").notNull().unique(),
    name: text("name").notNull(),
    typeId: integer("type_id").references(() => assetType.id, { onDelete: "set null" }),
    make: text("make").notNull().default(""),
    model: text("model").notNull().default(""),
    serial: text("serial").notNull().default(""),
    // "in_use" | "spare" | "repair" | "retired"
    status: text("status").notNull().default("spare"),
    siteId: integer("site_id").references(() => site.id, { onDelete: "set null" }),
    location: text("location").notNull().default(""),
    // Who or what has it: a person with an account, or a place/team ("Dispatch", "Showroom TV").
    assignedUserId: text("assigned_user_id").references(() => user.id, { onDelete: "set null" }),
    assignedTo: text("assigned_to").notNull().default(""),
    ipAddress: text("ip_address").notNull().default(""),
    macAddress: text("mac_address").notNull().default(""),
    purchaseDate: date("purchase_date", { mode: "string" }),
    // Pence, to avoid rounding errors.
    purchaseCostPence: integer("purchase_cost_pence"),
    supplier: text("supplier").notNull().default(""),
    warrantyUntil: date("warranty_until", { mode: "string" }),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("asset_type_idx").on(t.typeId), index("asset_site_idx").on(t.siteId), index("asset_assigned_idx").on(t.assignedUserId)],
);

export const assetPhoto = pgTable(
  "asset_photo",
  {
    id: serial("id").primaryKey(),
    assetId: integer("asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade" }),
    uploadedById: text("uploaded_by_id").references(() => user.id, { onDelete: "set null" }),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    size: integer("size").notNull(),
    storageKey: text("storage_key").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("asset_photo_asset_idx").on(t.assetId)],
);

// History: created, edited (with the fields), checked out/in, status, photo added, ticket linked.
export const assetEvent = pgTable(
  "asset_event",
  {
    id: serial("id").primaryKey(),
    assetId: integer("asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    type: text("type").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("asset_event_asset_idx").on(t.assetId)],
);

// Cupboard stock counted by quantity: keyboards, mice, toner, labels, cables.
export const stockItem = pgTable("stock_item", {
  id: serial("id").primaryKey(),
  // Short code for the shelf label, e.g. ST-0007.
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  category: text("category").notNull().default(""),
  siteId: integer("site_id").references(() => site.id, { onDelete: "set null" }),
  location: text("location").notNull().default(""),
  quantity: integer("quantity").notNull().default(0),
  // Alert when quantity drops below this. 0 = never alert.
  minQuantity: integer("min_quantity").notNull().default(0),
  supplier: text("supplier").notNull().default(""),
  // Free text, e.g. "HP LaserJet M507" for toner.
  fits: text("fits").notNull().default(""),
  notes: text("notes").notNull().default(""),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const stockMovement = pgTable(
  "stock_movement",
  {
    id: serial("id").primaryKey(),
    itemId: integer("item_id")
      .notNull()
      .references(() => stockItem.id, { onDelete: "cascade" }),
    // Negative when taken, positive when received.
    delta: integer("delta").notNull(),
    quantityAfter: integer("quantity_after").notNull(),
    // "taken" | "received" | "counted"
    reason: text("reason").notNull(),
    note: text("note").notNull().default(""),
    ticketId: integer("ticket_id").references(() => ticket.id, { onDelete: "set null" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stock_movement_item_idx").on(t.itemId)],
);

export const licence = pgTable("licence", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  supplier: text("supplier").notNull().default(""),
  seats: integer("seats"),
  renewsOn: date("renews_on", { mode: "string" }),
  costPence: integer("cost_pence"),
  notes: text("notes").notNull().default(""),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
