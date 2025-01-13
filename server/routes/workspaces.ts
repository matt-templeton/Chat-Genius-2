import { Router } from 'express';
import { db } from "@db";
import { workspaces, userWorkspaces, channels } from "@db/schema";
import { eq, and } from "drizzle-orm";
import type { Request, Response } from 'express';
import { isAuthenticated } from '../middleware/auth';
import { z } from 'zod';

// Input validation schemas
const createWorkspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required"),
  description: z.string().optional(),
});

const updateWorkspaceSchema = z.object({
  name: z.string().min(1, "Workspace name is required"),
  description: z.string().optional(),
});

export async function createNewWorkspace(userId: number, name: string, description?: string) {
  // Create workspace
  const [workspace] = await db.insert(workspaces).values({
    name,
    description,
    archived: false,
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();

  // Add creator as workspace owner
  await db.insert(userWorkspaces).values({
    userId,
    workspaceId: workspace.workspaceId,
    role: 'OWNER',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  // Create default general channel
  await db.insert(channels).values({
    workspaceId: workspace.workspaceId,
    name: 'general',
    topic: 'Default channel for general discussions',
    channelType: 'PUBLIC',
    archived: false,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  return workspace;
}

const router = Router();

/**
 * @route GET /workspaces
 * @desc List all workspaces that authenticated user is a member of
 */
router.get('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    const workspacesList = await db
      .select({
        workspaceId: workspaces.workspaceId,
        name: workspaces.name,
        description: workspaces.description,
        archived: workspaces.archived,
        createdAt: workspaces.createdAt,
        updatedAt: workspaces.updatedAt
      })
      .from(workspaces)
      .innerJoin(
        userWorkspaces,
        and(
          eq(userWorkspaces.workspaceId, workspaces.workspaceId),
          eq(userWorkspaces.userId, req.user!.userId)
        )
      );

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
 * @desc Create a new workspace with a default general channel
 */
router.post('/', isAuthenticated, async (req: Request, res: Response) => {
  try {
    // Validate input
    const validationResult = createWorkspaceSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Bad Request",
        details: {
          code: "VALIDATION_ERROR",
          message: "Invalid workspace data",
          errors: validationResult.error.errors
        }
      });
    }

    const { name, description } = validationResult.data;
    const workspace = await createNewWorkspace(req.user!.userId, name, description);
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

    // Validate input
    const validationResult = updateWorkspaceSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({
        error: "Bad Request",
        details: {
          code: "VALIDATION_ERROR",
          message: "Invalid workspace data",
          errors: validationResult.error.errors
        }
      });
    }

    const { name, description } = validationResult.data;

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

export { router as workspaceRouter };