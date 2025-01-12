import { Router } from 'express';
import { db } from "@db";
import { pinnedMessages, messages } from "@db/schema";
import { eq, and } from "drizzle-orm";
import type { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';

const router = Router();

/**
 * @route POST /messages/:messageId/pin
 * @desc Pin a message
 */
router.post('/:messageId/pin', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const { reason } = req.body;

    // First get the message to get its workspaceId
    const message = await db.query.messages.findFirst({
      where: eq(messages.messageId, parseInt(messageId))
    });

    if (!message) {
      return res.status(404).json({
        error: "Message Not Found",
        details: {
          code: "MESSAGE_NOT_FOUND",
          message: "The specified message does not exist"
        }
      });
    }

    // Check if message is already pinned
    const existingPin = await db.query.pinnedMessages.findFirst({
      where: and(
        eq(pinnedMessages.messageId, parseInt(messageId)),
        eq(pinnedMessages.workspaceId, message.workspaceId)
      )
    });

    if (existingPin) {
      return res.status(409).json({
        error: "Message Already Pinned",
        details: {
          code: "ALREADY_PINNED",
          message: "This message is already pinned"
        }
      });
    }

    // Pin the message
    const [pin] = await db.insert(pinnedMessages).values({
      messageId: parseInt(messageId),
      workspaceId: message.workspaceId,
      pinnedBy: req.user!.userId,
      pinnedReason: reason,
      pinnedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    res.status(201).json(pin);
  } catch (error) {
    console.error('Error pinning message:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to pin message"
      }
    });
  }
});

/**
 * @route DELETE /messages/:messageId/pin
 * @desc Unpin a message
 */
router.delete('/:messageId/pin', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;

    // First get the message to get its workspaceId
    const message = await db.query.messages.findFirst({
      where: eq(messages.messageId, parseInt(messageId))
    });

    if (!message) {
      return res.status(404).json({
        error: "Message Not Found",
        details: {
          code: "MESSAGE_NOT_FOUND",
          message: "The specified message does not exist"
        }
      });
    }

    await db.delete(pinnedMessages)
      .where(and(
        eq(pinnedMessages.messageId, parseInt(messageId)),
        eq(pinnedMessages.workspaceId, message.workspaceId)
      ));

    res.status(204).send();
  } catch (error) {
    console.error('Error unpinning message:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to unpin message"
      }
    });
  }
});

/**
 * @route GET /channels/:channelId/pins
 * @desc Get all pinned messages in a channel
 */
router.get('/channel/:channelId/pins', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;

    // Get messages from this channel that are pinned
    const pinnedMessagesList = await db.select()
      .from(messages)
      .innerJoin(
        pinnedMessages,
        and(
          eq(messages.messageId, pinnedMessages.messageId),
          eq(messages.workspaceId, pinnedMessages.workspaceId)
        )
      )
      .where(eq(messages.channelId, parseInt(channelId)))
      .orderBy(pinnedMessages.pinnedAt);

    res.json(pinnedMessagesList);
  } catch (error) {
    console.error('Error fetching pinned messages:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch pinned messages"
      }
    });
  }
});

export { router as pinRouter };
