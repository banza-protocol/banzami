import { redirect } from 'next/navigation'

// Legacy Portuguese route — certification content now lives at /certification
export default function ValidacaoRedirect() {
  redirect('/certification')
}
