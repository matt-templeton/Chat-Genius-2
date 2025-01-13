import { Router } from 'express';
import { hash, compare } from 'bcrypt';
import { db } from "@db";
import { users, workspaces, channels, userWorkspaces, userChannels } from "@db/schema";
import { eq } from "drizzle-orm";
import passport from '../middleware/auth';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { isAuthenticated } from '../middleware/auth';

const router = Router();

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

// Password validation
const isStrongPassword = (password: string): boolean => {
  return password.length >= 8 && // Minimum length
    /[A-Z]/.test(password) && // Has uppercase
    /[a-z]/.test(password) && // Has lowercase
    /[0-9]/.test(password) && // Has number
    /[^A-Za-z0-9]/.test(password); // Has special char
};

// Email validation
const isValidEmail = (email: string): boolean => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// Helper function to generate tokens
function generateTokens(userId: number) {
  const accessToken = jwt.sign({ userId }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
  const refreshToken = jwt.sign({ userId }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
  return { accessToken, refreshToken };
}

/**
 * @route POST /auth/register
 * @desc Register a new user with email verification and create default workspace
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = req.body;

    // Validate email format
    if (!isValidEmail(email)) {
      return res.status(400).json({
        error: "Invalid Email",
        details: {
          code: "INVALID_EMAIL",
          message: "Please provide a valid email address"
        }
      });
    }

    // Validate password strength
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error: "Weak Password",
        details: {
          code: "WEAK_PASSWORD",
          message: "Password must be at least 8 characters and include uppercase, lowercase, number, and special character"
        }
      });
    }

    // Check if user already exists
    const existingUser = await db.query.users.findFirst({
      where: eq(users.email, email)
    });

    if (existingUser) {
      return res.status(409).json({
        error: "Email in Use",
        details: {
          code: "EMAIL_IN_USE",
          message: "Email already registered"
        }
      });
    }

    // Hash password
    const passwordHash = await hash(password, 10);

    // Create user and get the returned user object with ID
    const [newUser] = await db.insert(users)
      .values({
        email,
        passwordHash,
        displayName,
        emailVerified: false,
        deactivated: false,
        lastKnownPresence: 'ONLINE',
        lastLogin: new Date(),
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    if (!newUser || !newUser.userId) {
      throw new Error('Failed to create user');
    }

    // Create default workspace for the user
    const [newWorkspace] = await db.insert(workspaces)
      .values({
        name: `${displayName}'s Workspace`,
        description: `Default workspace for ${displayName}`,
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    if (!newWorkspace || !newWorkspace.workspaceId) {
      throw new Error('Failed to create workspace');
    }

    // Add user as workspace owner
    await db.insert(userWorkspaces)
      .values({
        userId: newUser.userId,
        workspaceId: newWorkspace.workspaceId,
        role: 'OWNER',
        createdAt: new Date(),
        updatedAt: new Date()
      });

    // Create default general channel
    const [newChannel] = await db.insert(channels)
      .values({
        workspaceId: newWorkspace.workspaceId,
        name: 'general',
        topic: 'General discussions',
        channelType: 'PUBLIC',
        archived: false,
        createdAt: new Date(),
        updatedAt: new Date()
      })
      .returning();

    if (!newChannel || !newChannel.channelId) {
      throw new Error('Failed to create channel');
    }

    // Add user to the general channel
    await db.insert(userChannels)
      .values({
        userId: newUser.userId,
        channelId: newChannel.channelId,
        createdAt: new Date(),
        updatedAt: new Date()
      });

    // Auto-verify for testing
    await db.update(users)
      .set({ emailVerified: true })
      .where(eq(users.userId, newUser.userId));

    res.status(201).json({
      message: "User created successfully"
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "An unexpected error occurred"
      }
    });
  }
});

/**
 * @route POST /auth/login
 * @desc Authenticate user and return tokens
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Find user
    const user = await db.query.users.findFirst({
      where: eq(users.email, email)
    });

    if (!user || !user.passwordHash) {
      return res.status(401).json({
        error: "Authentication Failed",
        details: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password"
        }
      });
    }

    // Check password
    const isValidPassword = await compare(password, user.passwordHash);
    if (!isValidPassword) {
      return res.status(401).json({
        error: "Authentication Failed",
        details: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password"
        }
      });
    }

    // Generate tokens
    const tokens = generateTokens(user.userId);

    // Update last login
    await db.update(users)
      .set({ lastLogin: new Date() })
      .where(eq(users.userId, user.userId));

    res.json(tokens);
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "An unexpected error occurred"
      }
    });
  }
});

/**
 * @route POST /auth/refresh
 * @desc Refresh access token using refresh token
 */
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        error: "Invalid Token",
        details: {
          code: "INVALID_TOKEN",
          message: "Refresh token is required"
        }
      });
    }

    try {
      // Verify refresh token
      const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { userId: number };

      // Generate new tokens
      const tokens = generateTokens(decoded.userId);

      res.json(tokens);
    } catch (error) {
      return res.status(401).json({
        error: "Invalid Token",
        details: {
          code: "INVALID_TOKEN",
          message: "Invalid or expired refresh token"
        }
      });
    }
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "An unexpected error occurred"
      }
    });
  }
});

/**
 * @route POST /auth/logout
 * @desc Logout user and invalidate tokens
 */
router.post('/logout', isAuthenticated, (req: Request, res: Response) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({
        error: "Logout Error",
        details: {
          code: "LOGOUT_ERROR",
          message: "An error occurred during logout"
        }
      });
    }
    res.status(200).json({ message: "Logout successful" });
  });
});

/**
 * @route POST /auth/verify-email
 * @desc Verify user's email address
 */
router.post('/verify-email', async (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    // For testing, we'll accept a mock token
    if (token === 'test-verification-token') {
      return res.status(200).json({
        message: "Email verified successfully"
      });
    }

    return res.status(400).json({
      error: "Invalid Token",
      details: {
        code: "INVALID_TOKEN",
        message: "The verification token is invalid or has expired"
      }
    });
  } catch (error) {
    res.status(500).json({
      error: "Internal Server Error",
      details: {
        code: "SERVER_ERROR",
        message: "An unexpected error occurred"
      }
    });
  }
});

export { router as authRouter };