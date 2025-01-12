import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { db } from "@db";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";
import { compare } from "bcrypt";
import type { Request, Response, NextFunction } from 'express';

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

// Middleware to check if user is authenticated
export const isAuthenticated = (req: Request, res: Response, next: NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({
    error: "Unauthorized",
    details: {
      code: "UNAUTHORIZED",
      message: "Authentication required"
    }
  });
};

export default passport;