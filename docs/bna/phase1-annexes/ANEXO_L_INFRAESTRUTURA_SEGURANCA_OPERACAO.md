# Anexo L — Infra-estrutura, Segurança e Operação (Piloto Fase 1)

Versão: 1.0 · Data: __ / __ / 20__

> **Enquadramento institucional.** O Banzami é o operador de referência da rede BANZA,
> sociedade comercial independente e **não autorizada** para a prestação de serviços de
> pagamento até aprovação ou não-objecção do Banco Nacional de Angola (BNA). Este anexo
> descreve, em linguagem regulatória, o modelo de infra-estrutura, segurança e operação
> do ambiente técnico **interno (Sandbox)** utilizado na **Fase 0** e proposto como base
> do **piloto (Fase 1)**, de coorte fechada. Não são divulgados endereços, nomes de
> servidor, utilizadores de acesso, caminhos internos, segredos nem parâmetros sensíveis.

## 1. Finalidade da infra-estrutura

Suportar, de forma fiável e segura, a validação funcional dos fluxos de pagamento e da
camada de integração técnica em ambiente controlado, com integridade contabilística,
segregação e evidência auditável, sem utilização de dinheiro real nem de dados reais de
clientes.

## 2. Separação de ambientes

- **Fase 0 / Sandbox técnico:** ambiente interno, com participantes e saldos sintéticos,
  onde foi produzida a evidência funcional (estado consolidado: PASS 29 · FAIL 0 ·
  SIMULATED 6 · DEFERRED 0 · BLOCKED 0).
- **Fase 1 (futuro):** piloto proposto, de coorte fechada, sujeito a aprovação do BNA.
- **Produção:** **não activa.** Não existe ambiente LIVE nem disponibilização pública.

A cobertura da evidência interna abrange: pagamentos por QR, *links* de pagamento,
intenções de pagamento, *checkout* online, integração de plataforma via API/SDK,
autenticação por chave de plataforma, verificação de comprovativo, reconciliação de
plataforma, limites do piloto, integridade de *ledger*/saldo, idempotência e
restituição/estorno sintética.

## 3. Modelo de implantação independente do fornecedor

A infra-estrutura é **agnóstica de fornecedor** e **portável entre servidores**: assenta
em contentores normalizados e em processos reprodutíveis a partir do repositório
versionado, sem dependência de conhecimento não documentado nem de um fornecedor
específico. A reconstrução do ambiente num novo servidor está documentada em manual
operacional interno e em lista de verificação de migração.

## 4. Arquitectura de serviços contentorizados

O ambiente é composto por um conjunto reduzido de serviços aplicacionais
contentorizados (núcleo financeiro, camada de API/gateway, serviço de integração de
plataforma e serviço público de adesão), acompanhados de uma base de dados relacional e
de um serviço de cache/coordenação. Cada serviço corre em contentor dedicado, sem
privilégios elevados.

## 5. Fronteiras de serviço

Os serviços comunicam apenas por redes internas, sem portos publicados para o exterior.
As responsabilidades estão segregadas: o núcleo financeiro detém o registo contabilístico
e as regras financeiras; a camada de API expõe as operações; o serviço de integração gere
as identidades e chaves de plataforma; o serviço público trata a adesão. Nenhuma
plataforma/integrador detém fundos, calcula saldos ou emite comprovativos financeiros.

## 6. Segregação da base de dados

A base de dados do ambiente encontra-se logicamente segregada por esquemas: um esquema
aplicacional e um esquema dedicado ao modelo de plataforma/chaves. A propriedade dos
objectos pertence a um papel proprietário sem sessão interactiva; o serviço aplicacional
acede através de um papel de **menor privilégio**, sem capacidade de alteração de
estrutura.

## 7. Controlo de migrações

As alterações de estrutura são aplicadas **exclusivamente** através de migrações
canónicas versionadas, por um adaptador de migração **controlado (*gated*)** e com
autorização de uso único, execução sob bloqueio e verificação de identidade do pacote.
Não são permitidas alterações de estado por SQL avulso nem mutação manual da base de
dados fora do sistema de migração.

## 8. Princípios de gestão de segredos

Os segredos são entregues **apenas em ficheiro** e carregados em memória pelo processo,
**nunca** figurando em ambiente inspeccionável de contentor, em configuração, em registos
ou no repositório. Credenciais partilhadas entre serviços são geradas por execução e
coincidem apenas onde é estritamente necessário.

## 9. Controlo de acesso e menor privilégio

Aplica-se o princípio do menor privilégio a papéis de base de dados e a credenciais de
serviço. O papel de migração é de **curta duração**, com validade temporal e limite de
ligações, sendo renovado/retirado no âmbito do processo de migração. Não são utilizadas
credenciais de super-utilizador para operação corrente dos serviços.

## 10. Registo e sanitização de evidência

Os registos operacionais são minimizados e não expõem segredos nem dados pessoais
desnecessários. A evidência é sujeita a um processo de **sanitização** que verifica a
ausência de segredos, credenciais, endereços e dados sensíveis antes de qualquer
conservação ou reporte.

## 11. Princípios de cópia de segurança e recuperação

O ambiente prevê cópia de segurança da base de dados e dos ficheiros de estado
necessários, bem como procedimentos de restauro documentados, de forma a permitir a
recuperação sem perda de integridade contabilística e sem reinício destrutivo não
autorizado.

## 12. Monitorização e verificações de saúde

Cada serviço expõe verificações de saúde; a implantação valida a saúde após o arranque.
O ambiente prevê monitorização de disponibilidade e de indicadores operacionais
relevantes à supervisão do piloto.

## 13. Resposta a incidentes e suspensão de emergência

Existe procedimento de detecção, classificação e resposta a incidentes, com capacidade de
**suspensão cautelar** de participantes e de revogação de chaves de plataforma (Anexo F).
Incidentes materiais são comunicados ao BNA nos termos aplicáveis.

## 14. Capacidade de migração / reconstrução de servidor

O ambiente pode ser migrado ou reconstruído num novo servidor a partir do repositório
versionado e dos ficheiros de segredo, seguindo uma lista de verificação que inclui
congelamento prévio, cópia de segurança, preparação do servidor de destino, colocação de
segredos, renovação de papéis, aplicação de migrações, implantação, verificações de saúde,
testes de fumo, reconciliação e validação final. O processo é **portável** e não depende
de um fornecedor específico.

## 15. Limitações

- **Não** existe ambiente LIVE nem produção activa.
- **Não** há disponibilização pública.
- **Não** há pagamentos reais nem utilização de dados reais de clientes.
- **Não** há activação de fornecedor externo real.
- Qualquer passagem a produção ou utilização de fundos reais depende de aprovação ou
  não-objecção do BNA e da estrutura de salvaguarda aplicável (Anexo K).

Simulações limitadas em vigor: entrega/repetição de *webhooks* (exige recetor público
HTTPS); liquidação por rail externo EMIS/HMAC; ensaio de reinício de serviço; e
classificação de incidentes em mesa.

## Versão / Data

Versão 1.0 · Data de emissão: __ / __ / 20__ · Próxima revisão: __ / __ / 20__.

## Aprovação / Assinaturas

| Papel | Nome | Data | Assinatura |
|-------|------|------|-----------|
| Responsável de Infra-estrutura/Segurança (Banzami) | | | |
| Administração (Banzami) | | | |

*Documento preparatório interno. Não constitui prova de autorização, admissão a sandbox
regulatório, prontidão de produção nem prestação de serviço em produção.*
