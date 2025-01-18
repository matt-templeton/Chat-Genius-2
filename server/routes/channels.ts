import { Router } from 'express';
import { db } from "@db";
import { channels, userChannels, userWorkspaces, workspaces, users } from "@db/schema";
import { eq, and, inArray, not, or, exists } from "drizzle-orm";
import type { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { z } from 'zod';
import { getWebSocketManager } from '../websocket/WebSocketManager';

const router = Router();

// Input validation schemas
const createChannelSchema = z.object({
  name: z.string().min(1, "Channel name is required"),
  workspaceId: z.number().int().positive("Valid workspace ID is required"),
  topic: z.string().optional(),
  channelType: z.enum(['PUBLIC', 'PRIVATE', 'DM']).default('PUBLIC')
});

const updateChannelSchema = z.object({
  name: z.string().min(1, "Channel name is required"),
  topic: z.string().optional()
});

const addMemberSchema = z.object({
  userId: z.number().int().positive("Valid user ID is required")
});

// Add this validation schema for DM creation
const createDmSchema = z.object({
  workspaceId: z.number().int().positive("Valid workspace ID is required"),
  participants: z.array(z.number().int().positive("Valid user IDs required"))
});

// Add this interface near the top of the file
interface ChannelMember {
  userId: number;
  profilePicture: string | null;
  displayName: string;
}

/**
 * @route POST /api/v1/channels/dm
 * @desc Create a new DM channel
 */
router.post('/dm', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const validationResult = createDmSchema.safeParse(req.body);
    console.log(validationResult)
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Bad Request",
        details: {
          code: "VALIDATION_ERROR",
          message: "Invalid DM creation data",
          errors: validationResult.error.errors
        }
      });
    }

    const { workspaceId, participants } = validationResult.data;
    const currentUserId = req.user!.userId;

    // Add current user to participants if not included
    const allParticipants = Array.from(new Set([currentUserId, ...participants]));
    if (allParticipants.length <= 1) {
      return res.status(400).json({
        error: "Bad Request",
        details: {
          code: "VALIDATION_ERROR",
          message: "Couldn't find other member."
        }
      });
    }
    // Verify workspace exists
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.workspaceId, workspaceId)
    });

    if (!workspace) {
      return res.status(404).json({
        error: "Workspace Not Found",
        details: {
          code: "WORKSPACE_NOT_FOUND",
          message: "Workspace not found"
        }
      });
    }

    // Verify all participants are workspace members
    const workspaceMembers = await db.query.userWorkspaces.findMany({
      where: eq(userWorkspaces.workspaceId, workspaceId)
    });

    const memberIds = workspaceMembers.map(member => member.userId);
    const nonMembers = allParticipants.filter(id => !memberIds.includes(id));

    if (nonMembers.length > 0) {
      return res.status(400).json({
        error: "Bad Request",
        details: {
          code: "INVALID_PARTICIPANTS",
          message: "Some participants are not members of this workspace"
        }
      });
    }

    // Check for existing DM channel between these users
    const existingDm = await findExistingDmChannel(workspaceId, allParticipants);
    if (existingDm) {
      return res.json(existingDm);
    }

    // Create new DM channel
    const [channel] = await db.insert(channels).values({
      name: `dm-${Date.now()}`,
      workspaceId,
      channelType: 'DM',
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    // Add all participants to the channel
    await Promise.all(allParticipants.map(userId =>
      db.insert(userChannels).values({
        userId,
        channelId: channel.channelId,
        createdAt: new Date(),
        updatedAt: new Date()
      })
    ));

    // Broadcast channel creation event
    broadcastChannelEvent(channel, 'CHANNEL_CREATED');

    res.status(201).json(channel);
  } catch (error) {
    console.error('Error creating DM channel:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to create DM channel"
      }
    });
  }
});

/**
 * @route GET /api/v1/workspaces/{workspaceId}/channels
 * @desc List channels in a workspace
 */
