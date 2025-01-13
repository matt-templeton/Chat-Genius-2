import {
  pgTable,
  bigserial,
  varchar,
  text,
  boolean,
  timestamp,
  pgEnum,
  bigint,
  primaryKey,
  uniqueIndex,
  foreignKey,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";

// Enums
export const userPresenceEnum = pgEnum("user_presence_enum", [
  "ONLINE",
  "AWAY",
  "DND",
  "OFFLINE",
]);
export const workspaceRoleEnum = pgEnum("workspace_role_enum", [
  "OWNER",
  "ADMIN",
  "MEMBER",
  "GUEST",
]);
export const channelTypeEnum = pgEnum("channel_type_enum", [
  "PUBLIC",
  "PRIVATE",
  "DM",
]);

// Users table
export const users = pgTable("Users", {
  userId: bigserial("userId", { mode: "number" }).primaryKey(),
  email: varchar("email", { length: 254 }).notNull().unique(),
  passwordHash: varchar("passwordHash", { length: 255 }),
  displayName: varchar("displayName", { length: 50 }).notNull(),
  profilePicture: varchar("profilePicture", { length: 255 }),
  statusMessage: varchar("statusMessage", { length: 150 }),
  lastKnownPresence: userPresenceEnum("lastKnownPresence").default("ONLINE"),
  emailVerified: boolean("emailVerified").default(false),
  lastLogin: timestamp("lastLogin"),
  deactivated: boolean("deactivated").default(false),
  theme: varchar("theme", { length: 20 }).default("light"),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

// Workspaces table
export const workspaces = pgTable("Workspaces", {
  workspaceId: bigserial("workspaceId", { mode: "number" }).primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  archived: boolean("archived").default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

// Channels table
export const channels = pgTable(
  "Channels",
  {
    channelId: bigserial("channelId", { mode: "number" }).primaryKey(),
    workspaceId: bigint("workspaceId", { mode: "number" }).references(
      () => workspaces.workspaceId,
      { onDelete: "set null" },
    ),
    name: varchar("name", { length: 100 }).notNull(),
    topic: text("topic"),
    channelType: channelTypeEnum("channelType").notNull().default("PUBLIC"),
    archived: boolean("archived").default(false),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    notArchivedIdx: index("idx_channels_not_archived")
      .on(table.workspaceId, table.name)
      .where(sql`${table.archived} = false`),
  }),
);

// Messages table (partitioned by workspaceId)
export const messages = pgTable(
  "Messages",
  {
    messageId: bigserial("messageId", { mode: "number" }),
    userId: bigint("userId", { mode: "number" }).references(
      () => users.userId,
      { onDelete: "set null" },
    ),
    channelId: bigint("channelId", { mode: "number" }).references(
      () => channels.channelId,
      { onDelete: "set null" },
    ),
    workspaceId: bigint("workspaceId", { mode: "number" })
      .notNull()
      .references(() => workspaces.workspaceId, { onDelete: "set null" }),
    parentMessageId: bigint("parentMessageId", { mode: "number" }),
    content: text("content").notNull(),
    deleted: boolean("deleted").default(false),
    postedAt: timestamp("postedAt").defaultNow(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.messageId, table.workspaceId] }),
    channelIdx: index("idx_messages_channel_id").on(table.channelId),
    postedAtIdx: index("idx_messages_posted_at").on(table.postedAt),
    channelPostedIdx: index("idx_messages_channel_posted_at").on(
      table.channelId,
      table.postedAt,
    ),
    parentIdx: index("idx_messages_parent_id").on(table.parentMessageId),
    notDeletedIdx: index("idx_messages_not_deleted")
      .on(table.channelId, table.postedAt)
      .where(sql`${table.deleted} = false`),
    parentFk: foreignKey({
      columns: [table.parentMessageId, table.workspaceId],
      foreignColumns: [table.messageId, table.workspaceId],
    }).onDelete("set null"),
  }),
);

// Files table
export const files = pgTable(
  "Files",
  {
    fileId: bigserial("fileId", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" }).references(
      () => users.userId,
      { onDelete: "set null" },
    ),
    messageId: bigint("messageId", { mode: "number" }),
    workspaceId: bigint("workspaceId", { mode: "number" }),
    filename: varchar("filename", { length: 255 }).notNull(),
    fileType: varchar("fileType", { length: 50 }),
    fileUrl: varchar("fileUrl", { length: 255 }),
    fileSize: bigint("fileSize", { mode: "number" }),
    fileHash: varchar("fileHash", { length: 64 }),
    uploadTime: timestamp("uploadTime").defaultNow(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    messageFk: foreignKey({
      columns: [table.messageId, table.workspaceId],
      foreignColumns: [messages.messageId, messages.workspaceId],
    }).onDelete("set null"),
  }),
);

// Emojis table
export const emojis = pgTable(
  "Emojis",
  {
    emojiId: bigserial("emojiId", { mode: "number" }).primaryKey(),
    code: varchar("code", { length: 50 }).notNull().unique(),
    deleted: boolean("deleted").default(false),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    notDeletedIdx: index("idx_emojis_not_deleted")
      .on(table.code)
      .where(sql`${table.deleted} = false`),
  }),
);

