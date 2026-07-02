'use client';

import { useState } from 'react';
import Link from 'next/link';
import { PortalPage } from '@/components/developers/portal/PortalShell';
import { Card } from '@/components/developers/portal/ui';
import { IconArrowRight, IconCopy, IconEye, IconLock, IconPlus, IconRotate, IconShield } from '@/components/developers/portal/icons';

// API Keys — dossier ecrã 6. Sandbox tab lists mock keys with copy / reveal /
// rotate; the Live tab is a locked card until KYB is approved. Critical actions
// (reveal, rotate, delete) will require OTP reauth at wire time — the UI states it.

const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';
const mono = "'JetBrains Mono', ui-monospace, monospace";
const SECRET_REAL = 'sk_test_51Rz8a4b9Kd2secret';
const SECRET_MASK = 'sk_test_••••••••••••••••';

function iconBtn(): React.CSSProperties {
  return {
    width: 34,
    height: 34,
    border: '1px solid #F0E2E0',
    borderRadius: 9,
    background: '#fff',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
  };
}

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 18px',
        border: 'none',
        borderRadius: 9,
        background: active ? '#fff' : 'transparent',
        color: active ? '#B5101F' : '#a89a9e',
        fontWeight: 800,
        fontSize: 13.5,
        cursor: 'pointer',
        boxShadow: active ? '0 4px 12px -6px rgba(181,16,31,.3)' : 'none',
      }}
    >
      {label}
    </button>
  );
}

