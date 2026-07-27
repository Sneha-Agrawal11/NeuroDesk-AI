'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, FileText, Settings } from 'lucide-react'
import { type ProjectSummary } from '@/lib/api'
import { getProjects } from '@/lib/api'

interface ProjectWorkspaceProps {
  project: ProjectSummary
  onBack: () => void
}
export default function ProjectWorkspace({ project, onBack }: ProjectWorkspaceProps) {
  const [projectList, setProjectList] = useState<ProjectSummary[]>([])
  const [analysis, setAnalysis] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)

  useEffect(() => {
    getProjects().then(setProjectList).catch(() => setProjectList([]))
    
    // Fetch project analysis
    const fetchAnalysis = async () => {
      try {
        const token = window.localStorage.getItem('neurodesk_session') ? JSON.parse(window.localStorage.getItem('neurodesk_session') || '{}').token : ''
        const res = await fetch(`http://localhost:3001/api/workspace/project/${project.id}/analysis`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await res.json()
        if (data.success) {
          setAnalysis(data.data)
        }
      } catch (err) {
        console.error('Failed to load project analysis', err)
      } finally {
        setLoading(false)
      }
    }
    fetchAnalysis()
  }, [project.id])

  const techStack = project.technologyStack ? JSON.parse(project.technologyStack) : []

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isSending) return
    setIsSending(true)
    
    const text = input.trim()
    const newMessages = [...messages, { role: 'user', text }]
    setMessages(newMessages)
    setInput('')
    
    try {
      // Need to import streamChat at the top if not imported, or just fetch
      // Assuming streamChat is available in api.ts
      const { streamChat } = await import('@/lib/api')
      const chatResult = await streamChat(
        `Focus only on the project '${project.name}'. Query: ${text}`,
        newMessages.map(m => ({ role: m.role, content: m.text }))
      )
      setMessages(prev => [...prev, { role: 'assistant', text: chatResult.text }])
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', text: 'Failed to communicate with AI.' }])
    } finally {
      setIsSending(false)
    }
  }

  const renderSection = (title: string, content: any, isList = false) => {
    if (!content || (Array.isArray(content) && content.length === 0)) return null;
    return (
      <div className="mb-6 p-5 glass-card rounded-2xl bg-white/60">
        <h3 className="font-semibold text-lg text-foreground mb-3 border-b border-black/5 pb-2">{title}</h3>
        {isList && Array.isArray(content) ? (
          <ul className="list-disc pl-5 space-y-1">
            {content.map((item: string, i: number) => <li key={i} className="text-muted-foreground">{item}</li>)}
          </ul>
        ) : typeof content === 'object' ? (
          <div className="space-y-2">
            {Object.entries(content).map(([k, v]) => (
              <p key={k} className="text-sm"><strong className="text-foreground capitalize">{k.replace(/_/g, ' ')}:</strong> <span className="text-muted-foreground">{String(v)}</span></p>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">{content}</p>
        )}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen flex"
    >
      <div className="flex-1 overflow-y-auto">
      {/* Header */}
      <div
        className="sticky top-0 z-30 border-b"
        style={{
          background: 'rgba(246, 244, 239, 0.8)',
          borderColor: 'rgba(232, 230, 225, 0.4)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div className="max-w-7xl mx-auto px-12 py-5 flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center gap-2 p-2.5 rounded-lg hover:bg-black/5 transition text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Back</span>
          </button>

          <button className="p-2.5 rounded-lg hover:bg-black/5 transition text-muted-foreground">
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-12 py-12">
        {/* Project Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <div className="flex items-start gap-4 mb-6">
            <div className="text-5xl">📁</div>
            <div>
              <h1 className="text-4xl font-semibold text-foreground mb-2">
                {project.name}
              </h1>
              <p className="text-lg text-muted-foreground">{project.description || project.path}</p>
            </div>
          </div>

          {/* Tech Stack */}
          <div className="flex flex-wrap gap-2">
            {techStack.map((t: string, i: number) => (
              <span
                key={i}
                className="px-3 py-1.5 text-sm rounded-full bg-purple-100 text-purple-700 font-medium"
              >
                {t}
              </span>
            ))}
          </div>
        </motion.div>

        {loading ? (
          <div className="flex items-center justify-center p-20">
            <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="col-span-1 md:col-span-2">
              {renderSection('Architecture', analysis?.architecture)}
              {renderSection('Folder Structure', analysis?.folderStructure)}
            </div>
            <div>
              {renderSection('Tech Stack', analysis?.techStack, true)}
              {renderSection('Frontend', analysis?.frontend)}
              {renderSection('Backend', analysis?.backend)}
              {renderSection('Database', analysis?.database)}
              {renderSection('Authentication', analysis?.authentication)}
              {renderSection('APIs', analysis?.apis, true)}
              {renderSection('Routes', analysis?.routes, true)}
              {renderSection('ML Models', analysis?.mlModels, true)}
            </div>
            <div>
              {renderSection('Configuration', analysis?.configuration)}
              {renderSection('Environment', analysis?.environment)}
              {renderSection('Security Issues', analysis?.securityIssues, true)}
              {renderSection('Performance Issues', analysis?.performanceIssues, true)}
              {renderSection('Missing Files', analysis?.missingFiles, true)}
              {renderSection('Resume Points', analysis?.resumePoints, true)}
              {renderSection('Interview Questions', analysis?.interviewQuestions, true)}
              {renderSection('Improvement Suggestions', analysis?.improvementSuggestions, true)}
            </div>
            <div className="col-span-1 md:col-span-2">
              {renderSection('README', analysis?.readme)}
            </div>
          </div>
        )}
      </div>

      {/* Side AI Chat */}
      <div className="w-[400px] border-l glass-dark flex flex-col h-screen sticky top-0">
        <div className="p-5 border-b border-white/10 flex items-center gap-2">
          <h3 className="font-semibold text-white">Ask about this project</h3>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-white/50 mt-10">
              <p className="text-sm">I have analyzed this codebase. What would you like to know?</p>
            </div>
          ) : (
            messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%] rounded-xl px-4 py-2" style={{
                  background: m.role === 'user' ? 'rgba(109, 74, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                  color: 'white'
                }}>
                  <p className="text-sm">{m.text}</p>
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="p-4 border-t border-white/10">
          <form onSubmit={handleSend} className="flex gap-2">
            <input 
              type="text" 
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask a question..."
              className="flex-1 bg-white/10 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-purple-500"
            />
            <button disabled={isSending} type="submit" className="p-2 bg-purple-600 rounded-lg text-white hover:bg-purple-700 disabled:opacity-50 transition">
              Send
            </button>
          </form>
        </div>
      </div>
      </div>
    </motion.div>
  )
}
