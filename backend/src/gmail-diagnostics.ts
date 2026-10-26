const guidance = {
  gmail_pending_configuration:
    "Confira GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REDIRECT_URI e GMAIL_TOKEN_ENCRYPTION_KEY no Render.",
  invalid_oauth_state:
    "O link expirou ou já foi utilizado. Volte ao painel e clique novamente em Preparar autorização Google; não reutilize a aba antiga.",
  oauth_state_storage_failed:
    "O servidor não conseguiu consultar o estado OAuth no PostgreSQL. Confira migrations e disponibilidade do banco.",
  oauth_key_mismatch:
    "A chave de criptografia mudou desde a criação do link. Confira se a API usa uma chave estável e prepare uma nova autorização.",
  oauth_token_network_error:
    "O servidor não conseguiu consultar o Google. Aguarde e inicie uma nova autorização.",
  oauth_invalid_client:
    "O Google recusou o cliente OAuth. Confira no Render se Client ID e novo Client secret pertencem ao mesmo cliente Web e faça redeploy.",
  oauth_invalid_grant:
    "O Google recusou o código de autorização. Ele pode ter expirado, já ter sido usado ou não corresponder ao retorno/PKCE. Prepare um novo link; confira o callback configurado.",
  oauth_redirect_mismatch:
    "Confira GMAIL_REDIRECT_URI e o retorno cadastrado no Google: https://rs-licitabot-api.onrender.com/oauth/gmail/callback.",
  oauth_access_denied:
    "A autorização foi recusada. Confira a conta e os usuários de teste no Google; depois inicie novamente pelo painel.",
  oauth_exchange_failed:
    "O Google recusou a troca de autorização. Confira o cliente OAuth no Google e as variáveis correspondentes no Render.",
  offline_send_permission_missing:
    "O Google não concedeu gmail.send. Prepare um novo link e confira a permissão de envio no consentimento.",
  oauth_refresh_token_missing:
    "O Google não retornou refresh token. Prepare uma nova autorização com consentimento para acesso offline.",
  oauth_id_token_missing:
    "A permissão de identidade não foi concedida. Prepare uma nova autorização e confira as permissões de identidade e envio.",
  oauth_identity_verification_failed:
    "Não foi possível validar a identidade assinada pelo Google. Confira o Client ID e a conectividade do servidor; inicie novamente.",
  wrong_google_account:
    "Autorize com a conta definida em GMAIL_SENDER_EMAIL, atualmente prevista como construcenter.licitacao@gmail.com, e confira se o e-mail Google está verificado.",
  oauth_token_storage_failed:
    "A autorização não pôde ser salva com segurança. Confira migrations, conexão do banco e chave de criptografia.",
  oauth_internal_error:
    "Ocorreu uma falha interna. Consulte os logs do Render sem compartilhar tokens, códigos OAuth ou segredos.",
} as const;
export function oauthDiagnostic(error: unknown) {
  const candidate = error instanceof Error ? error.message : "";
  const code = Object.hasOwn(guidance, candidate)
    ? (candidate as keyof typeof guidance)
    : "oauth_internal_error";
  return { code, guidance: guidance[code] };
}
export function googleExchangeError(error: unknown) {
  const value =
    typeof error === "object" && error !== null && "error" in error
      ? (error as { error: unknown }).error
      : undefined;
  const codes: Record<string, string> = {
    invalid_client: "oauth_invalid_client",
    unauthorized_client: "oauth_invalid_client",
    invalid_grant: "oauth_invalid_grant",
    redirect_uri_mismatch: "oauth_redirect_mismatch",
    access_denied: "oauth_access_denied",
  };
  return new Error(
    typeof value === "string" && Object.hasOwn(codes, value)
      ? codes[value]
      : "oauth_exchange_failed",
  );
}
