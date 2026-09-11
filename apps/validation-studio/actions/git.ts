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
    // ok comes from git's exit status, not from the fact that it printed
    // something: a refused commit is not a commit (A2-27).
    return gitCommit(message)
  } catch (err) {
    return { ok: false, output: String(err) }
  }
}
