import { Router } from "express";
import { db } from "@db";
import { files, messages, workspaces } from "@db/schema";
import { eq, and } from "drizzle-orm";
import type { Request, Response } from "express";
import { isAuthenticated } from "../middleware/auth";
import multer from "multer";
import crypto from "crypto";
import path from "path";
import { promises as fs } from "fs";

const router = Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: "./uploads/",
  filename: (req, file, cb) => {
    // Generate unique filename with original extension
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${uniqueSuffix}${path.extname(file.originalname)}`);
  },
});

// File filter to validate file types
const fileFilter = (req: any, file: any, cb: any) => {
  // List of allowed MIME types
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/zip',
  ];

  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter,
});

// Custom error handler for multer
const handleFileUpload = (req: Request, res: Response, next: Function) => {
  upload.single("file")(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          error: "File Too Large",
          details: {
            code: "FILE_TOO_LARGE",
            message: "File size exceeds the 50MB limit",
          },
        });
      }
      return res.status(400).json({
        error: "File Upload Error",
        details: {
          code: "FILE_UPLOAD_ERROR",
          message: err.message,
        },
      });
    }
    if (err) {
      // Handle file type validation error
      if (err.message === 'Invalid file type') {
        return res.status(400).json({
          error: "Invalid File Type",
          details: {
            code: "INVALID_FILE_TYPE",
            message: "The uploaded file type is not supported",
          },
        });
      }
      return res.status(500).json({
        error: "Internal Server Error",
        details: {
          code: "SERVER_ERROR",
          message: "Failed to upload file",
        },
      });
    }
    next();
  });
};

/**
 * Verify workspace access
 */
async function verifyWorkspaceAccess(
  req: Request,
  res: Response,
  workspaceId: number,
) {
  const workspace = await db.query.workspaces.findFirst({
    where: eq(workspaces.workspaceId, workspaceId),
  });

  if (!workspace) {
    res.status(404).json({
      error: "Workspace Not Found",
      details: {
        code: "WORKSPACE_NOT_FOUND",
        message: "Workspace not found",
      },
    });
    return false;
  }

  // TODO: Add workspace member verification once workspace members table is set up
  return true;
}

/**
 * @route POST /files
 * @desc Upload a file, optionally attaching it to a message
 */
router.post(
  "/",
  isAuthenticated,
  handleFileUpload,
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      const { messageId, workspaceId } = req.body;

      if (!file) {
        return res.status(400).json({
          error: "Bad Request",
          details: {
            code: "FILE_REQUIRED",
            message: "No file was uploaded",
          },
        });
      }

      // Verify workspace access
      if (!(await verifyWorkspaceAccess(req, res, parseInt(workspaceId)))) {
        return;
      }

      // Generate file hash for deduplication
      const fileBuffer = await fs.readFile(file.path);
      const fileHash = crypto
        .createHash("sha256")
        .update(fileBuffer)
        .digest("hex");

      // Check if this exact file already exists
      const existingFile = await db.query.files.findFirst({
        where: and(
          eq(files.fileHash, fileHash),
          eq(files.workspaceId, parseInt(workspaceId)),
        ),
      });

      if (existingFile) {
        // Remove the duplicate file
        await fs.unlink(file.path);
        return res.status(200).json(existingFile);
      }

      // Create file record
      const [fileRecord] = await db
        .insert(files)
        .values({
          userId: req.user!.userId,
          messageId: messageId ? parseInt(messageId) : undefined,
          workspaceId: parseInt(workspaceId),
          filename: file.originalname,
          fileType: file.mimetype,
          fileUrl: `/uploads/${file.filename}`,
          fileSize: file.size,
          fileHash,
          uploadTime: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      res.status(201).json(fileRecord);
    } catch (error) {
      console.error("Error uploading file:", error);
      res.status(500).json({
        error: "Internal Server Error",
        details: {
          code: "SERVER_ERROR",
          message: "Failed to upload file",
        },
      });
    }
  },
);

/**
 * @route GET /files/:fileId
 * @desc Get file details
 */
router.get("/:fileId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;

    const file = await db.query.files.findFirst({
      where: eq(files.fileId, parseInt(fileId)),
    });

    if (!file) {
      return res.status(404).json({
        error: "File Not Found",
        details: {
          code: "FILE_NOT_FOUND",
          message: "File not found",
        },
      });
    }

    if (!file.workspaceId) {
      return res.status(404).json({
        error: "Invalid File",
        details: {
          code: "INVALID_FILE",
          message: "File is not associated with any workspace",
        },
      });
    }

    // Verify workspace access
    if (!(await verifyWorkspaceAccess(req, res, file.workspaceId))) {
      return;
    }

    res.json(file);
  } catch (error) {
    console.error("Error fetching file:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch file",
      },
    });
  }
});

/**
 * @route DELETE /files/:fileId
 * @desc Delete a file
 */
router.delete("/:fileId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { fileId } = req.params;

    const file = await db.query.files.findFirst({
      where: eq(files.fileId, parseInt(fileId)),
    });

    if (!file) {
      return res.status(404).json({
        error: "File Not Found",
        details: {
          code: "FILE_NOT_FOUND",
          message: "File not found",
        },
      });
    }

    if (!file.workspaceId) {
      return res.status(404).json({
        error: "Invalid File",
        details: {
          code: "INVALID_FILE",
          message: "File is not associated with any workspace",
        },
      });
    }

    // Verify workspace access
    if (!(await verifyWorkspaceAccess(req, res, file.workspaceId))) {
      return;
    }

    // Delete the file record first
    await db.delete(files).where(eq(files.fileId, parseInt(fileId)));

    // If there's a physical file, delete it
    if (file.fileUrl) {
      try {
        const filePath = path.join(process.cwd(), file.fileUrl);
        await fs.unlink(filePath);
      } catch (error) {
        console.error("Error deleting physical file:", error);
        // Continue even if physical file deletion fails
        // The file record has been removed from the database
      }
    }

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting file:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to delete file",
      },
    });
  }
});

export { router as fileRouter };