export default function ApiKeysPage() {
  const [tab, setTab] = useState<'sandbox' | 'live'>('sandbox');
  const [revealed, setRevealed] = useState(false);

  return (
    <PortalPage active="apikeys">
      <div className="bz-view">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, letterSpacing: '-.02em' }}>API Keys</h1>
            <p style={{ margin: '6px 0 0', fontSize: 14.5, color: '#8a7a7e', fontWeight: 600 }}>
              Use estas chaves para integrar e testar no ambiente Sandbox.
            </p>
          </div>
          <button
            className="bz-cta"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '11px 18px',
              border: 'none',
              borderRadius: 12,
              background: ctaGradient,
              color: '#fff',
              fontWeight: 800,
              fontSize: 13.5,
              cursor: 'pointer',
              boxShadow: '0 12px 24px -12px rgba(181,16,31,.5)',
            }}
          >
            <IconPlus size={15} />
            Criar chave
          </button>
        </div>

        <div style={{ display: 'inline-flex', gap: 4, padding: 4, borderRadius: 12, background: '#F7ECEA', marginBottom: 18 }}>
          <Tab label="Sandbox" active={tab === 'sandbox'} onClick={() => setTab('sandbox')} />
          <Tab label="Live · Produção" active={tab === 'live'} onClick={() => setTab('live')} />
        </div>

        {tab === 'sandbox' ? (
          <>
            <Card style={{ overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#a89a9e' }}>
                    <th style={{ padding: '13px 22px', fontSize: 11, fontWeight: 800 }}>NOME</th>
                    <th style={{ padding: '13px 12px', fontSize: 11, fontWeight: 800 }}>CHAVE</th>
                    <th style={{ padding: '13px 12px', fontSize: 11, fontWeight: 800 }}>CRIADA</th>
                    <th style={{ padding: '13px 22px', fontSize: 11, fontWeight: 800, textAlign: 'right' }}>AÇÕES</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="bz-row" style={{ borderTop: '1px solid #F5E9E7' }}>
                    <td style={{ padding: '15px 22px' }}>
                      <p style={{ margin: 0, fontWeight: 800 }}>Default Key</p>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#8a7a7e' }}>Publishable</span>
                    </td>
                    <td style={{ padding: '15px 12px', fontFamily: mono, color: '#3a2a2e' }}>pk_test_51Rz8a4b…c2f9</td>
                    <td style={{ padding: '15px 12px', color: '#a89a9e', fontWeight: 700 }}>18 Mar 2025</td>
                    <td style={{ padding: '15px 22px', textAlign: 'right' }}>
                      <button data-copy="pk_test_51Rz8a4b9Kd2c2f9" className="bz-icobtn" aria-label="Copiar chave" style={{ ...iconBtn(), color: '#6a5a5e' }}>
                        <IconCopy size={15} />
                      </button>
                    </td>
                  </tr>
                  <tr className="bz-row" style={{ borderTop: '1px solid #F5E9E7' }}>
                    <td style={{ padding: '15px 22px' }}>
                      <p style={{ margin: 0, fontWeight: 800 }}>Default Secret</p>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#C4303C' }}>Secret · nunca partilhe</span>
                    </td>
                    <td style={{ padding: '15px 12px', fontFamily: mono, color: '#3a2a2e' }}>{revealed ? SECRET_REAL : SECRET_MASK}</td>
                    <td style={{ padding: '15px 12px', color: '#a89a9e', fontWeight: 700 }}>18 Mar 2025</td>
                    <td style={{ padding: '15px 22px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <button
                        onClick={() => setRevealed((r) => !r)}
                        className="bz-icobtn"
                        aria-label={revealed ? 'Ocultar secret' : 'Revelar secret'}
                        style={{ ...iconBtn(), color: '#6a5a5e', marginRight: 6 }}
                      >
                        <IconEye size={15} />
                      </button>
                      <button data-copy={SECRET_REAL} className="bz-icobtn" aria-label="Copiar secret" style={{ ...iconBtn(), color: '#6a5a5e', marginRight: 6 }}>
                        <IconCopy size={15} />
                      </button>
                      <button className="bz-icobtn" title="Rotacionar" aria-label="Rotacionar secret" style={{ ...iconBtn(), color: '#B5101F' }}>
                        <IconRotate size={15} />
                      </button>
                    </td>
                  </tr>
                  <tr className="bz-row" style={{ borderTop: '1px solid #F5E9E7' }}>
                    <td style={{ padding: '15px 22px' }}>
                      <p style={{ margin: 0, fontWeight: 800 }}>Mobile App Key</p>
                      <span style={{ fontSize: 11, fontWeight: 800, color: '#8a7a7e' }}>Publishable</span>
                    </td>
                    <td style={{ padding: '15px 12px', fontFamily: mono, color: '#3a2a2e' }}>pk_test_4c3d…fbe5</td>
                    <td style={{ padding: '15px 12px', color: '#a89a9e', fontWeight: 700 }}>06 Mai 2025</td>
                    <td style={{ padding: '15px 22px', textAlign: 'right' }}>
                      <button data-copy="pk_test_4c3dfbe5" className="bz-icobtn" aria-label="Copiar chave" style={{ ...iconBtn(), color: '#6a5a5e' }}>
                        <IconCopy size={15} />
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </Card>
            <p style={{ margin: '14px 2px 0', display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 700, color: '#9a8a8e' }}>
              <span style={{ color: '#B5101F', display: 'inline-flex' }}>
                <IconShield size={15} />
              </span>
              Ações críticas (revelar, rotacionar, apagar) pedem reautenticação por OTP.
            </p>
          </>
        ) : (
          <div
            style={{
              background: '#fff',
              border: '1px dashed #E7C6C3',
              borderRadius: 18,
              padding: '44px 30px',
              textAlign: 'center',
              boxShadow: '0 18px 44px -40px rgba(181,16,31,.4)',
            }}
          >
            <div style={{ width: 56, height: 56, borderRadius: 16, background: '#FFF1F0', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, color: '#B5101F' }}>
              <IconLock size={26} />
            </div>
            <h3 style={{ margin: 0, fontSize: 19, fontWeight: 900 }}>Ambiente de produção bloqueado</h3>
            <p style={{ margin: '10px auto 20px', maxWidth: 400, fontSize: 14, lineHeight: 1.55, color: '#8a7a7e', fontWeight: 600 }}>
              Conclua o processo de verificação para aceder às chaves Live e processar pagamentos reais.
            </p>
            <Link
              href="/developers/go-live"
              className="bz-cta"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '12px 22px',
                border: 'none',
                borderRadius: 12,
                background: ctaGradient,
                color: '#fff',
                fontWeight: 800,
                fontSize: 14,
                textDecoration: 'none',
                boxShadow: '0 12px 24px -12px rgba(181,16,31,.5)',
              }}
            >
              Ir para Go Live
              <IconArrowRight size={15} />
            </Link>
          </div>
        )}
      </div>
    </PortalPage>
  );
}
