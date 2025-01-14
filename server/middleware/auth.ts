import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { db } from "@db";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";
import { compare } from "bcrypt";
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// JWT Configuration from auth.ts
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Extend the Express.User interface without recursion
declare global {
  namespace Express {
    interface User {
      userId: number;
      email: string;
      displayName: string;
      emailVerified: boolean;
      deactivated: boolean;
      lastKnownPresence: "ONLINE" | "AWAY" | "DND" | "OFFLINE";
    }
  }
}

// Configure passport local strategy
passport.use(new LocalStrategy(
  {
    usernameField: 'email',
    passwordField: 'password'
  },
  async (email: string, password: string, done) => {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.email, email)
      });

      if (!user) {
        return done(null, false, { message: 'INVALID_CREDENTIALS' });
      }

      if (!user.emailVerified) {
        return done(null, false, { message: 'EMAIL_NOT_VERIFIED' });
      }

      if (user.deactivated) {
        return done(null, false, { message: 'USER_DEACTIVATED' });
      }

      const isValidPassword = await compare(password, user.passwordHash || '');
      if (!isValidPassword) {
        return done(null, false, { message: 'INVALID_CREDENTIALS' });
      }

      // Only pass necessary user info to session
      const sessionUser: Express.User = {
        userId: user.userId,
        email: user.email,
        displayName: user.displayName,
        emailVerified: user.emailVerified || false,
        deactivated: user.deactivated || false,
        lastKnownPresence: user.lastKnownPresence || 'OFFLINE'
      };

      return done(null, sessionUser);
    } catch (error) {
      return done(error);
    }
  }
));

// Serialize user for the session
passport.serializeUser((user: Express.User, done) => {
  done(null, user.userId);
});

// Deserialize user from the session
passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.userId, id)
    });

    if (!user) {
      return done(null, false);
    }

    // Convert to session user
    const sessionUser: Express.User = {
      userId: user.userId,
      email: user.email,
      displayName: user.displayName,
      emailVerified: user.emailVerified || false,
      deactivated: user.deactivated || false,
      lastKnownPresence: user.lastKnownPresence || 'OFFLINE'
    };

    done(null, sessionUser);
  } catch (error) {
    done(error);
  }
});

// Helper function to extract token from Authorization header
function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7); // Remove 'Bearer ' prefix
  }
  return null;
}

// Helper function to validate JWT token and attach user
async function validateJwtToken(req: Request): Promise<boolean> {
  const token = extractToken(req);
  if (!token) return false;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };
    const user = await db.query.users.findFirst({
      where: eq(users.userId, decoded.userId)
    });

    if (!user) return false;

    // Attach user to request
    req.user = {
      userId: user.userId,
      email: user.email,
      displayName: user.displayName,
      emailVerified: user.emailVerified || false,
      deactivated: user.deactivated || false,
      lastKnownPresence: user.lastKnownPresence || 'OFFLINE'
    };

    return true;
  } catch (error) {
    return false;
  }
}

// Middleware to check if user is authenticated via session or JWT
export const isAuthenticated = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number };

    const user = await db.query.users.findFirst({
      where: eq(users.userId, decoded.userId),
    });

    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: 'Token expired' });
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export default passport;