import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

const rootDir = path.resolve(__dirname, '..', '..');
const serverBase = process.env.SERVER_BASE_URL || 'http://localhost:3001/api';
const aiBase = process.env.AI_BASE_URL || 'http://127.0.0.1:8000/internal';
const pythonExe = path.join(rootDir, 'ai-service', '.venv', 'Scripts', 'python.exe');
const prisma = new PrismaClient();

const sampleFiles = [
  path.join(rootDir, 'README.md'),
  path.join(rootDir, 'components', 'screens', 'MainWorkspace.tsx'),
  path.join(rootDir, 'components', 'screens', 'WorkspacePermission.tsx'),
];

type MetricReport = {
  embeddingDimension: number;
  totalIndexedDocuments: number;
  totalIndexedChunks: number;
  semanticSearchLatencyMs: number;
  retrievalPrecision: number;
  retrievalRecall: number;
  classificationAccuracy: number;
  duplicateDetectionAccuracy: number;
  averageResponseTimeMs: number;
  uploadCount: number;
  parsedFiles: number;
  graphRelationships: number;
  chatSamples: number;
};

async function requestJson(url: string, init: RequestInit = {}) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

async function uploadSampleFiles(token: string) {
  const form = new FormData();
  for (const filePath of sampleFiles) {
    const content = fs.readFileSync(filePath);
    form.append('files', new Blob([content]), path.basename(filePath));
  }

  const response = await fetch(`${serverBase}/workspace/upload`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: form,
  });

  const payload = await response.json();
  if (!response.ok || !payload.success) {
    throw new Error(`Upload failed: ${JSON.stringify(payload)}`);
  }

  return payload.data;
}

async function bootstrapSession() {
  const payload = await requestJson(`${serverBase}/auth/dev-session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  return payload.data as { token: string };
}

async function parseSample(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const response = await requestJson(`${aiBase}/parse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_path: filePath, file_type: path.extname(filePath).slice(1), content }),
  });

  return response;
}

async function embedChunks(fileId: string, chunks: string[], category = 'document') {
  const response = await requestJson(`${aiBase}/embed/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_id: fileId,
      chunks: chunks.map((content, index) => ({
        chunk_index: index,
        content,
        category,
        project_id: '',
      })),
    }),
  });

  return response;
}

async function semanticSearch(query: string) {
  const response = await requestJson(`${aiBase}/embed/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, limit: 5, filters: null }),
  });

  return response.results as Array<{ id: string; content: string; metadata: Record<string, any>; distance: number }>;
}

async function chat(token: string, query: string) {
  const response = await fetch(`${serverBase}/ai/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      history: [],
      retrieved_chunks: [],
      workspace_context: {},
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Chat failed with ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let output = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6);
      if (data === '[DONE]' || data.startsWith('[ERROR]')) continue;
      output += data;
    }
  }

  return output.trim();
}

async function graphExtract(fileName: string, content: string, workspaceFiles: Array<{ id: string; name: string }>) {
  return requestJson(`${aiBase}/graph/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_name: fileName, content, workspace_files: workspaceFiles }),
  });
}

