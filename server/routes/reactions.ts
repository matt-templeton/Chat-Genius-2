import { Router } from 'express';
import { db } from "@db";
import { messageReactions, messages, emojis } from "@db/schema";
import { eq, and } from "drizzle-orm";
import type { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { z } from 'zod';

const router = Router();

// Input validation schema
const addReactionSchema = z.object({
  emojiId: z.number().int().positive("Valid emoji ID is required")
});

/**
 * @route POST /messages/:messageId/reactions
 * @desc Add a reaction to a message
 */
router.post('/:messageId/reactions', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const validationResult = addReactionSchema.safeParse(req.body);

    if (!validationResult.success) {
      return res.status(400).json({
        error: "Invalid Request",
        details: {
          code: "VALIDATION_ERROR",
          message: "Invalid emoji ID",
          errors: validationResult.error.errors
        }
      });
    }

    const { emojiId } = validationResult.data;

    // First get the message to verify it exists and get its workspaceId
    const message = await db.query.messages.findFirst({
      where: eq(messages.messageId, parseInt(messageId))
    });

    if (!message) {
      return res.status(404).json({
        error: "Message Not Found",
        details: {
          code: "MESSAGE_NOT_FOUND",
          message: "Message not found"
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
          message: "Emoji not found or has been deleted"
        }
      });
    }

    // Check for existing reaction
    const existingReaction = await db.query.messageReactions.findFirst({
      where: and(
        eq(messageReactions.messageId, parseInt(messageId)),
        eq(messageReactions.emojiId, emojiId),
        eq(messageReactions.userId, req.user!.userId)
      )
    });

    if (existingReaction) {
      return res.status(409).json({
        error: "Duplicate Reaction",
        details: {
          code: "DUPLICATE_REACTION",
          message: "User has already reacted with this emoji"
        }
      });
    }

    // Add the reaction with workspaceId from the message
    const [reaction] = await db
      .insert(messageReactions)
      .values({
        messageId: parseInt(messageId),
        workspaceId: message.workspaceId,
        emojiId,
        userId: req.user!.userId
      })
      .returning();

    res.status(201).json(reaction);
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

    // First get the message to verify it exists and get its workspaceId
    const message = await db.query.messages.findFirst({
      where: eq(messages.messageId, parseInt(messageId))
    });

    if (!message) {
      return res.status(404).json({
        error: "Message Not Found",
        details: {
          code: "MESSAGE_NOT_FOUND",
          message: "Message not found"
        }
      });
    }

    // Check if reaction exists before trying to delete
    const existingReaction = await db.query.messageReactions.findFirst({
      where: and(
        eq(messageReactions.messageId, parseInt(messageId)),
        eq(messageReactions.emojiId, parseInt(emojiId)),
        eq(messageReactions.userId, req.user!.userId)
      )
    });

    if (!existingReaction) {
      return res.status(404).json({
        error: "Reaction Not Found",
        details: {
          code: "REACTION_NOT_FOUND",
          message: "Reaction not found"
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

    // First get the message to verify it exists and get its workspaceId
    const message = await db.query.messages.findFirst({
      where: eq(messages.messageId, parseInt(messageId))
    });

    if (!message) {
      return res.status(404).json({
        error: "Message Not Found",
        details: {
          code: "MESSAGE_NOT_FOUND",
          message: "Message not found"
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