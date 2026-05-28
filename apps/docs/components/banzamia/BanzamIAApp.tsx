'use client'

import { useState } from 'react'
import { isLiveMode, type Citation } from '@/lib/banzamia-client'
import { BanzamIASidebar } from './BanzamIASidebar'
import { BanzamIAChat } from './BanzamIAChat'
import { BanzamIASourcesPanel } from './BanzamIASourcesPanel'
import { ConformanceModule } from './modules/ConformanceModule'
import { ManifestModule } from './modules/ManifestModule'
import { TraceModule } from './modules/TraceModule'
import { SDKModule } from './modules/SDKModule'
import { RFCExplorerModule } from './modules/RFCExplorerModule'
import { KnowledgeModule } from './modules/KnowledgeModule'
import { StatusModule } from './modules/StatusModule'
import { OperatorBuilderModule } from './modules/OperatorBuilderModule'

export type ModuleId =
  | 'chat'
  | 'operator-builder'
  | 'conformance'
  | 'manifest'
  | 'trace'
  | 'sdk'
  | 'rfc-explorer'
  | 'knowledge'
  | 'status'

const MODULE_TITLES: Record<ModuleId, string> = {
  'chat':             'Chat',
  'operator-builder': 'Operator Builder',
  'conformance':      'Conformance',
  'manifest':         'Manifest Validator',
  'trace':            'Trace Explainer',
  'sdk':              'SDK Assistant',
  'rfc-explorer':     'RFC / ADR Explorer',
  'knowledge':        'Knowledge Search',
  'status':           'System Status',
}

interface Props {
  initialQuestion?: string
  autoSubmit?: boolean
}

export function BanzamIAApp({ initialQuestion, autoSubmit }: Props = {}) {
  const [activeModule, setActiveModule] = useState<ModuleId>('chat')
  const [citations, setCitations] = useState<Citation[]>([])
  const [model, setModel] = useState('')
  const [taskType, setTaskType] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)

  const mode = isLiveMode ? 'live' : 'demo'

  const handleModelChange = (m: string, t: string) => {
    setModel(m)
    setTaskType(t)
  }

  const renderModule = () => {
    switch (activeModule) {
      case 'chat':
        return (
          <BanzamIAChat
            onCitationsChange={setCitations}
            onModelChange={handleModelChange}
            onStreamingChange={setIsStreaming}
            initialQuestion={initialQuestion}
            autoSubmit={autoSubmit}
          />
        )
      case 'operator-builder': return <OperatorBuilderModule />
      case 'conformance':      return <ConformanceModule mode={mode} />
      case 'manifest':         return <ManifestModule />
      case 'trace':            return <TraceModule />
      case 'sdk':              return <SDKModule />
      case 'rfc-explorer':     return <RFCExplorerModule />
      case 'knowledge':        return <KnowledgeModule />
      case 'status':           return <StatusModule />
    }
  }

  // Show sources panel only for chat
  const showSources = activeModule === 'chat'

  return (
    <div className="flex h-full bg-bia-bg text-bia-text">
      {/* Left sidebar */}
      <BanzamIASidebar
        active={activeModule}
        onSelect={mod => {
          setActiveModule(mod)
          if (mod !== 'chat') {
            setCitations([])
            setModel('')
            setTaskType('')
          }
        }}
        mode={mode}
      />

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Module header */}
        <div className="flex h-14 shrink-0 items-center border-b border-bia-border bg-bia-surface px-5">
          <span className="text-sm font-semibold text-bia-text">{MODULE_TITLES[activeModule]}</span>
          {activeModule !== 'chat' && (
            <span className="ml-3 rounded-full border border-bia-border bg-bia-surface-2 px-2.5 py-0.5 text-[10px] font-medium text-bia-muted">
              {mode === 'demo' ? 'Demo' : 'Live'}
            </span>
          )}
        </div>

        {/* Module content */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {renderModule()}
        </div>
      </div>

      {/* Right panel — only for chat */}
      {showSources && (
        <BanzamIASourcesPanel
          citations={citations}
          model={model}
          taskType={taskType}
          isStreaming={isStreaming}
          mode={mode}
        />
      )}
    </div>
  )
}
