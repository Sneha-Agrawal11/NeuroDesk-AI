'use client'

import React, { useEffect, useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { ChevronLeft, Brain, Send, FileText, FileSearch, Sparkles, Image as ImageIcon, X, ExternalLink, ZoomIn, ZoomOut } from 'lucide-react'
import { type DocumentSummary, streamChat, getStoredSession, searchWorkspace, getDocumentFileUrl } from '@/lib/api'
import { Button } from '@/components/ui/button'

interface DocumentWorkspaceProps {
  document: DocumentSummary
  onBack: () => void
}

type PreviewKind = 'pdf' | 'image' | 'text' | 'csv' | 'unrenderable'

const TEXT_EXTENSIONS = new Set(['txt', 'md', 'markdown', 'json', 'js', 'jsx', 'ts', 'tsx', 'py', 'java', 'c', 'cpp', 'cs', 'go', 'rs', 'html', 'css', 'yml', 'yaml', 'log'])

function getPreviewKind(filename: string): PreviewKind {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  if (ext === 'pdf') return 'pdf'
  if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) return 'image'
  if (ext === 'csv') return 'csv'
  if (TEXT_EXTENSIONS.has(ext)) return 'text'
  // docx, pptx, xlsx, doc, ppt, xls and anything else can't be rendered
  // natively in a browser - show the extracted-text preview + Open Original.
  return 'unrenderable'
}