async function classifyDocument(fileName: string, content: string) {
  return requestJson(`${aiBase}/ml/classify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_name: fileName, content }),
  });
}

async function duplicateHash(content: string) {
  return requestJson(`${aiBase}/ml/duplicate/hash`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

function getEmbeddingDimension(): number {
  const code = [
    'from embedding.service import get_embedding_service',
    'service = get_embedding_service()',
    'print(service.model.get_sentence_embedding_dimension())',
  ].join('; ');

  const result = spawnSync(pythonExe, ['-c', code], {
    cwd: path.join(rootDir, 'ai-service'),
    encoding: 'utf-8',
  });

  if (result.status !== 0) {
    throw new Error(`Failed to read embedding dimension: ${result.stderr || result.stdout}`);
  }

  return Number(result.stdout.trim());
}

async function main() {
  const session = await bootstrapSession();
  const token = session.token;

  const upload = await uploadSampleFiles(token);

  const parseResults: Array<{ file: string; chunks: string[]; text: string }> = [];
  for (const filePath of sampleFiles) {
    const parsed = await parseSample(filePath);
    parseResults.push({ file: filePath, chunks: parsed.chunks || [], text: parsed.text || '' });
  }

  const metricCorpus = [
    {
      fileId: 'metrics-readme',
      fileName: 'README.md',
      content: parseResults[0].text,
      chunks: parseResults[0].chunks.length ? parseResults[0].chunks : [parseResults[0].text.slice(0, 2000)],
    },
    {
      fileId: 'metrics-workspace',
      fileName: 'MainWorkspace.tsx',
      content: parseResults[1].text,
      chunks: parseResults[1].chunks.length ? parseResults[1].chunks : [parseResults[1].text.slice(0, 2000)],
    },
  ];

  for (const doc of metricCorpus) {
    await embedChunks(doc.fileId, doc.chunks, 'document');
  }

  const searchStart = performance.now();
  const semanticResults = await semanticSearch('NeuroDesk workspace AI');
  const semanticSearchLatencyMs = Number((performance.now() - searchStart).toFixed(2));

  const relevantIds = new Set(['metrics-readme', 'metrics-workspace']);
  const topResults = semanticResults.slice(0, 2).map(result => result.metadata?.file_id).filter(Boolean);
  const truePositives = topResults.filter(fileId => relevantIds.has(fileId)).length;
  const retrievalPrecision = topResults.length ? truePositives / topResults.length : 0;
  const retrievalRecall = relevantIds.size ? truePositives / relevantIds.size : 0;

  const classificationSamples = [
    { fileName: 'resume.pdf', content: 'Senior software engineer with 8 years of experience in TypeScript, React, and distributed systems.', expected: 'resume' },
    { fileName: 'paper.pdf', content: 'Abstract: A novel method for workspace retrieval. Conclusion: the technique improves search quality.', expected: 'research_paper' },
  ];

  let classificationCorrect = 0;
  for (const sample of classificationSamples) {
    const result = await classifyDocument(sample.fileName, sample.content) as any;
    if (result.classification?.category === sample.expected) {
      classificationCorrect += 1;
    }
  }
  const classificationAccuracy = classificationSamples.length ? classificationCorrect / classificationSamples.length : 0;

  const duplicateSame = await duplicateHash('The quick brown fox jumps over the lazy dog.');
  const duplicateSame2 = await duplicateHash('The quick brown fox jumps over the lazy dog.');
  const duplicateDiff = await duplicateHash('The quick brown fox jumps over the lazy cat.');
  const duplicateDetectionAccuracy = (duplicateSame.near_duplicate_hash === duplicateSame2.near_duplicate_hash && duplicateSame.near_duplicate_hash !== duplicateDiff.near_duplicate_hash) ? 1 : 0;

  const chatQueries = [
    'Summarize the imported files',
    'What technologies does this workspace use?',
    'What can you infer about the project structure?',
  ];
  const chatTimings: number[] = [];
  let lastChatResponse = '';
  for (const query of chatQueries) {
    const start = performance.now();
    lastChatResponse = await chat(token, query);
    chatTimings.push(performance.now() - start);
  }
  const averageResponseTimeMs = chatTimings.length ? Number((chatTimings.reduce((sum, value) => sum + value, 0) / chatTimings.length).toFixed(2)) : 0;

  const graph = await graphExtract('README.md', parseResults[0].text, [
    { id: 'metrics-readme', name: 'README.md' },
    { id: 'metrics-workspace', name: 'MainWorkspace.tsx' },
  ]);

  const metrics: MetricReport = {
    embeddingDimension: getEmbeddingDimension(),
    totalIndexedDocuments: await prisma.fileRecord.count(),
    totalIndexedChunks: await prisma.chunk.count(),
    semanticSearchLatencyMs,
    retrievalPrecision: Number(retrievalPrecision.toFixed(2)),
    retrievalRecall: Number(retrievalRecall.toFixed(2)),
    classificationAccuracy: Number(classificationAccuracy.toFixed(2)),
    duplicateDetectionAccuracy: Number(duplicateDetectionAccuracy.toFixed(2)),
    averageResponseTimeMs,
    uploadCount: upload.uploaded?.length || 0,
    parsedFiles: parseResults.length,
    graphRelationships: graph.relationships?.length || 0,
    chatSamples: chatQueries.length,
  };

  const report = `# NeuroDesk AI Project Report\n\n## Summary\nNeuroDesk AI now runs as a three-service local knowledge assistant with a Next.js frontend, a Node/Express orchestration backend, and a FastAPI AI service. The workflow now covers import, parsing, chunking, embedding, semantic search, AI chat, knowledge graph extraction, and ML classification.\n\n## Key Outcomes\n- Real file import and onboarding flow connected to backend routes.\n- AI chat now streams grounded responses from workspace context.\n- Parsed chunks are persisted in Prisma and indexed in ChromaDB.\n- Semantic search, knowledge graph extraction, and document classification are wired end to end.\n\n## Metrics\n- Embedding dimension: ${metrics.embeddingDimension}\n- Total indexed documents: ${metrics.totalIndexedDocuments}\n- Total indexed chunks: ${metrics.totalIndexedChunks}\n- Semantic search latency: ${metrics.semanticSearchLatencyMs} ms\n- Retrieval precision: ${metrics.retrievalPrecision}\n- Retrieval recall: ${metrics.retrievalRecall}\n- Classification accuracy: ${metrics.classificationAccuracy}\n- Duplicate detection accuracy: ${metrics.duplicateDetectionAccuracy}\n- Average response time: ${metrics.averageResponseTimeMs} ms\n\n## Notes for Resume\n- Built a local-first AI workspace orchestration pipeline across Next.js, Express, FastAPI, Prisma, SQLite, ChromaDB, and SentenceTransformers.\n- Replaced mock UI flows with live backend session, import, search, and chat integration.\n- Added chunk persistence and grounded local chat fallback to keep the product usable without external API keys.\n`;

  const reportPath = path.join(rootDir, 'neurodesk-ai-report.md');
  fs.writeFileSync(reportPath, report, 'utf-8');

  console.log(JSON.stringify(metrics, null, 2));
  console.log(`\nReport written to ${reportPath}`);
  console.log(`\nLast chat sample: ${lastChatResponse}`);

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
