import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';
import { readSession } from '@/lib/session';
import { AuthHeader } from '@/components/AuthHeader';
import { LoginForm } from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default async function Entrar() {
  if (await readSession()) redirect('/inicio');
  return (
    <main className="mx-auto min-h-[100dvh] max-w-[460px] px-6 pb-12 pt-12">
      <AuthHeader title="Entrar" subtitle="Com o seu @banza e o PIN." />
      <Suspense><LoginForm /></Suspense>
      <p className="mt-6 text-center text-[14px] font-medium text-ink-soft">
        Ainda não tem conta? <Link href="/criar-conta" className="font-bold text-cherry">Criar conta</Link>
      </p>
    </main>
  );
}
