import { Router } from 'express';
import { db } from "@db";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";
import type { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';

const router = Router();

/**
 * @route GET /users
 * @desc List all users with optional deactivated filter
 */
router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { deactivated } = req.query;
    let usersList;

    // Filter by deactivation status if provided
    if (deactivated !== undefined) {
      usersList = await db.query.users.findMany({
        where: eq(users.deactivated, deactivated === 'true')
      });
    } else {
      // Default to showing only active users
      usersList = await db.query.users.findMany({
        where: eq(users.deactivated, false)
      });
    }

    res.json(usersList);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch users"
      }
    });
  }
});

/**
 * @route GET /users/me
 * @desc Get current authenticated user
 */
router.get('/me', isAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({
        error: "Unauthorized",
        details: {
          code: "UNAUTHORIZED",
          message: "Not authenticated"
        }
      });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.userId, req.user.userId)
    });

    if (!user) {
      return res.status(404).json({
        error: "User Not Found",
        details: {
          code: "USER_NOT_FOUND",
          message: "Current user not found"
        }
      });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch current user"
      }
    });
  }
});

/**
 * @route GET /users/:userId
 * @desc Get a specific user by ID
 */
router.get('/:userId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const user = await db.query.users.findFirst({
      where: eq(users.userId, parseInt(userId))
    });

    if (!user) {
      return res.status(404).json({
        error: "User Not Found",
        details: {
          code: "USER_NOT_FOUND",
          message: "User not found"
        }
      });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch user"
      }
    });
  }
});

/**
 * @route DELETE /users/:userId
 * @desc Deactivate (soft-delete) a user
 */
router.delete('/:userId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const [user] = await db.update(users)
      .set({
        deactivated: true,
        updatedAt: new Date()
      })
      .where(eq(users.userId, parseInt(userId)))
      .returning();

    if (!user) {
      return res.status(404).json({
        error: "User Not Found",
        details: {
          code: "USER_NOT_FOUND",
          message: "User not found"
        }
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deactivating user:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to deactivate user"
      }
    });
  }
});

/**
 * @route POST /users/:userId/reactivate
 * @desc Reactivate a previously deactivated user
 */
router.post('/:userId/reactivate', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const [user] = await db.update(users)
      .set({
        deactivated: false,
        updatedAt: new Date()
      })
      .where(eq(users.userId, parseInt(userId)))
      .returning();

    if (!user) {
      return res.status(404).json({
        error: "User Not Found",
        details: {
          code: "USER_NOT_FOUND",
          message: "User not found"
        }
      });
    }

    res.json(user);
  } catch (error) {
    console.error('Error reactivating user:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to reactivate user"
      }
    });
  }
});

export { router as userRouter };