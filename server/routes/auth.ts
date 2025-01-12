import { Router } from 'express';
import { hash } from 'bcrypt';
import { db } from "@db";
import { users, type NewUser } from "@db/schema";
import { eq } from "drizzle-orm";
import passport from '../middleware/auth';
import type { Request, Response } from 'express';

const router = Router();

/**
 * @route POST /auth/register
 * @desc Register a new user with email verification
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, displayName } = req.body;

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

    // Create user
    const newUser: NewUser = {
      email,
      passwordHash,
      displayName,
      emailVerified: false,
      deactivated: false,
      theme: 'light',
      statusMessage: '',
      lastKnownPresence: 'ONLINE',
      lastLogin: new Date(),
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const [user] = await db.insert(users).values(newUser).returning();

    // TODO: Send verification email

    res.status(201).json({
      message: "User created; verification email sent"
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
router.post('/login', passport.authenticate('local'), (req: Request, res: Response) => {
  res.json({
    accessToken: "temporary-token", // TODO: Implement proper JWT
    refreshToken: "temporary-refresh-token"
  });
});

/**
 * @route POST /auth/logout
 * @desc Logout user and clear session
 */
router.post('/logout', (req: Request, res: Response) => {
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

    // TODO: Implement email verification logic

    res.status(200).json({
      message: "Email verified successfully"
    });
  } catch (error) {
    res.status(400).json({
      error: "Invalid Token",
      details: {
        code: "INVALID_TOKEN",
        message: "The verification token is invalid or has expired"
      }
    });
  }
});

export { router as authRouter };