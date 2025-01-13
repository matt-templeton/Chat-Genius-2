import { Router } from 'express';
import { db } from "@db";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";
import type { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';

const router = Router();

/**
 * @route GET /v1/users
 * @desc List all users with optional deactivated filter
 */
router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { deactivated } = req.query;
    const query = deactivated ? 
      db.query.users.findMany({
        where: eq(users.deactivated, deactivated === 'true')
      }) :
      db.query.users.findMany({
        where: eq(users.deactivated, false)
      });

    const usersList = await query;
    res.json(usersList);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR"
      }
    });
  }
});

/**
 * @route GET /v1/users/me
 * @desc Get current authenticated user
 */
router.get('/me', isAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!req.user?.userId) {
      return res.status(401).json({
        error: "Unauthorized",
        details: {
          code: "UNAUTHORIZED"
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
          code: "USER_NOT_FOUND"
        }
      });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching current user:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR"
      }
    });
  }
});

/**
 * @route GET /v1/users/:userId
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
          code: "USER_NOT_FOUND"
        }
      });
    }

    res.json(user);
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR"
      }
    });
  }
});

/**
 * @route POST /v1/users/:userId/reactivate
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
          code: "USER_NOT_FOUND"
        }
      });
    }

    res.json(user);
  } catch (error) {
    console.error('Error reactivating user:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR"
      }
    });
  }
});

export { router as userRouter };