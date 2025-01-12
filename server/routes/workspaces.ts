import { Router } from 'express';
import { db } from "@db";
import { workspaces, userWorkspaces } from "@db/schema";
import { eq, and } from "drizzle-orm";
import type { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';

const router = Router();

/**
 * @route GET /workspaces
 * @desc List all workspaces
 */
router.get('/', isAuthenticated, async (_req: Request, res: Response) => {
  try {
    const workspacesList = await db.query.workspaces.findMany();
    res.json(workspacesList);
  } catch (error) {
    console.error('Error fetching workspaces:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch workspaces"
      }
    });
  }
});

/**
 * @route POST /workspaces
 * @desc Create a new workspace
 */
router.post('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { name, description } = req.body;

    const [workspace] = await db.insert(workspaces).values({
      name,
      description,
      archived: false,
      createdAt: new Date(),
      updatedAt: new Date()
    }).returning();

    // Add creator as workspace owner
    await db.insert(userWorkspaces).values({
      userId: req.user!.userId,
      workspaceId: workspace.workspaceId,
      role: 'OWNER',
      createdAt: new Date(),
      updatedAt: new Date()
    });

    res.status(201).json(workspace);
  } catch (error) {
    console.error('Error creating workspace:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to create workspace"
      }
    });
  }
});

/**
 * @route GET /workspaces/:workspaceId
 * @desc Get workspace details
 */
router.get('/:workspaceId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const workspace = await db.query.workspaces.findFirst({
      where: eq(workspaces.workspaceId, parseInt(workspaceId))
    });

    if (!workspace) {
      return res.status(404).json({
        error: "Workspace Not Found",
        details: {
          code: "WORKSPACE_NOT_FOUND",
          message: "The requested workspace does not exist"
        }
      });
    }

    res.json(workspace);
  } catch (error) {
    console.error('Error fetching workspace:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch workspace"
      }
    });
  }
});

/**
 * @route PUT /workspaces/:workspaceId
 * @desc Update a workspace
 */
router.put('/:workspaceId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { name, description } = req.body;

    const [workspace] = await db.update(workspaces)
      .set({
        name,
        description,
        updatedAt: new Date()
      })
      .where(eq(workspaces.workspaceId, parseInt(workspaceId)))
      .returning();

    if (!workspace) {
      return res.status(404).json({
        error: "Workspace Not Found",
        details: {
          code: "WORKSPACE_NOT_FOUND",
          message: "The requested workspace does not exist"
        }
      });
    }

    res.json(workspace);
  } catch (error) {
    console.error('Error updating workspace:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to update workspace"
      }
    });
  }
});

/**
 * @route DELETE /workspaces/:workspaceId
 * @desc Archive (soft-delete) a workspace
 */
router.delete('/:workspaceId', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;

    const [workspace] = await db.update(workspaces)
      .set({
        archived: true,
        updatedAt: new Date()
      })
      .where(eq(workspaces.workspaceId, parseInt(workspaceId)))
      .returning();

    if (!workspace) {
      return res.status(404).json({
        error: "Workspace Not Found",
        details: {
          code: "WORKSPACE_NOT_FOUND",
          message: "The requested workspace does not exist"
        }
      });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error archiving workspace:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to archive workspace"
      }
    });
  }
});

/**
 * @route POST /workspaces/:workspaceId/members
 * @desc Add a member to a workspace
 */
router.post('/:workspaceId/members', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
    const { userId, role = 'MEMBER' } = req.body;

    await db.insert(userWorkspaces).values({
      userId,
      workspaceId: parseInt(workspaceId),
      role,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    res.status(201).json({ message: "User added to workspace" });
  } catch (error) {
    console.error('Error adding workspace member:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to add member to workspace"
      }
    });
  }
});

/**
 * @route DELETE /workspaces/:workspaceId/members
 * @desc Remove a member from a workspace
 */
router.delete('/:workspaceId/members', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { workspaceId } = req.params;
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

    await db.delete(userWorkspaces)
      .where(and(
        eq(userWorkspaces.workspaceId, parseInt(workspaceId)),
        eq(userWorkspaces.userId, parseInt(userId as string))
      ));

    res.status(204).send();
  } catch (error) {
    console.error('Error removing workspace member:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to remove member from workspace"
      }
    });
  }
});

export { router as workspaceRouter };