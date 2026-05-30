'use client'

import { useState } from 'react'

const EXAMPLE_MANIFEST = JSON.stringify({
  operator_id: 'op_example',
  display_name: 'Example Operator',
  environment: 'sandbox',
  simulated: true,
  production_allowed: false,
  certification_level: 2,
  protocol_version: '1.0.0',
  capabilities: {
    supports_wallets: true,
    supports_transfers: true,
    supports_qr: true,
    supports_traces: true,
    supports_settlement: false,
  },
}, null, 2)

interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
  safetyOk: boolean
}

function validateManifest(raw: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { valid: false, errors: ['JSON inválido — verifique a sintaxe'], warnings: [], safetyOk: false }
  }

  const required = ['operator_id', 'display_name', 'environment', 'simulated', 'production_allowed', 'certification_level', 'protocol_version', 'capabilities']
  for (const field of required) {
    if (!(field in parsed)) errors.push(`Campo obrigatório ausente: ${field}`)
  }

  // Safety invariant
  let safetyOk = true
  if (parsed.environment === 'sandbox') {
    if (parsed.simulated !== true) {
      errors.push('SAFETY VIOLATION: operador sandbox deve declarar simulated: true')
      safetyOk = false
    }
    if (parsed.production_allowed !== false) {
      errors.push('SAFETY VIOLATION: operador sandbox deve declarar production_allowed: false')
      safetyOk = false
    }
  }

  const level = parsed.certification_level as number
  if (typeof level !== 'number' || level < 0 || level > 4) {
    errors.push('certification_level deve ser um número entre 0 e 4')
  }

  const caps = parsed.capabilities as Record<string, boolean> | undefined
  if (caps && level >= 2 && !caps.supports_traces) {
    warnings.push('Nível 2 requer supports_traces: true')
  }
  if (caps && level >= 3 && !caps.supports_wallets) {
    warnings.push('Nível 3 requer supports_wallets: true')
  }

  return { valid: errors.length === 0, errors, warnings, safetyOk }
}

export function ManifestModule() {
  const [raw, setRaw] = useState(EXAMPLE_MANIFEST)
  const [result, setResult] = useState<ValidationResult | null>(null)

  const validate = () => setResult(validateManifest(raw))

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-4">
        <div>
          <h2 className="text-lg font-bold text-bia-text mb-1">Manifest Validator</h2>
          <p className="text-sm text-bia-muted">
            Valida o schema de <code className="rounded bg-bia-surface-2 px-1 text-xs text-bia-gold">/.well-known/banzami/operator.json</code> e verifica invariantes de segurança.
          </p>
        </div>

        <textarea
          value={raw}
          onChange={e => setRaw(e.target.value)}
          className="w-full rounded-xl border border-bia-border bg-bia-surface p-4 font-mono text-xs text-bia-text outline-none focus:border-bia-primary/50 resize-y"
          rows={18}
          spellCheck={false}
        />

        <button
          onClick={validate}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-bia-primary px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Validar manifesto
        </button>

        {result && (
          <div className="rounded-xl border border-bia-border bg-bia-surface overflow-hidden">
            {/* Status bar */}
            <div className={`flex items-center gap-3 px-4 py-3 border-b border-bia-border ${
              result.valid ? 'bg-bia-green/5' : 'bg-bia-red/5'
            }`}>
              <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${result.valid ? 'bg-bia-green' : 'bg-bia-red'}`} />
              <span className={`font-semibold text-sm ${result.valid ? 'text-bia-green' : 'text-bia-red'}`}>
                {result.valid ? 'Manifesto válido' : 'Manifesto inválido'}
              </span>
              {!result.safetyOk && (
                <span className="ml-auto rounded-full bg-bia-red/10 border border-bia-red/30 px-2.5 py-0.5 text-xs font-bold text-bia-red">
                  SAFETY VIOLATION
                </span>
              )}
            </div>

            <div className="p-4 space-y-3">
              {result.errors.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-bia-red">Erros</div>
                  {result.errors.map((e, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg bg-bia-red/5 border border-bia-red/20 px-3 py-2 text-xs text-bia-red">
                      <span className="mt-px shrink-0">✗</span>
                      {e}
                    </div>
                  ))}
                </div>
              )}

              {result.warnings.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-widest text-bia-amber">Avisos</div>
                  {result.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2 rounded-lg bg-bia-amber/5 border border-bia-amber/20 px-3 py-2 text-xs text-bia-amber">
                      <span className="mt-px shrink-0">⚠</span>
                      {w}
                    </div>
                  ))}
                </div>
              )}

              {result.valid && (
                <div className="flex items-center gap-2 rounded-lg bg-bia-green/5 border border-bia-green/20 px-3 py-2 text-xs text-bia-green">
                  <span>✓</span>
                  Schema válido — todos os campos obrigatórios presentes, invariantes de segurança respeitados
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
