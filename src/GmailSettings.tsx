import { useEffect, useState } from "react";
type GmailStatus = {
  authorized: boolean;
  oauthReady?: boolean;
  missingVariables?: string[];
  sender: string;
  connectedAt: string | null;
  whatsappEnabled: boolean;
};
export function GmailSettings({
  request,
}: {
  request: (path: string, method?: string, body?: unknown) => Promise<any>;
}) {
  const [status, setStatus] = useState<GmailStatus>();
  const [url, setUrl] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    try {
      setStatus(await request("/api/gmail/status"));
    } catch {
      setMessage(
        "Configuração Gmail disponível somente ao usuário operador da conta remetente.",
      );
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch {
      setMessage(
        "Operação não concluída. Confira configuração/autorização no servidor; envio não confirmado.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="panel info">
      <h2>Gmail OAuth 2.0</h2>
      <p>
        Autorização da conta remetente no Google, sem informar a senha ao
        LicitaBot. Tokens são criptografados no backend.
      </p>
      {status && (
        <>
          <p>
            Conta: {status.sender} •{" "}
            {status.authorized ? "Autorizada" : "Autorização pendente"} •
            WhatsApp: {status.whatsappEnabled ? "habilitado" : "desativado"}
          </p>
          {status.oauthReady === false && (
            <p role="alert">
              Configuração OAuth incompleta no Render:{" "}
              {status.missingVariables?.join(", ")}. Preencha essas variáveis e
              faça redeploy, sem compartilhar os valores secretos.
            </p>
          )}
          <button
            className="outline"
            disabled={busy || status.oauthReady === false}
            onClick={() =>
              void act(async () => {
                const data = await request("/api/gmail/authorize", "POST");
                const parsed = new URL(data.authorizationUrl);
                if (parsed.origin !== "https://accounts.google.com")
                  throw Error();
                setUrl(parsed.toString());
                setMessage(
                  "Abra o link abaixo para autorizar a conta no Google.",
                );
              })
            }
          >
            Preparar autorização Google
          </button>
          {url && (
            <p>
              <a
                className="outline"
                href={url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir consentimento no Google
              </a>
            </p>
          )}
          <button className="outline" onClick={() => void refresh()}>
            Consultar autorização
          </button>
          <button
            className="outline"
            disabled={busy || !status.authorized}
            onClick={() =>
              void act(async () => {
                const result = await request("/api/gmail/test", "POST");
                setMessage(
                  result.status === "provider_accepted"
                    ? "Gmail aceitou o teste. Verifique a caixa da própria conta; entrega ainda não confirmada."
                    : "Envio não confirmado.",
                );
              })
            }
          >
            Enviar teste para a própria conta
          </button>
          <button
            className="outline"
            disabled={busy || !status.authorized}
            onClick={() =>
              void act(async () => {
                await request("/api/gmail/disconnect", "POST");
                setUrl("");
                setMessage(
                  "Conexão local removida. Para revogar a permissão no Google, use a segurança da conta Google.",
                );
                await refresh();
              })
            }
          >
            Desconectar Gmail
          </button>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
