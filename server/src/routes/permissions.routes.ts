import { Router } from 'express';
import { PermissionsController } from '../controllers/permissions.controller';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

router.get('/', PermissionsController.getPermissions);
router.put('/:id', PermissionsController.togglePermission);
router.post('/add', PermissionsController.addPermission);
router.delete('/:id', PermissionsController.removePermission);

export default router;
