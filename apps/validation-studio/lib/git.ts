import { execSync } from 'child_process'
import path from 'path'

const REPO_ROOT = path.join(process.cwd(), '../..')

function git(args: string): string {
  try {
    return execSync(`git ${args}`, {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return e.stdout || e.stderr || e.message || String(err)
  }
}

export function gitCurrentBranch(): string {
  return git('branch --show-current').trim()
}

export function gitStatus(): string {
  return git('status --short')
}

export function gitDiff(filepath: string): string {
  return git(`diff -- ${filepath}`)
}

export function gitLog(n = 5): string {
  return git(`log --oneline -${n}`)
}

export function gitStage(filepath: string): void {
  git(`add "${filepath}"`)
}

export function gitCommit(message: string): string {
  // Escape double quotes in message
  const safe = message.replace(/"/g, '\\"')
  return git(`commit -m "${safe}"`)
}
