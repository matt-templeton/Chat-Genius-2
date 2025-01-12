import { Router } from 'express';
import { authRouter } from './auth';
import { userRouter } from './users';
import { workspaceRouter } from './workspaces';
import { channelRouter } from './channels';
import { messageRouter } from './messages';

// Export individual routers
export {
  authRouter,
  userRouter,
  workspaceRouter,
  channelRouter,
  messageRouter
};