import { Router } from 'express';
import { db } from "@db";
import { channels, userChannels } from "@db/schema";
import { eq, and } from "drizzle-orm";
import type { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';

const router = Router();

/**
 * @route GET /channels
 * @desc List all channels (admin only)
 */
router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { includeArchived = false } = req.query;
    const query = includeArchived ? 
      db.query.channels.findMany() :
      db.query.channels.findMany({
        where: eq(channels.archived, false)
      });

    const channelsList = await query;
    res.json(channelsList);
  } catch (error) {
    console.error('Error fetching channels:', error);
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
 * @route GET /workspaces/:workspaceId/channels
 * @desc List channels in a workspace
 */
router.get('/workspace/:workspaceId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { includeArchived = false } = req.query;

    const query = includeArchived ?
      db.query.channels.findMany({
        where: eq(channels.workspaceId, parseInt(workspaceId))
      }) :
      db.query.channels.findMany({
        where: and(
          eq(channels.workspaceId, parseInt(workspaceId)),
          eq(channels.archived, false)
        )
      });

    const channelsList = await query;
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
 * @route POST /channels
 * @desc Create a new channel
 */
router.post('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { name, topic, workspaceId, channelType = 'PUBLIC' } = req.body;

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
 * @route GET /channels/:channelId
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
          message: "The requested channel does not exist"
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
 * @route PUT /channels/:channelId
 * @desc Update channel details
 */
router.put('/:channelId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const { name, topic } = req.body;

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
          message: "The requested channel does not exist"
        }
      });
    }

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
 * @route DELETE /channels/:channelId
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
          message: "The requested channel does not exist"
        }
      });
    }

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
 * @route POST /channels/:channelId/members
 * @desc Add a member to the channel
 */
router.post('/:channelId/members', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const { userId } = req.body;

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
 * @route DELETE /channels/:channelId/members
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

export { router as channelRouter };