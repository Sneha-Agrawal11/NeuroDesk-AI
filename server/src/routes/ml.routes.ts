import { Router } from 'express';
import { MLController } from '../controllers/ml.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/workspace', MLController.getWorkspaceAnalytics);
router.get('/project/:projectId/health', MLController.getProjectAnalytics);

export default router;
