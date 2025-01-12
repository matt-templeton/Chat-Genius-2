import { Router } from 'express';
import { db } from "@db";
import { emojis } from "@db/schema";
import { eq, and, desc, like } from "drizzle-orm";
import type { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { z } from "zod";
import { sql } from 'drizzle-orm';

const router = Router();

// Validation schemas
const createEmojiSchema = z.object({
  code: z.string().min(1).max(50),
});

const paginationSchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

/**
 * @openapi
 * /api/v1/emojis:
 *   get:
 *     tags:
 *       - Emojis
 *     summary: List all custom emojis
 *     description: Retrieve a paginated list of all custom emojis (excluding soft-deleted ones)
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: List of emojis
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Server error
 */
router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { page, limit } = paginationSchema.parse(req.query);
    const offset = (page - 1) * limit;

    // Use a where clause to filter out deleted emojis
    const where = eq(emojis.deleted, false);

    const customEmojis = await db.query.emojis.findMany({
      where,
      limit,
      offset,
      orderBy: [desc(emojis.createdAt)]
    });

    // Get total count for pagination, excluding deleted emojis
    const totalCount = await db.select({ 
      count: sql<number>`cast(count(*) as integer)` 
    })
    .from(emojis)
    .where(where);

    res.json({
      data: customEmojis,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCount[0].count / limit),
        totalItems: totalCount[0].count,
        itemsPerPage: limit
      }
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid Request",
        details: {
          code: "INVALID_REQUEST",
          message: "Invalid pagination parameters",
          validationErrors: error.errors
        }
      });
    }

    console.error('Error fetching emojis:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch emojis"
      }
    });
  }
});

/**
 * @openapi
 * /api/v1/emojis:
 *   post:
 *     tags:
 *       - Emojis
 *     summary: Create a new custom emoji
 *     description: Create a new custom emoji with the provided code
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - code
 *             properties:
 *               code:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 50
 *     responses:
 *       201:
 *         description: Emoji created successfully
 *       400:
 *         description: Invalid request body
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Emoji code already exists
 *       500:
 *         description: Server error
 */
router.post('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { code } = createEmojiSchema.parse(req.body);

    // Check if emoji code already exists
    const existingEmoji = await db.query.emojis.findFirst({
      where: eq(emojis.code, code)
    });

    if (existingEmoji) {
      return res.status(409).json({
        error: "Emoji Already Exists",
        details: {
          code: "EMOJI_EXISTS",
          message: "An emoji with this code already exists"
        }
      });
    }

    // Create new emoji
    const [emoji] = await db.insert(emojis).values({
      code,
      deleted: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    res.status(201).json(emoji);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: "Invalid Request",
        details: {
          code: "INVALID_REQUEST",
          message: "Invalid emoji data",
          validationErrors: error.errors
        }
      });
    }

    console.error('Error creating emoji:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to create emoji"
      }
    });
  }
});

/**
 * @openapi
 * /api/v1/emojis/{emojiId}:
 *   get:
 *     tags:
 *       - Emojis
 *     summary: Get a specific emoji
 *     description: Retrieve details of a specific emoji by ID
 *     parameters:
 *       - in: path
 *         name: emojiId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the emoji to retrieve
 *     responses:
 *       200:
 *         description: Emoji details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Emoji not found
 *       500:
 *         description: Server error
 */
router.get('/:emojiId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { emojiId } = req.params;

    const emoji = await db.query.emojis.findFirst({
      where: eq(emojis.emojiId, parseInt(emojiId))
    });

    if (!emoji) {
      return res.status(404).json({
        error: "Emoji Not Found",
        details: {
          code: "EMOJI_NOT_FOUND",
          message: "The requested emoji does not exist"
        }
      });
    }

    res.json(emoji);
  } catch (error) {
    console.error('Error fetching emoji:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch emoji"
      }
    });
  }
});

/**
 * @openapi
 * /api/v1/emojis/{emojiId}:
 *   delete:
 *     tags:
 *       - Emojis
 *     summary: Soft delete an emoji
 *     description: Mark an emoji as deleted (soft delete)
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: emojiId
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID of the emoji to delete
 *     responses:
 *       204:
 *         description: Emoji successfully deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Emoji not found
 *       500:
 *         description: Server error
 */
router.delete('/:emojiId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { emojiId } = req.params;

    const emoji = await db.query.emojis.findFirst({
      where: eq(emojis.emojiId, parseInt(emojiId))
    });

    if (!emoji) {
      return res.status(404).json({
        error: "Emoji Not Found",
        details: {
          code: "EMOJI_NOT_FOUND",
          message: "The requested emoji does not exist"
        }
      });
    }

    // Soft delete the emoji
    await db.update(emojis)
      .set({
        deleted: true,
        updatedAt: new Date()
      })
      .where(eq(emojis.emojiId, parseInt(emojiId)));

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting emoji:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to delete emoji"
      }
    });
  }
});

export { router as emojiRouter };