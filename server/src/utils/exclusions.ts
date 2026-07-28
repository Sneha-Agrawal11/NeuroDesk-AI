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
];

export const isExcluded = (filePath: string): boolean => {
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
