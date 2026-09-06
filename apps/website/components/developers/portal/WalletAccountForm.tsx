'use client';

import { useEffect, useRef, useState } from 'react';
import { developerApi, ApiError } from '@/lib/developer-api';
import { useDeveloperData } from './DeveloperData';
import { useToast } from './Toast';
import { Card } from './ui';

const ctaGradient = 'linear-gradient(160deg,#B5101F,#7C1016)';

/**
 * Open a wallet account — a destination that holds money separately.
 *
 * This is the primitive DOA uses for a campaign, and it has been available
 * through the API and the published SDK all along. What was missing was doing it
 * without writing code, which meant a developer could set up a project's
 * financial environment and then find it unusable until they had a codebase.
 *
 * The purposes are the operator's own list, deliberately generic: an external
 * developer must not have to describe a shop as a "campaign" because that is
 * what the first application on the platform happened to need.
 */

// Words for the purposes the server offers. The list itself comes FROM the
// server — a local copy drifted the moment it existed — and these are only the
// labels and hints for the values it returns.
//
// Every hint describes what the account is FOR and none describes what happens
// to the money in it, because nothing happens to the money because of a purpose:
// it is a label, and the only value the platform treats differently is PRIMARY.
// The first version of this picker offered "Caução — valor retido até uma
// condição se cumprir", which is a promise no code keeps.
const WORDS: Record<string, { label: string; hint: string }> = {
  CAMPAIGN: { label: 'Campanha', hint: 'uma angariação, uma causa, algo com uma meta' },
  STORE: { label: 'Loja', hint: 'um vendedor ou uma loja dentro da sua aplicação' },
  PROJECT: { label: 'Projeto', hint: 'um trabalho, uma encomenda, um contrato' },
  EVENT: { label: 'Evento', hint: 'bilheteira ou inscrições de um evento' },
  CUSTOM: { label: 'Outro', hint: 'quando nenhuma das anteriores descreve o seu caso' },
};

