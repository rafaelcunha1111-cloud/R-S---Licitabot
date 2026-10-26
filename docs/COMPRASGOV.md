# Primeira integração oficial — Compras.gov.br / dados públicos

## Escopo confirmado

Esta fase usa somente a API oficial **Compras.gov.br — Compras Públicas em Dados Abertos**, em `https://dadosabertos.compras.gov.br`. A documentação OpenAPI foi efetivamente consultada e um registro público foi recuperado pelo cliente implementado. Não foi necessário login, token, certificado ou credencial gov.br para essa operação de leitura.

**Disponível:** consultar uma contratação publicada sob o módulo Lei 14.133 por ID da compra ou número de controle PNCP, importar metadados oficiais para o PostgreSQL, salvar origem/data de coleta e versões, verificar mudanças dos campos públicos selecionados e gerar notificações dessas mudanças no painel/e-mail conforme as preferências existentes.

**Não disponível:** chat do pregoeiro, mensagens da sessão, convocações, participação da empresa, lance, envio de documentos ou acompanhamento de disputa ao vivo. Não foram encontrados endpoints de chat/convocações na especificação consultada. Isso não prova que nenhuma outra interface oficial exista; sua descoberta e autorização continuam pendentes. Uma situação “Divulgada no PNCP” não é o estado de uma sessão de lances.

O módulo consultado não cobre necessariamente todos os registros do PNCP, pregões legados ou outros portais. A consulta ao PNCP já existente no projeto continua sendo separada desta integração. Não se usam páginas privadas, cookies ou automação de login.

## Contrato e evidência de consulta real

- Swagger: https://dadosabertos.compras.gov.br/swagger-ui/index.html
- OpenAPI: https://dadosabertos.compras.gov.br/v3/api-docs
- Referência oficial de dados abertos indicada pela própria API: https://www.gov.br/compras/pt-br/cidadao/compras-publicas-dados-abertos
- Operação GET: `/modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id`
- Parâmetros obrigatórios: `tipo` (`idCompra` ou `numeroControlePNCPCompra`) e `codigo` (identificador correspondente).
- Resposta documentada: `resultado`, `totalRegistros`, `totalPaginas`, `paginasRestantes`; DTO `VwFtPNCPCompraDTO`.

O extrato fiel da operação e dos schemas utilizados está versionado em `backend/contracts/comprasgov-public.openapi.json`, com URL, horário de obtenção e SHA-256 da especificação completa. Essa documentação não foi inferida a partir de outro portal.

Consulta real, somente leitura, executada pelo novo cliente em 26/10/2026 (UTC):

- `idCompra`: `17013105000172023`
- `numeroControlePNCP`: `00394460000141-1-001631/2023`
- Situação retornada: `Divulgada no PNCP`
- Origem: https://dadosabertos.compras.gov.br/modulo-contratacoes/1.1_consultarContratacoes_PNCP_14133_Id?tipo=idCompra&codigo=17013105000172023

Esse registro público foi usado para verificar o transporte e o contrato, **não foi cadastrado no banco de produção do usuário**, não representa participação da empresa e não gerou alertas reais. Testes de alterações usam fixtures identificadas como teste em PostgreSQL descartável. O funcionamento em produção no Render precisa ser confirmado depois do deploy/importação de um registro escolhido pelo usuário.

## Usar no painel

1. Após o deploy da API, worker e Pages, entrar em **Servidor**.
2. Localizar **Compras.gov.br — dados públicos oficiais**.
3. Selecionar ID da compra (17 dígitos, nesta fase) ou número de controle PNCP (`CNPJ-1-sequencial/ano`, com sequencial de seis dígitos), copiado do registro/edital oficial. O número do pregão sozinho ou o nome de uma pasta Drive não basta.
4. Clicar **Consultar na API oficial** e conferir órgão, objeto, identificadores, situação publicada, data da fonte e link de origem.
5. Para salvar, clicar **Importar registro oficial no servidor**. Por padrão a verificação periódica fica desligada. Marcar explicitamente a opção de verificar alterações públicas para habilitar o worker.
6. Em **Histórico e prazos**, consultar o último documento oficial. O histórico de consultas mostra tentativas e falhas; as versões públicas são persistidas separadamente. O banco preserva as versões; a API retorna as 50 recentes.

