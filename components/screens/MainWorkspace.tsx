'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Sparkles, Settings, LogOut, Mic, Paperclip, Send, X, Brain, FileText, UploadCloud, Layers, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ProjectWorkspace from './ProjectWorkspace'
import WorkspacePermission from './WorkspacePermission'
import { clearSession, getProjects, getDocuments, getStoredSession, searchWorkspace, streamChat, triggerWorkspaceScan, uploadFiles, cancelPendingUpload, confirmPendingUpload, type ProjectSummary, type DocumentSummary } from '@/lib/api'
import DocumentWorkspace from './DocumentWorkspace'

type ChatMessage = { role: 'user' | 'assistant'; text: string }

type DuplicateInfo = {
  pendingId: string
  filename: string
  existingFilename: string
  existingUploadedAt: string | null
}

type UploadedDoc = {
  id: string
  name: string
  size: string
  uploadedAt: string
}

function toRelativeLabel(value: string) {
  if (!value) return 'Recently added'
  const timestamp = new Date(value).getTime()
  if (Number.isNaN(timestamp)) return 'Recently added'
  const diffHours = Math.max(0, Math.round((Date.now() - timestamp) / (1000 * 60 * 60)))
  if (diffHours < 1) return 'Just now'
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`
  const diffDays = Math.round(diffHours / 24)
  return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`
}

function HealthRing({ score }: { score: number }) {
  const safeScore = typeof score === 'number' && !isNaN(score) ? score : 0
  const radius = 18
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (safeScore / 100) * circumference
  const color = safeScore >= 80 ? '#14B86A' : safeScore >= 60 ? '#F7A928' : '#F14D6B'

  return (
    <motion.svg width="48" height="48" viewBox="0 0 48 48">
      <circle cx="24" cy="24" r={radius} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />
      <motion.circle
        cx="24"
        cy="24"
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.8, ease: 'easeOut' }}
        style={{ transform: 'rotate(-90deg)', transformOrigin: '24px 24px' }}
      />
      <text x="24" y="28" textAnchor="middle" fontSize="11" fontWeight="600" fill="#1E1E22">
        {safeScore}
      </text>
    </motion.svg>
  )
}

