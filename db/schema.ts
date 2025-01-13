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
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { relations, sql, type SQL } from "drizzle-orm";
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
  defaultWorkspace: bigint("defaultWorkspace", { mode: "number" }),
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
  userId: bigint("userId", { mode: "number" }),
  archived: boolean("archived").default(false),
  createdAt: timestamp("createdAt").notNull().defaultNow(),
  updatedAt: timestamp("updatedAt").notNull().defaultNow(),
});

// Define relations
export const userRelations = relations(users, ({ one }) => ({
  defaultWorkspaceRef: one(workspaces, {
    fields: [users.defaultWorkspace],
    references: [workspaces.workspaceId],
  }),
}));

export const workspaceRelations = relations(workspaces, ({ one }) => ({
  owner: one(users, {
    fields: [workspaces.userId],
    references: [users.userId],
  }),
}));

// Channels table
export const channels = pgTable(
  "Channels",
  {
    channelId: bigserial("channelId", { mode: "number" }).primaryKey(),
    workspaceId: bigint("workspaceId", { mode: "number" }),
    name: varchar("name", { length: 100 }).notNull(),
    topic: text("topic"),
    description: text("description"),
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

export const channelRelations = relations(channels, ({ one }) => ({
  workspace: one(workspaces, {
    fields: [channels.workspaceId],
    references: [workspaces.workspaceId],
  }),
}));

// Messages table (partitioned by workspaceId)
export const messages = pgTable(
  "Messages",
  {
    messageId: bigserial("messageId", { mode: "number" }),
    userId: bigint("userId", { mode: "number" }),
    channelId: bigint("channelId", { mode: "number" }),
    workspaceId: bigint("workspaceId", { mode: "number" })
      .notNull(),
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
    
  }),
);

export const messageRelations = relations(messages, ({ one, many }) => ({
  user: one(users, {
    fields: [messages.userId],
    references: [users.userId],
  }),
  channel: one(channels, {
    fields: [messages.channelId],
    references: [channels.channelId],
  }),
  workspace: one(workspaces, {
    fields: [messages.workspaceId],
    references: [workspaces.workspaceId],
  }),
  parentMessage: one(messages, {
    fields: [messages.parentMessageId, messages.workspaceId],
    references: [messages.messageId, messages.workspaceId],
  }),
  replies: many(messages, {
    fields: [messages.messageId, messages.workspaceId],
    references: [messages.parentMessageId, messages.workspaceId],
  }),
  files: many(files, {
    fields: [messages.messageId, messages.workspaceId],
    references: [files.messageId, files.workspaceId],
  }),
  reactions: many(messageReactions, {
    fields: [messages.messageId, messages.workspaceId],
    references: [messageReactions.messageId, messageReactions.workspaceId],
  }),
  pins: many(pinnedMessages, {
    fields: [messages.messageId, messages.workspaceId],
    references: [pinnedMessages.messageId, pinnedMessages.workspaceId],
  }),
}));


// Files table
export const files = pgTable(
  "Files",
  {
    fileId: bigserial("fileId", { mode: "number" }).primaryKey(),
    userId: bigint("userId", { mode: "number" }),
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
  (table) => ({}),
);

export const fileRelations = relations(files, ({ one }) => ({
  user: one(users, {
    fields: [files.userId],
    references: [users.userId],
  }),
  message: one(messages, {
    fields: [files.messageId, files.workspaceId],
    references: [messages.messageId, messages.workspaceId],
  }),
  workspace: one(workspaces, {
    fields: [files.workspaceId],
    references: [workspaces.workspaceId],
  }),
}));

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
    emojiId: bigint("emojiId", { mode: "number" }).notNull(),
    userId: bigint("userId", { mode: "number" }),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({
    uniqueReaction: uniqueIndex("idx_reactions_unique_message_emoji_user").on(
      table.messageId,
      table.workspaceId,
      table.emojiId,
      table.userId,
    ),
  }),
);

export const messageReactionRelations = relations(messageReactions, ({ one }) => ({
  message: one(messages, {
    fields: [messageReactions.messageId, messageReactions.workspaceId],
    references: [messages.messageId, messages.workspaceId],
  }),
  emoji: one(emojis, {
    fields: [messageReactions.emojiId],
    references: [emojis.emojiId],
  }),
  user: one(users, {
    fields: [messageReactions.userId],
    references: [users.userId],
  }),
}));

// User Workspaces table
export const userWorkspaces = pgTable(
  "UserWorkspaces",
  {
    userId: bigint("userId", { mode: "number" }),
    workspaceId: bigint("workspaceId", { mode: "number" }),
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

export const userWorkspaceRelations = relations(userWorkspaces, ({ one }) => ({
  user: one(users, {
    fields: [userWorkspaces.userId],
    references: [users.userId],
  }),
  workspace: one(workspaces, {
    fields: [userWorkspaces.workspaceId],
    references: [workspaces.workspaceId],
  }),
}));

// User Channels table
export const userChannels = pgTable(
  "UserChannels",
  {
    userId: bigint("userId", { mode: "number" }),
    channelId: bigint("channelId", { mode: "number" }),
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

export const userChannelRelations = relations(userChannels, ({ one }) => ({
  user: one(users, {
    fields: [userChannels.userId],
    references: [users.userId],
  }),
  channel: one(channels, {
    fields: [userChannels.channelId],
    references: [channels.channelId],
  }),
}));

// Pinned Messages table
export const pinnedMessages = pgTable(
  "PinnedMessages",
  {
    pinnedId: bigserial("pinnedId", { mode: "number" }).primaryKey(),
    messageId: bigint("messageId", { mode: "number" }),
    workspaceId: bigint("workspaceId", { mode: "number" }),
    pinnedBy: bigint("pinnedBy", { mode: "number" }),
    pinnedReason: text("pinnedReason"),
    pinnedAt: timestamp("pinnedAt").notNull().defaultNow(),
    createdAt: timestamp("createdAt").notNull().defaultNow(),
    updatedAt: timestamp("updatedAt").notNull().defaultNow(),
  },
  (table) => ({}),
);

export const pinnedMessageRelations = relations(pinnedMessages, ({ one }) => ({
  message: one(messages, {
    fields: [pinnedMessages.messageId, pinnedMessages.workspaceId],
    references: [messages.messageId, messages.workspaceId],
  }),
  user: one(users, {
    fields: [pinnedMessages.pinnedBy],
    references: [users.userId],
  }),
}));

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
export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
export type Emoji = typeof emojis.$inferSelect;
export type NewEmoji = typeof emojis.$inferInsert;
export type MessageReaction = typeof messageReactions.$inferSelect;
export type NewMessageReaction = typeof messageReactions.$inferInsert;
export type UserWorkspace = typeof userWorkspaces.$inferSelect;
export type NewUserWorkspace = typeof userWorkspaces.$inferInsert;
export type UserChannel = typeof userChannels.$inferSelect;
export type NewUserChannel = typeof userChannels.$inferInsert;
export type PinnedMessage = typeof pinnedMessages.$inferSelect;
export type NewPinnedMessage = typeof pinnedMessages.$inferInsert;

channels.relations = channelRelations;
messages.relations = messageRelations;
files.relations = fileRelations;
messageReactions.relations = messageReactionRelations;
userWorkspaces.relations = userWorkspaceRelations;
userChannels.relations = userChannelRelations;
pinnedMessages.relations = pinnedMessageRelations;
users.relations = userRelations;
workspaces.relations = workspaceRelations;