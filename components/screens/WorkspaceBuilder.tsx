'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { FileText, Code, BookOpen, Brain, Zap, CheckCircle2, ArrowRight } from 'lucide-react'
import { getWorkspaceStatus } from '@/lib/api'
import { Button } from '@/components/ui/button'

interface WorkspaceBuilderProps {
  onComplete: () => void
}

const steps = [
  { label: 'Reading files', icon: FileText, color: '#6D4AFF' },
  { label: 'Analyzing code', icon: Code, color: '#7F5AF0' },
  { label: 'Processing documents', icon: BookOpen, color: '#6D4AFF' },
  { label: 'Building index', icon: Brain, color: '#7F5AF0' },
  { label: 'Creating search', icon: Zap, color: '#6D4AFF' },
  { label: 'Finalizing', icon: CheckCircle2, color: '#14B86A' },
]

export default function WorkspaceBuilder({ onComplete }: WorkspaceBuilderProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [isComplete, setIsComplete] = useState(false)
  const [statusLabel, setStatusLabel] = useState('Scanning your workspace...')

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false

    const poll = async () => {
      try {
        const status = await getWorkspaceStatus()
        if (cancelled) return
        setStatusLabel(`Workspace status: ${status.status}`)

        if (status.status === 'ready' || status.status === 'created') {
          setCurrentStep(steps.length)
          setIsComplete(true)
          timer = setTimeout(onComplete, 800)
          return
        }

        setCurrentStep(prev => {
          const next = prev + 1
          if (next >= steps.length) {
            setIsComplete(true)
            setStatusLabel('Workspace setup complete!')
            timer = setTimeout(onComplete, 1200)
          }
          return Math.min(steps.length, next)
        })
      } catch {
        if (!cancelled) {
          setStatusLabel('Finalizing workspace setup...')
          setCurrentStep(prev => {
            const next = prev + 1
            if (next >= steps.length) {
              setIsComplete(true)
              setStatusLabel('Workspace setup complete!')
              timer = setTimeout(onComplete, 1200)
            }
            return Math.min(steps.length, next)
          })
        }
      }

      if (!isComplete) {
        timer = setTimeout(poll, 1200)
      }
    }

    poll()

    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [onComplete])

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden px-4">
      <motion.div
        className="relative z-10 flex flex-col items-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Magical AI Core */}
        <motion.div className="mb-12 relative w-36 h-36 flex items-center justify-center" initial={{ scale: 0.8 }} animate={{ scale: 1 }} transition={{ delay: 0.2, type: 'spring' }}>
          <motion.div
            className="absolute inset-0 rounded-full border-2 border-transparent"
            style={{ borderImage: 'linear-gradient(135deg, #6D4AFF, #9B5DFF, #14B86A) 1' }}
            animate={{ rotate: 360 }}
            transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
          />

          <div className="absolute inset-4 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 shadow-xl shadow-purple-500/40 flex items-center justify-center">
            <motion.div
              className="text-3xl text-white font-bold"
              animate={{ rotate: isComplete ? 360 : 0, scale: isComplete ? 1.2 : 1 }}
              transition={{ duration: 0.5 }}
            >
              {isComplete ? '✓' : '⚡'}
            </motion.div>
          </div>
        </motion.div>

        {/* Status text */}
        <motion.div
          className="text-center mb-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-2">Setting up your workspace</h2>
          <p className="text-sm text-muted-foreground">{statusLabel}</p>
        </motion.div>

        {/* Steps */}
        <motion.div className="w-full max-w-md space-y-2 mb-6" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
          {steps.map((step, idx) => {
            const StepIcon = step.icon
            const isActive = idx === currentStep
            const isStepDone = idx < currentStep || isComplete

            return (
              <motion.div
                key={idx}
                className="flex items-center gap-4 rounded-xl transition-all duration-300"
                style={{
                  padding: '12px 16px',
                  background: isStepDone
                    ? 'rgba(20, 184, 106, 0.08)'
                    : isActive
                      ? 'rgba(109, 74, 255, 0.1)'
                      : 'rgba(255, 255, 255, 0.4)',
                }}
              >
                <div className="flex-shrink-0">
                  <StepIcon
                    className="w-5 h-5"
                    style={{ color: isStepDone ? '#14B86A' : isActive ? step.color : '#6C6C75' }}
                  />
                </div>

                <span className={`text-sm font-medium flex-1 ${isStepDone ? 'text-green-600 font-semibold' : isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {step.label}
                </span>

                {isStepDone && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="flex-shrink-0"
                  >
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  </motion.div>
                )}
              </motion.div>
            )
          })}
        </motion.div>

        {/* Progress bar */}
        <div className="w-full max-w-md h-1.5 rounded-full overflow-hidden mb-8 bg-black/5 dark:bg-white/10">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: isComplete ? '#14B86A' : 'linear-gradient(90deg, #6D4AFF, #9B5DFF)',
            }}
            animate={{ width: `${Math.min(100, ((currentStep + (isComplete ? 1 : 0)) / steps.length) * 100)}%` }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          />
        </div>

        {/* Continue / Complete Action */}
        <motion.div className="flex flex-col items-center gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Button
            onClick={onComplete}
            className="px-8 py-3 rounded-2xl bg-primary text-white font-semibold shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-2"
          >
            <span>Go to Workspace Dashboard</span>
            <ArrowRight className="w-4 h-4" />
          </Button>
        </motion.div>
      </motion.div>
    </div>
  )
}