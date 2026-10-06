import type { CSSProperties, ReactNode } from 'react';
import { type Lang, type Loc } from '@/lib/marketing/nav';
import { DeletionRequestForm } from '../DeletionRequestForm';

/**
 * /supressao-de-conta — the public account-deletion page for Banzami (the app
 * store / data-rights deletion URL). It explains the deletion right, how to
 * exercise it in the app and through this web request form, what is deleted and
 * what is retained and why, and the Beta Sandbox behaviour. Body only: the shared
 * SiteShell provides header + footer + page background.
 *
 * Editorial rules: Banzami is feminine ("a Banzami"); no em/en dashes.
 */

const L = (pt: string, en: string): Loc => ({ pt, en });

const T = {
  badge: L('Direitos de dados', 'Data rights'),
  h1a: L('Supressão de', 'Account'),
  h1b: L('conta.', 'deletion.'),
  lead: L(
    'Pode pedir a eliminação da sua conta Banzami a qualquer momento, a partir da app ou através deste formulário. Explicamos o que é eliminado, o que é conservado por obrigação legal, e como fazer o pedido.',
    'You can ask to delete your Banzami account at any time, from the app or through this form. We explain what is deleted, what is kept for legal reasons, and how to make the request.',
  ),
  tocTitle: L('ÍNDICE', 'CONTENTS'),
};

// Section content as localized blocks.
type Block = { p: Loc } | { ul: Loc[] };

