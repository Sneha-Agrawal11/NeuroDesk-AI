'use client'

import { motion } from 'framer-motion'

interface AnimatedRobotProps {
  size?: 'sm' | 'md' | 'lg'
  variant?: 'floating' | 'thinking' | 'scanning'
}

export default function AnimatedRobot({ size = 'md', variant = 'floating' }: AnimatedRobotProps) {
  const sizeMap = {
    sm: 'w-12 h-12',
    md: 'w-20 h-20',
    lg: 'w-32 h-32',
  }

  return (
    <motion.div
      className={`${sizeMap[size]} relative`}
      animate={
        variant === 'floating'
          ? { y: [0, -12, 0] }
          : variant === 'thinking'
          ? { scale: [1, 1.05, 1], rotate: [0, 3, -3, 0] }
          : { opacity: [0.6, 1, 0.6] }
      }
      transition={{
        duration: variant === 'floating' ? 4 : 2,
        repeat: Infinity,
        ease: 'easeInOut',
      }}
    >
      {/* Robot SVG */}
      <svg
        viewBox="0 0 100 100"
        className="w-full h-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Head */}
        <motion.circle
          cx="50"
          cy="35"
          r="22"
          stroke="currentColor"
          strokeWidth="2"
          className="text-slate-700"
          animate={variant === 'floating' ? { y: [0, -2, 0] } : { y: 0 }}
          transition={{duration: 4, repeat: Infinity, ease: 'easeInOut'}}
        />

        {/* Left Eye */}
        <motion.circle
          cx="40"
          cy="32"
          r="4"
          fill="currentColor"
          className="text-indigo-500"
          animate={variant === 'floating' ? { scaleY: [1, 0.2, 1, 1, 1] } : { scaleY: 1 }}
          transition={{duration: 3, repeat: Infinity, times: [0, 0.4, 0.5, 0.95, 1], ease: 'easeInOut'}}
        />

        {/* Right Eye */}
        <motion.circle
          cx="60"
          cy="32"
          r="4"
          fill="currentColor"
          className="text-indigo-500"
          animate={variant === 'floating' ? { scaleY: [1, 0.2, 1, 1, 1] } : { scaleY: 1 }}
          transition={{duration: 3, repeat: Infinity, times: [0, 0.4, 0.5, 0.95, 1], ease: 'easeInOut'}}
        />

        {/* Antenna */}
        <motion.line
          x1="50"
          y1="10"
          x2="50"
          y2="2"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="text-slate-400"
          animate={variant === 'thinking' ? { rotate: [-5, 5, -5] } : { rotate: 0 }}
          transition={{duration: 0.8, repeat: Infinity, ease: 'easeInOut'}}
          style={{ originX: 50, originY: 10 } as any}
        />

        {/* Body */}
        <motion.rect
          x="32"
          y="58"
          width="36"
          height="28"
          rx="4"
          stroke="currentColor"
          strokeWidth="2"
          className="text-slate-700"
          animate={
            variant === 'floating'
              ? { y: [58, 56, 58] }
              : variant === 'thinking'
              ? { scale: [1, 1.02, 1] }
              : { y: [58, 60, 58] }
          }
          transition={{duration: variant === 'floating' ? 4 : 1.5, repeat: Infinity, ease: 'easeInOut'}}
        />

        {/* Center light */}
        <motion.circle
          cx="50"
          cy="72"
          r="3"
          fill="currentColor"
          className="text-indigo-400"
          animate={variant === 'scanning' ? { scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] } : { scale: 1, opacity: 0.7 }}
          transition={{duration: 1.5, repeat: Infinity, ease: 'easeInOut'}}
        />

        {/* Left Arm */}
        <motion.line
          x1="32"
          y1="68"
          x2="18"
          y2="68"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="text-slate-600"
          animate={variant === 'floating' ? { x2: [18, 20, 18], x1: [32, 34, 32] } : { x2: 18 }}
          transition={{duration: 4, repeat: Infinity, ease: 'easeInOut'}}
        />

        {/* Right Arm */}
        <motion.line
          x1="68"
          y1="68"
          x2="82"
          y2="68"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="text-slate-600"
          animate={variant === 'floating' ? { x2: [82, 80, 82], x1: [68, 66, 68] } : { x2: 82 }}
          transition={{duration: 4, repeat: Infinity, ease: 'easeInOut'}}
        />
      </svg>

      {/* Soft glow background */}
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-br from-indigo-400/20 to-purple-400/20 blur-xl -z-10"
        animate={variant === 'floating' ? { scale: [1, 1.15, 1], opacity: [0.3, 0.5, 0.3] } : { scale: 1 }}
        transition={{duration: 4, repeat: Infinity, ease: 'easeInOut'}}
      />
    </motion.div>
  )
}