function AIAssistantPanel({
  isOpen,
  onClose,
  messages,
  input,
  setInput,
  onSend,
  isSending,
}: {
  isOpen: boolean
  onClose: () => void
  messages: ChatMessage[]
  input: string
  setInput: (value: string) => void
  onSend: (value?: string) => Promise<void>
  isSending: boolean
}) {
  const formRef = useRef<HTMLFormElement>(null)

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="glass-dark fixed right-0 top-0 h-screen flex flex-col border-l z-50"
          style={{ width: '420px', borderColor: 'rgba(255,255,255,0.06)' }}
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          <div className="flex items-center justify-between p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            <div className="flex items-center gap-2">
              <Brain className="w-5 h-5 text-purple-400" />
              <h3 className="font-semibold text-white">AI Assistant</h3>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition">
              <X className="w-5 h-5 text-white/60" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <Brain className="w-12 h-12 text-purple-400/30 mb-3" />
                <p className="text-sm text-white/40">Ask anything about your workspace</p>
              </div>
            ) : (
              messages.map((msg, i) => (
                <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className="px-4 py-2 rounded-lg max-w-xs"
                    style={{
                      background: msg.role === 'user' ? 'rgba(109, 74, 255, 0.2)' : 'rgba(255,255,255,0.05)',
                      color: 'white',
                    }}
                  >
                    <p className="text-sm">{msg.text}</p>
                  </div>
                </motion.div>
              ))
            )}
          </div>

          <div className="p-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
            <form ref={formRef} className="flex gap-2" onSubmit={async (e) => { e.preventDefault(); await onSend(); }}>
              <button type="button" className="p-2 hover:bg-white/10 rounded-lg transition">
                <Paperclip className="w-5 h-5 text-white/60" />
              </button>
              <input
                type="text"
                placeholder="Ask anything..."
                value={input}
                onChange={e => setInput(e.target.value)}
                className="flex-1 bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-white placeholder-white/40 focus:outline-none focus:border-purple-400/50"
              />
              <button type="submit" disabled={isSending} className="p-2 bg-purple-500 hover:bg-purple-600 rounded-lg transition disabled:opacity-50">
                <Send className="w-5 h-5 text-white" />
              </button>
            </form>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function formatUploadedDate(value: string | null) {
  if (!value) return 'Unknown date'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return 'Unknown date'
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function DuplicateFileDialog({
  duplicate,
  onCancel,
  onUploadAgain,
  isBusy,
}: {
  duplicate: DuplicateInfo | null
  onCancel: () => void
  onUploadAgain: () => void
  isBusy: boolean
}) {
  if (!duplicate) return null

  return (
    <AnimatePresence>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="glass-dark rounded-2xl p-6 w-full max-w-sm border border-white/10 shadow-2xl"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-white">Duplicate File Detected</h2>
            <button onClick={onCancel} disabled={isBusy} className="p-1 hover:bg-white/10 rounded-lg text-white/60 transition">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-white/70 mb-4">
            This document already exists in your workspace.
          </p>
          <div className="rounded-lg bg-white/5 p-3 mb-5 space-y-1">
            <p className="text-xs text-white/50">Filename</p>
            <p className="text-sm text-white font-medium truncate">{duplicate.existingFilename || duplicate.filename}</p>
            <p className="text-xs text-white/50 mt-2">Uploaded</p>
            <p className="text-sm text-white font-medium">{formatUploadedDate(duplicate.existingUploadedAt)}</p>
          </div>
          <p className="text-sm text-white/70 mb-5">Do you want to upload another copy?</p>
          <div className="flex gap-3">
            <button
              onClick={onCancel}
              disabled={isBusy}
              className="flex-1 px-4 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition border border-white/10 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={onUploadAgain}
              disabled={isBusy}
              className="flex-1 px-4 py-2 text-sm text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition disabled:opacity-50"
            >
              {isBusy ? 'Uploading...' : 'Upload Again'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

function SettingsDrawer({ isOpen, onClose, onPermissions, onLogout, onRescan }: { isOpen: boolean; onClose: () => void; onPermissions: () => void; onLogout: () => void; onRescan: () => void }) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="fixed inset-0 bg-black/30 z-40" />
          <motion.div
            className="glass-dark fixed right-0 top-0 h-screen flex flex-col border-l p-6"
            style={{ width: '380px', borderColor: 'rgba(255,255,255,0.06)', zIndex: 50 }}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          >
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-lg font-semibold text-white">Settings</h2>
              <button onClick={onClose} className="p-1 hover:bg-white/10 rounded-lg transition">
                <X className="w-5 h-5 text-white/60" />
              </button>
            </div>

            <div className="space-y-6 flex-1 overflow-y-auto">
              <div>
                <h3 className="text-sm font-semibold text-white mb-3">Profile</h3>
                <div className="space-y-2">
                  <div className="p-3 rounded-lg bg-white/5">
                    <p className="text-xs text-white/50">User</p>
                    <p className="text-sm text-white font-medium">{getStoredSession()?.user.name || getStoredSession()?.user.email || 'Signed in user'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-white/5">
                    <p className="text-xs text-white/50">Workspace</p>
                    <p className="text-sm text-white font-medium">Your indexed workspace</p>
                  </div>
                </div>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-white mb-3">Permissions</h3>
                <button
                  onClick={onPermissions}
                  className="w-full px-4 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition text-left"
                >
                  Manage Permissions
                </button>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-white mb-3">Actions</h3>
                <div className="space-y-2">
                  <button onClick={onRescan} className="w-full px-4 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition text-left">
                    Rebuild Workspace
                  </button>
                  <button onClick={onRescan} className="w-full px-4 py-2 text-sm text-white/80 hover:text-white hover:bg-white/10 rounded-lg transition text-left">
                    Rescan Files
                  </button>
                </div>
              </div>
            </div>

            <button
              onClick={onLogout}
              className="w-full px-4 py-2 text-sm text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition flex items-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Logout
            </button>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export default function MainWorkspace() {
  const [showAI, setShowAI] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [selectedProject, setSelectedProject] = useState<ProjectSummary | null>(null)
  const [showPermissions, setShowPermissions] = useState(false)
  const [projects, setProjects] = useState<ProjectSummary[]>([])
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [query, setQuery] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadToast, setUploadToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null)
  const [documents, setDocuments] = useState<DocumentSummary[]>([])
  const [searchResults, setSearchResults] = useState<DocumentSummary[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState<DocumentSummary | null>(null)
  const [duplicateQueue, setDuplicateQueue] = useState<DuplicateInfo[]>([])
  const [isDuplicateBusy, setIsDuplicateBusy] = useState(false)

  const filePickerRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (typeof getProjects === 'function') {
      getProjects().then(res => {
        if (Array.isArray(res)) setProjects(res)
      }).catch(() => setProjects([]))
    }
    if (typeof getDocuments === 'function') {
      getDocuments().then(res => {
        if (Array.isArray(res)) setDocuments(res)
      }).catch(() => setDocuments([]))
    }
  }, [])

  const heroPlaceholder = useMemo(() => {
    const total = (projects?.length || 0) + (uploadedDocs?.length || 0) + (documents?.length || 0)
    if (total > 0) return `Search across ${total} document${total === 1 ? '' : 's'} or ask AI...`
    return 'Import a folder or upload files to start...'
  }, [projects, uploadedDocs, documents])

  // Precise Version & Duplicate Indexing Engine
  const getDocumentVersionMeta = (doc: DocumentSummary, list: DocumentSummary[]) => {
    if (!doc || !doc.filename || !Array.isArray(list)) {
      return { isOriginal: true, isDuplicate: false, label: null }
    }

    const sameNameDocs = list.filter(
      d => d.filename.trim().toLowerCase() === doc.filename.trim().toLowerCase()
    )

    if (sameNameDocs.length <= 1) {
      return { isOriginal: true, isDuplicate: false, label: null }
    }

    // Stable Sorting Logic by Timestamp and ID sequence
    const sorted = [...sameNameDocs].sort((a, b) => {
      const timeA = a.fileModifiedAt ? new Date(a.fileModifiedAt).getTime() : 0
      const timeB = b.fileModifiedAt ? new Date(b.fileModifiedAt).getTime() : 0
      if (timeA !== timeB) return timeA - timeB
      return (a.id || '').localeCompare(b.id || '')
    })

    const index = sorted.findIndex(d => d.id === doc.id)
    const position = index !== -1 ? index + 1 : 1

    if (position === 1) {
      return {
        isOriginal: true,
        isDuplicate: false,
        label: 'Original',
      }
    }

    const duplicateNumber = position - 1
    return {
      isOriginal: false,
      isDuplicate: true,
      label: `Duplicate File ${duplicateNumber}`,
    }
  }

  const sendQuery = async (overrideQuery?: string) => {
    const text = (overrideQuery ?? query).trim()
    if (!text || isSending || isSearching) return

    setIsSearching(true)
    try {
      const results = await searchWorkspace(text, 'hybrid', 20) as any[]
      
      const fileResults: DocumentSummary[] = results.map(r => ({
        id: r.id || r.file_id || r.metadata?.file_id || Date.now().toString(),
        filename: r.filename || r.metadata?.filename || 'Unknown File',
        category: r.category || r.metadata?.category || 'document',
        sizeBytes: '0',
        tags: [],
        summary: r.content?.substring(0, 100) || '',
        status: 'indexed',
        fileModifiedAt: new Date().toISOString()
      }))
      
      if (fileResults.length > 0) {
         setSearchResults(fileResults)
      } else {
         setSearchResults([])
         setIsSending(true)
         const nextHistory = [...messages, { role: 'user', text }] as any
         setMessages(nextHistory)
         setQuery('')
         
         if (typeof streamChat === 'function') {
           const chatResult = await streamChat(text, nextHistory.map((m: any) => ({ role: m.role, content: m.text })))
           setMessages(prev => [...prev, { role: 'assistant', text: chatResult?.text || 'This information is unavailable in the indexed workspace.' }])
         }
         setShowAI(true)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsSending(false)
      setIsSearching(false)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (event.target) event.target.value = ''
    if (!files.length) return

    setUploading(true)
    try {
      let result: any = null
      if (typeof uploadFiles === 'function') {
        result = await uploadFiles(files)
      }

      const uploaded = result?.data?.uploaded || []
      const duplicates: DuplicateInfo[] = result?.data?.duplicates || []

      if (uploaded.length > 0) {
        const newDocs: UploadedDoc[] = uploaded.map((f: any, i: number) => ({
          id: f.id || `${Date.now()}-${i}`,
          name: f.filename,
          size: '',
          uploadedAt: 'Just now',
        }))
        setUploadedDocs(prev => [...newDocs, ...prev])
        const refreshedDocuments = await getDocuments()
        setDocuments(refreshedDocuments)
      }

      if (duplicates.length > 0) {
        setDuplicateQueue(prev => [...prev, ...duplicates])
      } else if (uploaded.length > 0) {
        setUploadToast({ type: 'success', message: `${uploaded.length} file(s) queued for analysis.` })
        setTimeout(() => setUploadToast(null), 3000)
      }
    } catch (error) {
      setUploadToast({ type: 'error', message: error instanceof Error ? error.message : 'Upload failed.' })
      setTimeout(() => setUploadToast(null), 3000)
    } finally {
      setUploading(false)
    }
  }

  const activeDuplicate = duplicateQueue[0] || null

  const handleCancelDuplicate = async () => {
    if (!activeDuplicate) return
    setIsDuplicateBusy(true)
    try {
      if (typeof cancelPendingUpload === 'function') {
        await cancelPendingUpload(activeDuplicate.pendingId).catch(() => {})
      }
    } catch (error) {
      console.error(error)
    } finally {
      setIsDuplicateBusy(false)
      setDuplicateQueue(prev => prev.slice(1))
    }
  }

  const handleUploadAgainDuplicate = async () => {
    if (!activeDuplicate) return
    setIsDuplicateBusy(true)
    try {
      if (typeof confirmPendingUpload === 'function') {
        await confirmPendingUpload(activeDuplicate.pendingId)
      }
      const refreshedDocuments = await getDocuments()
      setDocuments(refreshedDocuments)
      setUploadToast({ type: 'success', message: `${activeDuplicate.filename} uploaded again as a duplicate version.` })
      setTimeout(() => setUploadToast(null), 3000)
    } catch (error) {
      setUploadToast({ type: 'error', message: 'Failed to upload duplicate.' })
      setTimeout(() => setUploadToast(null), 3000)
    } finally {
      setIsDuplicateBusy(false)
      setDuplicateQueue(prev => prev.slice(1))
    }
  }

  if (showPermissions) {
    return (
      <div className="min-h-screen bg-desktop">
        <WorkspacePermission onContinue={async () => setShowPermissions(false)} />
      </div>
    )
  }

  if (selectedProject) {
    return (
      <div className="min-h-screen bg-desktop">
        <ProjectWorkspace project={selectedProject} onBack={() => setSelectedProject(null)} />
      </div>
    )
  }

  if (selectedDocument) {
    return (
      <div className="min-h-screen bg-desktop">
        <DocumentWorkspace document={selectedDocument} onBack={() => setSelectedDocument(null)} />
      </div>
    )
  }

  const activeDocList = searchResults.length > 0 ? searchResults : documents

  return (
    <div className="min-h-screen relative">
      <motion.div animate={{ marginRight: showAI ? 420 : 0 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="min-h-screen">
        {uploadToast && (
          <div className="fixed bottom-6 right-6 z-50">
            <div className={`px-4 py-3 rounded-xl text-sm font-medium text-white shadow-lg ${uploadToast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}>
              {uploadToast.message}
            </div>
          </div>
        )}

        {/* Sticky Header */}
        <motion.div
          className="sticky top-0 z-30 border-b"
          style={{
            background: 'rgba(246, 244, 239, 0.8)',
            borderColor: 'rgba(232, 230, 225, 0.4)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div className="max-w-7xl mx-auto px-12 py-5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">N</div>
              <span className="font-semibold text-foreground text-lg">NeuroDesk</span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => filePickerRef.current?.click()}
                disabled={uploading}
                className="px-3 py-2 rounded-lg bg-black/5 hover:bg-black/10 transition text-sm text-foreground font-medium disabled:opacity-50"
              >
                {uploading ? 'Uploading...' : 'Upload files'}
              </button>
              <button
                onClick={() => setShowAI(!showAI)}
                className="p-2.5 rounded-lg hover:bg-black/5 transition"
                style={{ color: showAI ? '#6D4AFF' : '#6C6C75' }}
              >
                <Brain className="w-5 h-5" />
              </button>
              <button onClick={() => setShowSettings(!showSettings)} className="p-2.5 rounded-lg hover:bg-black/5 transition text-muted-foreground">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </motion.div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-12 py-12">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-12">
            <h1 className="text-4xl font-semibold text-foreground mb-2">Good to see you</h1>
            <p className="text-muted-foreground">Your AI is ready to help you explore your workspace</p>
          </motion.div>

          {/* Hero Search Bar */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="mb-12">
            <form
              className="glass-card rounded-3xl px-6 py-5 flex items-center gap-3 group hover:shadow-lg transition-all duration-300"
              style={{ height: '72px' }}
              onSubmit={async (e) => {
                e.preventDefault()
                await sendQuery()
              }}
            >
              <Search className="w-6 h-6 text-muted-foreground group-hover:text-foreground transition" />
              <input
                type="text"
                placeholder={heroPlaceholder}
                value={query}
                onChange={e => setQuery(e.target.value)}
                className="flex-1 bg-transparent outline-none text-foreground placeholder-muted-foreground text-base"
              />
              <Mic className="w-5 h-5 text-muted-foreground hover:text-foreground cursor-pointer transition" />
              <button type="button" onClick={() => filePickerRef.current?.click()} className="p-0 m-0 border-0 bg-transparent">
                <Paperclip className="w-5 h-5 text-muted-foreground hover:text-foreground cursor-pointer transition" />
              </button>
              <button
                type="submit"
                disabled={isSearching || isSending}
                className="px-5 py-2 rounded-2xl text-white font-medium transition-all duration-300 hover:scale-105 disabled:opacity-50"
                style={{
                  background: 'linear-gradient(135deg, #6D4AFF, #9B5DFF)',
                  boxShadow: '0 10px 30px rgba(109, 74, 255, 0.3)',
                }}
              >
                <Sparkles className="w-4 h-4 inline mr-1" />
                Ask
              </button>
            </form>
          </motion.div>

          <input ref={filePickerRef} type="file" multiple className="hidden" onChange={handleFileUpload} />

          {/* Document Explorer */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            <h2 className="text-xl font-semibold text-foreground mb-6">
              {searchResults.length > 0 ? 'Search Results' : 'Indexed Documents'}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {activeDocList.map((doc, idx) => {
                const versionMeta = getDocumentVersionMeta(doc, activeDocList)

                return (
                  <div 
                    key={doc.id || idx}
                    onClick={() => setSelectedDocument(doc)}
                    className="glass-card p-5 rounded-2xl cursor-pointer hover:shadow-lg transition flex flex-col gap-3 group relative overflow-hidden"
                  >
                    <div className="flex items-start justify-between">
                      <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
                        <FileText className="w-5 h-5" />
                      </div>
                      
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {/* Dynamic Label for Original & Sequential Duplicates */}
                        {versionMeta.label && (
                          <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            versionMeta.isDuplicate
                              ? 'bg-amber-500/15 text-amber-600 border border-amber-500/30 shadow-sm'
                              : 'bg-purple-500/15 text-purple-700 border border-purple-500/30'
                          }`}>
                            {versionMeta.isDuplicate ? <Copy className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
                            {versionMeta.label}
                          </div>
                        )}

                        {/* Status Badge */}
                        {(doc.status === 'indexed' || doc.status === 'analyzed') ? (
                          <div className="flex items-center gap-1 bg-green-100 text-green-700 px-2.5 py-1 rounded-full text-xs font-medium">
                            <Sparkles className="w-3 h-3" />
                            AI Analysed
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full text-xs font-medium">
                            <div className="animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                            Processing...
                          </div>
                        )}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-semibold text-foreground group-hover:text-purple-600 transition truncate">{doc.filename}</h3>
                      <p className="text-sm text-muted-foreground capitalize">{doc.category}</p>
                    </div>

                    {doc.summary && (
                      <p className="text-sm text-muted-foreground line-clamp-2 mt-2">{doc.summary}</p>
                    )}

                    <div className="flex items-center justify-between mt-auto pt-4 text-xs text-muted-foreground border-t border-black/5">
                      <span>{toRelativeLabel(doc.fileModifiedAt)}</span>
                      <div className="flex gap-1">
                        {doc.tags?.slice(0, 2).map((tag, i) => (
                          <span key={i} className="px-2 py-0.5 rounded-full bg-black/5">{tag}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              })}
              
              {searchResults.length === 0 && projects.map((proj, idx) => (
                <div 
                  key={proj.id || idx}
                  onClick={() => setSelectedProject(proj)}
                  className="glass-card p-5 rounded-2xl cursor-pointer hover:shadow-lg transition flex flex-col gap-3 group border-blue-200/50"
                  style={{ background: 'linear-gradient(to bottom right, rgba(255,255,255,0.7), rgba(239,246,255,0.7))' }}
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600 text-2xl">
                      📁
                    </div>
                  </div>
                  <div>
                    <h3 className="font-semibold text-foreground group-hover:text-blue-600 transition truncate">{proj.name}</h3>
                    <p className="text-sm text-muted-foreground capitalize">{proj.projectType || 'Project'}</p>
                  </div>
                  <p className="text-sm text-muted-foreground line-clamp-2 mt-2">{proj.description || proj.path}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </motion.div>

      <AIAssistantPanel
        isOpen={showAI}
        onClose={() => setShowAI(false)}
        messages={messages}
        input={query}
        setInput={setQuery}
        onSend={sendQuery}
        isSending={isSending}
      />
      <SettingsDrawer
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onPermissions={() => {
          setShowSettings(false)
          setShowPermissions(true)
        }}
        onLogout={() => { clearSession(); window.location.reload(); }}
        onRescan={async () => {
          if (typeof triggerWorkspaceScan === 'function') {
            await triggerWorkspaceScan();
          }
          setShowSettings(false);
        }}
      />
      <DuplicateFileDialog
        duplicate={activeDuplicate}
        onCancel={handleCancelDuplicate}
        onUploadAgain={handleUploadAgainDuplicate}
        isBusy={isDuplicateBusy}
      />
    </div>
  )
}