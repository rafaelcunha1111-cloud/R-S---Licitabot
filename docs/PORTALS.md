# Integrações oficiais e estado de acesso

Há um conector de leitura de dados públicos do Compras.gov.br; chat e convocações continuam sem conector homologado. Consulte [COMPRASGOV.md](COMPRASGOV.md) para o escopo implementado e as evidências. Não se presume autorização para scraping, login automatizado ou leitura de chat porque o edital é público. Não há contorno de CAPTCHA/MFA, certificado ou restrição de sessão. Não se enviam lances ou documentos.

| Prioridade | Portal                      | Dados potencialmente públicos                                                                                                                                                          | Mensagens/convocações e acesso                                                                                                                                          |
| ---------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1          | Comprasnet / Compras.gov.br | Avisos, contratações e outros conjuntos expressamente publicados nos canais oficiais de dados abertos, conforme documentação/licença de cada conjunto. Não é evidência de API de chat. | Nenhuma interface de chat/convocações homologada. Confirmar com o operador se há API oficial, convênio, escopo de leitura e credenciais autorizadas para o caso de uso. |
| 2          | BLL                         | Somente informações que o próprio portal disponibilizar publicamente e permitir consultar pela interface documentada.                                                                  | Documentação, permissões, autenticação e limites pendentes de validação com o operador.                                                                                 |
| 3          | BNC                         | Mesma restrição: publicidade de edital não autoriza qualquer automação.                                                                                                                | Integração oficial não disponível no projeto.                                                                                                                           |
| 4          | Licitanet                   | Consultas públicas conforme documentação e termos efetivamente publicados.                                                                                                             | Integração oficial não disponível no projeto.                                                                                                                           |
| 5          | Licitar Digital             | Consultas públicas conforme documentação e termos efetivamente publicados.                                                                                                             | Integração oficial não disponível no projeto.                                                                                                                           |
| 6          | Portal de Compras Públicas  | Consultas públicas conforme documentação e termos efetivamente publicados.                                                                                                             | Integração oficial não disponível no projeto.                                                                                                                           |
| 7          | BBMNET                      | Consultas públicas conforme documentação e termos efetivamente publicados.                                                                                                             | Integração oficial não disponível no projeto.                                                                                                                           |

“Potencialmente público” não confirma campo específico, licença, estabilidade, acesso automatizado ou disponibilidade de mensagens. Cada adaptador só pode ser habilitado após documentar a base de acesso, autorização/licença, endpoints oficiais, escopos de autenticação, limites, cursores, fuso, conteúdo permitido e retenção. Dados de PNCP/dados abertos de contratações não substituem a comunicação em tempo real de um pregão.

Pontos oficiais para iniciar a validação Compras.gov.br:

- https://www.gov.br/compras/pt-br/acesso-a-informacao/dados-abertos
- https://dadosabertos.compras.gov.br/swagger-ui/index.html

O acesso antes bloqueado foi liberado. A especificação oficial e uma consulta pública foram inspecionadas e verificadas na primeira fase descrita em COMPRASGOV.md. Não se implementam endpoints inferidos ou autenticação de sessão. O projeto não solicita senha do Comprasnet.

## Homologação do primeiro conector

1. Obter documentação e permissão oficial específica para acompanhar mensagens/convocações das sessões pretendidas, ou limitar o escopo aos dados abertos expressamente documentados.
2. Definir identidade externa estável da licitação/sessão, cursor incremental, deduplicação, datas/fuso e comportamento de correções. Registrar escopo e limites em documento versionado sem segredos.
3. Implementar `AuthorizedConnector.collect` em `backend/src/portals.ts` (preferir novo módulo). Somente o backend lê segredos pelo ambiente/cofre. Não aceitar URL arbitrária de usuário: destinos devem ser oficiais e fixos (proteção SSRF).
4. Respeitar `AbortSignal`, timeout de 20s e limites mais restritivos que cinco minutos, quando aplicáveis. Uma coleta parcial/erro de autenticação nunca pode retornar uma lista vazia como se fosse sucesso.
5. Criar testes de contrato com fixtures identificadas como teste e homologação externa autorizada. Validar o conteúdo real e campo de origem antes de registrar o adaptador no `productionConnectors`.
6. Atualizar metadados `portalStatus`, indicadores de monitoramento e documentação somente após evidência real. Atualmente `monitoringActive=false` continua indicando que não há monitoramento de mensagens/convocações. O único adaptador de produção é de dados públicos do Compras.gov.br, ativado por referência oficial e opção do usuário.

A detecção, persistência e deduplicação de mensagens/convocações foram exercitadas com um adaptador injetado exclusivamente no teste PostgreSQL. Isso valida a infraestrutura de ingestão; não valida acesso ou coleta do Comprasnet.
