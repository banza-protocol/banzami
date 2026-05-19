import { loadMatrix } from '@/actions/matrix'
import { getGitContext } from '@/actions/git'
import { Studio } from '@/components/Studio'

export const dynamic = 'force-dynamic'

export default async function ValidationStudioPage() {
  const [matrix, git] = await Promise.all([loadMatrix(), getGitContext()])
  return <Studio initialMatrix={matrix} gitBranch={git.branch} gitStatus={git.status} />
}
