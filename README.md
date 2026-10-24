# R&S LicitaBot

Central inicial de monitoramento de licitações, com React + TypeScript + Vite e API Express. Interface em português, responsiva, com sessões pesquisáveis, detalhes, mensagens, convocações, prazos e leitura local de alertas.

## Desenvolvimento

Requer Node.js 24 e npm 11.

```sh
npm ci
npm run dev
```

Vite usa a porta 5173 e encaminha `/api` para Express na porta 3001. Os dados são fictícios e os prazos relativos são gerados em cada consulta. Atualizar o painel reinicia os prazos demonstrativos. As marcações de leitura existem somente na memória do navegador. Horários seguem o fuso do navegador. Não há usuário autenticado, armazenamento persistente, notificações externas ou monitoramento real nesta versão.

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

Os testes atuais verificam o contrato demonstrativo, os sete portais e o bloqueio de conectores não configurados. Integrações reais precisam de testes de contrato e homologação individual com credenciais autorizadas.