const SECTIONS: { id: string; n: string; title: Loc; body: Block[] }[] = [
  {
    id: 'o-que-e',
    n: '01',
    title: L('O que é a supressão de conta', 'What account deletion is'),
    body: [
      {
        p: L(
          'A Banzami é a operadora de referência da rede de pagamentos construída sobre o protocolo BANZA. A supressão de conta encerra o seu acesso e torna a conta inutilizável: o início de sessão deixa de funcionar, as sessões activas são revogadas, o seu @banza é retirado e os dados pessoais que podemos eliminar são removidos ou anonimizados.',
          'Banzami is the reference operator of the payments network built on the BANZA protocol. Account deletion closes your access and makes the account unusable: sign-in stops working, active sessions are revoked, your @banza is retired, and the personal data we are allowed to delete is removed or anonymised.',
        ),
      },
      {
        p: L(
          'Alguns registos financeiros, de auditoria e de conformidade são conservados, porque a lei e as regras de integridade do sistema de pagamentos assim o exigem. A conta fica encerrada, não apagada sem rasto.',
          'Some financial, audit and compliance records are retained, because the law and the payment system integrity rules require it. The account is closed, not erased without trace.',
        ),
      },
    ],
  },
  {
    id: 'nao-e',
    n: '02',
    title: L('Terminar sessão não é supressão', 'Signing out is not deletion'),
    body: [
      {
        p: L(
          'Três acções diferentes, com nomes diferentes. Terminar sessão e "Remover deste dispositivo" afectam apenas este telemóvel; a conta continua a existir e pode voltar a iniciar sessão. Só a supressão encerra a conta.',
          'Three different actions, with different names. Signing out and "Remove from this device" affect only this phone; the account still exists and you can sign in again. Only deletion closes the account.',
        ),
      },
      {
        ul: [
          L(
            'Terminar sessão: sai da conta neste dispositivo. A conta mantém-se.',
            'Sign out: leaves the account on this device. The account stays.',
          ),
          L(
            'Remover deste dispositivo: apaga os dados guardados localmente. A conta mantém-se.',
            'Remove from this device: clears the locally stored data. The account stays.',
          ),
          L(
            'Suprimir conta: encerra a conta de forma definitiva, como descrito nesta página.',
            'Delete account: closes the account permanently, as described on this page.',
          ),
        ],
      },
    ],
  },
  {
    id: 'como-pedir',
    n: '03',
    title: L('Como pedir a supressão', 'How to request deletion'),
    body: [
      {
        p: L(
          'Na app (recomendado): em Definições, na secção Conta, escolha "Suprimir conta" (ou "Suprimir conta Business" na app de negócio). Confirma com o seu PIN e o pedido é aplicado de imediato na Sandbox.',
          'In the app (recommended): in Settings, under Account, choose "Delete account" (or "Delete Business account" in the business app). You confirm with your PIN and the request takes effect immediately in the Sandbox.',
        ),
      },
      {
        p: L(
          'Se já não tem a app instalada, use o formulário abaixo. Indica o seu @banza e um e-mail de contacto; enviamos um código para confirmar que controla o e-mail. Nunca lhe pedimos o PIN por e-mail ou neste formulário.',
          'If you no longer have the app installed, use the form below. You give your @banza and a contact email; we send a code to confirm you control the email. We never ask for your PIN by email or on this form.',
        ),
      },
      {
        p: L(
          'Confirmar o e-mail não é prova de que a conta é sua. Por isso, um pedido feito aqui é verificado pela equipa, que confirma a titularidade antes de o executar.',
          'Confirming the email is not proof that the account is yours. So a request made here is reviewed by the team, who verifies ownership before executing it.',
        ),
      },
    ],
  },
  {
    id: 'eliminamos',
    n: '04',
    title: L('Que dados eliminamos', 'What data we delete'),
    body: [
      {
        ul: [
          L(
            'O nome de apresentação e outros dados de perfil que possamos remover.',
            'The display name and other profile data we can remove.',
          ),
          L(
            'Os registos dos seus dispositivos associados à conta.',
            'The records of your devices associated with the account.',
          ),
          L(
            'As credenciais de início de sessão e as sessões activas, que são revogadas.',
            'The sign-in credentials and active sessions, which are revoked.',
          ),
          L(
            'O seu @banza, que é retirado para não poder ser reutilizado nem usado para o fazer passar por si.',
            'Your @banza, which is retired so it cannot be reused or used to impersonate you.',
          ),
        ],
      },
    ],
  },
  {
    id: 'conservamos',
    n: '05',
    title: L('Que dados conservamos e porquê', 'What data we retain and why'),
    body: [
      {
        p: L(
          'Determinados registos não podem ser eliminados com a conta, por razões legais e de integridade do sistema de pagamentos:',
          'Certain records cannot be deleted with the account, for legal and payment system integrity reasons:',
        ),
      },
      {
        ul: [
          L(
            'Registo financeiro (livro-razão, transferências, pagamentos, liquidações, reembolsos): imutável por conceção e necessário para reconciliação e prestação de contas.',
            'Financial records (ledger, transfers, payments, settlements, refunds): immutable by design and needed for reconciliation and accountability.',
          ),
          L(
            'Registos de auditoria e comprovativos de transação: a trilha que prova o que aconteceu.',
            'Audit records and transaction proofs: the trail that proves what happened.',
          ),
          L(
            'Dados de conformidade (KYC e KYB) quando existam: conservados pelo período de retenção aplicável.',
            'Compliance data (KYC and KYB) where it exists: retained for the applicable retention period.',
          ),
          L(
            'Sinais de risco, fraude e segurança, mantidos como referência sem o identificar diretamente.',
            'Risk, fraud and security signals, kept as a reference without directly identifying you.',
          ),
        ],
      },
      {
        p: L(
          'Estes registos deixam de estar ligados a uma conta utilizável. Os prazos e critérios exatos de conservação estão descritos na Política de Privacidade.',
          'These records are no longer tied to a usable account. The exact retention periods and criteria are described in the Privacy Policy.',
        ),
      },
    ],
  },
  {
    id: 'sandbox',
    n: '06',
    title: L('Na Beta Sandbox', 'In the Beta Sandbox'),
    body: [
      {
        p: L(
          'A Banzami está em Beta Sandbox: o dinheiro é fictício e não há operações com dinheiro real. Ao suprimir a conta, qualquer saldo fictício é retirado por lançamentos equilibrados no livro-razão, que nunca é alterado diretamente. O efeito é imediato: a conta fica inutilizável de imediato.',
          'Banzami is in Beta Sandbox: the money is fictitious and there are no real-money operations. When you delete the account, any test balance is retired through balanced ledger postings, which the ledger never alters directly. The effect is immediate: the account becomes unusable at once.',
        ),
      },
    ],
  },
  {
    id: 'contacto',
    n: '07',
    title: L('Contacto', 'Contact'),
    body: [
      {
        p: L(
          'Para qualquer questão sobre a supressão da sua conta ou os seus direitos de dados, escreva para contact@banzami.com.',
          'For any question about deleting your account or your data rights, write to contact@banzami.com.',
        ),
      },
    ],
  },
];

