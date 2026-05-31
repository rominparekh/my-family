import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  boolean,
  jsonb,
  pgEnum,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ── Enums ──
export const relationTypeEnum = pgEnum("relation_type", [
  "spouse",
  "partner",
  "child",
  "parent",
  "sibling",
  "grandparent",
  "grandchild",
  "friend",
  "colleague",
  "other",
]);

export const specialDayTypeEnum = pgEnum("special_day_type", [
  "birthday",
  "anniversary",
  "custom",
]);

export const contentKindEnum = pgEnum("content_kind", ["text", "photo", "video"]);

export const draftStatusEnum = pgEnum("draft_status", [
  "draft",
  "pending_approval",
  "changes_requested",
  "approved",
  "scheduled",
  "sent",
  "failed",
]);

export const messageRoleEnum = pgEnum("message_role", [
  "system",
  "user",
  "assistant",
]);

export const messageChannelEnum = pgEnum("message_channel", ["whatsapp", "web"]);

// ── Users ──
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneE164: text("phone_e164").notNull(),
    // SHA-256 of the E.164 number, used for privacy-preserving discovery matching.
    phoneHash: text("phone_hash").notNull(),
    displayName: text("display_name"),
    timezone: text("timezone").notNull().default("UTC"),
    // Whether other users adding this number can auto-link to this account.
    discoverable: boolean("discoverable").notNull().default(true),
    waVerified: boolean("wa_verified").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    phoneUnique: uniqueIndex("users_phone_unique").on(t.phoneE164),
    phoneHashIdx: index("users_phone_hash_idx").on(t.phoneHash),
  })
);

// ── One-time passcodes (login) ──
export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phoneE164: text("phone_e164").notNull(),
    codeHash: text("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    phoneIdx: index("otp_phone_idx").on(t.phoneE164),
  })
);

// ── Friends (contact records owned by a user) ──
export const friends = pgTable(
  "friends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    phoneE164: text("phone_e164"),
    phoneHash: text("phone_hash"),
    timezone: text("timezone").notNull().default("UTC"),
    notes: text("notes"),
    avatarUrl: text("avatar_url"),
    // If this friend is also a registered user, link to them for discovery/auto-add.
    linkedUserId: uuid("linked_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index("friends_owner_idx").on(t.ownerUserId),
    phoneHashIdx: index("friends_phone_hash_idx").on(t.phoneHash),
  })
);

// ── Relationships (owner -> friend semantic role) ──
export const relationships = pgTable(
  "relationships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    friendId: uuid("friend_id")
      .notNull()
      .references(() => friends.id, { onDelete: "cascade" }),
    relationType: relationTypeEnum("relation_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    friendIdx: index("relationships_friend_idx").on(t.friendId),
    uniquePair: uniqueIndex("relationships_unique_pair").on(t.friendId, t.relationType),
  })
);

// ── Special days (recurring or one-off) ──
export const specialDays = pgTable(
  "special_days",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    friendId: uuid("friend_id")
      .notNull()
      .references(() => friends.id, { onDelete: "cascade" }),
    type: specialDayTypeEnum("type").notNull(),
    label: text("label"), // for "custom" days, e.g. "Graduation"
    month: integer("month").notNull(), // 1-12
    day: integer("day").notNull(), // 1-31
    year: integer("year"), // optional original year (for age/years-married)
    recurring: boolean("recurring").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    friendIdx: index("special_days_friend_idx").on(t.friendId),
    monthDayIdx: index("special_days_month_day_idx").on(t.month, t.day),
  })
);

// ── Friend photos (stored in Vercel Blob) ──
export const friendPhotos = pgTable(
  "friend_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    friendId: uuid("friend_id")
      .notNull()
      .references(() => friends.id, { onDelete: "cascade" }),
    blobUrl: text("blob_url").notNull(),
    pathname: text("pathname").notNull(),
    caption: text("caption"),
    uploadedByUserId: uuid("uploaded_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    friendIdx: index("friend_photos_friend_idx").on(t.friendId),
  })
);

