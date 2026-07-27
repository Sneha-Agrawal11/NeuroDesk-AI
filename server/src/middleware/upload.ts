import fs from 'fs';
import path from 'path';
import multer from 'multer';

const uploadsRoot = path.resolve(__dirname, '../../data/uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = (req as any).user?.userId || 'anonymous';
    const targetDir = path.join(uploadsRoot, userId);
    fs.mkdirSync(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]+/g, '_');
    cb(null, `${Date.now()}_${safeName}`);
  }
});

export const workspaceUpload = multer({
  storage,
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 200,
  }
});