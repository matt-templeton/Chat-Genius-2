import { Router } from 'express';
import { db } from "@db";
import { messages, channels, users, userWorkspaces, userChannels } from "@db/schema";
import { eq, and, desc, lt } from "drizzle-orm";
import type { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { z } from 'zod';
import { getWebSocketManager } from '../websocket/WebSocketManager';

const router = Router();

// Input validation schemas
const createMessageSchema = z.object({
  content: z.string().min(1, "Message content cannot be empty"),
  parentMessageId: z.number().int().positive().optional(),
  hasAttachments: z.boolean().optional()
});

const updateMessageSchema = z.object({
  content: z.string().min(1, "Message content cannot be empty")
});

/**
 * @route POST /channels/:channelId/messages
 * @desc Send a message in the channel
 */
router.post('/:channelId/messages', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const validationResult = createMessageSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid Content",
        details: {
          code: "VALIDATION_ERROR",
          message: "Invalid message data",
          errors: validationResult.error.errors
        }
      });
    }

    const { content, parentMessageId } = validationResult.data;
    console.log("Message creation - hasAttachments from request:", validationResult.data.hasAttachments);

    // First get the channel to get its workspaceId
    const channel = await db.query.channels.findFirst({
      where: eq(channels.channelId, parseInt(channelId))
    });

    if (!channel || !channel.workspaceId) {
      return res.status(404).json({
        error: "Channel Not Found",
        details: {
          code: "CHANNEL_NOT_FOUND",
          message: "Channel not found"
        }
      });
    }

    // If parentMessageId is provided, verify it exists in the same workspace
    if (parentMessageId) {
      const parentMessage = await db.query.messages.findFirst({
        where: and(
          eq(messages.messageId, parentMessageId),
          eq(messages.workspaceId, channel.workspaceId)
        )
      });

      if (!parentMessage) {
        return res.status(404).json({
          error: "Parent Message Not Found",
          details: {
            code: "PARENT_MESSAGE_NOT_FOUND",
            message: "Parent message not found"
          }
        });
      }
    }

    const now = new Date();
    const hasAttachments = validationResult.data.hasAttachments || false;
    console.log("Message creation - setting hasAttachments to:", hasAttachments);

    // Insert the message
    const [message] = await db.insert(messages)
      .values({
        workspaceId: channel.workspaceId,
        channelId: parseInt(channelId),
        userId: req.user!.userId,
        content,
        parentMessageId: parentMessageId || null,
        hasAttachments,
        deleted: false,
        postedAt: now,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    console.log("Message creation - created message with hasAttachments:", message.hasAttachments);

    const wsManager = getWebSocketManager();

    // Get the user's display name
    const messageUser = await db.query.users.findFirst({
      where: eq(users.userId, req.user!.userId),
      columns: {
        displayName: true,
        profilePicture: true
      }
    });

    // Create the WebSocket event data
    const wsEventData = {
      type: "MESSAGE_CREATED" as const,
      workspaceId: channel.workspaceId,
      data: {
        messageId: message.messageId,
        channelId: message.channelId,
        content: message.content,
        userId: message.userId,
        workspaceId: message.workspaceId,
        parentMessageId: message.parentMessageId,
        hasAttachments: message.hasAttachments,
        createdAt: message.createdAt.toISOString(),
        user: {
          userId: message.userId,
          displayName: messageUser?.displayName || `User ${message.userId}`,
          profilePicture: messageUser?.profilePicture
        }
      }
    };

    console.log("Message creation - broadcasting WebSocket event with data:", wsEventData);

    // Broadcast with user info
    wsManager.broadcastToWorkspace(channel.workspaceId, wsEventData);

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
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const before = req.query.before as string | undefined;
    const includeDeleted = req.query.includeDeleted === 'true';

    // Get channel first to verify it exists and get workspaceId
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

    let conditions = [
      eq(messages.channelId, parseInt(channelId)),
      eq(messages.workspaceId, channel.workspaceId!)
    ];

    if (!includeDeleted) {
      conditions.push(eq(messages.deleted, false));
    }

    if (before) {
      conditions.push(lt(messages.postedAt, new Date(before)));
    }

    // Modified query to only get displayName from users
    const messagesList = await db
      .select({
        messageId: messages.messageId,
        channelId: messages.channelId,
        workspaceId: messages.workspaceId,
        userId: messages.userId,
        content: messages.content,
        parentMessageId: messages.parentMessageId,
        deleted: messages.deleted,
        hasAttachments: messages.hasAttachments,
        postedAt: messages.postedAt,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        displayName: users.displayName,
        profilePicture: users.profilePicture,
      })
      .from(messages)
      .leftJoin(users, eq(messages.userId, users.userId))
      .where(and(...conditions))
      .orderBy(desc(messages.postedAt))
      .limit(limit)
      .offset(offset);

    // Transform the results to include displayName in user object
    const formattedMessages = messagesList.map(message => {
      const { displayName, profilePicture, ...messageFields } = message;
      return {
        ...messageFields,
        user: {
          userId: message.userId,
          displayName: displayName || `User ${message.userId}`,
          profilePicture: profilePicture || null
        }
      };
    });

    res.json(formattedMessages);
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

    const message = await db
      .select({
        messageId: messages.messageId,
        channelId: messages.channelId,
        workspaceId: messages.workspaceId,
        userId: messages.userId,
        content: messages.content,
        parentMessageId: messages.parentMessageId,
        deleted: messages.deleted,
        hasAttachments: messages.hasAttachments,
        postedAt: messages.postedAt,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        displayName: users.displayName,
        profilePicture: users.profilePicture,
      })
      .from(messages)
      .leftJoin(users, eq(messages.userId, users.userId))
      .where(eq(messages.messageId, parseInt(messageId)))
      .limit(1);

    if (!message || message.length === 0) {
      return res.status(404).json({
        error: "Message Not Found",
        details: {
          code: "MESSAGE_NOT_FOUND",
          message: "Message not found"
        }
      });
    }

    // Transform the result to include user info in a nested object
    const { displayName, profilePicture, ...messageFields } = message[0];
    const formattedMessage = {
      ...messageFields,
      user: {
        userId: message[0].userId,
        displayName: displayName || `User ${message[0].userId}`,
        profilePicture
      }
    };

    res.json(formattedMessage);
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
    const validationResult = updateMessageSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid Content",
        details: {
          code: "VALIDATION_ERROR",
          message: "Invalid message data",
          errors: validationResult.error.errors
        }
      });
    }

    const { content } = validationResult.data;

    // First get the message to verify ownership and get workspaceId
    const existingMessage = await db.query.messages.findFirst({
      where: eq(messages.messageId, parseInt(messageId))
    });

    if (!existingMessage || !existingMessage.workspaceId) {
      return res.status(404).json({
        error: "Message Not Found",
        details: {
          code: "MESSAGE_NOT_FOUND",
          message: "Message not found"
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
          message: "Message not found"
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

/**
 * @route GET /messages/:messageId/thread
 * @desc Get all replies in a thread
 */
router.get('/:messageId/thread', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const includeDeleted = req.query.includeDeleted === 'true';

    // First get the parent message to verify it exists and get channel info
    const parentMessage = await db.query.messages.findFirst({
      where: eq(messages.messageId, parseInt(messageId))
    });

    if (!parentMessage || !parentMessage.channelId) {
      return res.status(404).json({
        error: "Message Not Found",
        details: {
          code: "MESSAGE_NOT_FOUND",
          message: "Parent message not found"
        }
      });
    }

    // Get the channel to check permissions
    const channel = await db.query.channels.findFirst({
      where: eq(channels.channelId, parentMessage.channelId)
    });

    if (!channel || !channel.workspaceId) {
      return res.status(404).json({
        error: "Channel Not Found",
        details: {
          code: "CHANNEL_NOT_FOUND",
          message: "Channel not found"
        }
      });
    }

    // Check if user is a member of the workspace
    const workspaceMembership = await db.query.userWorkspaces.findFirst({
      where: and(
        eq(userWorkspaces.workspaceId, channel.workspaceId),
        eq(userWorkspaces.userId, req.user!.userId)
      )
    });

    if (!workspaceMembership) {
      return res.status(404).json({
        error: "Not Found",
        details: {
          code: "NOT_FOUND",
          message: "Thread not found"
        }
      });
    }

    // If channel is not public, check channel membership
    if (channel.channelType !== 'PUBLIC') {
      const channelMembership = await db.query.userChannels.findFirst({
        where: and(
          eq(userChannels.channelId, channel.channelId),
          eq(userChannels.userId, req.user!.userId)
        )
      });

      if (!channelMembership) {
        return res.status(404).json({
          error: "Not Found",
          details: {
            code: "NOT_FOUND",
            message: "Thread not found"
          }
        });
      }
    }

    // Get all replies in the thread
    let conditions = [
      eq(messages.parentMessageId, parseInt(messageId)),
      eq(messages.workspaceId, channel.workspaceId)
    ];

    if (!includeDeleted) {
      conditions.push(eq(messages.deleted, false));
    }

    const threadMessages = await db
      .select({
        messageId: messages.messageId,
        channelId: messages.channelId,
        workspaceId: messages.workspaceId,
        userId: messages.userId,
        content: messages.content,
        parentMessageId: messages.parentMessageId,
        deleted: messages.deleted,
        hasAttachments: messages.hasAttachments,
        postedAt: messages.postedAt,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        displayName: users.displayName,
        profilePicture: users.profilePicture,
      })
      .from(messages)
      .leftJoin(users, eq(messages.userId, users.userId))
      .where(and(...conditions))
      .orderBy(desc(messages.postedAt));

    // Transform the results to include displayName in user object
    const formattedMessages = threadMessages.map(message => {
      const { displayName, profilePicture, ...messageFields } = message;
      return {
        ...messageFields,
        user: {
          userId: message.userId,
          displayName: displayName || `User ${message.userId}`,
          profilePicture: profilePicture || null
        }
      };
    });

    res.json(formattedMessages);
  } catch (error) {
    console.error('Error fetching thread messages:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch thread messages"
      }
    });
  }
});