A primeira importação cria a linha de base e não simula um alerta de alteração. Depois, uma mudança efetiva do fingerprint dos campos monitorados gera evento `public_data_update` e notificação distinta de mensagem/convocação. Sem mudança não há alerta repetido. Campos monitorados: identidade, órgão/objeto, UASG, número/modalidade, situação publicada, valores estimado/homologado, datas declaradas de atualização/publicação/propostas e indicador de exclusão da contratação. Campos adicionais da resposta não são automaticamente interpretados como eventos.

Datas retornadas sem offset/fuso são preservadas como texto, sem inferir UTC ou horário de Brasília e **sem criar prazos automáticos**. Confirmar prazos oficiais no edital/portal antes de cadastrar uma obrigação manual.

## Persistência e execução contínua

- `006_comprasgov_public.sql`: documento público atual e observações/versionamento, ligados à licitação do usuário.
- `007_portal_cooldowns.sql`: pausa global persistente por portal após limitação oficial.
- Importações de ID ou PNCP convergem para referência canônica `comprasgov:idCompra:<ID>`; duplicidade por usuário/portal é recusada com 409.
- Metadados importados e atualizados pela fonte são `verified`, com `verified_at`, link e horário de consulta. Cadastros manuais/Drive não são promovidos automaticamente só por nome ou número parecido.
- Cadastros antigos sem referência oficial ficam bloqueados com `comprasgov_reference_required`, sem tentativa de consulta indevida. Os demais portais seguem pendentes.
- O registry de produção contém somente o conector público do Compras.gov.br; sessões, mensagens e convocações retornam vazias porque não são coletadas, e essa ausência é explicitada nas capacidades. Não há indicação de monitoramento de chat ativo.
- O worker e as consultas/importações manuais compartilham um advisory lock PostgreSQL: no máximo uma consulta externa por vez entre as réplicas. Consultas manuais têm limite local adicional de 10 por minuto/IP. Jobs bem-sucedidos são reagendados no mínimo cinco minutos após terminar. O frescor dos dados depende da publicação pela fonte; isso não é tempo real de sessão.
- Timeout de 20 segundos, resposta limitada a 2 MiB, HTTPS/TLS padrão validado e redirecionamentos recusados. Não há URL de destino arbitrária fornecida pelo usuário, nem credenciais de outros serviços enviadas ao portal.
- HTTP 429 respeita `Retry-After` (mínimo local conservador de cinco minutos; máximo de um dia) e grava pausa global compartilhada pela API e worker. Falhas usam backoff; não atualizam `last_success_at`. Resposta vazia, registro diferente, schema incompatível ou retorno ambíguo não viram sucesso.

A especificação consultada não informa uma cota numérica por cliente nessa operação. Os limites locais são cautelas do projeto, não limites oficiais atribuídos ao órgão. Confirmar política com o operador antes de ampliar volume; prevalece qualquer limite oficial mais restritivo.

## Deploy e validação

Nenhuma nova senha ou token é necessário para esta operação pública. Aplicar migrations com o mecanismo já existente antes de executar o worker atualizado. Atualizar API, worker e Pages no commit desta entrega. Preservar Gmail/criptografia/PostgreSQL e manter `WHATSAPP_ENABLED=false`.

Endpoints próprios, todos protegidos por autenticação do LicitaBot:

- `GET /api/comprasgov/contract?type=idCompra&code=...`: consulta somente leitura.
- `POST /api/comprasgov/import`: corpo `{ "lookup": { "type": "idCompra", "code": "..." }, "monitorPublic": false }`; importar somente registro escolhido pelo usuário.
- `GET /api/procurements/:id`: retorna `officialData` e `officialHistory` somente ao proprietário, além do histórico já existente.

Validar no Render uma referência real escolhida pelo usuário, origem/situação, persistência após recarga e tentativas no worker. Não fabricar uma mudança na fonte para produzir e-mail. Os testes offline exercitam a detecção de alteração e sua deduplicação. Envio Gmail já validado em etapa anterior não comprova consulta a dados oficiais nesta nova versão.

Se o serviço público passar a exigir autenticação, retornar 403 ou mudar o contrato, a aplicação registra erro explícito; não tenta contornar nem solicita senha do portal por chat. O próximo escopo de chat/convocações requer documentação e autorização próprias.

