'use client';

import { useCallback, useState } from 'react';
import { developerApi, ApiError, type ExplorerResponse } from '@/lib/developer-api';

/** What an Explorer refusal says, in the Console's words. */
export function explorerRefusal(e: unknown): string {
  const code = e instanceof ApiError ? e.code : '';
  switch (code) {
    case 'EXPLORER_UNAVAILABLE': return 'O API Explorer não está disponível nesta instalação.';
    case 'EXPLORER_RATE_LIMITED': return 'Demasiados pedidos: no máximo 30 por minuto por projeto. Aguarde um minuto.';
    case 'EXPLORER_INVALID_REQUEST': return 'Um valor do caminho, um parâmetro ou o corpo não servem para esta operação.';
    case 'EXPLORER_OPERATION_UNKNOWN': return 'Esta operação não é executável no API Explorer.';
    case 'EXPLORER_UPSTREAM_UNAVAILABLE': return 'A API Sandbox não respondeu. Tente novamente.';
    case 'FORBIDDEN': return 'O seu papel neste workspace não pode executar pedidos (Owner, Admin ou Developer).';
    default: return 'Não foi possível executar o pedido.';
  }
}

/**
 * Run a published operation for the active Project through developer-api's
 * Explorer broker: a 60-second key scoped to that operation, never in the browser.
 */
export function useExplorer(projectId: string | undefined, csrf: string) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (operation_id: string, input: { path_params?: Record<string, string>; query?: Record<string, string>; body?: unknown; idempotency_key?: string } = {}): Promise<ExplorerResponse> => {
      if (!projectId) throw new ApiError('NOT_FOUND', 404, 'no project');
      setBusy(true);
      try {
        return await developerApi.runExplorerRequest(projectId, { operation_id, ...input }, csrf);
      } finally {
        setBusy(false);
      }
    },
    [projectId, csrf],
  );
  return { run, busy };
}

/** A fresh idempotency key, minted when a form opens — never per attempt. */
export function newIdempotencyKey(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}${Math.random()}`;
  return `${prefix}_${rand.replace(/-/g, '').slice(0, 20)}`;
}