router.get('/:workspaceId/channels', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const includeArchived = req.query.includeArchived === 'true';
    const currentUserId = req.user!.userId;

    // Verify workspace exists first
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.workspaceId, parseInt(workspaceId))
    });

    if (!workspace) {
      return res.status(404).json({
        error: "Workspace Not Found",
        details: {
          code: "WORKSPACE_NOT_FOUND",
          message: "Workspace not found"
        }
      });
    }

    // Get all non-DM channels and DM channels where the user is a member
    const channelsList = await db.query.channels.findMany({
      where: and(
        eq(channels.workspaceId, parseInt(workspaceId)),
        includeArchived ? undefined : eq(channels.archived, false),
        or(
          // Include all non-DM channels
          not(eq(channels.channelType, 'DM')),
          // Include DM channels where user is a member
          exists(
            db.select().from(userChannels)
            .where(and(
              eq(userChannels.channelId, channels.channelId),
              eq(userChannels.userId, currentUserId)
            ))
          )
        )
      )
    });

    res.json(channelsList);
  } catch (error) {
    console.error('Error fetching workspace channels:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch workspace channels"
      }
    });
  }
});

/**
 * @route GET /api/v1/channels
 * @desc Global: list all channels (admin only)
 */
router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const includeArchived = req.query.includeArchived === 'true';

    const channelsQuery = includeArchived ?
      db.query.channels.findMany() :
      db.query.channels.findMany({
        where: eq(channels.archived, false)
      });

    const channelsList = await channelsQuery;
    res.json(channelsList);
  } catch (error) {
    console.error('Error fetching all channels:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch channels"
      }
    });
  }
});

/**
 * @route POST /api/v1/channels
 * @desc Create a new channel
 */
router.post('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const validationResult = createChannelSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Bad Request",
        details: {
          code: "VALIDATION_ERROR",
          message: "Invalid channel data",
          errors: validationResult.error.errors
        }
      });
    }

    const { name, topic, workspaceId, channelType } = validationResult.data;

    // Verify workspace exists
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.workspaceId, workspaceId)
    });

    if (!workspace) {
      return res.status(404).json({
        error: "Workspace Not Found",
        details: {
          code: "WORKSPACE_NOT_FOUND",
          message: "Workspace not found"
        }
      });
    }

    const [channel] = await db.insert(channels).values({
      name,
      topic,
      workspaceId,
      channelType,
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    // Add creator as channel member
    await db.insert(userChannels).values({
      userId: req.user!.userId,
      channelId: channel.channelId,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    // Broadcast channel creation event
    broadcastChannelEvent(channel, 'CHANNEL_CREATED');

    res.status(201).json(channel);
  } catch (error) {
    console.error('Error creating channel:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to create channel"
      }
    });
  }
});

/**
 * @route GET /api/v1/channels/{channelId}
 * @desc Get channel details
 */
router.get('/:channelId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const channel = await db.query.channels.findFirst({
      where: eq(channels.channelId, parseInt(channelId))
    });

    if (!channel) {
      return res.status(404).json({
        error: "Channel Not Found",
        details: {
          code: "CHANNEL_NOT_FOUND",
          message: "Channel not found"
        }
      });
    }

    res.json(channel);
  } catch (error) {
    console.error('Error fetching channel:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch channel"
      }
    });
  }
});

/**
 * @route PUT /api/v1/channels/{channelId}
 * @desc Update channel details
 */