const secStyle: CSSProperties = {
  scrollMarginTop: '110px', background: '#fff', border: '1px solid #F3E3E1', borderRadius: '24px',
  padding: 'clamp(22px,3vw,34px)', marginBottom: '14px', boxShadow: '0 24px 50px -44px rgba(122,16,22,.4)',
};
const h2Style: CSSProperties = {
  margin: 0, display: 'flex', alignItems: 'baseline', gap: '12px', fontSize: 'clamp(20px,2vw,24px)',
  fontWeight: 900, letterSpacing: '-.02em', color: '#141014',
};
const numStyle: CSSProperties = { fontFamily: "'JetBrains Mono',monospace", fontSize: '13px', fontWeight: 600, color: '#B5101F' };
const bodyStyle: CSSProperties = { marginTop: '12px', fontSize: '15px', lineHeight: 1.7, fontWeight: 600, color: '#5a4a4e' };
const pStyle: CSSProperties = { margin: '0 0 12px', textWrap: 'pretty' };
const ulStyle: CSSProperties = { margin: '0 0 12px', paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '6px' };

function renderBlocks(body: Block[], lang: Lang): ReactNode {
  return body.map((b, i) =>
    'ul' in b ? (
      <ul key={i} style={ulStyle}>{b.ul.map((it, j) => <li key={j}>{it[lang]}</li>)}</ul>
    ) : (
      <p key={i} style={pStyle}>{b.p[lang]}</p>
    ),
  );
}

export function SupressaoDeContaPage({ lang }: { lang: Lang }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: '.bz-toc a:hover{background:#FFF1F0;color:#B5101F}' }} />

      {/* ═══════════════ HERO ═══════════════ */}
      <section id="inicio" style={{ position: 'relative', padding: '128px 24px 56px', overflow: 'hidden' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', right: '-8%', top: '-20%', width: '640px', height: '640px', borderRadius: '50%', background: 'radial-gradient(circle,rgba(251,210,208,.75),rgba(251,210,208,0) 68%)' }} />
        </div>
        <div style={{ position: 'relative', maxWidth: '1180px', margin: '0 auto' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '7px 14px', borderRadius: '40px', background: '#fff', border: '1px solid #F3D3D0', fontSize: '12px', fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#B5101F' }}>{T.badge[lang]}</span>
          <h1 style={{ margin: '20px 0 0', fontSize: 'clamp(38px,6vw,68px)', fontWeight: 900, letterSpacing: '-.03em', lineHeight: 1.02, color: '#141014' }}>
            {T.h1a[lang]}<br /><span style={{ color: '#B5101F' }}>{T.h1b[lang]}</span>
          </h1>
          <p style={{ margin: '22px 0 0', maxWidth: '640px', fontSize: 'clamp(16px,1.6vw,18px)', lineHeight: 1.6, fontWeight: 600, color: '#5a4a4e' }}>{T.lead[lang]}</p>
        </div>
      </section>

      {/* ═══════════════ BODY ═══════════════ */}
      <section style={{ padding: '0 24px 96px' }}>
        <div style={{ maxWidth: '1180px', margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: '0' }}>
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} style={secStyle}>
              <h2 style={h2Style}><span style={numStyle}>{s.n}</span>{s.title[lang]}</h2>
              <div style={bodyStyle}>{renderBlocks(s.body, lang)}</div>
              {s.id === 'como-pedir' && (
                <div style={{ marginTop: '18px' }}>
                  <DeletionRequestForm lang={lang} />
                </div>
              )}
            </section>
          ))}
        </div>
      </section>
    </>
  );
}
