import { redirect } from 'next/navigation'

// Legacy Portuguese route — content now lives at /banzai
export default function SobreBanzAIRedirect() {
  redirect('/banzai')
}
