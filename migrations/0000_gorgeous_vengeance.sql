DO $$ BEGIN
 CREATE TYPE "public"."channel_type_enum" AS ENUM('PUBLIC', 'PRIVATE', 'DM');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."user_presence_enum" AS ENUM('ONLINE', 'AWAY', 'DND', 'OFFLINE');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."workspace_role_enum" AS ENUM('OWNER', 'ADMIN', 'MEMBER', 'GUEST');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Channels" (
	"channelId" bigserial PRIMARY KEY NOT NULL,
	"workspaceId" bigint,
	"name" varchar(100) NOT NULL,
	"topic" text,
	"channelType" "channel_type_enum" DEFAULT 'PUBLIC' NOT NULL,
	"archived" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Files" (
	"fileId" bigserial PRIMARY KEY NOT NULL,
	"userId" bigint,
	"messageId" bigint,
	"workspaceId" bigint,
	"filename" varchar(255) NOT NULL,
	"fileType" varchar(50),
	"fileUrl" varchar(255),
	"fileSize" bigint,
	"fileHash" varchar(64),
	"uploadTime" timestamp DEFAULT now(),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "MessageReactions" (
	"reactionId" bigserial PRIMARY KEY NOT NULL,
	"messageId" bigint,
	"workspaceId" bigint,
	"emojiId" varchar(50) NOT NULL,
	"userId" bigint,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Messages" (
	"messageId" bigserial NOT NULL,
	"userId" bigint,
	"channelId" bigint,
	"workspaceId" bigint NOT NULL,
	"parentMessageId" bigint,
	"content" text NOT NULL,
	"deleted" boolean DEFAULT false,
	"hasAttachments" boolean DEFAULT false,
	"postedAt" timestamp DEFAULT now(),
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Messages_messageId_workspaceId_pk" PRIMARY KEY("messageId","workspaceId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "PinnedMessages" (
	"pinnedId" bigserial PRIMARY KEY NOT NULL,
	"messageId" bigint,
	"workspaceId" bigint,
	"pinnedBy" bigint,
	"pinnedReason" text,
	"pinnedAt" timestamp DEFAULT now() NOT NULL,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UserChannels" (
	"userId" bigint,
	"channelId" bigint,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "UserChannels_userId_channelId_pk" PRIMARY KEY("userId","channelId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "UserWorkspaces" (
	"userId" bigint,
	"workspaceId" bigint,
	"role" "workspace_role_enum" DEFAULT 'MEMBER',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "UserWorkspaces_userId_workspaceId_pk" PRIMARY KEY("userId","workspaceId")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Users" (
	"userId" bigserial PRIMARY KEY NOT NULL,
	"email" varchar(254) NOT NULL,
	"passwordHash" varchar(255),
	"displayName" varchar(50) NOT NULL,
	"defaultWorkspace" bigint,
	"profilePicture" varchar(255),
	"statusMessage" varchar(150),
	"lastKnownPresence" "user_presence_enum" DEFAULT 'ONLINE',
	"emailVerified" boolean DEFAULT false,
	"lastLogin" timestamp,
	"deactivated" boolean DEFAULT false,
	"theme" varchar(20) DEFAULT 'light',
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "Users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "Workspaces" (
	"workspaceId" bigserial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"description" text,
	"archived" boolean DEFAULT false,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Channels" ADD CONSTRAINT "Channels_workspaceId_Workspaces_workspaceId_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspaces"("workspaceId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Files" ADD CONSTRAINT "Files_userId_Users_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."Users"("userId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Files" ADD CONSTRAINT "Files_messageId_workspaceId_Messages_messageId_workspaceId_fk" FOREIGN KEY ("messageId","workspaceId") REFERENCES "public"."Messages"("messageId","workspaceId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MessageReactions" ADD CONSTRAINT "MessageReactions_userId_Users_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."Users"("userId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "MessageReactions" ADD CONSTRAINT "MessageReactions_messageId_workspaceId_Messages_messageId_workspaceId_fk" FOREIGN KEY ("messageId","workspaceId") REFERENCES "public"."Messages"("messageId","workspaceId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Messages" ADD CONSTRAINT "Messages_userId_Users_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."Users"("userId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Messages" ADD CONSTRAINT "Messages_channelId_Channels_channelId_fk" FOREIGN KEY ("channelId") REFERENCES "public"."Channels"("channelId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Messages" ADD CONSTRAINT "Messages_workspaceId_Workspaces_workspaceId_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspaces"("workspaceId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Messages" ADD CONSTRAINT "Messages_parentMessageId_workspaceId_Messages_messageId_workspaceId_fk" FOREIGN KEY ("parentMessageId","workspaceId") REFERENCES "public"."Messages"("messageId","workspaceId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PinnedMessages" ADD CONSTRAINT "PinnedMessages_pinnedBy_Users_userId_fk" FOREIGN KEY ("pinnedBy") REFERENCES "public"."Users"("userId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "PinnedMessages" ADD CONSTRAINT "PinnedMessages_messageId_workspaceId_Messages_messageId_workspaceId_fk" FOREIGN KEY ("messageId","workspaceId") REFERENCES "public"."Messages"("messageId","workspaceId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserChannels" ADD CONSTRAINT "UserChannels_userId_Users_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."Users"("userId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserChannels" ADD CONSTRAINT "UserChannels_channelId_Channels_channelId_fk" FOREIGN KEY ("channelId") REFERENCES "public"."Channels"("channelId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserWorkspaces" ADD CONSTRAINT "UserWorkspaces_userId_Users_userId_fk" FOREIGN KEY ("userId") REFERENCES "public"."Users"("userId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "UserWorkspaces" ADD CONSTRAINT "UserWorkspaces_workspaceId_Workspaces_workspaceId_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."Workspaces"("workspaceId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "Users" ADD CONSTRAINT "Users_defaultWorkspace_Workspaces_workspaceId_fk" FOREIGN KEY ("defaultWorkspace") REFERENCES "public"."Workspaces"("workspaceId") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_channels_not_archived" ON "Channels" USING btree ("workspaceId","name") WHERE "Channels"."archived" = false;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "idx_reactions_unique_message_emoji_user" ON "MessageReactions" USING btree ("messageId","workspaceId","emojiId","userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_channel_id" ON "Messages" USING btree ("channelId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_posted_at" ON "Messages" USING btree ("postedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_channel_posted_at" ON "Messages" USING btree ("channelId","postedAt");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_parent_id" ON "Messages" USING btree ("parentMessageId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_messages_not_deleted" ON "Messages" USING btree ("channelId","postedAt") WHERE "Messages"."deleted" = false;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_channels_user_id" ON "UserChannels" USING btree ("userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_channels_channel_id" ON "UserChannels" USING btree ("channelId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_channels_ch_user" ON "UserChannels" USING btree ("channelId","userId");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_user_workspaces_ws_user" ON "UserWorkspaces" USING btree ("workspaceId","userId");