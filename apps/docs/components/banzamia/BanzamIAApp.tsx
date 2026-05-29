'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
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
import { GraphExplorerModule } from './modules/GraphExplorerModule'
import { ResearchModule } from './modules/ResearchModule'
import { CertificationCopilotModule } from './modules/CertificationCopilotModule'
import { QualityModule } from './modules/QualityModule'
import { SimulatorModule } from './modules/SimulatorModule'
import { FederationModule } from './modules/FederationModule'
import { MemoryModule } from './modules/MemoryModule'
import { DigitalTwinModule } from './modules/DigitalTwinModule'

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
  | 'graph-explorer'
  | 'research'
  | 'certification-copilot'
  | 'quality'
  | 'simulator'
  | 'federation'
  | 'memory'
  | 'digital-twin'

const MODULE_TITLES: Record<ModuleId, string> = {
  'chat':                  'Chat',
  'operator-builder':      'Operator Builder',
  'conformance':           'Conformance',
  'manifest':              'Manifest Validator',
  'trace':                 'Trace Explainer',
  'sdk':                   'SDK Assistant',
  'rfc-explorer':          'RFC / ADR Explorer',
  'knowledge':             'Knowledge Search',
  'status':                'System Status',
  'graph-explorer':        'Protocol Graph',
  'research':              'Protocol Research',
  'certification-copilot': 'Certification Copilot',
  'quality':               'Quality Dashboard',
  'simulator':             'Protocol Simulator',
  'federation':            'Federation Intelligence',
  'memory':                'Protocol Memory',
  'digital-twin':          'Digital Twin',
}

export function BanzamIAApp() {
  const searchParams = useSearchParams()
  const initialQuestion = searchParams.get('question') ?? undefined
  const autoSubmit = searchParams.get('auto') === '1'

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
      case 'operator-builder':      return <OperatorBuilderModule />
      case 'conformance':           return <ConformanceModule mode={mode} />
      case 'manifest':              return <ManifestModule />
      case 'trace':                 return <TraceModule />
      case 'sdk':                   return <SDKModule />
      case 'rfc-explorer':          return <RFCExplorerModule />
      case 'knowledge':             return <KnowledgeModule />
      case 'status':                return <StatusModule />
      case 'graph-explorer':        return <GraphExplorerModule />
      case 'research':              return <ResearchModule />
      case 'certification-copilot': return <CertificationCopilotModule />
      case 'quality':               return <QualityModule />
      case 'simulator':             return <SimulatorModule />
      case 'federation':            return <FederationModule />
      case 'memory':                return <MemoryModule />
      case 'digital-twin':          return <DigitalTwinModule />
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

        {/* Module content — relative so BanzamIAChat can use absolute inset-0 */}
        <div className="relative min-h-0 flex-1 overflow-hidden">
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
