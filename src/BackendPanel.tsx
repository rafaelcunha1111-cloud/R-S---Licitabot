import { GmailSettings } from "./GmailSettings";
import { useState, useEffect } from "react";
const api = import.meta.env.VITE_API_URL?.replace(/\/$/, "") || "";
type Procurement = {
  id: string;
  portal: string;
  external_ref: string;
  agency: string;
  object: string;
  source: "manual" | "verified";
  monitoring_enabled: boolean;
  last_success_at: string | null;
  last_error: string | null;
  next_check_at: string;
};
type Notice = {
  id: string;
  title: string;
  body: string;
  channel: string;
  status: string;
  source: string;
  read_at: string | null;
  last_error: string | null;
};
type Status = {
  database: string;
  monitoringActive: boolean;
  worker: { healthy: boolean; heartbeatAt: string | null };
  providers: { email: string; whatsapp: string };
  portals: {
    portal: string;
    status: string;
    last_success_at?: string;
    reason: string;
  }[];
};
type Detail = {
  messages: { id: string; body: string; kind: string; occurred_at: string }[];
  sessions: { id: string; status: string; source: string }[];
  deadlines: {
    id: string;
    title: string;
    due_at: string;
    source: string;
    completed_at: string | null;
  }[];
  history: {
    id: string;
    status: string;
    started_at: string;
    error_code: string | null;
  }[];
};
const timestamp = (v: string | null | undefined) =>
  v ? new Date(v).toLocaleString("pt-BR") : "Nenhuma";
