import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  LayoutDashboard,
  Radio,
  MessageSquare,
  Bell,
  Plug,
  Settings,
  Search,
  ChevronRight,
  ArrowUpRight,
  Clock,
  CalendarDays,
  Gavel,
  ShieldCheck,
  CircleHelp,
  X,
  Check,
  RefreshCw,
} from "lucide-react";
import "./style.css";
import { BackendPanel } from "./BackendPanel";
import {
  initialSnapshot,
  storageKey,
  upsertSession,
  deadlineAlerts,
  type Snapshot,
} from "./local";
import { connectors as previewConnectors } from "../server/connectors";
type Session = {
  id: string;
  number: string;
  agency: string;
  object: string;
  portal: string;
  status: string;
  stage: string;
  deadline: string;
  value: number;
  source?: "demo" | "manual";
};
type Event = {
  id: string;
  sessionId: string;
  kind: string;
  title: string;
  text: string;
  portal: string;
  time: string;
};
type Data = {
  demo: boolean;
  generatedAt: string;
  sessions: Session[];
  events: Event[];
};
type Connector = { portal: string; status: string };
const money = (v: number) =>
  v.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
const date = (s: string) =>
  new Date(s).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (
          Array.isArray(parsed.sessions) &&
          Array.isArray(parsed.events) &&
          Array.isArray(parsed.read)
        )
          return parsed;
      }
    } catch {}
    return initialSnapshot();
  });
  const [storageError, setStorageError] = useState("");
  const [tick, setTick] = useState(Date.now());
  const [editing, setEditing] = useState<Session | null>();
  const [formError, setFormError] = useState("");
  const data: Data = {
    demo: true,
    generatedAt: new Date(tick).toISOString(),
    sessions: snapshot.sessions,
    events: [...deadlineAlerts(snapshot, tick), ...snapshot.events],
  };
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(snapshot));
      setStorageError("");
    } catch {
      setStorageError(
        "Armazenamento indisponível: alterações serão perdidas ao fechar esta página.",
      );
    }
  }, [snapshot]);
  useEffect(() => {
    const timer = setInterval(() => setTick(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [page, setPage] = useState("Visão geral");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todas");
  const [selected, setSelected] = useState<Session>();
  const read = snapshot.read;
  const setRead = (updater: (r: string[]) => string[]) =>
    setSnapshot((current) => ({ ...current, read: updater(current.read) }));
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setConnectors(previewConnectors);
    } catch {
      setError(
        "Não foi possível carregar os dados. Verifique a API e tente novamente.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, []);
  const sessions =
    data?.sessions.filter(
      (s) =>
        (filter === "Todas" || s.status === filter) &&
        `${s.number} ${s.agency} ${s.object} ${s.portal}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ) || [];
  const nav = [
    ["Visão geral", LayoutDashboard],
    ["Sessões", Radio],
    ["Mensagens", MessageSquare],
    ["Alertas", Bell],
    ["Prazos", CalendarDays],
    ["Integrações", Plug],
    ["Servidor", ShieldCheck],
  ] as const;
  return (
    <div className="shell">
      <aside>
        <a className="brand" href="/">
          {" "}
          <span className="brand-icon">
            <Gavel size={23} />
          </span>
          <span>
            licita<span className="brand-light">bot</span>
            <small>R&S INTELIGÊNCIA EM LICITAÇÕES</small>
          </span>
        </a>
        <div className="workspace">
          <span className="avatar">RS</span>
          <div>
            R&S Licitações<small>Workspace da equipe</small>
          </div>
          <span className="dots">⌄</span>
        </div>
        <div className="nav-label">PRINCIPAL</div>
        <nav>
          {nav.map(([name, Icon]) => (
            <button
              className={page === name ? "active" : ""}
              key={name}
              onClick={() => {
                setPage(name);
                setQuery("");
                setFilter("Todas");
              }}
            >
              <Icon size={19} />
              {name}
              {name === "Alertas" && (
                <b>
                  {data?.events.filter((e) => !read.includes(e.id)).length || 0}
                </b>
              )}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="help">
            <ShieldCheck size={22} />
            <strong>Sua operação, sob controle.</strong>
            <p>Acompanhe cada oportunidade em um só lugar.</p>
            <button onClick={() => setPage("Ajuda")}>
              Central de ajuda <ArrowUpRight size={14} />
            </button>
          </div>
          <button className="settings" onClick={() => setPage("Configurações")}>
            <Settings size={18} />
            Configurações
          </button>
          <div className="profile">
            <span className="avatar purple">RC</span>
            <div>
              Equipe R&S<small>Administrador</small>
            </div>
            <span className="online" />
          </div>
        </div>
      </aside>
      <main>
        <header>
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} /> <strong>{page}</strong>
          </div>
          <div className="header-right">
            <span className="demo-dot" />{" "}
            {page === "Servidor"
              ? "Servidor • integrações pendentes"
              : "Workspace local • demonstração"}
            <button
              aria-label="Abrir alertas"
              onClick={() => setPage("Alertas")}
            >
              <Bell size={19} />
            </button>
            <span className="avatar purple small">RC</span>
          </div>
        </header>
        <div className="content">
          <div className="title-row">
            <div>
              <div className="eyebrow">CENTRAL DE OPERAÇÕES</div>
              <h1>
                {page === "Visão geral"
                  ? "Tudo pronto para o próximo lance."
                  : page}
              </h1>
              <p>
                Acompanhe suas licitações e fique por dentro de cada movimento.
              </p>
            </div>
            {page !== "Servidor" && (
              <>
                <button
                  className="outline"
                  onClick={() => {
                    setEditing(null);
                    setFormError("");
                  }}
                >
                  + Cadastrar licitação
                </button>
                <button
                  className="outline"
                  onClick={() => {
                    setTick(Date.now());
                    void load();
                  }}
                  disabled={loading}
                >
                  <RefreshCw size={15} />
                  {loading ? "Atualizando…" : "Atualizar painel"}
                </button>
              </>
            )}
          </div>
          {page !== "Servidor" && (
            <div className="demo-banner">
              <ShieldCheck size={17} />
              <span>
                <strong>Protótipo sem conexão aos portais.</strong> Exemplos são
                fictícios. Cadastros manuais ficam somente neste navegador e não
                são dados verificados. Não insira credenciais ou informações
                sensíveis.
              </span>
              <button onClick={() => setPage("Integrações")}>
                Ver integrações <ArrowUpRight size={14} />
              </button>
            </div>
          )}
          {page !== "Servidor" && storageError && (
            <p role="alert">{storageError}</p>
          )}
          {error && (
            <p role="alert">{error} O workspace local continua disponível.</p>
          )}
          <>
            {(page === "Visão geral" || page === "Sessões") && (
              <>
                <div className="stats">
                  {[
                    {
                      label: "Sessões no workspace",
                      value: data.sessions.length,
                      icon: Radio,
                      note: "Exemplos e cadastros manuais",
                      color: "green",
                    },
                    {
                      label: "Em disputa agora",
                      value: data.sessions.filter(
                        (s) => s.status === "Em disputa",
                      ).length,
                      icon: Gavel,
                      note: "Situação informada no cadastro",
                      color: "blue",
                    },
                    {
                      label: "Convocações pendentes",
                      value: data.sessions.filter(
                        (s) => s.status === "Convocação",
                      ).length,
                      icon: MessageSquare,
                      note: "Precisam da sua atenção",
                      color: "orange",
                    },
                    {
                      label: "Prazos nas próximas 24h",
                      value: data.sessions.filter(
                        (s) =>
                          s.status !== "Encerrada" &&
                          Date.parse(s.deadline) >= tick &&
                          Date.parse(s.deadline) <= tick + 86400000,
                      ).length,
                      icon: Clock,
                      note: "Organize suas próximas ações",
                      color: "purple",
                    },
                  ].map((item) => (
                    <div className="stat" key={item.label}>
                      <div className="stat-top">
                        {item.label}
                        <span className={"icon-bg " + item.color}>
                          <item.icon size={18} />
                        </span>
                      </div>
                      <strong>{item.value.toString().padStart(2, "0")}</strong>
                      <small>{item.note}</small>
                    </div>
                  ))}
                </div>
                <div className="dashboard-grid">
                  <section className="panel sessions">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          Suas sessões <span>{data.sessions.length}</span>
                        </h2>
                        <p>Uma visão completa das licitações em andamento</p>
                      </div>
                      <Radio size={19} className="muted" />
                    </div>
                    <div className="table-tools">
                      <div className="tabs">
                        {["Todas", "Em disputa", "Convocação", "Agendada"].map(
                          (f) => (
                            <button
                              className={filter === f ? "chosen" : ""}
                              onClick={() => setFilter(f)}
                              key={f}
                            >
                              {f}
                            </button>
                          ),
                        )}
                      </div>
                      <label className="search">
                        <Search size={16} />
                        <input
                          placeholder="Buscar sessão..."
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                        />
                      </label>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>LICITAÇÃO / ÓRGÃO</th>
                            <th>PORTAL</th>
                            <th>STATUS</th>
                            <th>PRÓXIMO PRAZO</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {sessions.map((s) => (
                            <tr key={s.id} onClick={() => setSelected(s)}>
                              <td>
                                <strong>PE {s.number}</strong>
                                <span
                                  className={
                                    "badge " +
                                    (s.source === "manual" ? "blue" : "neutral")
                                  }
                                >
                                  {s.source === "manual"
                                    ? "Manual • não verificado"
                                    : "Demonstração"}
                                </span>
                                <small>{s.agency}</small>
                                <span className="object">{s.object}</span>
                              </td>
                              <td>
                                <span className="portal-mark">
                                  {s.portal.slice(0, 1)}
                                </span>
                                {s.portal}
                              </td>
                              <td>
                                <span
                                  className={
                                    "badge " +
                                    (s.status === "Em disputa"
                                      ? "green"
                                      : s.status === "Convocação"
                                        ? "orange"
                                        : s.status === "Agendada"
                                          ? "neutral"
                                          : "blue")
                                  }
                                >
                                  <i />
                                  {s.status}
                                </span>
                              </td>
                              <td>
                                <span className="deadline">
                                  <Clock size={13} />
                                  {date(s.deadline)}
                                </span>
                                <small>{s.stage}</small>
                              </td>
                              <td>
                                <button
                                  className="row-button"
                                  aria-label={"Detalhes da sessão " + s.number}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelected(s);
                                  }}
                                >
                                  <ChevronRight size={17} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!sessions.length && (
                        <div className="empty">
                          Nenhuma sessão encontrada para esta busca.
                        </div>
                      )}
                    </div>
                    <div className="table-footer">
                      Exibindo {sessions.length} de {data.sessions.length}{" "}
                      sessões <span>Exemplos + cadastros locais</span>
                    </div>
                  </section>
                  <section className="panel activity">
                    <div className="panel-heading">
                      <div>
                        <h2>
                          No seu radar <span className="live-dot" />
                        </h2>
                        <p>Movimentos que merecem atenção</p>
                      </div>
                      <Bell size={18} className="muted" />
                    </div>
                    <div className="event-list">
                      {data.events.slice(0, 3).map((e) => (
                        <button
                          className="event"
                          key={e.id}
                          onClick={() =>
                            setSelected(
                              data.sessions.find((s) => s.id === e.sessionId),
                            )
                          }
                        >
                          <span
                            className={
                              "event-icon " +
                              (e.kind === "summons" ? "orange" : "blue")
                            }
                          >
                            {e.kind === "summons" ? (
                              <Bell size={16} />
                            ) : (
                              <MessageSquare size={16} />
                            )}
                          </span>
                          <div>
                            <div className="event-meta">
                              {e.portal}
                              <span>
                                {new Date(e.time).toLocaleTimeString("pt-BR", {
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </span>
                            </div>
                            <strong>{e.title}</strong>
                            <p>{e.text}</p>
                            <span className="event-link">
                              Ver sessão <ArrowUpRight size={12} />
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                    <button
                      className="all-events"
                      onClick={() => setPage("Mensagens")}
                    >
                      Ver todas as atualizações <ChevronRight size={15} />
                    </button>
                  </section>
                </div>
                <section className="portal-strip">
                  <div>
                    <span className="icon-bg green">
                      <Plug size={20} />
                    </span>
                    <div>
                      <h3>Sua operação conectada</h3>
                      <p>7 portais. Uma central de acompanhamento.</p>
                    </div>
                  </div>
                  <div className="portal-names">
                    Comprasnet <span>•</span> BLL <span>•</span> BNC{" "}
                    <span>•</span> +4 portais
                  </div>
                  <button onClick={() => setPage("Integrações")}>
                    Gerenciar integrações <ArrowUpRight size={15} />
                  </button>
                </section>
                <p className="footnote">
                  * Acompanhamento manual e exemplos. Nenhuma consulta aos
                  portais é realizada nesta versão.
                </p>
              </>
            )}
            {page === "Prazos" && (
              <section className="panel">
                <div className="panel-heading">
                  <h2>Agenda de prazos</h2>
                  <span>Fuso do navegador • atualização a cada 30s</span>
                </div>
                {[...data.sessions]
                  .sort(
                    (a, b) => Date.parse(a.deadline) - Date.parse(b.deadline),
                  )
                  .map((session) => (
                    <div className="message-row" key={session.id}>
                      <Clock size={20} />
                      <div>
                        <h3>
                          {session.number} • {session.agency}
                        </h3>
                        <p>
                          {session.stage} • {date(session.deadline)}
                        </p>
                        <span className="badge neutral">
                          {session.source === "manual"
                            ? "Manual, não verificado"
                            : "Demonstração"}{" "}
                          •{" "}
                          {Date.parse(session.deadline) < tick
                            ? "Vencido"
                            : Date.parse(session.deadline) < tick + 86400000
                              ? "Próximas 24h"
                              : "Agendado"}
                        </span>
                      </div>
                      <button
                        className="outline"
                        onClick={() => {
                          setEditing(session);
                          setFormError("");
                        }}
                      >
                        Atualizar prazo
                      </button>
                    </div>
                  ))}
              </section>
            )}
            {page === "Servidor" && <BackendPanel />}
            {page === "Integrações" && (
              <div className="connector-grid">
                {connectors.map((c) => (
                  <section className="panel connector" key={c.portal}>
                    <span className="icon-bg green">
                      <Plug size={22} />
                    </span>
                    <h2>{c.portal}</h2>
                    <span className="badge neutral">Não configurado</span>
                    <p>
                      Conector preparado para implementação mediante
                      documentação oficial e acesso autorizado.
                    </p>
                    <small>
                      Autenticação, permissões, limites de consulta e condições
                      de uso serão validados individualmente. Nenhuma credencial
                      é solicitada neste protótipo.
                    </small>
                  </section>
                ))}
              </div>
            )}
            {(page === "Mensagens" || page === "Alertas") && (
              <section className="panel">
                <div className="panel-heading">
                  <h2>
                    {page === "Alertas"
                      ? "Central de alertas"
                      : "Mensagens e atualizações"}
                  </h2>
                  <span>Exemplos e registros manuais</span>
                </div>
                {data.events.map((e) => (
                  <div className="message-row" key={e.id}>
                    <span
                      className={
                        "event-icon " +
                        (e.kind === "summons" ? "orange" : "blue")
                      }
                    >
                      <MessageSquare size={20} />
                    </span>
                    <div>
                      <small>
                        {e.portal} • {date(e.time)} •{" "}
                        {data.sessions.find((s) => s.id === e.sessionId)
                          ?.source === "manual"
                          ? "Manual, não verificado"
                          : "Demonstração"}
                      </small>
                      <h3>{e.title}</h3>
                      <p>{e.text}</p>
                    </div>
                    <button
                      className="outline"
                      onClick={() =>
                        setRead((r) => (r.includes(e.id) ? r : [...r, e.id]))
                      }
                    >
                      {read.includes(e.id) ? (
                        <>
                          <Check size={15} />
                          Lido
                        </>
                      ) : (
                        "Marcar como lido"
                      )}
                    </button>
                  </div>
                ))}
              </section>
            )}
            {page === "Configurações" && (
              <section className="panel info">
                <Settings />
                <h2>Configurações do workspace</h2>
                <p>
                  Esta versão usa dados demonstrativos. Cadastros e marcações de
                  leitura são salvos neste navegador, sem sincronização entre
                  dispositivos.
                </p>
                <p>
                  Banco de dados compartilhado, autenticação de usuários e
                  notificações externas estão previstos na arquitetura e ainda
                  não estão ativos.
                </p>
              </section>
            )}
            {page === "Ajuda" && (
              <section className="panel info">
                <CircleHelp />
                <h2>Como usar a central</h2>
                <p>
                  Filtre ou pesquise suas sessões, abra os detalhes e acompanhe
                  as mensagens e os prazos. A área Integrações mostra os portais
                  previstos.
                </p>
                <p>
                  Os horários seguem o fuso do seu navegador. Confirme sempre
                  informações e prazos no portal de origem antes de agir.
                </p>
              </section>
            )}
          </>
          <footer>
            R&S LicitaBot{" "}
            <span>
              Inteligência para acompanhar. Tranquilidade para decidir.
            </span>
            <span>
              <span className="demo-dot" />{" "}
              {page === "Servidor"
                ? "Backend • integração pendente"
                : "Workspace local • sem coleta real"}
            </span>
          </footer>
        </div>
      </main>
      {editing !== undefined && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-title"
          >
            <button
              className="close"
              aria-label="Fechar cadastro"
              onClick={() => setEditing(undefined)}
            >
              <X />
            </button>
            <h2 id="form-title">
              {editing ? "Atualizar sessão" : "Cadastrar licitação"}
            </h2>
            <p>
              Registro manual local. Não consulta o portal nem confirma dados
              oficiais.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fields = new FormData(e.currentTarget);
                try {
                  const session: Session = {
                    id: editing?.id || crypto.randomUUID(),
                    number: String(fields.get("number")),
                    agency: String(fields.get("agency")),
                    object: String(fields.get("object")),
                    portal: String(fields.get("portal")),
                    status: String(fields.get("status")),
                    stage: String(fields.get("stage")),
                    deadline: new Date(
                      String(fields.get("deadline")),
                    ).toISOString(),
                    value: Number(fields.get("value")),
                    source: "manual",
                  };
                  setSnapshot(upsertSession(snapshot, session));
                  setEditing(undefined);
                } catch (error) {
                  setFormError(
                    error instanceof Error
                      ? error.message
                      : "Confira os campos.",
                  );
                }
              }}
            >
              {(["number", "agency", "object", "stage"] as const).map(
                (field, index) => (
                  <label className="field" key={field}>
                    {
                      [
                        "Número do pregão",
                        "Órgão",
                        "Objeto",
                        "Etapa / obrigação",
                      ][index]
                    }
                    <input
                      required
                      maxLength={500}
                      name={field}
                      defaultValue={editing?.[field]}
                    />
                  </label>
                ),
              )}
              <label className="field">
                Portal
                <select name="portal" defaultValue={editing?.portal}>
                  {previewConnectors.map((c) => (
                    <option key={c.portal}>{c.portal}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Situação
                <select
                  name="status"
                  defaultValue={editing?.status || "Agendada"}
                >
                  {[
                    "Agendada",
                    "Em disputa",
                    "Convocação",
                    "Em análise",
                    "Encerrada",
                  ].map((status) => (
                    <option key={status}>{status}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                Prazo (fuso do navegador)
                <input
                  type="datetime-local"
                  required
                  name="deadline"
                  defaultValue={
                    editing
                      ? new Date(
                          Date.parse(editing.deadline) -
                            new Date(editing.deadline).getTimezoneOffset() *
                              60000,
                        )
                          .toISOString()
                          .slice(0, 16)
                      : undefined
                  }
                />
              </label>
              <label className="field">
                Valor estimado (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  required
                  name="value"
                  defaultValue={editing?.value || 0}
                />
              </label>
              {formError && <p role="alert">{formError}</p>}
              <button className="outline" type="submit">
                Salvar cadastro local
              </button>
            </form>
          </section>
        </div>
      )}
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(undefined)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="session-title"
            className="modal"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close"
              aria-label="Fechar detalhes"
              onClick={() => setSelected(undefined)}
            >
              <X />
            </button>
            <div className="eyebrow">
              DETALHES DA SESSÃO •{" "}
              {selected.source === "manual"
                ? "CADASTRO MANUAL"
                : "DEMONSTRAÇÃO"}
            </div>
            <h2 id="session-title">Pregão {selected.number}</h2>
            <p>{selected.agency}</p>
            <h3>{selected.object}</h3>
            <dl>
              <dt>Portal</dt>
              <dd>{selected.portal}</dd>
              <dt>Situação</dt>
              <dd>{selected.status}</dd>
              <dt>Etapa</dt>
              <dd>{selected.stage}</dd>
              <dt>Próximo prazo</dt>
              <dd>{date(selected.deadline)}</dd>
              <dt>Valor estimado</dt>
              <dd>{money(selected.value)}</dd>
            </dl>
            <h3>Atualizações da sessão</h3>
            {data?.events
              .filter((e) => e.sessionId === selected.id)
              .map((e) => (
                <div className="modal-event" key={e.id}>
                  <strong>{e.title}</strong>
                  <p>{e.text}</p>
                </div>
              ))}
            {!data?.events.some((e) => e.sessionId === selected.id) && (
              <p>Nenhuma atualização disponível.</p>
            )}
            <button
              className="outline"
              onClick={() => {
                setEditing(selected);
                setSelected(undefined);
                setFormError("");
              }}
            >
              Editar sessão e prazo
            </button>
            <small>
              {selected.source === "manual"
                ? "Cadastro manual não verificado."
                : "Dados fictícios."}{" "}
              Nenhuma ação é enviada ao portal.
            </small>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
