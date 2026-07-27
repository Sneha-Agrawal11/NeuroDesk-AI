// Shared TypeScript interfaces between Frontend and Backend

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
}

export interface WorkspaceStatus {
  id: string;
  status: 'created' | 'scanning' | 'ready' | 'error';
  totalFiles: number;
  totalProjects: number;
  storageBytes: number;
  lastScanAt: string | null;
}

export interface Permission {
  id: string;
  path: string;
  label: string;
  enabled: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface FileRecord {
  id: string;
  path: string;
  filename: string;
  extension: string | null;
  category: string;
  sizeBytes: number;
  fileModifiedAt: string;
  status: string;
  projectId: string | null;
}

export interface ProjectRecord {
  id: string;
  name: string;
  path: string;
  description: string | null;
  projectType: string | null;
  healthScore: number | null;
  totalFiles: number;
}
