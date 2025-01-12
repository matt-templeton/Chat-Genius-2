import type { Express } from "express";
import { createServer, type Server } from "http";
import session from "express-session";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import MemoryStore from "memorystore";
import { db } from "@db";
import { users } from "@db/schema";
import { eq } from "drizzle-orm";
import { hash, compare } from "bcrypt";

const MemoryStoreSession = MemoryStore(session);

// Configure passport local strategy
passport.use(new LocalStrategy(
  {
    usernameField: 'email',
    passwordField: 'password'
  },
  async (email, password, done) => {
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

      const isValidPassword = await compare(password, user.passwordHash);
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
passport.serializeUser((user: any, done) => {
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

export function registerRoutes(app: Express): Server {
  // Session middleware
  app.use(session({
    store: new MemoryStoreSession({
      checkPeriod: 86400000 // prune expired entries every 24h
    }),
    secret: process.env.SESSION_SECRET || 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));

  // Initialize passport middleware
  app.use(passport.initialize());
  app.use(passport.session());

  // Authentication Routes
  app.post('/v1/auth/register', async (req, res) => {
    try {
      const { email, password, displayName } = req.body;

      // Check if user already exists
      const existingUser = await db.query.users.findFirst({
        where: eq(users.email, email)
      });

      if (existingUser) {
        return res.status(409).json({
          message: "Email already in use"
        });
      }

      // Hash password
      const passwordHash = await hash(password, 10);

      // Create user
      const [user] = await db.insert(users).values({
        email,
        passwordHash,
        displayName,
        emailVerified: false,
        deactivated: false
      }).returning();

      // TODO: Send verification email

      res.status(201).json({
        message: "User created; verification email sent"
      });
    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({
        message: "Internal Server Error"
      });
    }
  });

  app.post('/v1/auth/login', passport.authenticate('local'), (req, res) => {
    res.json({
      accessToken: "temporary-token", // TODO: Implement proper JWT
      refreshToken: "temporary-refresh-token"
    });
  });

  app.post('/v1/auth/logout', (req, res) => {
    req.logout(() => {
      res.status(200).json({ message: "Logout successful" });
    });
  });

  // Create HTTP server
  const httpServer = createServer(app);

  return httpServer;
}