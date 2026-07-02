'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AuthShell } from '@/components/developers/portal/AuthShell';
import { IconEnvelope } from '@/components/developers/portal/icons';

// Login (Email only) — dossier ecrã 1. Auth V1 is Email + OTP: no password,
// phone, Google or name at entry. "Continuar" sends the email to the OTP screen;
// "Entrar" is the demo shortcut straight to the dashboard.

const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';

export default function DevelopersLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('exemplo@empresa.co.ao');

  const goVerify = () => {
    router.push(`/developers/verify?email=${encodeURIComponent(email)}`);
  };

  return (
    <AuthShell>
      <div
        className="bz-view"
        style={{
          width: '100%',
          maxWidth: 428,
          background: '#fff',
          border: '1px solid #F2E2E0',
          borderRadius: 26,
          padding: '40px 38px 34px',
          boxShadow: '0 40px 90px -50px rgba(181,16,31,.5)',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            padding: '6px 13px',
            borderRadius: 30,
            background: '#FFF1F0',
            border: '1px solid #F7DAD7',
            fontSize: 11.5,
            fontWeight: 900,
            letterSpacing: '.05em',
            color: '#B5101F',
            marginBottom: 22,
          }}
        >
          PLATAFORMA DE DEVELOPERS
        </div>
        <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900, letterSpacing: '-.02em', lineHeight: 1.1 }}>
          Bem-vindo(a) 👋
        </h1>
        <p style={{ margin: '12px 0 26px', fontSize: 15, lineHeight: 1.55, color: '#7a6a6e', fontWeight: 600 }}>
          Insira o seu email para continuar com o acesso à plataforma de developers.
        </p>
        <label style={{ display: 'block', fontSize: 13, fontWeight: 800, color: '#6a5a5e', marginBottom: 8 }}>Email</label>
        <input
          className="bz-in"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="exemplo@empresa.co.ao"
          onKeyDown={(e) => {
            if (e.key === 'Enter') goVerify();
          }}
          style={{
            width: '100%',
            padding: '14px 16px',
            border: '1.5px solid #EBDBD9',
            borderRadius: 14,
            fontSize: 15,
            fontWeight: 600,
            color: '#2a2024',
            background: '#FFFDFD',
            outline: 'none',
            transition: 'border-color .16s, box-shadow .16s',
          }}
        />
        <button
          onClick={goVerify}
          className="bz-cta"
          style={{
            width: '100%',
            marginTop: 16,
            padding: 15,
            border: 'none',
            borderRadius: 14,
            background: ctaGradient,
            color: '#fff',
            fontWeight: 800,
            fontSize: 15.5,
            cursor: 'pointer',
            boxShadow: '0 16px 30px -12px rgba(181,16,31,.55)',
          }}
        >
          Continuar
        </button>
        <p
          style={{
            margin: '14px 0 0',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            fontSize: 12.5,
            color: '#9a8a8e',
            fontWeight: 700,
          }}
        >
          <span style={{ color: '#B5101F', display: 'inline-flex' }}>
            <IconEnvelope size={15} />
          </span>
          Vamos enviar um código de verificação para o seu email.
        </p>
        <div style={{ height: 1, background: '#F2E6E4', margin: '24px 0 18px' }} />
        <p style={{ margin: 0, fontSize: 12, lineHeight: 1.55, color: '#a89a9e', fontWeight: 600 }}>
          Ao continuar, concorda com os nossos{' '}
          <Link href="/sobre" style={{ color: '#9A1B22', fontWeight: 800, textDecoration: 'none' }}>
            Termos de Serviço
          </Link>{' '}
          e{' '}
          <Link href="/sobre" style={{ color: '#9A1B22', fontWeight: 800, textDecoration: 'none' }}>
            Política de Privacidade
          </Link>
          .
        </p>
        <p style={{ margin: '16px 0 0', textAlign: 'center', fontSize: 14, fontWeight: 700, color: '#7a6a6e' }}>
          Já tem uma conta?{' '}
          <Link href="/developers/dashboard" style={{ color: '#B5101F', fontWeight: 800, textDecoration: 'none' }}>
            Entrar
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}
