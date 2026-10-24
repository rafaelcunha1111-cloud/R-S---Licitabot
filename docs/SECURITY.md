# Segurança e verificações

- Nenhuma credencial real, chave privada ou token de portal é incluído. `.env`, variantes locais, certificados e chaves são ignorados; `.dockerignore` exclui segredos da imagem.
- Somente a URL pública da API usa `VITE_*`. Bundles de Pages não podem conter segredos. Dados do workspace demonstrativo ficam locais e não são importados automaticamente no servidor.
- APIs de negócio exigem Bearer; senhas usam scrypt com salt; tokens aleatórios são armazenados por hash e expiram. Login tem limitação de tentativas e mensagem genérica. Não há conta padrão ou cadastro público.
- CORS usa origem exata. API não usa cookies de autenticação. CORS não substitui autenticação; endpoints validam usuário e propriedade em cada acesso. SQL é parametrizado; validações Zod rejeitam campos extras, inclusive `source=verified` enviado por usuário.
- TLS PostgreSQL é obrigatório em produção, com verificação de certificado. HTTP externo usa HTTPS fixo dos provedores; sem URL de coleta configurável pelo cliente e sem desabilitar validação TLS.
- Respostas autenticadas usam `Cache-Control: no-store`; Helmet, limite de corpo e rate limit são aplicados. Senhas/tokens/corpos de provedores não são registrados. Erros de API são genéricos; logs incluem apenas identificador/código SQL limitado.
- Webhooks têm assinaturas e deduplicação. `provider_accepted`, `delivered`, `delivery_unknown` e falhas são estados distintos. Notificações Meta não têm reenvio automático após resultado incerto.
- Locks e transações PostgreSQL protegem consultas e fila entre réplicas. Testes de fixture nunca habilitam conectores de produção.
- Imagem roda como usuário `node`, sem privilégios root. Gerenciar banco/cofre/contas com menor privilégio, rotação e backups fora do repositório.

## Executado nesta entrega

TypeScript frontend/backend; testes unitários e de integração com PostgreSQL 16 real; aplicação idempotente de migrations; testes de 401, CORS, isolamento entre usuários, validação de origem, deduplicação, concorrência, reenvio, webhook válido/falsificado e assinatura Meta. Auditoria npm de dependências de produção deve ser rodada em cada build; ver relatório final da entrega para seu resultado. Esta lista não é pentest, certificação ou garantia de ausência de vulnerabilidades.

```sh
npm ci
npm --prefix backend ci
npm run check && npm test && npm run build:preview
npm --prefix backend run check
# TEST_DATABASE_URL deve apontar para banco descartável cujo nome termina em _test.
# A suíte trunca as tabelas desse banco; nunca use banco de produção.
npm --prefix backend test
npm --prefix backend run build
npm --prefix backend audit --omit=dev --audit-level=high
```

Sem `TEST_DATABASE_URL`, o teste de integração é explicitamente **skipped**, não aprovado. O workflow de backend cria PostgreSQL efêmero e executa a suíte sem skips. Credenciais de fixture no CI são exclusivas desse container descartável, não credenciais externas.

## Pendências antes de produção real

Homologar todos os provedores e acessos, testar HTTPS/TLS reais e o proxy, validar consentimento/endereços de destinatários, configurar alertas de operação e restauração de backup, retenção/LGPD e procedimento de incidentes. Para equipe maior, integrar IdP com MFA/recuperação e papéis administrativos; revisar rate limit compartilhado caso aumente réplicas. Testes de carga/penetração e análise da infraestrutura externa ainda não foram executados. Não há upload de certificado, senha ou sessão de portal no frontend.
