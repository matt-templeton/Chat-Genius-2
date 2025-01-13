import {
  pgTable,
  bigserial,
  bigint,
  varchar,
  text,
  boolean,
  timestamp,
  pgEnum,
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
    workspaceId: bigint("workspaceId", { mode: "number" })
      .notNull()
      .references(() => workspaces.workspaceId, { onDelete: "cascade" }),
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

// User Workspaces table
export const userWorkspaces = pgTable(
  "UserWorkspaces",
  {
    userId: bigint("userId", { mode: "number" })
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    workspaceId: bigint("workspaceId", { mode: "number" })
      .notNull()
      .references(() => workspaces.workspaceId, { onDelete: "cascade" }),
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
    userId: bigint("userId", { mode: "number" })
      .notNull()
      .references(() => users.userId, { onDelete: "cascade" }),
    channelId: bigint("channelId", { mode: "number" })
      .notNull()
      .references(() => channels.channelId, { onDelete: "cascade" }),
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

// Export schemas for validation
export const insertUserSchema = createInsertSchema(users);
export const selectUserSchema = createSelectSchema(users);
export const insertWorkspaceSchema = createInsertSchema(workspaces);
export const selectWorkspaceSchema = createSelectSchema(workspaces);
export const insertChannelSchema = createInsertSchema(channels);
export const selectChannelSchema = createSelectSchema(channels);

// Export types
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
export type Channel = typeof channels.$inferSelect;
export type NewChannel = typeof channels.$inferInsert;