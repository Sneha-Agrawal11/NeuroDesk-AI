import { Router } from 'express';
import authRoutes from './auth.routes';
import workspaceRoutes from './workspace.routes';
import settingsRoutes from './settings.routes';
import permissionsRoutes from './permissions.routes';
import searchRoutes from './search.routes';
import aiRoutes from './ai.routes';
import graphRoutes from './graph.routes';
import mlRoutes from './ml.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/workspace', workspaceRoutes);
router.use('/settings', settingsRoutes);
router.use('/permissions', permissionsRoutes);
router.use('/search', searchRoutes);
router.use('/ai', aiRoutes);
router.use('/graph', graphRoutes);
router.use('/ml', mlRoutes);

// Other routes will be mounted here as they are built
// router.use('/workspace', workspaceRoutes);
// router.use('/permissions', permissionsRoutes);
// router.use('/settings', settingsRoutes);
// router.use('/files', filesRoutes);
// router.use('/projects', projectsRoutes);
// router.use('/search', searchRoutes);
// router.use('/ai', aiRoutes);

export default router;
