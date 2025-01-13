import { Router } from 'express';
import { db } from '@db';
import { channels } from '@db/schema';
import { eq } from 'drizzle-orm';

const router = Router();

// Get channels in a workspace
router.get('/workspaces/:workspaceId/channels', async (req, res) => {
  const workspaceId = parseInt(req.params.workspaceId);
  const includeArchived = req.query.includeArchived === 'true';

  try {
    const channelList = await db.query.channels.findMany({
      where: includeArchived ? 
        eq(channels.workspaceId, workspaceId) :
        eq(channels.workspaceId, workspaceId) && eq(channels.archived, false)
    });
    res.json(channelList);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching channels' });
  }
});

// Create a new channel in a workspace
router.post('/workspaces/:workspaceId/channels', async (req, res) => {
  const workspaceId = parseInt(req.params.workspaceId);
  const { name, type = 'PUBLIC', description = '' } = req.body;

  try {
    const newChannel = await db.insert(channels).values({
      name,
      type,
      description,
      workspaceId,
      archived: false,
    }).returning();

    // Broadcast channel creation to all workspace clients
    req.app.locals.broadcastToWorkspace(workspaceId, {
      type: 'CHANNEL_CREATED',
      payload: newChannel[0]
    });

    res.status(201).json(newChannel[0]);
  } catch (error) {
    res.status(500).json({ message: 'Error creating channel' });
  }
});

export default router;
