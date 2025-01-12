import { Router } from 'express';
import { db } from "@db";
import { messageReactions, messages, emojis } from "@db/schema";
import { eq, and } from "drizzle-orm";
import type { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';

const router = Router();

/**
 * @route POST /messages/:messageId/reactions
 * @desc Add a reaction to a message
 */
router.post('/:messageId/reactions', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const { emojiId } = req.body;

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

    // Verify emoji exists and is not deleted
    const emoji = await db.query.emojis.findFirst({
      where: and(
        eq(emojis.emojiId, emojiId),
        eq(emojis.deleted, false)
      )
    });

    if (!emoji) {
      return res.status(404).json({
        error: "Emoji Not Found",
        details: {
          code: "EMOJI_NOT_FOUND",
          message: "The specified emoji does not exist or has been deleted"
        }
      });
    }

    // Add the reaction
    await db.insert(messageReactions).values({
      messageId: parseInt(messageId),
      workspaceId: message.workspaceId,
      emojiId,
      userId: req.user!.userId,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    res.status(201).send();
  } catch (error) {
    // Check if error is a unique constraint violation
    if (error instanceof Error && error.message.includes('idx_reactions_unique')) {
      return res.status(409).json({
        error: "Duplicate Reaction",
        details: {
          code: "DUPLICATE_REACTION",
          message: "User has already reacted with this emoji"
        }
      });
    }

    console.error('Error adding reaction:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to add reaction"
      }
    });
  }
});

/**
 * @route DELETE /messages/:messageId/reactions/:emojiId
 * @desc Remove a reaction from a message
 */
router.delete('/:messageId/reactions/:emojiId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { messageId, emojiId } = req.params;

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

    // Remove the reaction
    await db.delete(messageReactions)
      .where(and(
        eq(messageReactions.messageId, parseInt(messageId)),
        eq(messageReactions.workspaceId, message.workspaceId),
        eq(messageReactions.emojiId, parseInt(emojiId)),
        eq(messageReactions.userId, req.user!.userId)
      ));

    res.status(204).send();
  } catch (error) {
    console.error('Error removing reaction:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to remove reaction"
      }
    });
  }
});

/**
 * @route GET /messages/:messageId/reactions
 * @desc Get all reactions for a message
 */
router.get('/:messageId/reactions', isAuthenticated, async (req: Request, res: Response) => {
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

    const reactions = await db.query.messageReactions.findMany({
      where: and(
        eq(messageReactions.messageId, parseInt(messageId)),
        eq(messageReactions.workspaceId, message.workspaceId)
      )
    });

    res.json(reactions);
  } catch (error) {
    console.error('Error fetching reactions:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch reactions"
      }
    });
  }
});

export { router as reactionRouter };
