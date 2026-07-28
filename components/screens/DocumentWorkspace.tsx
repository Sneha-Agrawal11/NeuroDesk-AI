'use client'

import React, { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, Brain, Send, FileText, FileSearch, Sparkles, Image as ImageIcon, X } from 'lucide-react'
import { type DocumentSummary, streamChat, getStoredSession, searchWorkspace } from '@/lib/api'
import { Button } from '@/components/ui/button'

interface DocumentWorkspaceProps {
  document: DocumentSummary
  onBack: () => void
}

export default function DocumentWorkspace({ document, onBack }: DocumentWorkspaceProps) {
  const [analysis, setAnalysis] = useState<any>(null)
  const [relatedDocs, setRelatedDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [chatOpen, setChatOpen] = useState(true)

  useEffect(() => {
    // Fetch real analysis from backend
    const fetchAnalysis = async () => {
      try {
        const token = getStoredSession()?.token
        const res = await fetch(`http://localhost:3001/api/workspace/document/${document.id}/analysis`, {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        })
        const data = await res.json()
        if (data.success) {
          setAnalysis(data.data)
        }
        
        // Fetch related documents
        try {
          const searchQ = (data.data?.summary || document.filename).substring(0, 50)
          const related = await searchWorkspace(searchQ, 'semantic', 5) as any[]
          setRelatedDocs(related.filter(r => r.id !== document.id && r.metadata?.file_id !== document.id))
        } catch (e) {}
        
      } catch (err) {
        console.error('Failed to load analysis', err)
      } finally {
        setLoading(false)
      }
    }
    fetchAnalysis()
  }, [document.id])

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isSending) return
    setIsSending(true)
    
    const text = input.trim()
    const newMessages = [...messages, { role: 'user', text }]
    setMessages(newMessages)
    setInput('')
    
    try {
      const chatResult = await streamChat(
        text,
        newMessages.map(m => ({ role: m.role, content: m.text })),
        [],
        {},
        undefined,
        undefined,
        document.id
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

  const renderResumeAnalysis = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="col-span-1 md:col-span-2">
        {renderSection('Professional Summary', analysis?.summary)}
      </div>
      <div>
        {renderSection('ATS Score', analysis?.atsScore ? `${analysis.atsScore}/100` : null)}
        {renderSection('Education', analysis?.education, true)}
        {renderSection('Skills', analysis?.skills, true)}
        {renderSection('Strengths', analysis?.strengths, true)}
        {renderSection('Missing Skills', analysis?.missingSkills, true)}
      </div>
      <div>
        {renderSection('Experience', analysis?.experience, true)}
        {renderSection('Projects', analysis?.projects, true)}
        {renderSection('Certifications & Achievements', analysis?.achievements, true)}
        {renderSection('Interview Questions', analysis?.interviewQuestions, true)}
        {renderSection('Improvement Suggestions', analysis?.improvements, true)}
      </div>
    </div>
  )

  const renderAssignmentAnalysis = () => (
    <div className="grid grid-cols-1 gap-6">
      {renderSection('Summary', analysis?.summary)}
      {renderSection('Key Concepts', analysis?.keyConcepts, true)}
      {renderSection('Important Topics', analysis?.importantTopics, true)}
      {renderSection('Definitions & Formulae', analysis?.definitions, true)}
      {renderSection('Questions & Answers', analysis?.qaPairs)}
      {renderSection('Quiz Questions', analysis?.quiz, true)}
    </div>
  )

  const renderResearchPaperAnalysis = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div className="col-span-1 md:col-span-2">
        {renderSection('Abstract', analysis?.abstract)}
      </div>
      <div>
        {renderSection('Problem Statement', analysis?.problemStatement)}
        {renderSection('Methodology', analysis?.methodology)}
        {renderSection('Keywords', analysis?.keywords, true)}
      </div>
      <div>
        {renderSection('Results', analysis?.results)}
        {renderSection('Limitations', analysis?.limitations)}
        {renderSection('Future Work', analysis?.futureWork)}
        {renderSection('Citation', analysis?.citation)}
      </div>
    </div>
  )

  const renderInvoiceAnalysis = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {renderSection('Summary', analysis?.summary)}
      <div>
        {renderSection('Invoice Details', {
          Vendor: analysis?.vendor,
          Date: analysis?.date,
          Amount: analysis?.amount,
          Tax: analysis?.tax,
          Status: analysis?.paymentStatus
        })}
      </div>
      <div className="col-span-1 md:col-span-2">
        {renderSection('Items', analysis?.items, true)}
      </div>
    </div>
  )

  const renderImageAnalysis = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        {renderSection('Scene Description', analysis?.sceneDescription)}
        {renderSection('Visual Tags', analysis?.visualTags, true)}
        {renderSection('Detected Objects', analysis?.detectedObjects, true)}
      </div>
      <div>
        {renderSection('Colours', analysis?.colours, true)}
        {renderSection('Faces Detected', analysis?.faces)}
        {renderSection('OCR Text', analysis?.ocrText)}
      </div>
    </div>
  )

  return (
    <div className="min-h-screen flex">
      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        <div className="sticky top-0 z-30 border-b bg-white/80 backdrop-blur-md">
          <div className="max-w-5xl mx-auto px-8 py-5 flex items-center justify-between">
            <button onClick={onBack} className="flex items-center gap-2 p-2 hover:bg-black/5 rounded-lg transition text-muted-foreground">
              <ChevronLeft className="w-5 h-5" />
              <span className="font-medium">Back</span>
            </button>
            <div className="flex items-center gap-2 text-purple-600 bg-purple-50 px-3 py-1 rounded-full text-sm font-medium">
              <Sparkles className="w-4 h-4" />
              Intelligent Workspace
            </div>
          </div>
        </div>
        
        <div className="max-w-5xl mx-auto px-8 py-10">
          <div className="mb-10">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
                {document.category === 'image' ? <ImageIcon className="w-6 h-6" /> : <FileText className="w-6 h-6" />}
              </div>
              <div>
                <h1 className="text-3xl font-semibold text-foreground">{document.filename}</h1>
                <p className="text-muted-foreground capitalize">{document.category} Workspace</p>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-20">
              <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
            </div>
          ) : (
            <div>
              {document.category === 'resume' && renderResumeAnalysis()}
              {(document.category === 'assignment' || document.category === 'document') && renderAssignmentAnalysis()}
              {document.category === 'research_paper' && renderResearchPaperAnalysis()}
              {document.category === 'invoice' && renderInvoiceAnalysis()}
              {document.category === 'image' && renderImageAnalysis()}
              
              {/* Related Knowledge Section */}
              <div className="mt-10">
                <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                  <FileSearch className="w-5 h-5 text-purple-500" />
                  Related Knowledge
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {relatedDocs.map((doc: any, i: number) => (
                    <div key={i} className="p-4 border rounded-xl hover:shadow-md transition bg-white/50 cursor-pointer">
                      <p className="font-medium truncate">{doc.filename || doc.metadata?.filename || doc.title}</p>
                      <p className="text-xs text-muted-foreground capitalize">{doc.category || doc.metadata?.category || 'Document'}</p>
                    </div>
                  ))}
                  {relatedDocs.length === 0 && (
                    <p className="text-muted-foreground text-sm col-span-full">No related documents found in this workspace yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Side AI Chat */}
      {chatOpen ? (
      <div className="w-[400px] border-l glass-dark flex flex-col h-screen sticky top-0">
        <div className="p-5 border-b border-white/10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-purple-400" />
            <h3 className="font-semibold text-white">Ask about this document</h3>
          </div>
          <button
            onClick={() => setChatOpen(false)}
            aria-label="Close chat"
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-white/50 mt-10">
              <Brain className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">I have read this document. What would you like to know?</p>
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
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </div>
      ) : (
        <button
          onClick={() => setChatOpen(true)}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex items-center gap-2 px-3 py-4 bg-[#1a1625] border border-white/10 border-r-0 rounded-l-xl text-white/70 hover:text-white hover:bg-[#241f33] transition shadow-lg"
          aria-label="Open document chat"
        >
          <Brain className="w-4 h-4 text-purple-400" />
        </button>
      )}
    </div>
  )
}
