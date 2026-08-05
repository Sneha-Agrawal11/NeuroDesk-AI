import path from 'path';

// The app's own project root (wherever it's cloned/installed). No matter
// which folder names get added below, files that live inside NeuroDesk's
// own installation directory (its upload storage, ChromaDB data, node
// modules, fix scripts downloaded to Downloads, etc.) should never be
// treated as user content - if a permitted folder (e.g. "Projects" or
// "Downloads") happens to contain files related to this app itself, this
// stops it from indexing itself and polluting search results.
const APP_ROOT = path.resolve(__dirname, '..', '..', '..');

export const DEFAULT_EXCLUSIONS = [
  // Directories
  'node_modules',
  '.git',
  '.svn',
  '.hg',
  '.idea',
  '.vscode',
  '.next',
  '.nuxt',
  'dist',
  'build',
  'out',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
  'env',
  '.tox',
  'target', // Rust
  'bin', // C#/Java
  'obj', // C#
  'vendor', // PHP/Go
  'benchmark_data',
  'benchmark_data_large',
  'chromadb',
  'chroma_db',
  'My Music',
  'My Videos',
  'My Pictures',

  // Files
  '.DS_Store',
  'Thumbs.db',
  'desktop.ini',
  '*.lock',
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'Gemfile.lock',
  'poetry.lock',
  'Cargo.lock',
  '*.min.js',
  '*.min.css',
  '*.map',
  '*.pyc',
  '*.pyo',
  '*.exe',
  '*.dll',
  '*.so',
  '*.dylib',
  '*.bin',
  '*.iso',
  '*.dmg',
  '*.pkg',
  '*.tar',
  '*.gz',
  '*.zip',
  '*.rar',
  '*.7z',
  '*.sqlite',
  '*.db',
  // Dev/ops scripts - not user documents, common in Downloads while
  // debugging this very app
  '*.ps1',
  '*.psm1',
  '*.bat',
  '*.cmd',
  '*.sh',
];

export const isExcluded = (filePath: string): boolean => {
  // Never scan/index/watch anything inside the app's own installation
  // directory - it should never be treated as user content.
  try {
    const resolved = path.resolve(filePath);
    if (resolved === APP_ROOT || resolved.startsWith(APP_ROOT + path.sep)) {
      return true;
    }
  } catch {
    // fall through to name-based checks
  }

  // Basic check against excluded names or extensions
  for (const exclusion of DEFAULT_EXCLUSIONS) {
    if (exclusion.startsWith('*.')) {
      if (filePath.endsWith(exclusion.slice(1))) return true;
    } else {
      if (filePath.includes(`/${exclusion}/`) || filePath.includes(`\\${exclusion}\\`) || filePath.endsWith(`/${exclusion}`) || filePath.endsWith(`\\${exclusion}`)) {
        return true;
      }
    }
  }
  return false;
};
