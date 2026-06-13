# 04 — Auditoria Comercial

**Versão:** 1.0
**Data:** 2026-06-13
**Tipo:** Auditoria estratégica — Fase 4 (Comercial)
**Pergunta central de cada secção:** *Porque é que esta pessoa escolheria Banzami — hoje, com o que existe?*

---

## Utilizador final (consumidor)

**Porque usaria?** Para parar de andar com dinheiro físico e de mandar comprovativos no WhatsApp; pagar por @handle e QR ao instante.

**Porque NÃO usaria hoje:**
- Não consegue meter Kwanza na carteira (EMIS por ligar). Uma carteira que não se enche não tem uso.
- Efeito de rede zero: ninguém à volta aceita. O valor de uma rede de pagamentos é o nº de contrapartes; hoje é ~0.
- Confiança: PIN curto, sem garantia visível de fundos, sem licença/regulação comunicada.

**Veredicto:** proposta forte *em potencial*, inutilizável *hoje*. O consumidor só vem depois dos comerciantes.

---

## Comerciante (cantina, restaurante, loja)

**Porque aceitaria?** QR sem terminal caro, liquidação instantânea, dashboard, sem hardware POS.

**Porque NÃO aceitaria hoje:**
- Não pode levantar o dinheiro para a conta bancária (payout/settlement sem rail real).
- Sem consumidores na rede, aceitar Banzami não traz vendas — só custo de adopção.
- Concorre com "transferência + comprovativo" que, por mau que seja, **funciona hoje e move Kwanza real**.

**Veredicto:** o comerciante é o cliente certo e o ponto de alavancagem correto (traz consumidores). Mas a oferta só é real quando *entra* e *sai* dinheiro de verdade.

---

## Empresa (ecommerce, escola, plataforma)

**Porque integraria?** API REST versionada, idempotente, webhooks assinados, SDKs. A engenharia da integração é genuinamente boa.

**Porque NÃO integraria hoje:**
- Mesma razão raiz: sem liquidação real, integra-se um simulador.
- Risco de fornecedor: operador pré-receita, sem prova de continuidade nem licença comunicada.

**Veredicto:** tecnicamente pronto para integrar, comercialmente não financiável como dependência de produção.

---

## Startup (consumidora de SDK)

**Porque usaria o SDK?** Aceitar Kwanza in-app em horas (taxi, entregas, doações). Esta é, possivelmente, a **cunha de entrada mais subestimada** do projecto: developers angolanos sem forma fácil de aceitar pagamentos in-app.

**Porque NÃO usaria hoje:** sem dinheiro real e sem outros utilizadores, o SDK move tokens de brincar.

**Veredicto:** canal promissor; deve ser tratado como hipótese de GTM séria (ver `09_gtm.md`), não como item de catálogo.

---

## Marketplace

**Porque escolheria Banzami?** Split de pagamentos, payouts a vendedores, ledger auditável. O core (double-entry, multi-leg postings) suporta isto tecnicamente.

**Porque NÃO hoje:** funcionalidade de split/escrow não está exposta como produto; e o rail real falta. Marketplace é um cliente de fase 2–3.

---

## App de táxi

**Porque integraria?** "Corrida terminada → liquidação instantânea, sem dinheiro, sem confirmação manual." É o caso de uso emblemático do próprio CLAUDE.md e é convincente.

**Porque NÃO hoje:** o motorista precisa de **sacar** o dinheiro no fim do dia. Sem payout real, o caso de uso colapsa.

**Veredicto:** caso de uso âncora excelente para marketing e para o primeiro piloto — *assim que houver rails*.

---

## App de entregas

Idêntico ao táxi: integração elegante, bloqueada pela mesma dependência (entrada + saída de dinheiro real).

---

## Síntese comercial

| Persona | Atractividade da proposta | Bloqueador nº 1 | Quando se torna real |
|---|---|---|---|
| Consumidor | Alta | Funding + efeito de rede | Fase 2 |
| **Comerciante** | **Alta** | **Payout real + consumidores** | **Fase 1 (alvo)** |
| Empresa | Média-alta | Liquidação real + risco de fornecedor | Fase 2 |
| Startup/SDK | Alta (subestimada) | Dinheiro real | Fase 1–2 (cunha) |
| Marketplace | Média | Split como produto + rail | Fase 3 |
| Táxi / entregas | Alta (âncora) | Payout real | Fase 2 (piloto) |

**A conclusão comercial é uma só:** todas as personas têm uma proposta de valor real e uma única dependência partilhada que as bloqueia a todas — **a entrada e saída de Kwanza real (EMIS/Multicaixa + payouts bancários).** Nenhuma quantidade de produto, SDK ou protocolo compensa isto. É o único nó que destranca o negócio inteiro.

O modelo de receita (fees de comerciante) é o correto e provado (Pix monetiza via comerciantes/PSPs; M-Pesa via tarifas). Mas receita = volume × fee, e volume = 0 enquanto o rail não existir.

---

*Próximo: `05_architecture.md`.*
