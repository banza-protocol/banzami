# Banzami — Posicionamento Competitivo em Angola

> **Documento institucional de posicionamento estratégico**  
> **Versão:** 1.0  
> **Data:** 2 de julho de 2026  
> **Estado:** Oficial — orientação estratégica interna  
> **Âmbito:** Posicionamento competitivo, produto e comunicação  
> **Leitura obrigatória com:** `README.md`, `BANZAMI_REFERENCIA.md`, `BANZAMI_ARCHITECTURE.md`, `BANZAMI_GOVERNANCE.md` e a documentação do protocolo BANZA.

---

## Síntese executiva

O mercado angolano já dispõe de pagamentos digitais, wallets, QR e gateways. A oportunidade do Banzami não é repetir essas ofertas. É ligar **aceitação por telefone**, pagamentos **wallet-to-wallet**, confirmação simultânea, comprovativos verificáveis e uma plataforma de integração para aplicações numa única experiência.

O Banzami é desenhado para que consumidores, comerciantes e plataformas utilizem a mesma infraestrutura de pagamento, sem TPA físico, sem screenshots como prova e sem cada aplicação ter de construir a sua própria lógica financeira.

> ## O Banzami não vende apenas QR.  
> ## O Banzami vende certeza de pagamento.

### A proposta em uma frase

> **O Banzami transforma cada pagamento em Kwanza numa confirmação instantânea, verificável e integrável por QR, `@banza`, links e APIs.**

### Nota de rigor

Este documento descreve o **posicionamento alvo** e a proposta de valor do Banzami. Não constitui uma declaração de produção comercial, certificação BANZA, licenciamento, money-in/money-out ativo, KYC/KYB operacional ou disponibilidade de rails reais. Enquanto essas condições não estiverem formalmente ativas, a comunicação pública deve usar linguagem de construção, sandbox, capacidade em desenvolvimento e visão de produto.

---

# 1. Contexto competitivo

## O mercado já tem pagamentos digitais. O problema é a fragmentação da experiência.

A EMIS/MULTICAIXA Express, PayPay, operadores de mobile money e gateways como a AppyPay mostram que Angola já possui meios digitais para pagar, receber e integrar cobranças. O espaço estratégico do Banzami está em converter estes comportamentos numa experiência **QR-first**, **wallet-native** e **programável**, com confiança operacional no momento da venda.

| Sinal de mercado | O que demonstra | Implicação para o Banzami |
|---|---|---|
| QR já tem adoção | A EMIS informou que os pagamentos por QR ultrapassaram um milhão de transações em 2024.[^1] | Não dizer que QR “não existe”; competir por uma experiência mais clara, verificável e orientada ao telefone. |
| Wallets e QR comerciais existem | PayPay promove pagamentos por QR e comprovativos de transações.[^2][^3] | Não vender apenas “wallet + QR”; diferenciar por prova verificável, infraestrutura para apps e desenho de rede. |
| Gateways já agregam métodos | AppyPay disponibiliza API para Multicaixa Express, referências, débito direto e Unitel Money.[^4] | Não ser apenas outro gateway; oferecer pagamentos wallet-to-wallet e uma camada de produto comum. |
| Aceitação por telefone é uma expectativa do mercado | AppyPay comunica a possibilidade de transformar o smartphone num “TPA virtual”.[^5] | A vantagem do Banzami é a arquitetura integrada: QR + wallet + confirmação + prova + SDK, não a mera ausência de hardware. |

## Leitura estratégica

A oportunidade não é provar que o QR pode funcionar. É fazer com que pagar por QR seja simples, confiável e operacionalmente útil para todos os lados da transação:

- quem paga;
- quem recebe;
- quem gere uma empresa;
- quem integra pagamentos numa aplicação.

---

# 2. A diferença Banzami

## Do QR como funcionalidade ao QR como prova de pagamento

Um QR pode apenas iniciar um pagamento. O Banzami pretende transformar esse momento numa confirmação completa: pagamento executado, comerciante informado, consumidor confirmado e comprovativo consultável sem depender de uma imagem enviada por WhatsApp.

```text
1. Mostrar QR  →  2. Scan  →  3. Confirmar  →  4. Pago  →  5. Verificar
```

| Modelo tradicional de confirmação | Modelo Banzami proposto |
|---|---|
| Transferência ou pagamento | Pagamento wallet-to-wallet iniciado por QR, `@banza` ou link |
| Screenshot, SMS ou confirmação manual | Estado confirmado imediatamente para ambas as partes |
| Comprovativo difícil de validar | Referência única e página/QR de verificação com dados mínimos |
| Reconciliação posterior e fragmentada | Evento, recibo e prova integrados no fluxo técnico |
| Integração por métodos heterogéneos | APIs, SDKs e webhooks para aplicações e plataformas |

