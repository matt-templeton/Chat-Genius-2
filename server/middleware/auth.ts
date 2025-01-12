import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { db } from "@db";
import { users, type User } from "@db/schema";
import { eq } from "drizzle-orm";
import { compare } from "bcrypt";
import type { Request, Response, NextFunction } from 'express';

declare global {
  namespace Express {
    interface User extends User {}
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

      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }
));

// Serialize user for the session
passport.serializeUser((user: User, done) => {
  done(null, user.userId);
});

// Deserialize user from the session
passport.deserializeUser(async (id: number, done) => {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.userId, id)
    });
    done(null, user);
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