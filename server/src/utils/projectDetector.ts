import fs from 'fs';
import path from 'path';

// Signatures that strongly indicate a directory is a project root
export const PROJECT_SIGNATURES: Record<string, { type: string, confidence: number }> = {
  'package.json': { type: 'web-project', confidence: 0.9 },
  'requirements.txt': { type: 'python-project', confidence: 0.8 },
  'setup.py': { type: 'python-project', confidence: 0.9 },
  'pyproject.toml': { type: 'python-project', confidence: 0.9 },
  'Cargo.toml': { type: 'rust-project', confidence: 0.9 },
  'pom.xml': { type: 'java-project', confidence: 0.9 },
  'build.gradle': { type: 'java-project', confidence: 0.9 },
  'go.mod': { type: 'go-project', confidence: 0.9 },
  'docker-compose.yml': { type: 'infrastructure', confidence: 0.8 },
  '.git': { type: 'repository', confidence: 1.0 },
};

export const detectProject = (dirPath: string): { isProject: boolean, type?: string, name?: string } => {
  try {
    const items = fs.readdirSync(dirPath);
    
    for (const [file, details] of Object.entries(PROJECT_SIGNATURES)) {
      if (items.includes(file)) {
        return {
          isProject: true,
          type: details.type,
          name: path.basename(dirPath)
        };
      }
    }
    
    // Fallback heuristic: Makefile + source files
    if (items.includes('Makefile') && (items.some(f => f.endsWith('.c') || f.endsWith('.cpp')))) {
      return { isProject: true, type: 'c-cpp-project', name: path.basename(dirPath) };
    }
    
  } catch (err) {
    // Ignore read errors (permissions, etc)
  }
  
  return { isProject: false };
};
