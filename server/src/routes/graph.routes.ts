import { Router } from 'express';
import { GraphController } from '../controllers/graph.controller';
import { authenticate } from '../middleware/auth';

const router = Router();
router.use(authenticate);

router.get('/', GraphController.getWorkspaceGraph);

export default router;
