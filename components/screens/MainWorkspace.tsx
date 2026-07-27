'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Search, Sparkles, Settings, LogOut, Mic, Paperclip, Send, X, Brain, FileText, UploadCloud } from 'lucide-react'
import { Button } from '@/components/ui/button'
import ProjectWorkspace from './ProjectWorkspace'
import WorkspacePermission from './WorkspacePermission'
import { clearSession, getProjects, getDocuments, getStoredSession, searchWorkspace, streamChat, triggerWorkspaceScan, uploadFiles, type ProjectSummary, type DocumentSummary } from '@/lib/api'
import DocumentWorkspace from './DocumentWorkspace'

type ChatMessage = { role: 'user' | 'assistant'; text: string }

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
    const total = (projects?.length || 0) + (uploadedDocs?.length || 0)
    if (total > 0) return `Search across ${total} document${total === 1 ? '' : 's'} or ask AI...`
    return 'Import a folder or upload files to start...'
  }, [projects, uploadedDocs])

  const sendQuery = async (overrideQuery?: string) => {
    const text = (overrideQuery ?? query).trim()
    if (!text || isSending || isSearching) return

    // Smart Search Execution
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
         // Fallback to chat if no files found
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
    if (!files.length) return

    setUploading(true)
    try {
      if (typeof uploadFiles === 'function') {
        await uploadFiles(files)
      }

      const newDocs: UploadedDoc[] = files.map((f, i) => ({
        id: `${Date.now()}-${i}`,
        name: f.name,
        size: `${(f.size / (1024 * 1024)).toFixed(2)} MB`,
        uploadedAt: 'Just now',
      }))

      setUploadedDocs(prev => [...newDocs, ...prev])
      const refreshedDocuments = await getDocuments()
      setDocuments(refreshedDocuments)
      setUploadToast({ type: 'success', message: `${files.length} file(s) queued for analysis.` })
      setTimeout(() => setUploadToast(null), 3000)
    } catch (error) {
      setUploadToast({ type: 'error', message: error instanceof Error ? error.message : 'Upload failed.' })
      setTimeout(() => setUploadToast(null), 3000)
    } finally {
      setUploading(false)
      if (event.target) event.target.value = ''
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

  return (
    <div className="min-h-screen relative">
      <motion.div animate={{ marginRight: showAI ? 420 : 0 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }} className="min-h-screen">
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
                className="px-3 py-2 rounded-lg bg-black/5 hover:bg-black/10 transition text-sm text-foreground font-medium"
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
                className="px-5 py-2 rounded-2xl text-white font-medium transition-all duration-300 hover:scale-105"
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
              {(searchResults.length > 0 ? searchResults : documents).map((doc, idx) => (
                <div 
                  key={doc.id || idx}
                  onClick={() => setSelectedDocument(doc)}
                  className="glass-card p-5 rounded-2xl cursor-pointer hover:shadow-lg transition flex flex-col gap-3 group"
                >
                  <div className="flex items-start justify-between">
                    <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
                      <FileText className="w-5 h-5" />
                    </div>
                    {(doc.status === 'indexed' || doc.status === 'analyzed') ? (
                      <div className="flex items-center gap-1 bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-medium">
                        <Sparkles className="w-3 h-3" />
                        AI Analysed
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 bg-blue-100 text-blue-700 px-2 py-1 rounded-full text-xs font-medium">
                        <div className="animate-spin w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                        Processing...
                      </div>
                    )}
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
              ))}
              
              {/* Also show projects in search results if applicable */}
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

      {/* Sidebars */}
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
    </div>
  )
}
