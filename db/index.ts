import { drizzle } from "drizzle-orm/neon-serverless";
import { NeonClient } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "@db/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const db = drizzle({
  connection: new NeonClient(process.env.DATABASE_URL, { ws }), // Corrected line
  schema,
});