function renderCsvTable(text: string) {
  const rows = text.split('\n').filter(Boolean).slice(0, 100).map(row => row.split(' | '))
  if (!rows.length) return null
  const [header, ...body] = rows
  return (
    <div className="overflow-auto max-h-[70vh]">
      <table className="w-full text-sm border-collapse">
        <thead className="sticky top-0 bg-white/95">
          <tr>
            {header.map((h, i) => (
              <th key={i} className="text-left font-semibold border-b border-black/10 px-3 py-2 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? 'bg-black/[0.02]' : ''}>
              {row.map((cell, ci) => (
                <td key={ci} className="px-3 py-1.5 border-b border-black/5 whitespace-nowrap">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const clamped = Math.max(0, Math.min(100, Number(score) || 0))
  const color = clamped >= 75 ? 'bg-emerald-500' : clamped >= 50 ? 'bg-amber-500' : 'bg-rose-500'
  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-foreground/80">{label}</span>
        <span className="text-sm font-semibold text-foreground">{clamped}</span>
      </div>
      <div className="h-2 rounded-full bg-black/5 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  )
}

function TagList({ items, tone = 'default' }: { items: string[]; tone?: 'default' | 'warning' }) {
  const toneClasses = tone === 'warning'
    ? 'bg-amber-50 text-amber-800 border-amber-200'
    : 'bg-violet-50 text-violet-700 border-violet-200'
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item, i) => (
        <span key={i} className={`text-xs font-medium px-2.5 py-1 rounded-full border ${toneClasses}`}>
          {item}
        </span>
      ))}
    </div>
  )
}

function ChecklistRow({ label, done }: { label: string; done: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${done ? 'bg-emerald-500 text-white' : 'bg-black/10 text-black/40'}`}>
        {done ? '✓' : '✕'}
      </span>
      <span className={`text-sm ${done ? 'text-foreground/85' : 'text-muted-foreground'}`}>{label}</span>
    </div>
  )
}

export default function DocumentWorkspace({ document, onBack }: DocumentWorkspaceProps) {
  const [analysis, setAnalysis] = useState<any>(null)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [relatedDocs, setRelatedDocs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [messages, setMessages] = useState<any[]>([])
  const [input, setInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [previewFailed, setPreviewFailed] = useState(false)
  const [imageZoomed, setImageZoomed] = useState(false)
  const [openingOriginal, setOpeningOriginal] = useState(false)

  const handleOpenOriginal = async () => {
    setOpeningOriginal(true)
    try {
      const token = getStoredSession()?.token
      await fetch(`http://localhost:3001/api/workspace/document/${document.id}/open`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      })
    } catch (err) {
      console.error('Failed to open original file', err)
    } finally {
      setTimeout(() => setOpeningOriginal(false), 1200)
    }
  }

  const previewKind = getPreviewKind(document.filename)
  const fileUrl = getDocumentFileUrl(document.id)

  const fetchAnalysis = async () => {
    setLoading(true)
    setAnalysisError(null)
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
      } else if (res.status === 409) {
        setAnalysisError('This file is still being processed (re-indexing or extracting text). Try refreshing in a minute.')
      } else {
        setAnalysisError(data.error || 'Analysis is temporarily unavailable.')
      }

      // Fetch related documents
      try {
        const searchQ = (data.data?.summary || document.filename).substring(0, 50)
        const related = await searchWorkspace(searchQ, 'semantic', 5) as any[]
        setRelatedDocs(related.filter(r => r.id !== document.id && r.metadata?.file_id !== document.id))
      } catch (e) {}

    } catch (err) {
      console.error('Failed to load analysis', err)
      setAnalysisError('Could not reach the server. Check that it is running and try again.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAnalysis()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [document.id])

  const sendMessageText = async (text: string) => {
    if (!text.trim() || isSending) return
    setIsSending(true)

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

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    await sendMessageText(input.trim())
  }

  const RESUME_QUICK_ACTIONS = [
    'Improve my resume',
    'Increase my ATS score',
    'Rewrite my project descriptions',
    'Generate interview questions',
    'Generate HR questions',
    'Suggest skills I should learn',
    'Tailor this resume for Google',
    'Tailor this resume for Infosys',
    'Generate a cover letter',
    'Generate my LinkedIn About section',
    'Generate an elevator pitch',
  ]

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

  const renderResumeAnalysis = () => {
    const a = analysis || {}
    const hasNewSchema = !!a.atsScores || !!a.candidateOverview

    if (!hasNewSchema) {
      // Old cached analysis (pre-upgrade schema) - keep working until it's
      // regenerated, rather than showing a blank dashboard.
      return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="col-span-1 md:col-span-2">
            {renderSection('Professional Summary', a.summary)}
          </div>
          <div>
            {renderSection('ATS Score', a.atsScore ? `${a.atsScore}/100` : null)}
            {renderSection('Education', a.education, true)}
            {renderSection('Skills', a.skills, true)}
            {renderSection('Strengths', a.strengths, true)}
            {renderSection('Missing Skills', a.missingSkills, true)}
          </div>
          <div>
            {renderSection('Experience', a.experience, true)}
            {renderSection('Projects', a.projects, true)}
            {renderSection('Certifications & Achievements', a.achievements, true)}
            {renderSection('Interview Questions', a.interviewQuestions, true)}
            {renderSection('Improvement Suggestions', a.improvements, true)}
          </div>
        </div>
      )
    }

    const overview = a.candidateOverview || {}
    const scores = a.atsScores || {}
    const skills = a.skillsBreakdown || {}
    const completeness = a.completeness || {}

    const scoreLabels: [string, string][] = [
      ['formatting', 'Formatting'],
      ['keywordCoverage', 'Keyword Coverage'],
      ['readability', 'Readability'],
      ['sectionCompleteness', 'Section Completeness'],
      ['experienceStrength', 'Experience Strength'],
      ['technicalSkills', 'Technical Skills'],
      ['projectQuality', 'Project Quality'],
      ['achievements', 'Achievements'],
      ['recruiterFriendliness', 'Recruiter Friendliness'],
    ]

    const skillGroups: [string, string][] = [
      ['languages', 'Programming Languages'],
      ['frameworks', 'Frameworks'],
      ['libraries', 'Libraries'],
      ['databases', 'Databases'],
      ['cloud', 'Cloud'],
      ['tools', 'Tools'],
      ['softSkills', 'Soft Skills'],
    ]

    const completenessLabels: [string, string][] = [
      ['contactDetails', 'Contact Details'],
      ['email', 'Email'],
      ['phone', 'Phone'],
      ['github', 'GitHub'],
      ['linkedin', 'LinkedIn'],
      ['projects', 'Projects'],
      ['skills', 'Skills'],
      ['experience', 'Experience'],
      ['achievements', 'Achievements'],
      ['publications', 'Publications'],
      ['portfolio', 'Portfolio'],
      ['openSource', 'Open Source'],
    ]

    return (
      <div className="space-y-6">
        {/* Candidate Overview */}
        <div className="p-5 glass-card rounded-2xl bg-white/60">
          <h3 className="font-semibold text-lg text-foreground mb-4 border-b border-black/5 pb-2">Candidate Overview</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              ['Name', overview.name],
              ['Current Role', overview.currentRole],
              ['Education', overview.education],
              ['Experience', overview.totalExperience],
              ['Total Skills', overview.totalSkills],
              ['Total Projects', overview.totalProjects],
              ['Certifications', overview.certifications],
              ['Contact', overview.contactComplete ? 'Complete' : 'Incomplete'],
              ...(a.pageCount ? [['Length', `${a.pageCount} page${a.pageCount > 1 ? 's' : ''}`]] : []),
            ].map(([label, value]) => (
              <div key={label as string}>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className={`text-sm font-medium mt-0.5 ${label === 'Length' && Number(a.pageCount) > 1 ? 'text-amber-600' : 'text-foreground'}`}>
                  {value || value === 0 ? String(value) : '—'}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* ATS Score */}
        <div className="p-5 glass-card rounded-2xl bg-white/60">
          <div className="flex items-center justify-between border-b border-black/5 pb-2 mb-4">
            <h3 className="font-semibold text-lg text-foreground">ATS Score</h3>
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl font-bold ${(scores.overall || 0) >= 75 ? 'text-emerald-600' : (scores.overall || 0) >= 50 ? 'text-amber-600' : 'text-rose-600'}`}>
                {scores.overall ?? '—'}
              </span>
              <span className="text-sm text-muted-foreground">/ 100</span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-4 leading-relaxed">
            AI-estimated score based on formatting, keyword coverage, and content quality in this resume - not a certified score from an official ATS system (no such single standard exists; every tool scores differently). Use it directionally to spot what to improve, not as a guaranteed pass/fail number.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
            {scoreLabels.map(([key, label]) => (
              scores[key] !== undefined ? <ScoreBar key={key} label={label} score={scores[key]} /> : null
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Strengths & Weaknesses */}
          {a.strengths?.length > 0 && (
            <div className="p-5 glass-card rounded-2xl bg-white/60">
              <h3 className="font-semibold text-lg text-foreground mb-3 border-b border-black/5 pb-2">Strengths</h3>
              <ul className="space-y-1.5">
                {a.strengths.map((s: string, i: number) => (
                  <li key={i} className="text-sm text-foreground/80 flex gap-2"><span className="text-emerald-500">✓</span>{s}</li>
                ))}
              </ul>
            </div>
          )}
          {a.weaknesses?.length > 0 && (
            <div className="p-5 glass-card rounded-2xl bg-white/60">
              <h3 className="font-semibold text-lg text-foreground mb-3 border-b border-black/5 pb-2">Weaknesses</h3>
              <ul className="space-y-1.5">
                {a.weaknesses.map((s: string, i: number) => (
                  <li key={i} className="text-sm text-foreground/80 flex gap-2"><span className="text-amber-500">!</span>{s}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Missing Keywords */}
        {a.missingKeywords?.length > 0 && (
          <div className="p-5 glass-card rounded-2xl bg-white/60">
            <h3 className="font-semibold text-lg text-foreground mb-3 border-b border-black/5 pb-2">Missing Keywords</h3>
            <TagList items={a.missingKeywords} tone="warning" />
          </div>
        )}

        {/* Skills Breakdown */}
        {Object.values(skills).some((v: any) => Array.isArray(v) && v.length > 0) && (
          <div className="p-5 glass-card rounded-2xl bg-white/60">
            <h3 className="font-semibold text-lg text-foreground mb-4 border-b border-black/5 pb-2">Skills Breakdown</h3>
            <div className="space-y-4">
              {skillGroups.map(([key, label]) => (
                skills[key]?.length > 0 ? (
                  <div key={key}>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1.5">{label}</p>
                    <TagList items={skills[key]} />
                  </div>
                ) : null
              ))}
            </div>
          </div>
        )}

        {/* Resume Suggestions */}
        {a.suggestions?.length > 0 && (
          <div className="p-5 glass-card rounded-2xl bg-white/60">
            <h3 className="font-semibold text-lg text-foreground mb-4 border-b border-black/5 pb-2">Resume Suggestions</h3>
            <div className="space-y-4">
              {a.suggestions.map((s: any, i: number) => (
                <div key={i} className="rounded-xl bg-black/[0.02] p-4">
                  <p className="text-xs text-rose-500 font-semibold mb-1">Before</p>
                  <p className="text-sm text-foreground/70 mb-2">{s.before}</p>
                  <p className="text-xs text-emerald-600 font-semibold mb-1">After</p>
                  <p className="text-sm text-foreground/90 mb-2">{s.after}</p>
                  {s.reason && <p className="text-xs text-muted-foreground italic">Why: {s.reason}</p>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Project Improvements */}
        {a.projectImprovements?.length > 0 && (
          <div className="p-5 glass-card rounded-2xl bg-white/60">
            <h3 className="font-semibold text-lg text-foreground mb-4 border-b border-black/5 pb-2">Project Improvement</h3>
            <div className="space-y-5">
              {a.projectImprovements.map((p: any, i: number) => (
                <div key={i} className="rounded-xl bg-black/[0.02] p-4">
                  <p className="font-medium text-foreground mb-3">{p.title}</p>
                  <div className="space-y-2.5 text-sm">
                    <div><span className="text-xs uppercase text-muted-foreground">Current</span><p className="text-foreground/70">{p.current}</p></div>
                    <div><span className="text-xs uppercase text-muted-foreground">Improved Bullet</span><p className="text-foreground/85">{p.improvedBullet}</p></div>
                    <div><span className="text-xs uppercase text-muted-foreground">ATS Optimized</span><p className="text-foreground/85">{p.atsOptimized}</p></div>
                    <div><span className="text-xs uppercase text-muted-foreground">Recruiter Friendly</span><p className="text-foreground/85">{p.recruiterFriendly}</p></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Completeness Checklist */}
          {Object.keys(completeness).length > 0 && (
            <div className="p-5 glass-card rounded-2xl bg-white/60">
              <h3 className="font-semibold text-lg text-foreground mb-3 border-b border-black/5 pb-2">Resume Completeness</h3>
              <div className="grid grid-cols-2 gap-x-4">
                {completenessLabels.map(([key, label]) => (
                  completeness[key] !== undefined ? <ChecklistRow key={key} label={label} done={!!completeness[key]} /> : null
                ))}
              </div>
            </div>
          )}

          {/* AI Recommendations */}
          {a.recommendations?.length > 0 && (
            <div className="p-5 glass-card rounded-2xl bg-white/60">
              <h3 className="font-semibold text-lg text-foreground mb-3 border-b border-black/5 pb-2">AI Recommendations</h3>
              <ul className="space-y-1.5">
                {a.recommendations.map((r: string, i: number) => (
                  <li key={i} className="text-sm text-foreground/80 flex gap-2"><Sparkles className="w-3.5 h-3.5 mt-0.5 shrink-0 text-violet-500" />{r}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Likely Interview Questions */}
        {a.interviewQuestions?.length > 0 && (
          <div className="p-5 glass-card rounded-2xl bg-white/60">
            <h3 className="font-semibold text-lg text-foreground mb-4 border-b border-black/5 pb-2">Likely Interview Questions</h3>
            <div className="space-y-3">
              {a.interviewQuestions.map((q: any, i: number) => (
                <div key={i} className="rounded-xl bg-black/[0.02] p-3.5">
                  <p className="text-sm text-foreground/90">{q.question}</p>
                  {q.basedOn && <p className="text-xs text-violet-600 mt-1">Based on: {q.basedOn}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

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

  const renderPresentationAnalysis = () => (
    <div className="grid grid-cols-1 gap-6">
      {renderSection('Slide Summary', analysis?.slideSummary)}
      {renderSection('Important Topics', analysis?.importantTopics, true)}
      {renderSection('Key Points', analysis?.keyPoints, true)}
    </div>
  )

  const renderCertificateAnalysis = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        {renderSection('Details', {
          Issuer: analysis?.issuer,
          Candidate: analysis?.candidate,
          'Completion Date': analysis?.completionDate,
        })}
      </div>
      <div>
        {renderSection('Summary', analysis?.summary)}
        {renderSection('Additional Details', analysis?.details, true)}
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
          <div className="max-w-6xl mx-auto px-8 py-5 flex items-center justify-between">
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
        
        <div className="max-w-6xl mx-auto px-8 py-10">
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

          {/* Original File Preview - never forces a download, never copies the file */}
          {!previewFailed && (
            <div className="mb-10 rounded-2xl overflow-hidden border bg-white/60">
              <div className="flex items-center justify-between px-4 py-2 border-b bg-white/70">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Original File</p>
                <div className="flex items-center gap-2">
                  {previewKind === 'image' && (
                    <button
                      onClick={() => setImageZoomed(z => !z)}
                      className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-black/5 transition text-muted-foreground"
                    >
                      {imageZoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
                      {imageZoomed ? 'Fit to screen' : 'Zoom in'}
                    </button>
                  )}
                  <button
                    onClick={handleOpenOriginal}
                    disabled={openingOriginal}
                    className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg hover:bg-black/5 transition text-muted-foreground disabled:opacity-50"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {openingOriginal ? 'Opening...' : 'Open Original'}
                  </button>
                </div>
              </div>

              {previewKind === 'pdf' && (
                <iframe
                  src={fileUrl}
                  title={document.filename}
                  className="w-full h-[88vh]"
                  onError={() => setPreviewFailed(true)}
                />
              )}

              {previewKind === 'image' && (
                <div className={imageZoomed ? 'overflow-auto max-h-[88vh] bg-black/5' : 'bg-black/5'}>
                  <img
                    src={fileUrl}
                    alt={document.filename}
                    onClick={() => setImageZoomed(z => !z)}
                    className={imageZoomed
                      ? 'max-w-none cursor-zoom-out'
                      : 'w-full max-h-[80vh] object-contain cursor-zoom-in'}
                    onError={() => setPreviewFailed(true)}
                  />
                </div>
              )}

              {previewKind === 'csv' && (
                <div className="p-2">
                  {loading ? (
                    <p className="text-sm text-muted-foreground p-4">Loading preview...</p>
                  ) : analysis?.extractedTextPreview ? (
                    renderCsvTable(analysis.extractedTextPreview)
                  ) : (
                    <p className="text-sm text-muted-foreground p-4">Preview not available yet. Use "Ask about this document" to explore its contents.</p>
                  )}
                </div>
              )}

              {previewKind === 'text' && (
                <div className="p-5 max-h-[75vh] overflow-y-auto">
                  {loading ? (
                    <p className="text-sm text-muted-foreground">Loading preview...</p>
                  ) : (
                    <pre className="text-sm text-foreground/85 whitespace-pre-wrap font-mono leading-relaxed">
                      {analysis?.extractedTextPreview || 'Preview not available for this file yet.'}
                    </pre>
                  )}
                </div>
              )}

              {previewKind === 'unrenderable' && (
                <div className="p-6">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Quick preview (extracted content)</p>
                  <p className="text-sm text-foreground/80 whitespace-pre-wrap max-h-[50vh] overflow-y-auto">
                    {loading
                      ? 'Loading preview...'
                      : (analysis?.extractedTextPreview || analysis?.summary || 'Preview not available for this file type. Use "Ask about this document" to explore its contents, or click "Open Original" above to view the real file.')}
                  </p>
                </div>
              )}
            </div>
          )}

          {loading ? (
            <div className="flex flex-col items-center justify-center p-20 gap-4">
              <div className="animate-spin w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full"></div>
              <p className="text-sm text-muted-foreground">
                {document.category === 'resume'
                  ? 'Generating your Resume Intelligence report... this can take up to a minute.'
                  : 'Analyzing document...'}
              </p>
            </div>
          ) : (
            <div>
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                AI Analysis
              </h2>
              {analysisError && (
                <div className="mb-6 p-4 rounded-xl bg-blue-50 border border-blue-200 text-sm text-blue-800 flex items-center justify-between gap-4">
                  <span>{analysisError}</span>
                  <button
                    onClick={fetchAnalysis}
                    className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition"
                  >
                    Retry
                  </button>
                </div>
              )}
              {analysis?.aiUnavailable && (
                <div className="mb-6 p-4 rounded-xl bg-amber-50 border border-amber-200 text-sm text-amber-800 flex items-center justify-between gap-4">
                  <span>
                    {analysis?.quotaExceeded
                      ? "Your Gemini API quota is exhausted for now, so we're showing an extracted text preview instead. This isn't a bug - it resets after some time, or you can check your plan at ai.dev. You can still ask questions in the chat panel."
                      : "Full AI analysis is temporarily unavailable, so we're showing an extracted text preview instead. You can still ask questions in the chat panel."}
                  </span>
                  {!analysis?.quotaExceeded && (
                    <button
                      onClick={fetchAnalysis}
                      className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition"
                    >
                      Retry
                    </button>
                  )}
                </div>
              )}
              {!analysisError && (
                <>
                  {document.category === 'resume' && renderResumeAnalysis()}
                  {(document.category === 'assignment' || document.category === 'document') && renderAssignmentAnalysis()}
                  {document.category === 'research_paper' && renderResearchPaperAnalysis()}
                  {document.category === 'invoice' && renderInvoiceAnalysis()}
                  {document.category === 'image' && renderImageAnalysis()}
                  {document.category === 'presentation' && renderPresentationAnalysis()}
                  {document.category === 'certificate' && renderCertificateAnalysis()}
                  {!['resume', 'assignment', 'document', 'research_paper', 'invoice', 'image', 'presentation', 'certificate'].includes(document.category) && (
                    renderSection('Summary', analysis?.summary)
                  )}
                </>
              )}
              
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
              <p className="text-sm mb-4">I have read this document. What would you like to know?</p>
              {document.category === 'resume' && (
                <div className="flex flex-wrap gap-2 justify-center px-2">
                  {RESUME_QUICK_ACTIONS.map((action, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessageText(action)}
                      className="text-xs px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white/80 hover:text-white transition border border-white/10"
                    >
                      {action}
                    </button>
                  ))}
                </div>
              )}
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