router.put('/:channelId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;

    const validationResult = updateChannelSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Bad Request",
        details: {
          code: "VALIDATION_ERROR",
          message: "Invalid channel data",
          errors: validationResult.error.errors
        }
      });
    }

    const { name, topic } = validationResult.data;

    const [channel] = await db.update(channels)
      .set({
        name,
        topic,
        updatedAt: new Date()
      })
      .where(eq(channels.channelId, parseInt(channelId)))
      .returning();

    if (!channel) {
      return res.status(404).json({
        error: "Channel Not Found",
        details: {
          code: "CHANNEL_NOT_FOUND",
          message: "Channel not found"
        }
      });
    }

    // Broadcast channel update event
    broadcastChannelEvent(channel, 'CHANNEL_UPDATED');

    res.json(channel);
  } catch (error) {
    console.error('Error updating channel:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to update channel"
      }
    });
  }
});

/**
 * @route DELETE /api/v1/channels/{channelId}
 * @desc Archive (soft-delete) a channel
 */
router.delete('/:channelId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;

    const [channel] = await db.update(channels)
      .set({
        archived: true,
        updatedAt: new Date()
      })
      .where(eq(channels.channelId, parseInt(channelId)))
      .returning();

    if (!channel) {
      return res.status(404).json({
        error: "Channel Not Found",
        details: {
          code: "CHANNEL_NOT_FOUND",
          message: "Channel not found"
        }
      });
    }

    // Broadcast channel archive event
    broadcastChannelEvent(channel, 'CHANNEL_ARCHIVED');

    res.status(204).send();
  } catch (error) {
    console.error('Error archiving channel:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to archive channel"
      }
    });
  }
});

/**
 * @route POST /api/v1/channels/{channelId}/members
 * @desc Add a member to the channel
 */
router.post('/:channelId/members', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;

    // Validate input
    const validationResult = addMemberSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Bad Request",
        details: {
          code: "VALIDATION_ERROR",
          message: "Invalid member data",
          errors: validationResult.error.errors
        }
      });
    }

    const { userId } = validationResult.data;

    // Verify channel exists
    const channel = await db.query.channels.findFirst({
      where: eq(channels.channelId, parseInt(channelId))
    });

    if (!channel) {
      return res.status(404).json({
        error: "Channel Not Found",
        details: {
          code: "CHANNEL_NOT_FOUND",
          message: "The requested channel does not exist"
        }
      });
    }

    // Verify user exists
    const user = await db.query.users.findFirst({
      where: eq(users.userId, userId)
    });

    if (!user) {
      return res.status(404).json({
        error: "User Not Found",
        details: {
          code: "USER_NOT_FOUND",
          message: "The specified user does not exist"
        }
      });
    }

    await db.insert(userChannels).values({
      userId,
      channelId: parseInt(channelId),
      createdAt: new Date(),
      updatedAt: new Date()
    });

    res.status(201).json({ message: "User added to channel" });
  } catch (error) {
    console.error('Error adding channel member:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to add member to channel"
      }
    });
  }
});

/**
 * @route DELETE /api/v1/channels/{channelId}/members
 * @desc Remove a member from the channel
 */
router.delete('/:channelId/members', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        error: "Bad Request",
        details: {
          code: "MISSING_USER_ID",
          message: "User ID is required"
        }
      });
    }

    // Verify channel exists
    const channel = await db.query.channels.findFirst({
      where: eq(channels.channelId, parseInt(channelId))
    });

    if (!channel) {
      return res.status(404).json({
        error: "Channel Not Found",
        details: {
          code: "CHANNEL_NOT_FOUND",
          message: "The requested channel does not exist"
        }
      });
    }

    // Verify membership exists before attempting deletion
    const membershipExists = await db.query.userChannels.findFirst({
      where: and(
        eq(userChannels.channelId, parseInt(channelId)),
        eq(userChannels.userId, parseInt(userId as string))
      )
    });

    if (!membershipExists) {
      return res.status(404).json({
        error: "Member Not Found",
        details: {
          code: "MEMBER_NOT_FOUND",
          message: "The specified user is not a member of this channel"
        }
      });
    }

    // Delete the membership
    await db.delete(userChannels)
      .where(and(
        eq(userChannels.channelId, parseInt(channelId)),
        eq(userChannels.userId, parseInt(userId as string))
      ));

    res.status(204).send();
  } catch (error) {
    console.error('Error removing channel member:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to remove member from channel"
      }
    });
  }
});