export function WalletAccountForm({ onCreated }: { onCreated: () => void }) {
  const { activeProject, csrf } = useDeveloperData();
  const { flash } = useToast();
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [purpose, setPurpose] = useState('CAMPAIGN');
  const [purposes, setPurposes] = useState<string[]>([]);
  const [refType, setRefType] = useState('');
  const [refID, setRefID] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => { if (open) first.current?.focus(); }, [open]);
  useEffect(() => {
    let live = true;
    developerApi.walletAccountPurposes()
      .then((r) => { if (live) setPurposes(r.purposes); })
      // A failure leaves the picker empty rather than guessing. Offering a value
      // the server might refuse is worse than offering none.
      .catch(() => { if (live) setPurposes([]); });
    return () => { live = false; };
  }, []);

  const valid = label.trim().length > 0 && label.trim().length <= 80 && purposes.includes(purpose);

  async function create() {
    if (!activeProject || !valid || busy) return;
    setBusy(true);
    setError('');
    try {
      const acct = await developerApi.createWalletAccount(activeProject.id, {
        label: label.trim(),
        purpose,
        reference_type: refType.trim() || undefined,
        reference_id: refID.trim() || undefined,
      }, csrf);
      flash(`Conta "${acct.label}" criada`);
      setLabel(''); setRefType(''); setRefID(''); setOpen(false);
      onCreated();
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'UNAVAILABLE';
      setError(
        code === 'PROJECT_FINANCIAL_SETUP_REQUIRED'
          ? 'Configure primeiro o ambiente financeiro deste projeto.'
          : code === 'UNSUPPORTED_PURPOSE'
            ? 'Essa finalidade não está disponível.'
            : code === 'FORBIDDEN'
              ? 'O seu papel neste workspace não permite criar contas.'
              : e instanceof ApiError ? e.message : 'Não foi possível criar a conta.',
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ padding: '10px 18px', border: 'none', borderRadius: 11, background: ctaGradient, color: '#fff', fontSize: 13.5, fontWeight: 800, cursor: 'pointer' }}
      >
        Criar conta
      </button>
    );
  }

  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 800, color: '#6a5a5e', marginBottom: 6 } as const;
  const input = {
    width: '100%', padding: '10px 12px', border: '1.5px solid #EBDBD9', borderRadius: 10,
    fontSize: 14, fontWeight: 700, background: '#fff', color: '#2A1E20',
  } as const;
  const chosen = WORDS[purpose];

  return (
    <Card style={{ padding: 22, maxWidth: 560 }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 15.5, fontWeight: 900 }}>Nova conta</h3>
      <p style={{ margin: '0 0 18px', fontSize: 13, color: '#8a7a7e', fontWeight: 600, lineHeight: 1.55 }}>
        Uma conta mantém dinheiro separado do resto do projeto. Crie uma por cada coisa que precisa de
        contabilidade própria — uma campanha, um vendedor, um evento.
      </p>

      <div style={{ marginBottom: 14 }}>
        <label htmlFor="wa-label" style={labelStyle}>Nome</label>
        <input id="wa-label" ref={first} value={label} maxLength={80}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Ex.: Campanha de Inverno" style={input} />
      </div>

      <div style={{ marginBottom: 14 }}>
        <label htmlFor="wa-purpose" style={labelStyle}>Finalidade</label>
        <select id="wa-purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)}
          aria-describedby="wa-purpose-hint" style={{ ...input, cursor: 'pointer' }}>
          {purposes.map((p) => <option key={p} value={p}>{WORDS[p]?.label ?? p}</option>)}
        </select>
        <p id="wa-purpose-hint" style={{ margin: '6px 0 0', fontSize: 12, color: '#8a7a7e', fontWeight: 600 }}>
          {chosen?.hint ?? 'Uma etiqueta para si — não altera o que acontece ao dinheiro.'}
        </p>
      </div>

      <details style={{ marginBottom: 18 }}>
        <summary style={{ fontSize: 12.5, fontWeight: 800, color: '#6a5a5e', cursor: 'pointer' }}>
          Referência da sua aplicação (opcional)
        </summary>
        <p style={{ margin: '10px 0 12px', fontSize: 12.5, color: '#8a7a7e', fontWeight: 600, lineHeight: 1.55 }}>
          Os seus próprios identificadores, guardados tal como os escreve. Se repetir a mesma finalidade e a
          mesma referência, recebe a conta que já existe em vez de uma segunda.
        </p>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="wa-reftype" style={labelStyle}>Tipo</label>
            <input id="wa-reftype" value={refType} onChange={(e) => setRefType(e.target.value)}
              placeholder="Ex.: SHOP" style={input} />
          </div>
          <div style={{ flex: 1, minWidth: 180 }}>
            <label htmlFor="wa-refid" style={labelStyle}>Identificador</label>
            <input id="wa-refid" value={refID} onChange={(e) => setRefID(e.target.value)}
              placeholder="Ex.: shop_1204" style={input} />
          </div>
        </div>
      </details>

      {error && (
        <p role="alert" style={{ margin: '0 0 14px', fontSize: 13.5, color: '#B5101F', fontWeight: 700, lineHeight: 1.5 }}>
          {error}
        </p>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={() => void create()} disabled={!valid || busy}
          style={{
            padding: '11px 20px', border: 'none', borderRadius: 11,
            background: valid && !busy ? ctaGradient : '#E7D9D7',
            color: valid && !busy ? '#fff' : '#a89a9e',
            fontSize: 14, fontWeight: 800, cursor: valid && !busy ? 'pointer' : 'not-allowed',
          }}>
          {busy ? 'A criar…' : 'Criar conta'}
        </button>
        <button onClick={() => { setOpen(false); setError(''); }} disabled={busy}
          style={{ padding: '11px 20px', border: '1.5px solid #EBDBD9', borderRadius: 11, background: '#fff', fontSize: 14, fontWeight: 800, color: '#6a5a5e', cursor: busy ? 'wait' : 'pointer' }}>
          Cancelar
        </button>
      </div>
    </Card>
  );
}