const names = [
  "Comprasnet",
  "BLL",
  "BNC",
  "Licitanet",
  "Licitar Digital",
  "Portal de Compras Públicas",
  "BBMNET",
];
export function BackendPanel() {
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<Status>();
  const [items, setItems] = useState<Procurement[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [selected, setSelected] = useState<Procurement>();
  const [detail, setDetail] = useState<Detail>();
  const [busy, setBusy] = useState(false);
  const validUrl =
    api &&
    (() => {
      try {
        const url = new URL(api);
        return (
          url.protocol === "https:" ||
          (import.meta.env.DEV && url.hostname === "localhost")
        );
      } catch {
        return false;
      }
    })();
  async function request(path: string, method = "GET", body?: unknown) {
    const response = await fetch(api + path, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      if (response.status === 401) setToken("");
      throw Error(
        response.status === 401
          ? "Sessão inválida ou credenciais incorretas."
          : `Operação recusada (${response.status}). Confira os campos e a configuração do servidor.`,
      );
    }
    return response.status === 204 ? null : response.json();
  }
  async function refresh() {
    try {
      const [s, p, n] = await Promise.all([
        request("/api/status"),
        request("/api/procurements"),
        request("/api/notifications"),
      ]);
      setStatus(s);
      setItems(p);
      setNotices(n);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backend indisponível.");
    }
  }
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha na operação.");
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!token) return;
    void refresh();
    const interval = setInterval(() => void refresh(), 30000);
    return () => clearInterval(interval);
  }, [token]);
  if (!validUrl)
    return (
      <section className="panel info">
        <h2>Servidor persistente — implantação pendente</h2>
        <p>
          A demonstração continua disponível. Para acessar cadastros
          persistentes, configure a variável pública VITE_API_URL no GitHub
          Actions com a URL HTTPS do backend e publique o Pages novamente.
        </p>
        <p>
          API, worker contínuo e PostgreSQL precisam estar implantados
          separadamente. Nenhum portal está sendo monitorado nesta versão.
        </p>
      </section>
    );
  return (
    <div className="backend-workspace">
      <section className="demo-banner">
        <strong>Workspace do servidor</strong>
        <span>
          Separado da demonstração local. Cadastro manual não é dado verificado.
          Nenhum conector oficial está homologado.
        </span>
      </section>
      {error && <p role="alert">{error}</p>}
      {!token ? (
        <section className="panel info">
          <h2>Entrar no backend</h2>
          <p>
            Usuário provisionado pelo administrador. Token fica somente na
            memória desta página.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const body = {
                email: String(f.get("email")),
                password: String(f.get("password")),
              };
              e.currentTarget.reset();
              void act(async () => {
                const result = await request("/api/auth/login", "POST", body);
                setToken(result.token);
              });
            }}
          >
            <label className="field">
              E-mail do usuário
              <input
                name="email"
                type="email"
                autoComplete="username"
                required
              />
            </label>
            <label className="field">
              Senha
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            <button className="outline" disabled={busy}>
              Entrar
            </button>
          </form>
        </section>
      ) : (
        <>
          <div className="title-row">
            <h2>Dados persistentes no servidor</h2>
            <button className="outline" onClick={() => void refresh()}>
              Atualizar servidor
            </button>
            <button
              className="outline"
              onClick={() =>
                void act(async () => {
                  await request("/api/auth/logout", "POST");
                  setToken("");
                  setItems([]);
                  setNotices([]);
                  setDetail(undefined);
                  setStatus(undefined);
                })
              }
            >
              Sair
            </button>
          </div>
          <section className="panel info">
            <h2>Saúde e integrações</h2>
            <p>
              PostgreSQL: {status?.database || "aguardando"} • Worker:{" "}
              {status?.worker.healthy
                ? "heartbeat recente"
                : "sem heartbeat recente"}{" "}
              • Último heartbeat: {timestamp(status?.worker.heartbeatAt)}
            </p>
            <p>
              Monitoramento de portais: <strong>não ativo</strong> • E-mail:{" "}
              {status?.providers.email || "aguardando"} • WhatsApp:{" "}
              {status?.providers.whatsapp || "aguardando"}
            </p>
            <p>
              configured_unverified indica somente configuração presente, sem
              confirmar envio ou entrega.
            </p>
            {status?.portals.map((p) => (
              <p key={p.portal}>
                <strong>{p.portal}</strong>: {p.status} • Última consulta
                bem-sucedida: {timestamp(p.last_success_at)}
                <br />
                {p.reason}
              </p>
            ))}
          </section>
          <section className="panel info">
            <h2>Cadastrar licitação no PostgreSQL</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const f = new FormData(form);
                void act(async () => {
                  await request("/api/procurements", "POST", {
                    portal: f.get("portal"),
                    externalRef: f.get("externalRef"),
                    agency: f.get("agency"),
                    object: f.get("object"),
                  });
                  form.reset();
                  await refresh();
                });
              }}
            >
              <label className="field">
                Portal
                <select name="portal">
                  {names.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </label>
              {[
                ["externalRef", "Referência oficial / número"],
                ["agency", "Órgão"],
                ["object", "Objeto"],
              ].map(([name, label]) => (
                <label className="field" key={name}>
                  {label}
                  <input
                    required
                    name={name}
                    maxLength={name === "object" ? 2000 : 500}
                  />
                </label>
              ))}
              <button className="outline" disabled={busy}>
                Salvar cadastro manual no servidor
              </button>
            </form>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Licitações do servidor</h2>
              <span>Até 200 registros recentes</span>
            </div>
            {items.length === 0 && (
              <p className="empty">Nenhum cadastro no servidor.</p>
            )}
            {items.map((p) => (
              <div className="message-row" key={p.id}>
                <div>
                  <h3>
                    {p.external_ref} • {p.agency}
                  </h3>
                  <p>
                    {p.portal} • {p.object}
                  </p>
                  <span
                    className={
                      "badge " + (p.source === "verified" ? "green" : "neutral")
                    }
                  >
                    {p.source === "verified"
                      ? "Verificado por conector autorizado"
                      : "Manual • não verificado"}
                  </span>
                  <p>
                    Último sucesso: {timestamp(p.last_success_at)} • Último
                    erro: {p.last_error || "nenhum registrado"}
                    <br />
                    Próxima tentativa: {timestamp(p.next_check_at)} •
                    Agendamento:{" "}
                    {p.monitoring_enabled
                      ? "habilitado (conector pendente)"
                      : "pausado"}
                  </p>
                </div>
                <button
                  className="outline"
                  onClick={() =>
                    void act(async () => {
                      setSelected(p);
                      setDetail(await request("/api/procurements/" + p.id));
                    })
                  }
                >
                  Histórico e prazos
                </button>
                <button
                  className="outline"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await request("/api/procurements/" + p.id, "PATCH", {
                        monitoringEnabled: !p.monitoring_enabled,
                      });
                      await refresh();
                    })
                  }
                >
                  {p.monitoring_enabled ? "Pausar" : "Retomar"}
                </button>
              </div>
            ))}
          </section>
          {selected && detail && (
            <section className="panel info">
              <h2>Histórico • {selected.external_ref}</h2>
              <h3>Sessões</h3>
              {detail.sessions.map((s) => (
                <p key={s.id}>
                  {s.status} • {s.source}
                </p>
              ))}
              <h3>Mensagens e convocações verificadas</h3>
              {detail.messages.length === 0 ? (
                <p>
                  Nenhuma coletada. Não há mensagens demonstrativas nesta área.
                </p>
              ) : (
                detail.messages.map((m) => (
                  <p key={m.id}>
                    {timestamp(m.occurred_at)} • {m.kind}: {m.body}
                  </p>
                ))
              )}
              <h3>Prazos persistentes</h3>
              {detail.deadlines.map((d) => (
                <div key={d.id}>
                  <p>
                    {d.title} • {timestamp(d.due_at)} • {d.source} •{" "}
                    {d.completed_at ? "Concluído" : "Aberto"}
                  </p>
                  <button
                    className="outline"
                    onClick={() =>
                      void act(async () => {
                        await request("/api/deadlines/" + d.id, "PATCH", {
                          completed: !d.completed_at,
                        });
                        setDetail(
                          await request("/api/procurements/" + selected.id),
                        );
                      })
                    }
                  >
                    {d.completed_at ? "Reabrir" : "Concluir"}
                  </button>
                </div>
              ))}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const f = new FormData(form);
                  void act(async () => {
                    await request(
                      "/api/procurements/" + selected.id + "/deadlines",
                      "POST",
                      {
                        title: f.get("title"),
                        dueAt: new Date(String(f.get("due"))).toISOString(),
                      },
                    );
                    form.reset();
                    setDetail(
                      await request("/api/procurements/" + selected.id),
                    );
                  });
                }}
              >
                <label className="field">
                  Título do prazo
                  <input name="title" required maxLength={500} />
                </label>
                <label className="field">
                  Data e hora (fuso do navegador)
                  <input name="due" type="datetime-local" required />
                </label>
                <button className="outline" disabled={busy}>
                  Adicionar prazo manual
                </button>
              </form>
              <h3>Últimas 50 tentativas de consulta</h3>
              {detail.history.length === 0 && (
                <p>Nenhuma tentativa registrada.</p>
              )}
              {detail.history.map((h) => (
                <p key={h.id}>
                  {timestamp(h.started_at)} • {h.status} •{" "}
                  {h.error_code || "sem erro"}
                </p>
              ))}
            </section>
          )}
          <section className="panel info">
            <h2>Preferências de alertas externos</h2>
            <p>
              Não há envio sem provedor configurado. WhatsApp requer opt-in e
              template aprovado; use somente destinatários autorizados. As
              preferências abaixo substituem as anteriores.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                void act(async () => {
                  await request("/api/me", "PATCH", {
                    emailAlerts: f.has("emailAlerts"),
                    whatsappOptIn: f.has("whatsappOptIn"),
                    whatsappPhone: String(f.get("phone") || "") || null,
                  });
                  await refresh();
                });
              }}
            >
              <label>
                <input type="checkbox" name="emailAlerts" /> Receber e-mails no
                endereço do usuário
              </label>
              <label className="field">
                Telefone WhatsApp autorizado (+país e DDD)
                <input
                  name="phone"
                  type="tel"
                  placeholder="Formato internacional"
                />
              </label>
              <label>
                <input type="checkbox" name="whatsappOptIn" disabled /> Confirmo
                autorização para receber alertas neste número
              </label>
              <p>
                <button className="outline" disabled={busy}>
                  Salvar preferências
                </button>
              </p>
            </form>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <h2>Notificações persistentes</h2>
              <span>Aceitação e entrega são estados distintos</span>
            </div>
            {notices.length === 0 && (
              <p className="empty">Nenhuma notificação.</p>
            )}
            {notices.map((n) => (
              <div className="message-row" key={n.id}>
                <div>
                  <h3>{n.title}</h3>
                  <p>{n.body}</p>
                  <small>
                    {n.source} • {n.channel} • {n.status}{" "}
                    {n.last_error && `• ${n.last_error}`}
                  </small>
                </div>
                {n.channel === "panel" && !n.read_at && (
                  <button
                    className="outline"
                    onClick={() =>
                      void act(async () => {
                        await request(
                          "/api/notifications/" + n.id + "/read",
                          "POST",
                        );
                        await refresh();
                      })
                    }
                  >
                    Marcar como lida
                  </button>
                )}
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
