'use client'

import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'

interface WelcomeScreenProps {
  onContinue: () => void
}

export default function WelcomeScreen({ onContinue }: WelcomeScreenProps) {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden">
      {/* Premium layered background is inherited from parent */}

      {/* Content wrapper with max width for desktop feel */}
      <motion.div
        className="relative z-10 flex flex-col items-center justify-center w-full max-w-2xl px-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
      >
        {/* Premium AI Symbol - Glowing Neural Core */}
        <motion.div
          className="mb-12 relative"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, duration: 0.8, type: 'spring' }}
        >
          {/* Soft purple glow behind symbol */}
          <div className="absolute inset-0 -z-10">
            <div className="absolute inset-0 rounded-full blur-3xl bg-gradient-to-b from-purple-300/30 to-purple-200/10 scale-150" />
          </div>

          {/* Neural core symbol */}
          <div className="relative w-32 h-32 rounded-full flex items-center justify-center">
            {/* Outer glowing ring */}
            <motion.div
              className="absolute inset-0 rounded-full border-2 border-transparent"
              style={{
                borderImage: 'linear-gradient(135deg, #6D4AFF, #9B5DFF, #6D4AFF) 1',
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
            />

            {/* Middle glowing ring */}
            <motion.div
              className="absolute inset-2 rounded-full border border-purple-400/30"
              animate={{ rotate: -360 }}
              transition={{ duration: 15, repeat: Infinity, ease: 'linear' }}
            />

            {/* Inner core with soft glow */}
            <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-purple-400 to-purple-500 shadow-lg shadow-purple-500/50">
              {/* Subtle inner highlight */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-b from-white/30 to-transparent" />
            </div>
          </div>

          {/* Floating particles around symbol */}
          {[...Array(5)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-1.5 h-1.5 rounded-full bg-purple-400/60"
              initial={{
                x: Math.cos((i / 5) * Math.PI * 2) * 80,
                y: Math.sin((i / 5) * Math.PI * 2) * 80,
              }}
              animate={{
                x: Math.cos((i / 5) * Math.PI * 2 + Math.PI * 0.5) * 100,
                y: Math.sin((i / 5) * Math.PI * 2 + Math.PI * 0.5) * 100,
              }}
              transition={{
                duration: 4 + i,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            />
          ))}
        </motion.div>

        {/* Heading - Very large and powerful */}
        <motion.div
          className="text-center mb-6"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          <h1 className="text-6xl md:text-7xl font-semibold text-foreground tracking-tight leading-tight mb-2">
            NeuroDesk
          </h1>
          <p className="text-xl text-muted-foreground font-normal">
            Your AI-Powered Knowledge System
          </p>
        </motion.div>

        {/* Description */}
        <motion.p
          className="text-center text-base text-muted-foreground max-w-lg mb-8 leading-relaxed"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.6 }}
        >
          Transform how you work with your files, code, and knowledge. NeuroDesk understands everything you create and helps you find what matters.
        </motion.p>

        {/* Premium glass privacy card */}
        <motion.div
          className="glass-card rounded-3xl px-6 py-4 mb-10 max-w-md"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5, duration: 0.6 }}
        >
          <p className="text-sm text-center">
            <span className="font-medium text-foreground">🔒 Privacy First.</span>
            <span className="text-muted-foreground"> Your files never leave your computer.</span>
          </p>
        </motion.div>

        {/* Premium gradient button */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6, duration: 0.6 }}
        >
          <Button
            onClick={onContinue}
            className="px-10 py-3 text-base font-semibold rounded-2xl text-white transition-all duration-300 hover:scale-105 hover:-translate-y-1"
            style={{
              background: 'linear-gradient(135deg, #6D4AFF, #9B5DFF)',
              boxShadow: '0 30px 80px rgba(109, 74, 255, 0.25)',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = '0 30px 80px rgba(109, 74, 255, 0.35)'
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = '0 30px 80px rgba(109, 74, 255, 0.25)'
            }}
          >
            Continue
          </Button>
        </motion.div>
      </motion.div>
    </div>
  )
}
