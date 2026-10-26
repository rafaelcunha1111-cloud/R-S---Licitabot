# Gmail API — construcenter.licitacao@gmail.com

**Estado:** integração implementada e testada com fixtures, mas projeto/cliente OAuth, consentimento, configuração Render e envio real não foram validados por esta entrega. Não há ferramenta autenticada para administrar Google Cloud/Render nesta sessão. O arquivo de credencial Google do ambiente não demonstrou autorização para a conta solicitada e não foi utilizado. A consulta pública à API Render foi bloqueada pelo proxy (403); isso não prova que a API esteja fora do ar.

O repositório já continha envio Gmail por `GMAIL_REFRESH_TOKEN` no Render; esse caminho foi preservado. Não recriar um projeto ou OAuth client que o usuário já tenha configurado: conferir os recursos existentes primeiro. Tokens já presentes no Render não podem ser lidos ou validados por este ambiente.

## Google Cloud Console

1. Entrar em https://console.cloud.google.com/ com **construcenter.licitacao@gmail.com**. Confirmar a conta no avatar. Senha e MFA permanecem exclusivamente no Google.
2. No seletor de projetos, usar o projeto existente do LicitaBot, se houver. Caso contrário, clicar **Novo projeto**, nome **R&S LicitaBot**, revisar o Project ID gerado e criar. Não há Project ID criado ou inventado nesta entrega.
3. Em **APIs e serviços → Biblioteca**, pesquisar **Gmail API** e habilitar `gmail.googleapis.com` no projeto selecionado.
4. Em **Google Auth Platform**, configurar **Branding**, **Audience** e **Data Access** (interfaces antigas podem exibir “Tela de consentimento OAuth”). Para conta pessoal Gmail, o público é **External**. Usar nome do aplicativo e e-mail de suporte reais. Se estiver em Testing, adicionar a conta acima como test user.
5. Solicitar somente `openid`, `email` e `https://www.googleapis.com/auth/gmail.send`. O aplicativo não precisa de leitura da caixa, contatos ou Drive para enviar alertas. Escopos existentes de outros aplicativos não são reutilizados automaticamente.
6. Em **Clients → Create client → Web application**, criar ou ajustar o cliente OAuth 2.0. Em **Authorized redirect URIs**, cadastrar exatamente:

   `https://rs-licitabot-api.onrender.com/oauth/gmail/callback`

   Não usar o GitHub Pages como callback e não cadastrar uma URL diferente no backend. O backend é um cliente confidencial; o segredo fica somente no Render.

7. Copiar Client ID e Client secret **diretamente para Environment no Render**, não para o chat, GitHub, frontend ou este documento. Não usar senha Google, app password ou conta de serviço para substituir o consentimento OAuth da caixa Gmail pessoal.
8. Antes de depender da automação contínua, revisar a política OAuth: em modo Testing com esses escopos, refresh tokens podem expirar em sete dias. Publicação para produção, escopo sensível Gmail Send, consentimento e eventual verificação dependem das regras e análise atuais do Google. Não prometer token permanente ou contornar a verificação.

Alternativa CLI, somente para projeto/API: após login seguro com a conta indicada e instalação do gcloud, executar `bash scripts/setup-gmail-project.sh PROJECT_ID --create` para criar e habilitar a API, ou omitir `--create` para um projeto já existente. Substituir PROJECT_ID pelo ID real escolhido. O script não foi executado contra o Google nesta entrega; não configura a tela de consentimento, não gera OAuth secrets e não envia mensagem.

## Render: API e worker

A URL pública informada pelo usuário é `https://rs-licitabot-api.onrender.com`. O worker contínuo precisa compartilhar PostgreSQL e configuração de envio com a API. Somente publicar o Web Service não processa alertas automaticamente.