// Message Reactions table
export const messageReactions = pgTable(
  "MessageReactions",
  {
    reactionId: bigserial("reactionId", { mode: "number" }).primaryKey(),
    messageId: bigint("messageId", { mode: "number" }),
    workspaceId: bigint("workspaceId", { mode: "number" }),
    emojiId: bigint("emojiId", { mode: "number" })
      .references(() => emojis.emojiId, { onDelete: "set null" })
      .notNull(),
    userId: bigint("userId", { mode: "number" }).references(
      () => users.userId,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    messageFk: foreignKey({
      columns: [table.messageId, table.workspaceId],
      foreignColumns: [messages.messageId, messages.workspaceId],
    }).onDelete("set null"),
    uniqueReaction: uniqueIndex("idx_reactions_unique_message_emoji_user").on(
      table.messageId,
      table.workspaceId,
      table.emojiId,
      table.userId,
    ),
  }),
);

// User Workspaces table
export const userWorkspaces = pgTable(
  "UserWorkspaces",
  {
    userId: bigint("userId", { mode: "number" }).references(
      () => users.userId,
      { onDelete: "set null" },
    ),
    workspaceId: bigint("workspaceId", { mode: "number" }).references(
      () => workspaces.workspaceId,
      { onDelete: "set null" },
    ),
    role: workspaceRoleEnum("role").default("MEMBER"),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.workspaceId] }),
    workspaceUserIdx: index("idx_user_workspaces_ws_user").on(
      table.workspaceId,
      table.userId,
    ),
  }),
);

// User Channels table
export const userChannels = pgTable(
  "UserChannels",
  {
    userId: bigint("userId", { mode: "number" }).references(
      () => users.userId,
      { onDelete: "set null" },
    ),
    channelId: bigint("channelId", { mode: "number" }).references(
      () => channels.channelId,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.userId, table.channelId] }),
    userIdx: index("idx_user_channels_user_id").on(table.userId),
    channelIdx: index("idx_user_channels_channel_id").on(table.channelId),
    channelUserIdx: index("idx_user_channels_ch_user").on(
      table.channelId,
      table.userId,
    ),
  }),
);

// Pinned Messages table
export const pinnedMessages = pgTable(
  "PinnedMessages",
  {
    pinnedId: bigserial("pinnedId", { mode: "number" }).primaryKey(),
    messageId: bigint("messageId", { mode: "number" }),
    workspaceId: bigint("workspaceId", { mode: "number" }),
    pinnedBy: bigint("pinnedBy", { mode: "number" }).references(
      () => users.userId,
      { onDelete: "set null" },
    ),
    pinnedReason: text("pinnedReason"),
    pinnedAt: timestamp("pinnedAt").notNull().defaultNow(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    messageFk: foreignKey({
      columns: [table.messageId, table.workspaceId],
      foreignColumns: [messages.messageId, messages.workspaceId],
    }).onDelete("set null"),
  }),
);

// Export schemas for validation
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertWorkspaceSchema = createInsertSchema(workspaces);
export const selectWorkspaceSchema = createSelectSchema(workspaces);
export const insertChannelSchema = createInsertSchema(channels);
export const selectChannelSchema = createSelectSchema(channels);
export const insertMessageSchema = createInsertSchema(messages);
export const selectMessageSchema = createSelectSchema(messages);

// Export types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
