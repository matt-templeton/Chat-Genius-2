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
import { OpenAIEmbeddings } from "@langchain/openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { runPythonScript } from "../utils/pythonRunner";

// Types for semantic chunks
interface SemanticChunk {
  text: string;
  metadata: {
    page?: number;
    title?: string;
    [key: string]: any;
  };
}

interface SemanticSplitResult {
  success: boolean;
  chunks: SemanticChunk[];
  error?: string;
}

// Type for Pinecone metadata
interface PdfMetadata {
  [key: string]: string | number;
  userId: string;
  type: string;
  title: string;
  channelId: string;
  pageNumber: number;
  text: string;
}

const router = Router();

// Initialize OpenAI embeddings
const embeddings = new OpenAIEmbeddings({
  modelName: "text-embedding-3-large",
  dimensions: 3072,
});

// Initialize Pinecone client
const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY!,
});

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
 * Helper function to truncate text while preserving words
 */
function truncateText(text: string, maxLength: number = 1000): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength);
  // Find the last complete word
  const lastSpace = truncated.lastIndexOf(' ');
  return truncated.slice(0, lastSpace) + '...';
}

/**
 * Process PDF file and upsert to Pinecone
 */
async function processPdfForPinecone(
  filePath: string,
  userId: number,
  channelId: number,
  workspaceId: number,
  fileRecord: typeof files.$inferSelect
) {
  try {
    if (!fileRecord.fileUrl) {
      throw new Error('File URL is missing');
    }
    
    // Get just the filename from the fileUrl for the Python script
    const filename = path.basename(fileRecord.fileUrl);
    
    // Use Python script to get semantic chunks
    const result = await runPythonScript('semantic_split.py', [filename]) as SemanticSplitResult;
    if (!result.success || result.chunks.length === 0) {
      throw new Error(result.error || 'Failed to split PDF');
    }

    // Use the original filename (without .pdf extension) as the title
    const title = path.basename(fileRecord.filename, '.pdf');
    
    // Generate embeddings for all chunks
    const texts = result.chunks.map(chunk => chunk.text);
    const embeddingVectors = await embeddings.embedDocuments(texts);

    // Get Pinecone index
    const index = pinecone.index('slackers');

    // Prepare vectors with metadata
    const vectors = embeddingVectors.map((vector, i) => {
      // Build metadata object with proper typing
      const metadata: PdfMetadata = {
        userId: userId.toString(),
        type: 'pdf',
        title,
        channelId: channelId.toString(),
        pageNumber: result.chunks[i].metadata?.page || 0,
        text: truncateText(texts[i]), // Truncate text to prevent metadata size issues
      };

      return {
        id: `${title}_chunk${i}`,
        values: vector,
        metadata
      };
    });

    // Upsert vectors to workspace namespace in smaller batches
    const BATCH_SIZE = 100;
    for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
      const batch = vectors.slice(i, i + BATCH_SIZE);
      await index.namespace(workspaceId.toString()).upsert(batch);
      // Add a small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return true;
  } catch (error) {
    console.error('Error processing PDF for Pinecone:', error);
    return false;
  }
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

      // If the file is a PDF, process it for Pinecone
      if (file.mimetype === 'application/pdf') {
        // Get the channelId from the message if it exists
        let channelId: number | undefined;
        if (messageId) {
          const message = await db.query.messages.findFirst({
            where: eq(messages.messageId, parseInt(messageId))
          });
          if (message?.channelId != null) {
            channelId = message.channelId;
          }
        }

        if (channelId) {
          // Process PDF in the background
          processPdfForPinecone(
            file.path,
            req.user!.userId,
            channelId,
            parseInt(workspaceId),
            fileRecord
          ).catch(error => {
            console.error('Error processing PDF:', error);
          });
        }
      }

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

/**
 * @route GET /files/message/:messageId
 * @desc Get all files associated with a message
 */
router.get("/message/:messageId", isAuthenticated, async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;

    // Get all files for the message
    const messageFiles = await db.query.files.findMany({
      where: eq(files.messageId, parseInt(messageId)),
    });

    if (!messageFiles || messageFiles.length === 0) {
      return res.status(404).json({
        error: "Files Not Found",
        details: {
          code: "FILES_NOT_FOUND",
          message: "No files found for this message"
        }
      });
    }

    // Verify workspace access for the first file (they should all be in the same workspace)
    if (messageFiles[0].workspaceId && !(await verifyWorkspaceAccess(req, res, messageFiles[0].workspaceId))) {
      return;
    }

    res.json(messageFiles);
  } catch (error) {
    console.error("Error fetching message files:", error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "Failed to fetch message files"
      }
    });
  }
});

export { router as fileRouter };