| Variável                     | Configuração                                                                                                                                                                         |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `EMAIL_PROVIDER`             | `gmail` para seleção explícita. `auto` preserva a escolha antiga quando já existe configuração Gmail completa. Não há fallback automático para outro remetente após erro de Gmail.   |
| `GMAIL_CLIENT_ID`            | Client ID real no Environment seguro do Render.                                                                                                                                      |
| `GMAIL_CLIENT_SECRET`        | Client secret real no Environment seguro do Render.                                                                                                                                  |
| `GMAIL_SENDER_EMAIL`         | `construcenter.licitacao@gmail.com`                                                                                                                                                  |
| `GMAIL_OPERATOR_EMAIL`       | Usuário administrador do **LicitaBot**, não a identidade Google. Padrão preservado: `rafaelcunha1111@gmail.com`, conforme o primeiro acesso administrativo já existente.             |
| `GMAIL_REDIRECT_URI`         | `https://rs-licitabot-api.onrender.com/oauth/gmail/callback`                                                                                                                         |
| `GMAIL_TOKEN_ENCRYPTION_KEY` | Chave de 32 bytes aleatórios em base64, igual na API e no worker. Não publicar, compartilhar em chat ou regenerar a cada deploy.                                                     |
| `GMAIL_REFRESH_TOKEN`        | Compatibilidade com a configuração anterior. Se já foi autorizado e inserido no Render, pode continuar sendo utilizado sem o novo fluxo do painel. Não copiar para este repositório. |
| `ALERT_RECIPIENT_EMAIL`      | Destino de alertas opcional já existente, preservado. Se ausente, usa o e-mail de cada usuário com alertas habilitados. O teste Gmail é sempre para a própria conta remetente.       |
| `WHATSAPP_ENABLED`           | `false` na API e no worker. Token/opt-in antigos não habilitam envio enquanto este bloqueio estiver ativo.                                                                           |

Para gerar a chave, executar uma única vez em terminal seguro `node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"` e copiar o resultado diretamente para o Render. Não enviar o resultado ao assistente nem registrar em arquivo versionado. A chave criptografa os refresh tokens no PostgreSQL com AES-256-GCM. Perder ou trocar a chave sem migração exige nova autorização.

Aplicar migrations pelo mecanismo existente (`node dist/migrate.js`; a API atual também aplica migrations ao iniciar). A migration nova é `005_gmail_oauth.sql`, que preserva as migrations de Drive e cria tabelas OAuth, auditoria de testes e identificação do provedor nas notificações. Fazer redeploy da API e do worker. Não alterar as variáveis PostgreSQL/TLS já corrigidas para resolver OAuth.

## Autorizar e testar

1. Publicar o frontend atualizado mantendo `VITE_API_URL=https://rs-licitabot-api.onrender.com` como variável **pública** de build. Nenhuma variável `GMAIL_*` vai para `VITE_*`.
2. Entrar no LicitaBot, aba **Servidor**, com o usuário administrador configurado em `GMAIL_OPERATOR_EMAIL`. Essa senha é a do aplicativo, não a senha Google. O primeiro acesso e a importação de pastas Drive existentes foram preservados.
3. Na seção **Gmail OAuth 2.0**, clicar **Preparar autorização Google** e abrir o link de consentimento. Entrar na conta Google remetente e autorizar. O callback verifica assinatura/audience/expiração do ID token, e-mail verificado, conta exata, `state` de uso único e PKCE. O refresh token fica criptografado no banco e nunca retorna ao frontend.
4. Voltar ao painel e clicar **Consultar autorização**. Apenas configuração ou consentimento não significam envio testado.
5. Clicar **Enviar teste para a própria conta** uma vez. Alternativamente, administrador autenticado pode chamar `POST /api/gmail/test`; não aceita destinatário arbitrário. Há limite de três testes por hora/IP.
6. `provider_accepted` com ID Gmail indica aceitação da mensagem pela API, **não confirmação de entrega na caixa**. Conferir recebimento na própria conta, inclusive spam. O aplicativo não solicita leitura da caixa para confirmar isso. O teste é identificado como teste e não simula coleta de licitações.
7. Habilitar preferências de e-mail e manter o worker ativo para os alertas de eventos/prazos efetivamente registrados. Não declarar monitoramento real de Comprasnet: os conectores de portais continuam pendentes.

