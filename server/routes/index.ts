import { Router } from 'express';
import { authRouter } from './auth';

// Export individual routers
export { authRouter };

// We'll add more route exports here as we create them:
// export { userRouter } from './users';
// export { workspaceRouter } from './workspaces';
// export { channelRouter } from './channels';
// export { messageRouter } from './messages';