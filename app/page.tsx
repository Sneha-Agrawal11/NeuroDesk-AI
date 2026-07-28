'use client'

import { useEffect, useState } from 'react'
import { ensureDevSession, getWorkspaceStatus, addPermission, triggerWorkspaceScan, type WorkspaceStatus } from '@/lib/api'
import WelcomeScreen from '@/components/screens/WelcomeScreen'
import WorkspacePermission from '@/components/screens/WorkspacePermission'
import WorkspaceBuilder from '@/components/screens/WorkspaceBuilder'
import MainWorkspace from '@/components/screens/MainWorkspace'

type Screen = 'welcome' | 'permission' | 'builder' | 'workspace'

export default function Page() {
  const [screen, setScreen] = useState<Screen>('welcome')
  const [isLoading, setIsLoading] = useState(true)
  const [workspaceStatus, setWorkspaceStatus] = useState<WorkspaceStatus | null>(null)
  const [projectCount, setProjectCount] = useState(0)

  useEffect(() => {
    let cancelled = false

    const bootstrap = async () => {
      try {
        await ensureDevSession().catch(() => {})
        const status = await getWorkspaceStatus().catch(() => null)

        if (cancelled) return
        setWorkspaceStatus(status)

        if (status?.status === 'scanning') {
          setScreen('builder')
        }
      } catch (err) {
        console.error('Session init error:', err)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    bootstrap()
    return () => { cancelled = true }
  }, [])

  const handlePermissionsGranted = async () => {
    // Direct transition to Builder screen without blocking UI
    setScreen('builder')

    try {
      await ensureDevSession().catch(() => {})
      await addPermission('default', 'Default Workspace').catch(() => {})
      await triggerWorkspaceScan().catch(() => {})
    } catch (e) {
      console.warn("Backend API scanning triggered in background", e)
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="w-10 h-10 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-desktop">
      {screen === 'welcome' && (
        <WelcomeScreen onContinue={() => setScreen('permission')} />
      )}
      {screen === 'permission' && (
        <WorkspacePermission onContinue={handlePermissionsGranted} />
      )}
      {screen === 'builder' && (
        <WorkspaceBuilder onComplete={() => setScreen('workspace')} />
      )}
      {screen === 'workspace' && (
        <MainWorkspace />
      )}
    </div>
  )
}