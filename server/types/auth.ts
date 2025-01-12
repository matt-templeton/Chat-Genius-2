import { User } from "@db/schema";

declare global {
  namespace Express {
    interface User {
      userId: number;
      email: string;
    }
  }
}

export interface AuthenticatedRequest extends Express.Request {
  user: Express.User;
}
