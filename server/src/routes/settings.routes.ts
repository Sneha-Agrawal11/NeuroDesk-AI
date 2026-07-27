import { Router } from 'express';
import { SettingsController } from '../controllers/settings.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', SettingsController.getAllSettings);
router.put('/', SettingsController.updateSettings);

export default router;
