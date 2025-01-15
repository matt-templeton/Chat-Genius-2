import { Router } from 'express';
import { db } from "@db";
import { users, userWorkspaces } from "@db/schema";
import { eq } from "drizzle-orm";
import type { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { getWebSocketManager } from '../websocket/WebSocketManager';

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

/**
 * @route PATCH /users/status
 * @desc Update current user's status
 */
router.patch('/status', isAuthenticated, async (req: Request, res: Response) => {
  try {
    console.log("HEERE")
    console.log(req)
    if (!req.user?.userId) {
      return res.status(401).json({
        error: "Unauthorized",
        details: {
          code: "UNAUTHORIZED",
          message: "Not authenticated"
        }
      });
    }

    const { status } = req.body;
    if (typeof status !== 'string') {
      return res.status(400).json({
        error: "Bad Request",
        details: {
          code: "INVALID_STATUS",
          message: "Status must be a string"
        }
      });
    }

    // Update user status
    const [updatedUser] = await db.update(users)
      .set({
        statusMessage: status,
        updatedAt: new Date()
      })
      .where(eq(users.userId, req.user.userId))
      .returning();

    if (!updatedUser) {
      return res.status(404).json({
        error: "User Not Found",
        details: {
          code: "USER_NOT_FOUND",
          message: "User not found"
        }
      });
    }

    // Get all workspaces the user is a member of
    const workspaceMemberships = await db.query.userWorkspaces.findMany({
      where: eq(userWorkspaces.userId, req.user.userId)
    });

    // Get WebSocket manager and broadcast status update to all relevant workspaces
    const wsManager = getWebSocketManager();
    workspaceMemberships.forEach((membership) => {
      if (membership.workspaceId) {
        wsManager.broadcastToWorkspace(membership.workspaceId, {
          type: 'USER_STATUS_UPDATE',
          workspaceId: membership.workspaceId,
          data: {
            userId: req.user?.userId,
            status: status
          }
        });
      }
    });

    res.json(updatedUser);
  } catch (error) {
    console.error('Error updating user status:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to update user status"
      }
    });
  }
});

/**
 * @route PATCH /users/profile-picture
 * @desc Update user's profile picture
 */
router.patch("/profile-picture", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { profilePicture } = req.body;
    const userId = req.user!.userId;

    // Update user's profile picture
    const [updatedUser] = await db
      .update(users)
      .set({
        profilePicture,
        updatedAt: new Date(),
      })
      .where(eq(users.userId, userId))
      .returning();

    // Get user's workspaces to broadcast the update
    const userWorkspacesList = await db.query.userWorkspaces.findMany({
      where: eq(userWorkspaces.userId, userId),
    });

    // Broadcast profile picture update to all workspaces
    const wsManager = getWebSocketManager();
    userWorkspacesList.forEach((workspace) => {
      wsManager.broadcastToWorkspace(workspace.workspaceId, {
        type: "USER_PROFILE_UPDATED",
        workspaceId: workspace.workspaceId,
        data: {
          userId,
          profilePicture,
        },
      });
    });

    res.json(updatedUser);
  } catch (error) {
    console.error("Error updating profile picture:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to update profile picture",
      },
    });
  }
});

export { router as userRouter };