/**
 * @route GET /api/v1/channels/{channelId}/members
 * @desc Get all members of a channel
 */
router.get('/:channelId/members', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const currentUserId = req.user!.userId;

    // Get the channel
    const channel = await db.query.channels.findFirst({
      where: eq(channels.channelId, parseInt(channelId))
    });

    if (!channel) {
      return res.status(404).json({
        error: "Channel Not Found",
        details: {
          code: "CHANNEL_NOT_FOUND",
          message: "Channel not found"
        }
      });
    }

    // Verify workspace membership
    const workspaceMembership = await db.query.userWorkspaces.findFirst({
      where: and(
        eq(userWorkspaces.userId, currentUserId),
        eq(userWorkspaces.workspaceId, channel.workspaceId!)
      )
    });

    if (!workspaceMembership) {
      return res.status(403).json({
        error: "Forbidden",
        details: {
          code: "NOT_WORKSPACE_MEMBER",
          message: "You are not a member of this workspace"
        }
      });
    }

    // Get all channel members
    const channelMembers = await db.query.userChannels.findMany({
      where: eq(userChannels.channelId, parseInt(channelId))
    });

    // Verify the current user is a channel member
    if (!channelMembers.some(member => member.userId === currentUserId)) {
      return res.status(403).json({
        error: "Forbidden",
        details: {
          code: "NOT_CHANNEL_MEMBER",
          message: "You are not a member of this channel"
        }
      });
    }

    // Get user details for all channel members
    const memberUserIds = channelMembers
      .map(member => member.userId)
      .filter((id): id is number => id !== null);

    const memberUsers = await db.query.users.findMany({
      where: inArray(users.userId, memberUserIds),
      columns: {
        userId: true,
        profilePicture: true,
        displayName: true
      }
    });

    // Format the response
    const channelMembersList: ChannelMember[] = memberUsers.map(user => ({
      userId: user.userId,
      profilePicture: user.profilePicture || null,
      displayName: user.displayName
    }));

    res.json(channelMembersList);
  } catch (error) {
    console.error('Error fetching channel members:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch channel members"
      }
    });
  }
});

function broadcastChannelEvent(channel: any, eventType: 'CHANNEL_CREATED' | 'CHANNEL_UPDATED' | 'CHANNEL_ARCHIVED') {
  const wsManager = getWebSocketManager();
  if (channel.workspaceId) {
    wsManager.broadcastToWorkspace(channel.workspaceId, {
      type: eventType,
      workspaceId: channel.workspaceId,
      data: {
        id: channel.channelId,
        name: channel.name,
        description: channel.topic ?? undefined,
        isPrivate: channel.channelType === 'PRIVATE',
        channelType: channel.channelType,
        workspaceId: channel.workspaceId,
        createdAt: channel.createdAt.toISOString(),
        updatedAt: channel.updatedAt.toISOString(),
        archived: channel.archived || false 
      }
    });
  }
}

// Add this new function to check for existing DM
async function findExistingDmChannel(workspaceId: number, userIds: number[]) {
  // Get all DM channels in the workspace
  const dmChannels = await db.query.channels.findMany({
    where: and(
      eq(channels.workspaceId, workspaceId),
      eq(channels.channelType, 'DM'),
      eq(channels.archived, false)
    )
  });

  // For each DM channel, check if it contains exactly these users
  for (const channel of dmChannels) {
    const channelMembers = await db.query.userChannels.findMany({
      where: eq(userChannels.channelId, channel.channelId)
    });

    const memberIds = channelMembers.map(member => member.userId);
    if (memberIds.length === userIds.length && 
        userIds.every(id => memberIds.includes(id))) {
      return channel;
    }
  }

  return null;
}

export { router as channelRouter };