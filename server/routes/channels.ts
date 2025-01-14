import { Router } from 'express';
import { db } from "@db";
import { channels, userChannels, workspaces, users } from "@db/schema";
import { eq, and } from "drizzle-orm";
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

/**
 * @route GET /api/v1/workspaces/{workspaceId}/channels
 * @desc List channels in a workspace
 */
router.get('/:workspaceId/channels', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const includeArchived = req.query.includeArchived === 'true';

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

    // Query channels based on includeArchived parameter
    let channelsQuery = includeArchived ?
      db.query.channels.findMany({
        where: eq(channels.workspaceId, parseInt(workspaceId))
      }) :
      db.query.channels.findMany({
        where: and(
          eq(channels.workspaceId, parseInt(workspaceId)),
          eq(channels.archived, false)
        )
      });

    const channelsList = await channelsQuery;
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

export { router as channelRouter };