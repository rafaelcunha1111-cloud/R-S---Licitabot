# Implantação contínua — R&S LicitaBot

Estado desta entrega: backend implementado e validado localmente com PostgreSQL real; **não implantado**, sem envio externo homologado e sem monitoramento real dos portais. A execução contínua independe do navegador somente depois de API, worker e banco estarem ativos em infraestrutura sempre ligada. Nenhuma credencial de portal foi utilizada.

## Componentes e contratação

| Componente        | Configuração necessária                                                                                                                                                                                                                                                                                         |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend          | Manter GitHub Pages e seu workflow atual. Definir repository variable pública `VITE_API_URL` com a origem HTTPS da API e executar o workflow de Pages. Não colocar segredos em variáveis `VITE_*`.                                                                                                              |
| API Node.js 24    | Serviço web **sempre ativo**, HTTPS e proxy gerenciado, por exemplo plano pago Render Web Service ou Railway sem suspensão/serverless. Dockerfile em `backend/`.                                                                                                                                                |
| Worker Node.js 24 | Segundo serviço **sempre ativo**, mesma imagem e banco; comando `node dist/worker.js`. Não é cron do navegador nem GitHub Actions agendado.                                                                                                                                                                     |
| Banco             | PostgreSQL 16+ gerenciado, armazenamento persistente, backups automáticos/PITR e restauração testada. Banco não deve usar disco efêmero do serviço web.                                                                                                                                                         |
| E-mail            | Conta Resend, domínio remetente validado, DNS SPF/DKIM/DMARC, chave de envio no cofre do provedor e webhook assinado. Habilitar preferências do usuário após validar destinatário.                                                                                                                              |
| WhatsApp          | Meta Business/WABA, número habilitado, token de sistema com permissões de envio, versão Graph suportada, template aprovado com **dois parâmetros de corpo** (título e descrição), idioma e opt-in do destinatário. Configurar assinatura e challenge do webhook. Sujeito a aprovação e tarifação Meta/provedor. |
| Portais           | Homologação de cada interface oficial, autorização, escopos e limites. **Nenhum conector de coleta está disponível nesta entrega.**                                                                                                                                                                             |
| Operação          | Monitor externo para HTTPS `/health/ready`, alerta para heartbeat ausente do worker, logs sem dados sensíveis, orçamento, rotação de chaves, backups e retenção.                                                                                                                                                |

Preços e nomes de planos podem mudar. `render.yaml` é um modelo revisável, não prova de contratação ou implantação. Não há serviço externo contratado nem URL nova publicada por esta implementação.

## Ambiente local

Instalar separadamente o frontend e o backend:

```sh
npm ci
npm --prefix backend ci
npm run dev
```

O comando de desenvolvimento original mantém a demonstração; para o backend persistente, copie `backend/.env.example` para `backend/.env` (ignorado pelo Git), configure um banco local e use `NODE_ENV=development`. Um banco local pode usar conexão sem TLS no desenvolvimento. A rede privada do Render possui uma política interna específica descrita abaixo. No diretório `backend`:

```sh
node --env-file=.env --import tsx src/migrate.ts
node --env-file=.env --import tsx src/index.ts
# Em outro terminal:
node --env-file=.env --import tsx src/worker.ts
```

Não execute o servidor demonstrativo da raiz e a API persistente na mesma porta. A demonstração do Pages continua independente; a aba **Servidor** usa `VITE_API_URL`. Para frontend de desenvolvimento, usar `VITE_API_URL=http://localhost:3001` e `FRONTEND_ORIGIN=http://localhost:5173`. Na produção ambos devem usar HTTPS.

`FRONTEND_ORIGIN` deve ser **https://rafaelcunha1111-cloud.github.io**, sem `/R-S---Licitabot` e sem barra final. CORS distingue origem, não caminho. O backend não aceita origens diferentes. O proxy de produção deve remover cabeçalhos encaminhados enviados pelo cliente; a API confia em um salto de proxy. Se a topologia mudar, revisar `trust proxy` e os limites de requisição antes de expor o serviço. Rate limiting atual é por processo; para várias réplicas públicas, acrescentar rate limit compartilhado no gateway.

