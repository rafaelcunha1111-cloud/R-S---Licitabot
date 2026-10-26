# Solicitação de integração autorizada — R&S LicitaBot

Situação em 26/10/2026: texto preparado, **não enviado**, sem protocolo de
atendimento. Nenhum acesso à API de sessões foi concedido ou validado.

## Canal oficial confirmado

A [Central de Atendimento do Compras.gov.br](https://www.gov.br/compras/pt-br/canais_atendimento/central-de-atendimento),
consultada em 26/10/2026, indica:

- Portal de Atendimento: https://portaldeservicos.gestao.gov.br/
- Telefone: 0800 978 9001.
- Horário divulgado: segunda a sexta-feira, das 08h às 18h (a página não explicita o fuso).

A indicação do canal não confirma que exista API de sessões disponível a terceiros.
A categoria do chamado deve ser escolhida conforme as opções reais do portal.
Não há protocolo enquanto o atendimento não registrar a solicitação.

## Texto para abertura do chamado

**Assunto:** Consulta sobre API oficial e autorização de leitura de sessões públicas do Compras.gov.br

Prezados,

Estamos desenvolvendo o R&S LicitaBot, aplicativo para organização de licitações,
controle de prazos e alertas por e-mail. Precisamos esclarecer quais interfaces
oficiais podem ser utilizadas por um aplicativo de terceiros para acompanhar
compras e sessões, respeitando as permissões do fornecedor e do sistema.

Já utilizamos a API pública de Dados Abertos Compras.gov.br para consultar
metadados de contratações. Não identificamos em seu contrato público operações
para leitura de mensagens do pregoeiro, convocações ou eventos da sessão.

Solicitamos orientação sobre:

1. Existência de API, webhook ou outro canal oficial autorizado para leitura de
   sessões, mensagens do pregoeiro, convocações e respectivos prazos. Informar
   separadamente o que é público e o que exige autorização do fornecedor.
2. Documentação, especificação de endpoints, versionamento e ambiente de testes.
3. Procedimento de habilitação para aplicativos de terceiros, requisitos de
   cadastro/contratação/termo de uso e eventual custo.
4. Modelo de autenticação e consentimento, escopos de leitura, validade e
   revogação. Não pretendemos receber ou compartilhar senhas gov.br.
5. Limites de chamadas, concorrência, frequência mínima permitida, tratamento
   de indisponibilidade e política de retenção dos dados.
6. Identificadores estáveis de mensagens e eventos, ordenação, fuso dos horários,
   paginação e recuperação após interrupções, para evitar perda ou duplicação
   de alertas.
7. Se não houver interface disponível a terceiros, quais alternativas oficiais
   são permitidas e para qual equipe deve ser encaminhada esta solicitação.

Exemplo concreto para análise:

- UASG: 160102.
- Compra: Pregão 72/2026; ID 16010205000722026.
- Acompanhamento público:
  https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra=16010205000722026
- Referência PNCP fornecida pelo usuário: 00394452000103-1-021902/2026.
- A consulta de Dados Abertos por esse ID retornou zero registros em 26/10/2026.
  Solicitamos também esclarecer a cobertura e o prazo de atualização dessa base.

O aplicativo possui backend Node.js/TypeScript, PostgreSQL, worker contínuo,
controle de duplicidade e alertas por e-mail. Nesta fase, mensagens e convocações
não são coletadas automaticamente. Não utilizamos automação de login nem
credenciais de sessão copiadas do navegador.

Favor fornecer o número do protocolo e encaminhar à equipe responsável pela
integração, caso necessário.

Atenciosamente,
Responsável pelo R&S LicitaBot

## Evidências e próximos passos técnicos

Em 26/10/2026 foi revisto o contrato
https://dadosabertos.compras.gov.br/v3/api-docs (77 caminhos). A busca nos caminhos
e descrições por chat, convocação, mensagem e sessão não identificou operações
para esse acompanhamento. Isso descreve apenas o contrato revisado; não prova
que não exista outra interface sob autorização.

O HTTP 403 observado ao acessar páginas SERPRO neste ambiente não foi tratado
como permissão para contornar controles nem como prova de bloqueio ao usuário.

Após resposta do atendimento, registrar aqui somente protocolo, condições e
links públicos. Credenciais devem ficar nas configurações protegidas do serviço,
nunca no GitHub ou neste documento. Antes de ativar um conector, validar o escopo,
autenticação, limites, testes de identidade dos eventos, deduplicação, retomada,
alertas e isolamento entre usuários com dados autorizados. Até essa validação,
continuam operacionais somente cadastro manual, prazos manuais, alertas desses
prazos e consulta dos metadados públicos cobertos pela API existente.
