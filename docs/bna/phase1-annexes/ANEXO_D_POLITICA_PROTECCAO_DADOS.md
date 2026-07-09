# Anexo D — Política de Protecção de Dados (Piloto Fase 1)

Versão: 1.0 · Data: __ / __ / 20__

> **Enquadramento institucional.** O Banzami é o operador de referência da rede BANZA,
> sociedade comercial independente e **não autorizada** até aprovação ou não-objecção
> do BNA. Este documento respeita a um **piloto proposto (Fase 1)**, de coorte fechada.
> Durante a Fase 0 **não** foram utilizados dados reais de clientes: os participantes e
> saldos foram sintéticos, em Sandbox técnico interno.

## 1. Objectivo (Finalidade)

Definir os princípios e procedimentos de protecção de dados pessoais aplicáveis ao
piloto, garantindo licitude, minimização, finalidade limitada, segurança e direitos
dos titulares, em consonância com o quadro legal angolano de protecção de dados.

## 2. Âmbito

- Dados de consumidores e comerciantes da coorte fechada e metadados técnicos de
  integração de plataformas.
- Cobre recolha, tratamento, conservação, acesso, minimização e eliminação, bem como a
  não-exposição de dados pessoais desnecessários em comprovativos e eventos.
- Exclui qualquer tratamento de dados reais em ambiente LIVE/produção antes da
  aprovação do BNA.

## 3. Partes / Participantes Afectados

- **Responsável pelo tratamento:** Banzami.
- **Titulares dos dados:** consumidores e representantes de comerciantes da coorte.
- **Subcontratantes/integradores:** plataformas técnicas, sem acesso a dados pessoais
  para além do estritamente necessário à integração.
- **Autoridade de supervisão:** BNA (para efeitos de reporte do piloto).

## 4. Obrigações

**Do operador:** tratar dados apenas para as finalidades do piloto; aplicar
minimização; assegurar confidencialidade, integridade e disponibilidade; não expor
dados pessoais desnecessários (por exemplo, o pagador é apresentado por identificador
`@banza`, sem nome pessoal, nos comprovativos autenticados); garantir os direitos dos
titulares; registar acessos.

**Dos participantes/plataformas:** não recolher nem reter dados para além do necessário;
proteger credenciais; comunicar incidentes de dados.

## 5. Procedimento Operacional

1. Recolha mínima no momento da adesão (identidade e contacto).
2. Tratamento estritamente para operação e reporte do piloto.
3. Controlo de acesso por menor privilégio; segregação de credenciais.
4. Minimização em comprovativos e eventos (identificadores em vez de dados pessoais).
5. Conservação limitada e eliminação segura findo o âmbito do piloto.

## 6. Controlos de Risco

- Segredos e credenciais entregues apenas em ficheiro/memória, nunca em configuração
  inspeccionável nem em registos.
- Comprovativos e eventos não expõem dados pessoais desnecessários (privacidade por
  desenho); o pagador consumidor é mostrado apenas por identificador.
- Trilho de auditoria de acessos; princípio de menor privilégio nas permissões de dados.

## 7. Evidência a Produzir

- Registo de consentimentos e finalidades (ligação ao Anexo A).
- Evidência de minimização (comprovativos com identificador, sem dados pessoais).
- Registo de sanitização da evidência (ausência de segredos/dados sensíveis).
- Registo de acessos e de eliminação findo o piloto.

## 8. Relevância para o Reporte ao BNA

Demonstra conformidade com os princípios de protecção de dados e conduta, elemento
transversal aos relatórios intermédio e final (Anexos H e I).

## 9. Versão / Data

Versão 1.0 · Data de emissão: __ / __ / 20__ · Próxima revisão: __ / __ / 20__.

## 10. Aprovação / Assinaturas

| Papel | Nome | Data | Assinatura |
|-------|------|------|-----------|
| Encarregado de Protecção de Dados (Banzami) | | | |
| Responsável pelo tratamento (Banzami) | | | |

*Documento preparatório interno. Não constitui prova de autorização, admissão a
sandbox regulatório, prontidão de produção nem prestação de serviço em produção.*