## Sem TPA físico: o telefone como ponto de aceitação

O QR em TPA depende de um terminal físico no comerciante. O modelo Banzami é **phone-native**:

```text
Telefone do comerciante ou QR impresso
                ↓
Cliente faz scan com o telefone
                ↓
Cliente confirma o pagamento
                ↓
Comerciante recebe confirmação no telefone
                ↓
Ambos acedem a uma prova verificável
```

A proposta é especialmente relevante para cantinas, táxis, vendedores ambulantes, mercados, pequenos restaurantes, prestadores de serviços, lojas de bairro e comércio realizado por WhatsApp, Instagram ou TikTok.

> **Aceita pagamentos com o telefone que já tens.**  
> **Sem TPA. Sem screenshots. Sem espera.**

## A prova verificável é o diferencial operacional

O PDF não é o produto principal. O produto principal é a **prova verificável em tempo real**.

A sequência pretendida é:

```text
Pagamento
  ↓
Confirmação instantânea na app
  ↓
Link público verificável, com exposição mínima de dados
  ↓
QR de verificação no comprovativo
  ↓
PDF oficial gerado pelo servidor para arquivo
```

Exemplo conceptual:

```text
banzami.com/verify/0FC11CCE

✓ Pagamento confirmado
1.500 Kz
De: @joao
Para: @cantina-alex
Data e hora: [timestamp]
Referência: 0FC11CCE
Estado: concluído
```

A página de verificação deve apresentar apenas informação necessária e consentida. Não deve expor saldo, telefone, email, IP ou dados pessoais desnecessários. Referências devem ser aleatórias e não sequenciais; pagamentos anulados, revertidos ou contestados devem ter estado claro; e o PDF deve ser sempre gerado pelo servidor a partir de dados canónicos.

---

# 3. Onde o Banzami entra no ecossistema angolano

A comparação abaixo não pretende desvalorizar os operadores existentes. Cada categoria resolve necessidades relevantes. O Banzami deve posicionar-se como uma camada complementar e diferenciada: UX de pagamentos por telefone, confiança verificável e infraestrutura programável sobre rails aprovados.

| Categoria / exemplo | Força atual | Limite estratégico | Espaço Banzami | Posicionamento recomendado |
|---|---|---|---|---|
| **EMIS / MULTICAIXA Express** | Rail bancário, escala, confiança e rede interbancária; QR com telemóvel em crescimento.[^1] | Experiência orientada ao ecossistema bancário e aos seus canais, incluindo QR em TPA. | Integrar rails aprovados e criar uma experiência wallet-native, QR-first e programável. | Não substituir a EMIS; simplificar a experiência sobre rails existentes. |
| **Wallets e QR comerciais / PayPay** | Carteira digital, QR Pay, pagamentos e comprovativos.[^2][^3] | QR e recibo, por si só, não criam necessariamente uma rede comum para aplicações, merchant tooling e integrações profundas. | Prova verificável, API/SDK-first, eventos, ambiente sandbox e pagamentos integrados em apps. | Não competir apenas com “temos QR”; competir com certeza de pagamento e integração. |
| **Mobile money / telecom** | Distribuição móvel, relação com o número de telefone e potencial de agentes. | Pode permanecer fechado à sua própria base e menos orientado a aplicações de terceiros. | Camada interoperável de produto, QR e integração para comércio e plataformas. | Cooperar quando fizer sentido; não depender de uma única rede. |
| **Gateways / AppyPay** | API e agregação de métodos como MCX Express, referências, débito direto e Unitel Money.[^4] | Foco principal em orquestrar métodos existentes e checkout empresarial. | Wallet-to-wallet, `@banza`, QR nativo, comprovativo verificável e uma rede partilhada. | Não ser só gateway; ser operador e experiência de rede. |

## A distinção essencial

> **O Banzami não deve ser apresentado como “um QR melhor”.**

Deve ser apresentado como a rede de pagamentos onde:

> **o QR inicia, o ledger confirma, o comerciante sabe, o consumidor prova e a aplicação integra.**

---

# 4. Proposta de valor por público

| Público | Promessa Banzami | Prova de valor |
|---|---|---|
| Consumidor | Pagar por QR ou `@banza` sem cartão, IBAN ou comprovativo manual. | Confirmação imediata, histórico e prova verificável. |
| Pequeno comerciante | Aceitar pagamentos com o telefone que já tem, sem TPA físico. | QR impresso ou no ecrã; confirmação direta; menos fraude por screenshot. |
| Empresa / loja | Receber pagamentos, reconciliar vendas e emitir comprovativos consistentes. | Referências, recibos PDF oficiais e estado verificável. |
| Aplicação / plataforma | Adicionar pagamentos sem construir ledger, wallets, webhooks ou reconciliação própria. | APIs, SDKs, sandbox, eventos e contratos padronizados. |
| Parceiro financeiro | Usar uma camada de produto moderna sobre rails aprovados. | Rastreabilidade, segurança, separação de responsabilidades e interoperabilidade futura. |

