import { Router } from 'express';
import { WorkspaceController } from '../controllers/workspace.controller';
import { authenticate } from '../middleware/auth';
import { workspaceUpload } from '../middleware/upload';

const router = Router();

router.use(authenticate);

router.post('/create', WorkspaceController.createWorkspace);
router.get('/status', WorkspaceController.getStatus);
router.get('/projects', WorkspaceController.listProjects);
router.get('/documents', WorkspaceController.listDocuments);
router.get('/document/:id/analysis', WorkspaceController.getDocumentAnalysis);
router.get('/project/:id/analysis', WorkspaceController.getProjectAnalysis);
router.post('/upload', workspaceUpload.array('files', 200), WorkspaceController.uploadFiles);
router.post('/scan', WorkspaceController.triggerScan);

export default router;
