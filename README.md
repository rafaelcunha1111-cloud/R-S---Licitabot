# R&S LicitaBot

Central inicial de monitoramento de licitações, com React + TypeScript + Vite e API Express. Interface em português, responsiva, com sessões pesquisáveis, detalhes, mensagens, convocações, prazos e leitura local de alertas.

## Desenvolvimento

Requer Node.js 24 e npm 11.

```sh
npm ci
npm run dev
```

Vite usa a porta 5173 e encaminha `/api` para Express na porta 3001. O dashboard mantém seu workspace em `localStorage`: cadastros, edições e marcações de leitura sobrevivem à recarga no mesmo navegador/origem. Os exemplos são gerados somente na primeira abertura; atualizar o painel não reinicia seus prazos. Limpar os dados do site remove os cadastros locais e recria os exemplos. Não há banco compartilhado nem sincronização entre dispositivos.

**Operacional:** cadastro e edição manual de licitações, busca e filtros, detalhes de sessões, agenda ordenada, alertas internos de convocação registrada manualmente e prazos nas próximas 24h/vencidos, leitura persistente local. Os alertas de prazo são recalculados a cada 30 segundos enquanto a página está aberta. Alertas lidos conservam sua identidade até a edição do prazo. Sessões encerradas não geram alertas de prazo.

**Demonstrativo:** mensagens de pregoeiros e sessões pré-carregadas. **Não implementado:** coleta de sessões públicas/mensagens, autenticação da equipe, integração real com portais, notificações por email/WhatsApp/push ou em segundo plano. Cadastros manuais são identificados como não verificados; não equivalem a dados oficiais. Não utilize credenciais ou dados sensíveis.

## Prévia no navegador

`npm run build:preview` gera `dist-preview/licitabot-preview.html`, um único HTML com JavaScript e CSS incorporados. Baixe e abra no navegador; não depende da API nem consulta portais. Alguns navegadores restringem armazenamento em arquivos locais; nesses casos o painel informa que as alterações não serão persistidas. A prévia foi também validada via HTTP local.

O workflow `.github/workflows/preview.yml` prepara publicação estática no GitHub Pages, sem credenciais de portais e sem segredos personalizados. Para ativar: **Settings → Pages → Build and deployment → Source: GitHub Actions**, e execute o workflow “Prévia do LicitaBot”. A URL publicada será informada pelo próprio job; não considerar o site publicado apenas pelo push do workflow. A hospedagem será pública conforme as configurações/plano do repositório. A prévia usa somente armazenamento local de cada visitante.

```sh
npm run check
npm test
npm run build
NODE_ENV=production npm start
```

O modo de produção serve o build e a API na porta 3001 (ou `PORT`). Verificação: `GET /api/health`, `GET /api/dashboard`, `GET /api/connectors`. Não expor esta base como serviço com dados reais antes de implementar autenticação e isolamento de clientes.

## Arquitetura de integrações

`server/connectors.ts` define contratos normalizados para Comprasnet, BLL, BNC, Licitanet, Licitar Digital, Portal de Compras Públicas e BBMNET. Todos os conectores estão explicitamente **não configurados**. Não são presumidas APIs públicas, endpoints, fluxos de login ou disponibilidade de cada portal. Nenhum acesso externo aos portais é feito.

Para cada portal, a implementação deverá validar documentação e autorização oficiais, modalidade de acesso (API conveniada, OAuth, certificado ou sessão permitida), escopos, termos, limites de consultas e homologação. Segredos devem ser referenciados por identificadores de um cofre no backend; nunca enviar credenciais ao frontend, registrar tokens em logs ou versionar certificados. CAPTCHA e MFA exigem o fluxo autorizado do portal; não implementar contorno ou automação não autorizada. Esta base não envia lances nem documentos.

Evolução prevista:

- Autenticação da equipe, controle de acesso por função e isolamento por organização em toda consulta e evento.
- PostgreSQL para organizações, usuários, sessões, vínculos com portais, eventos, prazos, regras de alerta e auditoria. Preservar ID de origem, fuso e data de coleta.
- Workers e fila para consultas autorizadas, cursores incrementais, deduplicação por portal/organização/ID externo, backoff e limites específicos por portal.
- Separar coleta de entrega de notificações; implementar outbox, tentativas idempotentes, preferências, confirmação de leitura persistente e trilha de auditoria.
- Reconciliar convocações e prazos com a fonte oficial; distinguir dado desatualizado, erro de coleta e ausência de eventos. A API de demonstração não confirma prazos oficiais.

Os cinco testes atuais verificam os contratos, bloqueio de conectores, cadastro/edição, validação e alertas de prazo. Integrações reais precisam de testes de contrato e homologação individual com credenciais autorizadas.