---

# 5. BANZA e Banzami

## A ambição não é apenas uma aplicação

A ambição do Banzami é maior do que criar uma carteira. É demonstrar como uma infraestrutura financeira moderna pode servir produtos diferentes sem que cada produto tenha de construir pagamentos do zero.

| Camada | Responsabilidade |
|---|---|
| **BANZA** | Protocolo aberto: define contratos, invariantes, eventos, QR e regras de interoperabilidade. |
| **Banzami** | Operador de referência: implementa produtos e infraestrutura de operador, incluindo pagamentos, wallets, QR, recibos, APIs e experiência de rede. |
| **Aplicações** | DOA, Mongo e futuras plataformas: definem o negócio e usam a infraestrutura, sem executar dinheiro nem implementar lógica financeira própria. |

## Princípio fundamental

> **As aplicações definem o negócio.**  
> **O operador executa o dinheiro.**  
> **O protocolo define os standards.**

Por isso:

- uma aplicação não calcula saldos, não move dinheiro e não inventa recibos;
- um comerciante não depende de terminal físico para aceitar pagamentos; depende de um telefone e de um QR;
- um pagamento não termina numa mensagem ou imagem: termina numa confirmação auditável e verificável;
- a rede não fica limitada a uma única aplicação: pode servir comércio, doações, delivery, escolas, marketplaces e mobilidade.

---

# 6. Mensagens recomendadas

| Contexto | Mensagem |
|---|---|
| Mensagem-mãe | **Banzami transforma cada pagamento em Kwanza numa confirmação instantânea e verificável.** |
| Comerciantes | **Aceita pagamentos com o telefone que já tens. Sem TPA. Sem screenshots. Sem espera.** |
| Consumidores | **Scan. Confirmar. Pago. Com uma prova que podes verificar.** |
| Programadores | **Integra pagamentos sem construir ledger, wallets ou reconciliação do zero.** |
| Ecossistema | **BANZA é o protocolo. Banzami é o operador que transforma essas regras numa experiência de pagamento para Angola.** |

---

# 7. Disciplina de comunicação

Toda a comunicação deve separar **visão** de **estado atual**.

Enquanto os rails reais, KYC/KYB, requisitos regulatórios e operação comercial não estiverem formalmente ativos, o Banzami deve usar linguagem de:

- construção;
- sandbox;
- capacidade em desenvolvimento;
- preparação operacional;
- posicionamento alvo;
- integração sujeita a validação e ativação.

Nunca deve afirmar, sem evidência atual e autorização aplicável:

- produção ativa;
- certificação BANZA;
- licenciamento financeiro;
- disponibilidade comercial de money-in/money-out;
- integração ativa com rails bancários ou EMIS;
- KYC/KYB operacional;
- liquidação real em Kwanza;
- adoção, volume ou cobertura de mercado não comprovados.

---

# 8. Referências externas

[^1]: EMIS, “Rede MULTICAIXA atinge recordes históricos”, 16 de janeiro de 2025. A EMIS informou que o pagamento com telemóvel através de QR ultrapassou um milhão de transações em 2024. <https://emis.ao/noticias-eventos/rede-multicaixa-atinge-recordes-historicos/>

[^2]: PayPay Africa, “QR Pay”. A página descreve o pagamento por digitalização do QR do comerciante na app PayPay. <https://paypayafrica.com/qr-pay/>

[^3]: PayPay Africa, “Como gerar comprovativos de pagamento de serviço?”, 7 de agosto de 2023. A empresa descreve a geração de comprovativos de transações e pagamentos de serviços. <https://paypayafrica.com/como-gerar-comprovativos-de-pagamento-de-servico/>

[^4]: AppyPay, “API para mais flexibilidade”. A página lista integração via API com Multicaixa Express, pagamentos por referência, débito direto e Unitel Money. <https://www.appypay.co.ao/api-info>

[^5]: AppyPay, página institucional. A empresa comunica a possibilidade de “transformar o smartphone num TPA virtual”. <https://www.appypay.ao/>

# 9. Base interna e precedência

Este documento deve ser interpretado em conjunto com a documentação institucional e técnica do Banzami e do BANZA.

Em caso de conflito, a seguinte ordem prevalece:

1. legislação, regulação, licenças aplicáveis e requisitos de parceiros financeiros;
2. contratos, invariantes e governação do protocolo BANZA;
3. documentação de referência e claims permitidas do Banzami;
4. decisões de arquitetura e operações do Banzami;
5. este documento de posicionamento competitivo.

Este é um documento de estratégia e comunicação. Não altera contratos BANZA, regras financeiras, decisões de arquitetura, estados de certificação ou obrigações regulatórias.
