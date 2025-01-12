import { Router } from 'express';
import { db } from "@db";
import { messages, channels } from "@db/schema";
import { eq, and, desc, lt } from "drizzle-orm";
import type { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';

const router = Router();

/**
 * @route POST /channels/:channelId/messages
 * @desc Send a message in the channel
 */
router.post('/:channelId/messages', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const { content, parentMessageId } = req.body;

    // Validate content
    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        error: "Invalid Content",
        details: {
          code: "INVALID_CONTENT",
          message: "Message content cannot be empty"
        }
      });
    }

    // First get the channel to get its workspaceId
    const channel = await db.query.channels.findFirst({
      where: eq(channels.channelId, parseInt(channelId))
    });

    if (!channel || !channel.workspaceId) {
      return res.status(404).json({
        error: "Channel Not Found",
        details: {
          code: "CHANNEL_NOT_FOUND",
          message: "The specified channel does not exist"
        }
      });
    }

    // If parentMessageId is provided, verify it exists in the same workspace
    if (parentMessageId) {
      const parentMessage = await db.query.messages.findFirst({
        where: and(
          eq(messages.messageId, parseInt(parentMessageId)),
          eq(messages.workspaceId, channel.workspaceId)
        )
      });

      if (!parentMessage) {
        return res.status(404).json({
          error: "Parent Message Not Found",
          details: {
            code: "PARENT_MESSAGE_NOT_FOUND",
            message: "The specified parent message does not exist in this workspace"
          }
        });
      }
    }

    const now = new Date();

    // Insert the message
    const [message] = await db.insert(messages)
      .values({
        workspaceId: channel.workspaceId,
        channelId: parseInt(channelId),
        userId: req.user!.userId,
        content,
        parentMessageId: parentMessageId ? parseInt(parentMessageId) : null,
        deleted: false,
        postedAt: now,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    res.status(201).json(message);
  } catch (error) {
    console.error('Error creating message:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to create message"
      }
    });
  }
});

/**
 * @route GET /channels/:channelId/messages
 * @desc List messages in a channel with pagination (excluded deleted unless requested)
 */
router.get('/:channelId/messages', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const { limit = '20', offset = '0', before, includeDeleted = false } = req.query;

    // Get channel first to verify it exists and get workspaceId
    const channel = await db.query.channels.findFirst({
      where: eq(channels.channelId, parseInt(channelId))
    });

    if (!channel) {
      return res.status(404).json({
        error: "Channel Not Found",
        details: {
          code: "CHANNEL_NOT_FOUND",
          message: "The specified channel does not exist"
        }
      });
    }

    let conditions = [
      eq(messages.channelId, parseInt(channelId)),
      eq(messages.workspaceId, channel.workspaceId!)
    ];

    if (!includeDeleted) {
      conditions.push(eq(messages.deleted, false));
    }

    if (before) {
      conditions.push(lt(messages.postedAt, new Date(before as string)));
    }

    const messagesList = await db.query.messages.findMany({
      where: and(...conditions),
      orderBy: [desc(messages.postedAt)],
      limit: parseInt(limit as string),
      offset: parseInt(offset as string)
    });

    res.json(messagesList);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch messages"
      }
    });
  }
});

/**
 * @route GET /messages/:messageId
 * @desc Get message details (including soft-deleted if found)
 */
router.get('/:messageId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;

    const message = await db.query.messages.findFirst({
      where: eq(messages.messageId, parseInt(messageId))
    });

    if (!message) {
      return res.status(404).json({
        error: "Message Not Found",
        details: {
          code: "MESSAGE_NOT_FOUND",
          message: "The requested message does not exist"
        }
      });
    }

    res.json(message);
  } catch (error) {
    console.error('Error fetching message:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch message"
      }
    });
  }
});

/**
 * @route PUT /messages/:messageId
 * @desc Update a message's content
 */
router.put('/:messageId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const { content } = req.body;

    // Validate content
    if (!content || content.trim().length === 0) {
      return res.status(400).json({
        error: "Invalid Content",
        details: {
          code: "INVALID_CONTENT",
          message: "Message content cannot be empty"
        }
      });
    }

    // First get the message to verify ownership and get workspaceId
    const existingMessage = await db.query.messages.findFirst({
      where: eq(messages.messageId, parseInt(messageId))
    });

    if (!existingMessage || !existingMessage.workspaceId) {
      return res.status(404).json({
        error: "Message Not Found",
        details: {
          code: "MESSAGE_NOT_FOUND",
          message: "The requested message does not exist"
        }
      });
    }

    // Check if message is deleted
    if (existingMessage.deleted) {
      return res.status(400).json({
        error: "Message Deleted",
        details: {
          code: "MESSAGE_DELETED",
          message: "Cannot update a deleted message"
        }
      });
    }

    // Verify user owns the message or has appropriate permissions
    if (existingMessage.userId !== req.user!.userId) {
      return res.status(403).json({
        error: "Forbidden",
        details: {
          code: "FORBIDDEN",
          message: "You don't have permission to edit this message"
        }
      });
    }

    const [message] = await db.update(messages)
      .set({
        content,
        updatedAt: new Date()
      })
      .where(and(
        eq(messages.messageId, parseInt(messageId)),
        eq(messages.workspaceId, existingMessage.workspaceId)
      ))
      .returning();

    res.json(message);
  } catch (error) {
    console.error('Error updating message:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to update message"
      }
    });
  }
});

/**
 * @route DELETE /messages/:messageId
 * @desc Soft delete a message
 */
router.delete('/:messageId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;

    // First get the message to verify ownership and get workspaceId
    const existingMessage = await db.query.messages.findFirst({
      where: eq(messages.messageId, parseInt(messageId))
    });

    if (!existingMessage || !existingMessage.workspaceId) {
      return res.status(404).json({
        error: "Message Not Found",
        details: {
          code: "MESSAGE_NOT_FOUND",
          message: "The requested message does not exist"
        }
      });
    }

    // Verify user owns the message or has appropriate permissions
    if (existingMessage.userId !== req.user!.userId) {
      return res.status(403).json({
        error: "Forbidden",
        details: {
          code: "FORBIDDEN",
          message: "You don't have permission to delete this message"
        }
      });
    }

    await db.update(messages)
      .set({
        deleted: true,
        updatedAt: new Date()
      })
      .where(and(
        eq(messages.messageId, parseInt(messageId)),
        eq(messages.workspaceId, existingMessage.workspaceId)
      ));

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting message:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to delete message"
      }
    });
  }
});

export { router as messageRouter };