O worker preserva provider, deduplicação e histórico. Gmail não possui uma chave de idempotência de envio documentada equivalente à do Resend: timeout/5xx após tentativa de envio ou lease expirada ficam `delivery_unknown`, sem reenvio cego. Falha temporária ao obter access token pode ser repetida porque ainda não enviou a mensagem. Tokens revogados deixam a fila pendente de reautorização. Cotas e limites são os da conta Google; Gmail pessoal não substitui automaticamente um provedor transacional para alto volume.

O botão Desconectar remove tokens OAuth do banco e estados pendentes. Se houver `GMAIL_REFRESH_TOKEN` no Render, remover essa variável antes de desconectar; caso contrário, o caminho anterior ainda teria acesso. Revogar a permissão em https://myaccount.google.com/permissions se quiser invalidar o acesso também no Google. Não remover autorizações não relacionadas ao LicitaBot.

## Endpoints e segurança

- `POST /api/gmail/authorize`, `GET /api/gmail/status`, `POST /api/gmail/test`, `POST /api/gmail/disconnect`: exigem login e usuário operador específico.
- `GET /oauth/gmail/callback`: público por necessidade OAuth, protegido por state aleatório com expiração, PKCE e verificação da identidade Google. Resposta sem tokens, `no-store` e `no-referrer`.
- A senha Google nunca é solicitada pelo backend. Logs do proxy/Render não devem registrar query strings OAuth; revisar a política de logs do ambiente. Códigos OAuth são temporários, de uso único e vinculados ao verifier, mas não devem ser compartilhados.
- Não registrar corpos das respostas Google, Client secret, access/refresh tokens, chaves de criptografia ou headers Authorization. O botão de desconexão não apaga o histórico de alertas.

## Falha no retorno OAuth

O callback agora mostra somente um código seguro e uma orientação específica, e registra apenas esse código nos logs (`gmail_oauth_failed`). Nunca pedir a URL completa do callback ou a resposta bruta do Google: elas podem conter dados temporários de autorização.

| Código                                                              | Próximo passo                                                                                                                                    |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `invalid_oauth_state`                                               | Preparar novo link no painel e concluir em até dez minutos; não atualizar a página do callback nem reutilizar link antigo.                       |
| `oauth_invalid_client`                                              | Conferir se o ID e o novo segredo no Render pertencem ao mesmo cliente Web; salvar/redeploy.                                                     |
| `oauth_invalid_grant`                                               | Gerar novo link. Se persistir, conferir retorno OAuth e coerência da configuração; código expirado/usado e PKCE também podem causar essa recusa. |
| `oauth_key_mismatch`                                                | Manter a mesma chave de criptografia na API entre geração do link e callback e iniciar novamente.                                                |
| `wrong_google_account`                                              | Escolher a conta de GMAIL_SENDER_EMAIL, prevista como construcenter.licitacao@gmail.com.                                                         |
| `offline_send_permission_missing`                                   | Conferir que o consentimento concedeu gmail.send.                                                                                                |
| `oauth_refresh_token_missing`                                       | Refazer consentimento offline por novo link.                                                                                                     |
| `oauth_token_network_error` ou `oauth_identity_verification_failed` | Verificar conectividade/identidade no servidor; nunca desativar validação TLS ou do ID token.                                                    |
| `oauth_state_storage_failed` ou `oauth_token_storage_failed`        | Verificar migrations e conexão PostgreSQL.                                                                                                       |

A seção Gmail do painel mostra os nomes das variáveis OAuth ausentes, sem seus valores, e bloqueia a preparação enquanto a configuração estiver incompleta. Essa melhoria de diagnóstico não confirma a causa de uma falha anterior nem conclui autorização/envio real automaticamente. Fazer deploy da API para obter o novo código antes de repetir o fluxo.