/**
 * @route POST /messages/:messageId/thread
 * @desc Post a reply in a thread
 */
router.post('/:messageId/thread', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const validationResult = createMessageSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid Content",
        details: {
          code: "VALIDATION_ERROR",
          message: "Invalid message data",
          errors: validationResult.error.errors
        }
      });
    }

    const { content } = validationResult.data;

    // Get the parent message to verify it exists and get channel info
    const parentMessage = await db.query.messages.findFirst({
      where: eq(messages.messageId, parseInt(messageId))
    });

    if (!parentMessage || !parentMessage.channelId) {
      return res.status(404).json({
        error: "Message Not Found",
        details: {
          code: "MESSAGE_NOT_FOUND",
          message: "Parent message not found"
        }
      });
    }

    // Get the channel to check permissions
    const channel = await db.query.channels.findFirst({
      where: eq(channels.channelId, parentMessage.channelId)
    });

    if (!channel || !channel.workspaceId) {
      return res.status(404).json({
        error: "Channel Not Found",
        details: {
          code: "CHANNEL_NOT_FOUND",
          message: "Channel not found"
        }
      });
    }

    // Check if user is a member of the workspace
    const workspaceMembership = await db.query.userWorkspaces.findFirst({
      where: and(
        eq(userWorkspaces.workspaceId, channel.workspaceId),
        eq(userWorkspaces.userId, req.user!.userId)
      )
    });

    if (!workspaceMembership) {
      return res.status(403).json({
        error: "Forbidden",
        details: {
          code: "FORBIDDEN",
          message: "You don't have permission to reply in this thread"
        }
      });
    }

    // If channel is not public, check channel membership
    if (channel.channelType !== 'PUBLIC') {
      const channelMembership = await db.query.userChannels.findFirst({
        where: and(
          eq(userChannels.channelId, channel.channelId),
          eq(userChannels.userId, req.user!.userId)
        )
      });

      if (!channelMembership) {
        return res.status(403).json({
          error: "Forbidden",
          details: {
            code: "FORBIDDEN",
            message: "You don't have permission to reply in this thread"
          }
        });
      }
    }

    const now = new Date();

    // Insert the reply
    const [message] = await db.insert(messages)
      .values({
        workspaceId: channel.workspaceId,
        channelId: parentMessage.channelId,
        userId: req.user!.userId,
        content,
        parentMessageId: parseInt(messageId),
        deleted: false,
        postedAt: now,
        createdAt: now,
        updatedAt: now
      })
      .returning();

    const wsManager = getWebSocketManager();

    // Get the user's display name
    const messageUser = await db.query.users.findFirst({
      where: eq(users.userId, req.user!.userId),
      columns: {
        displayName: true,
        profilePicture: true
      }
    });

    // Broadcast with user info
    wsManager.broadcastToWorkspace(channel.workspaceId, {
      type: "MESSAGE_CREATED" as const,
      workspaceId: channel.workspaceId,
      data: {
        messageId: message.messageId,
        channelId: message.channelId,
        content: message.content,
        userId: message.userId,
        workspaceId: message.workspaceId,
        parentMessageId: message.parentMessageId,
        hasAttachments: message.hasAttachments,
        createdAt: message.createdAt.toISOString(),
        user: {
          userId: message.userId,
          displayName: messageUser?.displayName || `User ${message.userId}`,
          profilePicture: messageUser?.profilePicture
        }
      }
    });

    res.status(201).json(message);
  } catch (error) {
    console.error('Error creating thread reply:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to create thread reply"
      }
    });
  }
});

export { router as messageRouter };