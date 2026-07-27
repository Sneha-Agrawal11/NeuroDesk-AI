'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Folder, HardDrive, Download, Image, Code, Check, ShieldCheck, Cloud, GitBranch } from 'lucide-react'

interface WorkspacePermissionProps {
  onContinue: () => void | Promise<void>
}

interface PermissionItem {
  id: string
  name: string
  description: string
  icon: any
  enabled: boolean
  isOptional?: boolean
}

export default function WorkspacePermission({ onContinue }: WorkspacePermissionProps) {
  const [permissions, setPermissions] = useState<PermissionItem[]>([
    { id: 'documents', name: 'Documents & Research', description: 'Scan research papers, notes, PDFs, and text docs', icon: Folder, enabled: true },
    { id: 'projects', name: 'Source Code & Repos', description: 'Scan local development projects and codebase', icon: Code, enabled: true },
    { id: 'downloads', name: 'Downloads Directory', description: 'Automatically index newly downloaded resources', icon: Download, enabled: true },
    { id: 'desktop', name: 'Desktop Workspace', description: 'Quick index for active workspace files', icon: HardDrive, enabled: false },
    { id: 'pictures', name: 'Images & Diagrams', description: 'Process visual assets for OCR and graph generation', icon: Image, enabled: false },
    { id: 'gdrive', name: 'Google Drive', description: 'Connect cloud workspace to sync remote documents', icon: Cloud, enabled: false, isOptional: true },
    { id: 'github', name: 'GitHub Repositories', description: 'Link repositories for real-time code knowledge graph', icon: GitBranch, enabled: false, isOptional: true },
  ])

  const [isSubmitting, setIsSubmitting] = useState(false)

  const togglePermission = (id: string) => {
    setPermissions(prev =>
      prev.map(p => (p.id === id ? { ...p, enabled: !p.enabled } : p))
    )
  }

  const handleGrantAndContinue = async () => {
    setIsSubmitting(true)
    try {
      await onContinue()
    } catch (err) {
      console.error("Error setting permissions:", err)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-4 py-12 selection:bg-primary/20">
      {/* Background glow effects */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-primary/10 blur-[120px] rounded-full pointer-events-none" />
      
      <motion.div
        className="relative z-10 w-full max-w-2xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Header Badge & Title */}
        <motion.div
          className="text-center mb-10"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary mb-4 backdrop-blur-md">
            <ShieldCheck className="w-4 h-4" />
            <span>Privacy-First & On-Device Security</span>
          </div>

          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-3">
            System & Cloud Permissions
          </h1>
          <p className="text-base text-muted-foreground max-w-lg mx-auto">
            Choose what NeuroDesk AI can access to build your personalized <strong>Knowledge Graph</strong> and semantic memory.
          </p>
        </motion.div>

        {/* Local Permissions Section */}
        <div className="mb-6">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 mb-3 ml-1">
            Local Storage Access
          </h2>
          <div className="space-y-2.5">
            {permissions.filter(p => !p.isOptional).map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.id}
                  onClick={() => togglePermission(item.id)}
                  className="group relative rounded-2xl p-4 flex items-center justify-between cursor-pointer transition-all duration-300 border hover:shadow-md"
                  style={{
                    background: item.enabled 
                      ? 'rgba(109, 74, 255, 0.06)' 
                      : 'rgba(255, 255, 255, 0.6)',
                    borderColor: item.enabled 
                      ? 'rgba(109, 74, 255, 0.35)' 
                      : 'rgba(0, 0, 0, 0.08)',
                    backdropFilter: 'blur(16px)',
                  }}
                >
                  <div className="flex items-center gap-4">
                    <div
                      className="p-3 rounded-xl transition-transform duration-300 group-hover:scale-105"
                      style={{ 
                        background: item.enabled ? 'rgba(109, 74, 255, 0.15)' : 'rgba(0,0,0,0.04)',
                        color: item.enabled ? '#6D4AFF' : '#6C6C75'
                      }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                        {item.name}
                      </h3>
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <div 
                    className="relative w-11 h-6 rounded-full transition-colors duration-300"
                    style={{ background: item.enabled ? '#6D4AFF' : '#E8E6E1' }}
                  >
                    <motion.div
                      className="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-md flex items-center justify-center"
                      animate={{ x: item.enabled ? 20 : 0 }}
                      transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                    >
                      {item.enabled && <Check className="w-3 h-3 text-[#6D4AFF]" />}
                    </motion.div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Optional Integrations Section */}
        <div className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground/80 mb-3 ml-1 flex items-center justify-between">
            <span>Cloud & Service Integrations</span>
            <span className="text-[10px] bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded-full font-normal">Optional</span>
          </h2>
          <div className="grid md:grid-cols-2 gap-2.5">
            {permissions.filter(p => p.isOptional).map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.id}
                  onClick={() => togglePermission(item.id)}
                  className="relative rounded-2xl p-4 flex flex-col justify-between cursor-pointer transition-all duration-300 border hover:shadow-md"
                  style={{
                    background: item.enabled 
                      ? 'rgba(109, 74, 255, 0.08)' 
                      : 'rgba(255, 255, 255, 0.4)',
                    borderColor: item.enabled 
                      ? 'rgba(109, 74, 255, 0.4)' 
                      : 'rgba(0, 0, 0, 0.08)',
                    backdropFilter: 'blur(16px)',
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className="p-2.5 rounded-xl"
                      style={{ 
                        background: item.enabled ? 'rgba(109, 74, 255, 0.2)' : 'rgba(0,0,0,0.04)',
                        color: item.enabled ? '#6D4AFF' : '#6C6C75'
                      }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>

                    <div 
                      className="relative w-10 h-5 rounded-full transition-colors duration-300"
                      style={{ background: item.enabled ? '#6D4AFF' : '#E8E6E1' }}
                    >
                      <motion.div
                        className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow-sm flex items-center justify-center"
                        animate={{ x: item.enabled ? 20 : 0 }}
                        transition={{ type: 'spring', stiffness: 350, damping: 25 }}
                      >
                        {item.enabled && <Check className="w-2.5 h-2.5 text-[#6D4AFF]" />}
                      </motion.div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{item.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Action Button */}
        <Button
          onClick={handleGrantAndContinue}
          disabled={isSubmitting}
          className="w-full py-4 text-base font-semibold rounded-2xl text-white transition-all duration-300 hover:scale-[1.01] active:scale-[0.99]"
          style={{
            background: 'linear-gradient(135deg, #14B86A 0%, #0D9659 100%)',
            boxShadow: '0 20px 40px rgba(20, 184, 106, 0.25)',
          }}
        >
          {isSubmitting ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              Initializing Security Session...
            </span>
          ) : (
            'Grant Permissions & Continue'
          )}
        </Button>
      </motion.div>
    </div>
  )
}