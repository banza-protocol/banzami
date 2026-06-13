# 09 — Auditoria de Go-To-Market

**Versão:** 1.0
**Data:** 2026-06-13
**Tipo:** Auditoria estratégica — Fase 9 (GTM)
**Pergunta por marco:** *O que falta para conseguir o primeiro de cada?*

---

## Pré-requisito universal (vale para todos os marcos)

**Entrada e saída de Kwanza real.** Hoje o sistema é circuito fechado (EMIS stub, payouts sem rail). Sem isto, nenhum marco abaixo é alcançável a sério. Tudo o resto é secundário a este nó.

Além disso, dois bloqueadores regulatórios/segurança transversais:
- **Licenciamento / enquadramento BNA** (Banco Nacional de Angola) — operar pagamentos em Kwanza exige enquadramento regulatório. Não há evidência de licença no repo (esperado — é trabalho jurídico, não de código), mas é gating absoluto para LIVE.
- **KYC/AML real** (`core/compliance` e `core/risk` em esqueleto) — obrigatório antes de mover dinheiro de terceiros.

---

## 1.º utilizador (consumidor)

**O que falta:**
- Funding real (carregar a carteira).
- Pelo menos um sítio onde gastar (≥1 comerciante activo) — senão a carteira é um beco.
- Segurança de login a nível de confiança (ver `06`).
- Fluxo de recuperação de conta robusto.

**Verdade:** o primeiro consumidor não vem isolado; vem atrás do primeiro comerciante. Não perseguir consumidores primeiro.

---

## 1.º comerciante

**O que falta:**
- Payout real para conta bancária (sacar o dinheiro recebido).
- Um punhado de consumidores capazes de pagar.
- Onboarding de comerciante simples + material físico (QR impresso).
- Proposta de valor concreta vs. "transferência + comprovativo".

**Estratégia certa:** densidade geográfica. Conquistar **um corredor** (um mercado, uma rua, um campus) com 10–30 comerciantes + os seus clientes habituais, em vez de espalhar. É o playbook do M-Pesa e do Pix em micro-mercados.

---

## 1.ª empresa

**O que falta:**
- Liquidação real + SLA + estatuto legal que torne o Banzami uma dependência aceitável.
- Caso de referência (o primeiro comerciante/piloto a funcionar).
- Quickstart de developer real (do zero ao primeiro pagamento em minutos).

---

## 1.ª integração SDK

**O que falta:**
- Pouca coisa **técnica** — os SDKs existem, são tipados, idempotentes, com webhooks assinados.
- Falta o **caminho de 5 minutos**: hoje, a documentação de entrada é um README de ~2000 linhas. Precisa-se de um quickstart de uma página, chave sandbox em 1 clique, e um exemplo "taxi app aceita pagamento" funcional.
- Falta dinheiro real para a integração valer a pena em produção.

**Esta é, provavelmente, a cunha de GTM mais rápida:** developers angolanos (apps de táxi, entregas, doações tipo DOA) que hoje não têm forma simples de aceitar Kwanza in-app. Tecnicamente quase pronto; precisa de rail + quickstart.

---

## 1.º parceiro

**O que falta:**
- Um parceiro óbvio é um **banco ou a própria EMIS** (rail + settlement + cobertura regulatória). Ironicamente, o pré-requisito (rail) é também o melhor candidato a primeiro parceiro.
- Proposta clara de win-win: o CLAUDE.md já enquadra bem ("bancos não são concorrentes, Banzami é camada de simplificação"). Operacionalizar isso num acordo é o trabalho.

---

## 1.º operador BANZA (federação)

**O que falta:** tudo o que torna federação relevante — e nada disto deve ser perseguido agora. Um segundo operador só faz sentido depois de o Banzami provar que o modelo funciona com utilizadores reais. **Recomendação: remover este marco do roadmap de 12 meses.** É fase B+.

---

## Sequência de GTM recomendada (ordem importa)

```
0. Rail real (EMIS/Multicaixa funding + payout bancário)   ← destranca tudo
   + enquadramento BNA + KYC/AML mínimo
1. Quickstart de developer + 1 app piloto (táxi/entregas/DOA)  ← cunha mais rápida
2. Um corredor de comerciantes (densidade geográfica) + os seus consumidores
3. Expandir corredores; casos de referência; primeira empresa
4. (Mais tarde) marketplace, split, federação, BanzAI como produto externo
```

---

## Veredicto de GTM

O projecto tem **produto e tecnologia à frente do go-to-market por uma larga margem** — o oposto do erro habitual de startups. Não falta capacidade de construir; falta **um único caminho de dinheiro real e os primeiros 100 utilizadores num corredor concreto**. Toda a energia gasta em federação/certificação/Protocol OS foi energia *não* gasta a fechar o acordo de rail e a conquistar a primeira rua. O GTM não está atrasado por incompetência de execução — está atrasado por **má sequenciação de prioridades**.

---

*Próximo: `BANZAMI_AUDIT_MASTER.md` — Relatório Executivo.*
