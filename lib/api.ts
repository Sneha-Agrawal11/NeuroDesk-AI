const SERVER_BASE_URL = process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3001/api'
const TOKEN_KEY = 'neurodesk_token'
const SESSION_KEY = 'neurodesk_session'

type ApiSuccess<T> = {
  success: true
  data: T
}

type ApiFailure = {
  success: false
  error?: string
  message?: string
}

export type DevSession = {
  token: string
  user: {
    id: string
    email: string
    name: string | null
    picture: string | null
  }
  workspace?: {
    id: string
    status: string
    rootPath: string | null
    totalFiles: number
    totalProjects: number
    storageBytes: string | number
    lastScanAt: string | null
  }
}

export type WorkspaceStatus = {
  id: string
  status: string
  rootPath: string | null
  totalFiles: number
  totalProjects: number
  storageBytes: string | number
  lastScanAt: string | null
}

export type PermissionRecord = {
  id: string
  path: string
  label: string
  enabled: boolean
}

export type ProjectSummary = {
  id: string
  name: string
  path: string
  description: string | null
  projectType: string | null
  healthScore: number | null
  totalFiles: number
  technologyStack: string | null
  discoveredAt: string
  filesCount: number
}

export type DocumentSummary = {
  id: string
  filename: string
  category: string
  sizeBytes: string
  tags: string[]
  summary: string
  status: string
  fileModifiedAt: string
}

export type ChatResponse = {
  conversationId: string | null
  text: string
}

function readToken() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(TOKEN_KEY) || ''
}

function writeSession(session: DevSession) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(TOKEN_KEY, session.token)
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

export function clearSession() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(TOKEN_KEY)
  window.localStorage.removeItem(SESSION_KEY)
}

export function getStoredSession(): DevSession | null {
  if (typeof window === 'undefined') return null
  const raw = window.localStorage.getItem(SESSION_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw) as DevSession
  } catch {
    return null
  }
}

async function apiRequest<T>(path: string, init: RequestInit = {}, includeAuth = true): Promise<T> {
  const headers = new Headers(init.headers)
  if (includeAuth) {
    const token = readToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  const isFormData =
    init.body &&
    (init.body instanceof FormData ||
      init.body.constructor?.name === 'FormData' ||
      Object.prototype.toString.call(init.body) === '[object FormData]')

  if (!isFormData && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(`${SERVER_BASE_URL}${path}`, {
    ...init,
    headers,
  })

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : await response.text()

  if (!response.ok) {
    const message = typeof payload === 'string' ? payload : payload?.error || payload?.message || response.statusText
    throw new Error(message)
  }

  return payload as T
}

export async function ensureDevSession(): Promise<DevSession> {
  const existing = getStoredSession()
  if (existing?.token) return existing

  try {
    const response = await apiRequest<ApiSuccess<DevSession> | ApiFailure>(
      '/auth/dev-session',
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
      false
    )

    if ('success' in response && response.success) {
      writeSession(response.data)
      return response.data
    }
    throw new Error('Failed to ensure dev session')
  } catch (e) {
    throw e
  }
}

export async function getWorkspaceStatus() {
  try {
    const response = await apiRequest<ApiSuccess<WorkspaceStatus> | ApiFailure>('/workspace/status')
    if ('success' in response && response.success) return response.data
    throw new Error('Failed to get workspace status')
  } catch (e) {
    throw e
  }
}

export async function getPermissions() {
  try {
    const response = await apiRequest<ApiSuccess<PermissionRecord[]> | ApiFailure>('/permissions')
    if ('success' in response && response.success) return response.data
    throw new Error('Failed to get permissions')
  } catch (e) {
    throw e
  }
}

export async function addPermission(path: string, label: string) {
  try {
    const response = await apiRequest<ApiSuccess<PermissionRecord> | ApiFailure>('/permissions/add', {
      method: 'POST',
      body: JSON.stringify({ path, label }),
    })
    if ('success' in response && response.success) return response.data
    throw new Error('Failed to add permission')
  } catch (e) {
    throw e
  }
}

export async function triggerWorkspaceScan() {
  try {
    const response = await apiRequest<ApiSuccess<{ jobId: string; message: string }> | ApiFailure>('/workspace/scan', {
      method: 'POST',
      body: JSON.stringify({}),
    })
    if ('success' in response && response.success) return response.data
    throw new Error('Failed to trigger scan')
  } catch (e) {
    throw e
  }
}

export async function getProjects() {
  try {
    const response = await apiRequest<ApiSuccess<ProjectSummary[]> | ApiFailure>('/workspace/projects')
    if ('success' in response && response.success) return response.data
    throw new Error('Failed to get projects')
  } catch (e) {
    throw e
  }
}

export async function getDocuments() {
  try {
    const response = await apiRequest<ApiSuccess<DocumentSummary[]> | ApiFailure>('/workspace/documents')
    if ('success' in response && response.success) return response.data
    throw new Error('Failed to get documents')
  } catch (e) {
    throw e
  }
}

export async function uploadFiles(files: File[]) {
  const formData = new FormData()
  files.forEach(file => formData.append('files', file))

  try {
    const response = await fetch(`${SERVER_BASE_URL}/workspace/upload`, {
      method: 'POST',
      body: formData,
      headers: {
        Authorization: readToken() ? `Bearer ${readToken()}` : '',
      },
    })
    if (response.ok) {
      const data = await response.json()
      return data
    }
  } catch (e) {
    throw e
  }
  throw new Error('Upload failed')
}

export async function searchWorkspace(query: string, mode: 'hybrid' | 'keyword' | 'semantic' = 'hybrid', limit = 10) {
  try {
    const response = await apiRequest<ApiSuccess<unknown[]> | ApiFailure>('/search', {
      method: 'POST',
      body: JSON.stringify({ query, mode, limit }),
    })
    if ('success' in response && response.success) return response.data
    throw new Error('Search failed')
  } catch (e) {
    throw e
  }
}

export async function streamChat(
  query: string,
  history: Array<{ role: string; content: string }>,
  retrievedChunks: unknown[] = [],
  workspaceContext: Record<string, unknown> = {},
  provider?: string,
  model?: string
): Promise<ChatResponse> {
  try {
    const response = await fetch(`${SERVER_BASE_URL}/ai/chat`, {
      method: 'POST',
      headers: {
        Authorization: readToken() ? `Bearer ${readToken()}` : '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        history,
        retrieved_chunks: retrievedChunks,
        workspace_context: workspaceContext,
        provider,
        model,
      }),
    })

    if (response.ok && response.body) {
      const conversationId = response.headers.get('x-conversation-id')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullText = ''

      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6)
          if (data === '[DONE]' || data.startsWith('[ERROR]')) continue
          fullText += data
        }
      }

      if (buffer.startsWith('data: ')) {
        const data = buffer.slice(6)
        if (data !== '[DONE]' && !data.startsWith('[ERROR]')) {
          fullText += data
        }
      }

      return { conversationId, text: fullText }
    }
    throw new Error('Failed to stream AI chat')
  } catch (e) {
    throw e
  }
}