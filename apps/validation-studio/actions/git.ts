'use server'

import {
  gitCurrentBranch,
  gitStatus,
  gitDiff,
  gitLog,
  gitStage,
  gitCommit,
} from '@/lib/git'
import { MATRIX_REPO_PATH } from '@/lib/matrix'

export async function getGitContext() {
  return {
    branch: gitCurrentBranch(),
    status: gitStatus(),
    log: gitLog(3),
  }
}

export async function getMatrixDiff() {
  return gitDiff(MATRIX_REPO_PATH)
}

export async function commitMatrix(message: string): Promise<{ ok: boolean; output: string }> {
  try {
    gitStage(MATRIX_REPO_PATH)
    const output = gitCommit(message)
    return { ok: true, output }
  } catch (err) {
    return { ok: false, output: String(err) }
  }
}
