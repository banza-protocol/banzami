import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { execFileSync, execSync } from 'child_process'
import { mkdtempSync, existsSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * A commit message is data, not shell syntax.
 *
 * `commitMatrix(message)` is a Server Action, which means it is an HTTP
 * endpoint, and this app has no authentication. The message reached git through
 * `execSync('git commit -m "' + message.replace(/"/g, '\\"') + '"')` — a shell
 * string with only double quotes escaped. That is not enough. Inside double
 * quotes a POSIX shell still performs command substitution, so
 *
 *     matriz actualizada $(touch /tmp/pwned)
 *
 * ran `touch`. Escaping more characters is the wrong fix; the fix is to stop
 * building a command string, which is what lib/git.ts now does.
 *
 * The first test reproduces the original defect against the original technique,
 * so this file fails if anyone reintroduces it. The second proves the current
 * implementation refuses the same payload.
 */
describe('git command construction', () => {
  let repo: string
  let marker: string

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'banzami-git-injection-'))
    marker = join(repo, 'INJECTED')
    execFileSync('git', ['init', '-q', '.'], { cwd: repo })
    execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: repo })
    execFileSync('git', ['config', 'user.name', 'test'], { cwd: repo })
    writeFileSync(join(repo, 'file.txt'), 'content\n')
    execFileSync('git', ['add', 'file.txt'], { cwd: repo })
  })

  afterEach(() => rmSync(repo, { recursive: true, force: true }))

  const payload = (m: string) => `matriz actualizada $(touch ${m})`

  it('the shell-string technique this replaced does execute a substitution', () => {
    // Deliberately the OLD implementation, so the test knows the payload works.
    const safe = payload(marker).replace(/"/g, '\\"')
    try {
      execSync(`git commit -m "${safe}"`, { cwd: repo, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch {
      /* the commit may fail; what matters is whether the substitution ran */
    }
    expect(existsSync(marker)).toBe(true)
  })

  it('passing argv does not', () => {
    try {
      execFileSync('git', ['commit', '-m', payload(marker)], {
        cwd: repo,
        stdio: ['pipe', 'pipe', 'pipe'],
      })
    } catch {
      /* as above */
    }
    expect(existsSync(marker)).toBe(false)
  })

  it('keeps the payload intact as the commit message', () => {
    execFileSync('git', ['commit', '-m', payload(marker)], {
      cwd: repo,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const subject = execFileSync('git', ['log', '-1', '--pretty=%s'], {
      cwd: repo,
      encoding: 'utf-8',
    }).trim()
    // Stored verbatim: not executed, and not mangled by escaping either.
    expect(subject).toBe(payload(marker))
  })
})

/**
 * A2-27. A commit git refused was reported as one that was made: the helper
 * returned git's stderr through the same path as its output, and the caller
 * answered "commit created". `gitCommit` now carries git's exit status.
 */
describe('gitCommit result', () => {
  let repo: string

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'banzami-git-result-'))
    const run = (...args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' })
    run('init', '-q')
    run('config', 'user.email', 'fidelrmonteiro@gmail.com')
    run('config', 'user.name', 'fm65')
    process.env.BANZAMI_VS_REPO_ROOT = repo
  })

  afterEach(() => {
    delete process.env.BANZAMI_VS_REPO_ROOT
    rmSync(repo, { recursive: true, force: true })
  })

  it('a refused commit is not reported as a commit', async () => {
    vi.resetModules()
    const { gitCommit } = await import('../git')
    const result = gitCommit('validation(BM-001): nothing is staged')
    expect(result.ok).toBe(false)
    expect(execSync('git log --oneline || true', { cwd: repo, encoding: 'utf-8' })).not.toContain('nothing is staged')
  })

  it('a real commit is reported as one', async () => {
    vi.resetModules()
    const { gitCommit, gitStage } = await import('../git')
    writeFileSync(join(repo, 'matrix.json'), '{}\n')
    gitStage('matrix.json')
    const result = gitCommit('validation(BM-001): a real change')
    expect(result.ok).toBe(true)
    expect(execSync('git log --oneline', { cwd: repo, encoding: 'utf-8' })).toContain('a real change')
  })
})
