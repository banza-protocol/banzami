import Link from 'next/link';
import { redirect } from 'next/navigation';
import { readSession } from '@/lib/session';
import { AuthHeader } from '@/components/AuthHeader';
import { RegisterForm } from '@/components/RegisterForm';

export const dynamic = 'force-dynamic';

export default async function CriarConta() {
  if (await readSession()) redirect('/inicio');
  return (
    <main className="mx-auto min-h-[100dvh] max-w-[460px] px-6 pb-12 pt-12">
      <AuthHeader title="Criar conta" subtitle="Escolha o seu @banza e um PIN. Começa com saldo de teste." />
      <RegisterForm />
      <p className="mt-6 text-center text-[14px] font-medium text-ink-soft">
        Já tem conta? <Link href="/entrar" className="font-bold text-cherry">Entrar</Link>
      </p>
    </main>
  );
}