// ── Content drafts (the generated wish for one occasion) ──
export const contentDrafts = pgTable(
  "content_drafts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerUserId: uuid("owner_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    friendId: uuid("friend_id")
      .notNull()
      .references(() => friends.id, { onDelete: "cascade" }),
    specialDayId: uuid("special_day_id")
      .notNull()
      .references(() => specialDays.id, { onDelete: "cascade" }),
    // The concrete date this occasion lands on, stored as YYYY-MM-DD (friend's local date).
    occasionDate: text("occasion_date").notNull(),
    kind: contentKindEnum("kind").notNull().default("text"),
    status: draftStatusEnum("status").notNull().default("draft"),
    textBody: text("text_body"),
    mediaUrls: jsonb("media_urls").$type<string[]>().notNull().default([]),
    generationPrompt: text("generation_prompt"),
    revision: integer("revision").notNull().default(0),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerStatusIdx: index("drafts_owner_status_idx").on(t.ownerUserId, t.status),
    // One draft per friend+occasion date keeps the cron scan idempotent.
    occasionUnique: uniqueIndex("drafts_occasion_unique").on(
      t.specialDayId,
      t.occasionDate
    ),
  })
);

// ── Draft messages (approval + modification chat thread) ──
export const draftMessages = pgTable(
  "draft_messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    draftId: uuid("draft_id")
      .notNull()
      .references(() => contentDrafts.id, { onDelete: "cascade" }),
    role: messageRoleEnum("role").notNull(),
    channel: messageChannelEnum("channel").notNull().default("web"),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    draftIdx: index("draft_messages_draft_idx").on(t.draftId),
  })
);

// ── Notifications log (outbound WhatsApp/web messages) ──
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    draftId: uuid("draft_id").references(() => contentDrafts.id, {
      onDelete: "set null",
    }),
    channel: text("channel").notNull(), // whatsapp | web
    type: text("type").notNull(), // approval_request | delivered | reminder
    waMessageId: text("wa_message_id"),
    status: text("status").notNull().default("sent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    userIdx: index("notifications_user_idx").on(t.userId),
  })
);

// ── Relations (for Drizzle relational queries) ──
export const usersRelations = relations(users, ({ many }) => ({
  friends: many(friends),
}));

export const friendsRelations = relations(friends, ({ one, many }) => ({
  owner: one(users, {
    fields: [friends.ownerUserId],
    references: [users.id],
  }),
  linkedUser: one(users, {
    fields: [friends.linkedUserId],
    references: [users.id],
  }),
  relationships: many(relationships),
  specialDays: many(specialDays),
  photos: many(friendPhotos),
}));

export const relationshipsRelations = relations(relationships, ({ one }) => ({
  friend: one(friends, {
    fields: [relationships.friendId],
    references: [friends.id],
  }),
}));

export const specialDaysRelations = relations(specialDays, ({ one }) => ({
  friend: one(friends, {
    fields: [specialDays.friendId],
    references: [friends.id],
  }),
}));

export const friendPhotosRelations = relations(friendPhotos, ({ one }) => ({
  friend: one(friends, {
    fields: [friendPhotos.friendId],
    references: [friends.id],
  }),
}));

export const contentDraftsRelations = relations(contentDrafts, ({ one, many }) => ({
  owner: one(users, {
    fields: [contentDrafts.ownerUserId],
    references: [users.id],
  }),
  friend: one(friends, {
    fields: [contentDrafts.friendId],
    references: [friends.id],
  }),
  specialDay: one(specialDays, {
    fields: [contentDrafts.specialDayId],
    references: [specialDays.id],
  }),
  messages: many(draftMessages),
}));

export const draftMessagesRelations = relations(draftMessages, ({ one }) => ({
  draft: one(contentDrafts, {
    fields: [draftMessages.draftId],
    references: [contentDrafts.id],
  }),
}));

// ── Inferred types ──
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Friend = typeof friends.$inferSelect;
export type NewFriend = typeof friends.$inferInsert;
export type Relationship = typeof relationships.$inferSelect;
export type SpecialDay = typeof specialDays.$inferSelect;
export type FriendPhoto = typeof friendPhotos.$inferSelect;
export type ContentDraft = typeof contentDrafts.$inferSelect;
export type NewContentDraft = typeof contentDrafts.$inferInsert;
export type DraftMessage = typeof draftMessages.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