## Identificador válido e nenhum resultado

O número de controle PNCP pode existir no Portal Nacional sem estar presente na base do módulo Compras.gov.br consultado. A aplicação não pode concluir inexistência da licitação, plataforma de origem ou erro do usuário a partir de `resultado: []`. O painel agora explica essa distinção e oferece **Consultar este número no PNCP** como consulta separada, somente leitura. A resposta exige o mesmo número de controle antes de exibir dados e identifica fonte/publicador/link HTTPS de origem quando informados. Não importa o registro como Compras.gov.br e não ativa monitoramento de outro portal.

A rota PNCP existente tinha uma expressão regular incorreta (`\\d` literal em vez de dígitos) que rejeitava CNPJ válido. A validação foi corrigida e coberta por teste HTTP. O parâmetro opcional `only=procurement` evita a consulta adicional de contratos nessa operação; o comportamento anterior completo continua disponível para os outros fluxos. O endpoint continua autenticado, com host fixo, timeout, limite de requisições e redirecionamentos recusados.

A interface aceita a variante copiada com hífen antes do ano e a normaliza para a barra PNCP; não altera CNPJ, ano ou sequência. A consulta real ao domínio PNCP a partir deste ambiente continuou bloqueada pelo proxy nesta correção. Os testes dessa rota e da interface usam respostas identificadas como fixtures; ainda é necessário conferir o registro escolhido no ambiente Render/PNCP. Não foi afirmado que os números informados pelo usuário existam no PNCP.

### Pesquisa por UASG e número

O formulário principal pesquisa a operação oficial documentada
`/modulo-contratacoes/1_consultarContratacoes_PNCP_14133`, com UASG de seis
algarismos, modalidade (Pregão código 5 ou Dispensa código 6), datas de publicação
obrigatórias e paginação de dez registros. O período é limitado localmente a 366
dias. O número da compra, sem ano, é um filtro local da página retornada, pois a
operação não documenta esse parâmetro. Totais são da fonte antes desse filtro;
é necessário avançar páginas para conferir os demais registros. Não há varredura
ilimitada ou consultas paralelas. A rota autenticada `/api/comprasgov/search`
compartilha trava, rate limit e cooldown com as consultas existentes.

Selecionar um resultado faz nova consulta oficial por ID antes da importação.
O ano aparece quando informado pela fonte. A consulta avançada PNCP permanece
recolhida. Não há filtros fictícios de participação da empresa, etapa em disputa,
ME/EPP ou chat: a API usada não fornece a mesma pesquisa de sessões autenticadas
da captura de tela. Nenhuma credencial de portal é solicitada.

A pesquisa agora inicia com o ano de publicação inteiro, editável. As datas são
as de publicação, não de abertura da sessão. Em resposta vazia, o usuário pode
ampliar explicitamente para o ano inteiro ou retirar o filtro de número. Essas
ações não substituem 72 por 90072 e não confirmam um registro ausente.

### Link público de acompanhamento: cadastro, sem coletor de sessão

O painel aceita somente o caminho público de acompanhamento em
`https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra=…`.
Extrai o ID de 17 dígitos, sem declarar existência ou conteúdo verificado.
Credenciais na URL, hosts externos, IDs duplicados e fragmentos são recusados;
parâmetros extras não são guardados. A consulta é feita à API de Dados Abertos
existente, não a endpoints internos descobertos no navegador.

Se a base não encontrar o ID, o usuário pode cadastrar explicitamente o link,
órgão e objeto pelo fluxo manual autenticado existente. O backend grava
`source=manual` e `monitoring_enabled=false`. O link pode ser aberto pelo usuário;
isso não coleta sessões nem confirma mensagens. Prazos continuam manuais.

Para o ID `16010205000722026`, a consulta oficial por ID retornou zero registros
em 26/10/2026. O acesso à página SERPRO recebeu HTTP 403 neste ambiente. Isso não
comprova bloqueio ao usuário ou inexistência da compra. Nenhum endpoint de chat
foi validado no contrato público utilizado. A implantação de um coletor de sessão
continua bloqueada pela falta de documentação e acesso oficialmente autorizados;
não há automação de login, reaproveitamento de cookies nem contorno do 403.