## Render

1. Provisionar PostgreSQL gerenciado com persistência e backups. Na mesma rede/região Render, usar a Internal Database URL original com a política interna abaixo. Para URL externa, exigir TLS e obter CA confiável se a cadeia não estiver no trust store da imagem. Não usar `rejectUnauthorized=false` nem `NODE_TLS_REJECT_UNAUTHORIZED=0`.
2. Criar Blueprint com `render.yaml` ou dois serviços Docker a partir de `backend/Dockerfile`, contexto `backend`. Revisar custos e planos. Preencher `DATABASE_URL` e `FRONTEND_ORIGIN` no grupo compartilhado do cofre/Environment Group.
3. A API usa `node dist/index.js`; pre-deploy `node dist/migrate.js`; health check `/health/ready`. O worker usa `node dist/worker.js`. As migrations são transacionais e serializadas por advisory lock. Não executar migrations destrutivas em versões futuras sem plano de compatibilidade/backup.
4. Compartilhar configuração de banco e provedores entre API e worker. As credenciais de envio ficam no worker; segredos de webhook ficam na API. É permitido separar os grupos posteriormente pelo princípio de menor privilégio.
5. Criar o usuário inicial pelo console seguro do serviço, conforme abaixo. Não existe cadastro público ou conta padrão.
6. Configurar `VITE_API_URL` nas Actions Variables do GitHub e republicar o frontend. Apenas a URL pública da API vai para o bundle.

## PostgreSQL: conexão interna Render e TLS externo

A configuração anterior forçava TLS para qualquer `NODE_ENV=production`. Isso tentava validar o certificado também na URL interna e era compatível com a falha relatada `DEPTH_ZERO_SELF_SIGNED_CERT`. O erro significa que a conexão TLS recebeu um certificado autoassinado não confiável; o código não tinha distinção entre transporte privado interno e externo. Não houve acesso aos logs ou ao banco real do usuário nesta correção.

`DATABASE_SSL_MODE` agora define a política usada por API, worker, migrations e provisionamento:

| Política          | Comportamento                                                                                                                                                                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auto` (padrão)   | Na plataforma (`RENDER=true`, marcador injetado pelo Render), hostname interno curto estritamente no formato `dpg-<id>-<letra>` e sem pedido explícito de TLS/CA: `pg.ssl=false`. Outros hosts em produção continuam com `rejectUnauthorized:true`. |
| `render-internal` | Opt-in explícito para a URL interna curta do PostgreSQL Render. Usa `ssl:false` somente nessa conexão e rejeita hosts externos, TLS exigido na URL ou CA conflitante.                                                                               |
| `verify-full`     | TLS com validação de certificado e hostname, inclusive quando o host é interno. `DATABASE_CA_CERT` fornece um arquivo PEM confiável quando necessário.                                                                                              |

Para corrigir a API que usa **Internal Database URL**: manter `NODE_ENV=production`, usar a URL interna original fornecida pelo Render, definir `DATABASE_SSL_MODE=auto` (ou `render-internal` para opção explícita), não acrescentar `sslmode=require/verify-full` nem `DATABASE_CA_CERT` nessa conexão privada e fazer redeploy. Não definir manualmente `RENDER=true` fora da plataforma para tentar classificar uma conexão externa como interna. Se a URL interna real não corresponder ao formato restrito suportado, a aplicação mantém TLS; investigar a topologia antes de ampliar a regra.

URLs externas, inclusive `dpg-…-a.<região>-postgres.render.com`, não são tratadas como internas. Usar TLS validado e configurar a CA correta quando necessária. Pedidos explícitos `sslmode=require`, `verify-ca`, `verify-full` ou `ssl=true` mantêm verificação completa mesmo em `auto` no Render. `sslmode=no-verify`, modos ambíguos, parâmetros duplicados e desativação externa de TLS em produção são rejeitados. O código remove opções SSL/libpq da URL antes de entregá-la ao `pg`, para impedir que o parser substitua o objeto SSL seguro; certificados pela URL não são aceitos, usar `DATABASE_CA_CERT`.

Não há retry com SSL enfraquecido após falha de certificado, nem alteração de TLS global. `ssl:false` é específico da conexão PostgreSQL privada autorizada; HTTPS dos provedores continua validado. Após redeploy, verificar migrations, `/health/ready` e login. Sucesso local não confirma o deploy Render.

## Railway

Criar PostgreSQL persistente e dois serviços do mesmo repositório com Root Directory `/backend`. O `railway.json` é a configuração da **API**: migrations pre-deploy, `/health/ready` e reinício por falha. Para o **worker**, sobrescrever comando para `node dist/worker.js`, remover health check HTTP e não reutilizar a configuração de saúde da API. Pode-se desabilitar seu pre-deploy após a API aplicar migrations. Desativar sleep/serverless para ambos. Usar domínio HTTPS para a API e URL PostgreSQL com TLS verificável. Ajustar a referência gerenciada ao banco nos dois serviços; não colocar sua URL no GitHub.

## Usuário inicial e autenticação

A CLI lê a senha de stdin, usa scrypt e grava somente o hash. No console seguro de um serviço, com o ambiente já configurado:

```sh
read -r -s -p 'Senha inicial (12 a 128 caracteres): ' LICITABOT_INITIAL_PASSWORD
printf '%s' "$LICITABOT_INITIAL_PASSWORD" | node dist/create-user.js operador@seu-dominio.com
unset LICITABOT_INITIAL_PASSWORD
```

Não digitar senha na linha de comando ou usar shell com `set -x`. O comando não imprime a senha. Não há senha inicial no código. API usa Bearer aleatório de 256 bits, hash SHA-256 no banco e validade de 12 horas. Logout revoga a sessão. O frontend guarda o token apenas em memória e o perde ao recarregar. O administrador deve validar controle do endereço do usuário antes de provisionar/permitir envio. Rotação de senha/MFA e recuperação de conta ainda dependem de implementação ou substituição por IdP OIDC; não há formulário público de recuperação.

## Banco e migrations

`backend/migrations/001_initial.sql` cria usuários, sessões de autenticação, licitações, sessões de pregões, mensagens, view de convocações, prazos, histórico de consultas, eventos, notificações, recibos e heartbeat. Dados de demonstração não são inseridos. Todo cadastro via API é `manual`; somente ingestão transacional por conector autorizado pode marcar mensagens/sessões/prazos como `verified` e registrar `last_success_at`. Os metadados do cadastro (órgão/objeto) permanecem manuais: o contrato atual não os coleta nem promove sua origem; `verified_at` está reservado para futura homologação desses metadados.

Use papéis separados de migration e runtime antes de produção com maior exposição: o runtime precisa de SELECT/INSERT/UPDATE/DELETE nas tabelas da aplicação e não precisa de CREATE/ALTER/DROP. CLI de provisionamento de usuários deve ser reservada à administração. Estabelecer retenção e jobs de manutenção para histórico/recibos e revisar LGPD; as tabelas não possuem exclusão automática nesta versão. Endpoints de lista têm limites fixos (200 cadastros/notificações, 100 mensagens, 50 consultas); paginação de histórico extenso ainda é evolução necessária.

## Agenda e fila

Worker acorda a cada 10 segundos e seleciona até 20 licitações vencidas por ciclo. Cada licitação recebe nova tentativa **no mínimo cinco minutos após o término**; falhas têm backoff até uma hora. Um advisory lock PostgreSQL impede consultas paralelas até entre réplicas. A política atual é conservadora: uma consulta de portal por vez no conjunto inteiro. Um conector homologado deverá impor também os limites oficiais de seu portal, prazo máximo de 20 segundos, cursor e tamanho de lote; se o limite oficial for mais restritivo, prevalece o limite oficial. Carteiras grandes podem atrasar além de cinco minutos; escalar exige medir backlog e manter limites por portal.

Sem conector, a tentativa fica `blocked/pending_authorized_integration`, sem requisição ao portal, sem mensagem inventada e sem alterar `last_success_at`. Ingestão bem-sucedida salva mensagens/convocações e alertas na mesma transação. Chaves únicas impedem eventos e notificações duplicados.

Prazos manuais também geram alertas no worker sem navegador. Há eventos separados de proximidade (até 24 horas) e vencimento, deduplicados por prazo/data/etapa. Concluir um prazo interrompe novos alertas; não cancela notificações já enfileiradas. Alertas de proximidade/vencimento não confirmam o prazo oficial de um cadastro manual.

A fila usa `FOR UPDATE SKIP LOCKED`, lease de dois minutos, até cinco tentativas efetivas e backoff. Falta de configuração mantém `pending_configuration`, não consome tentativas nem finge envio. Opt-out impede futuros despachos. E-mails usam chave de idempotência estável e não são reprocessados automaticamente depois de 23 horas, dentro da janela de 24h do Resend. `provider_accepted` não significa `delivered`: entrega só é confirmada por webhook assinado. Resultados desconhecidos do WhatsApp ficam `delivery_unknown` para reconciliação, sem reenvio cego que poderia duplicar alerta. O operador deve investigar esses registros e nunca alterar para “entregue” sem prova. A política oferece prevenção de duplicidade; não promete exactly-once entre redes e provedores.

## Configurar notificações sem fingir envio

- Resend: `RESEND_API_KEY`, `EMAIL_FROM`; webhook HTTPS `/webhooks/resend`, eventos `email.delivered`, `email.bounced`, `email.failed`, `email.complained`, segredo `RESEND_WEBHOOK_SECRET`. Assinatura Svix verificada no corpo bruto com tolerância temporal da biblioteca.
- WhatsApp: `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_GRAPH_VERSION`, `WHATSAPP_TEMPLATE`, `WHATSAPP_LANGUAGE`; webhook `/webhooks/whatsapp`, app secret `WHATSAPP_APP_SECRET` e challenge `WHATSAPP_VERIFY_TOKEN`. POSTs exigem HMAC SHA-256 e recibos são deduplicados. Template deve ter dois parâmetros de corpo conforme o adaptador. Nenhum cadastro de telefone é verificação automática de titularidade; confirmar opt-in e evidência com o destinatário antes de habilitar.
- Provedores só são chamados quando existem configuração e opt-in. Nesta entrega foram testados apenas transportes falsos **dentro dos testes**, sem envio real.

## Aceite da implantação

Antes de declarar 24h ativo:

1. Aplicar migrations duas vezes (segunda sem alterações), validar backups/restauração e persistência após reiniciar serviços.
2. Verificar `/health/live` e `/health/ready` via HTTPS; autenticar e verificar `/api/status`: banco disponível, heartbeat recente e status pendente real de cada portal.
3. Pela aba Servidor, cadastrar licitação e prazo; fechar navegador, aguardar worker, reabrir e confirmar notificação persistente e consulta bloqueada enquanto não há conector.
4. Com conta de teste autorizada, homologar e-mail, webhook de entrega, WhatsApp/template/opt-in e falhas/reenvios. Confirmar que nenhum resultado desconhecido se tornou entrega presumida.
5. Homologar interface oficial do Comprasnet com o responsável, implementar adaptador e seus testes de contrato; só então habilitar coleta. Validar dados reais e horário de última consulta com evidências, sem inserir fixtures na produção.
6. Testar 401, isolamento entre usuários, CORS, revogação, assinatura de webhooks, limites de requisição, falha de banco, reinício do worker e alarmes operacionais. Executar CI sem skips.
7. Observar operação contínua e alertas externos durante uma janela acordada. Uma máquina local, teste de unidade, deploy de Pages ou heartbeat isolado não prova monitoramento 24h.
