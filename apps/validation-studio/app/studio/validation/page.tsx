import { loadMatrix } from '@/actions/matrix'
import { getGitContext } from '@/actions/git'
import { Studio } from '@/components/Studio'
import { ReadinessDashboard } from '@/components/ReadinessDashboard'
import { computeReadiness } from '@/lib/readiness'

export const dynamic = 'force-dynamic'

export default async function ValidationStudioPage() {
  const [matrix, git] = await Promise.all([loadMatrix(), getGitContext()])
  const readiness = computeReadiness(matrix)
  return (
    <>
      <ReadinessDashboard readiness={readiness} />
      <Studio initialMatrix={matrix} gitBranch={git.branch} gitStatus={git.status} />
    </>
  )
}
