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
  const [data, setData] = useState<Data>();
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [page, setPage] = useState("Visão geral");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Todas");
  const [selected, setSelected] = useState<Session>();
  const [read, setRead] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const responses = await Promise.all([
        fetch("/api/dashboard"),
        fetch("/api/connectors"),
      ]);
      if (responses.some((r) => !r.ok)) throw Error();
      setData(await responses[0].json());
      setConnectors(await responses[1].json());
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
    ["Integrações", Plug],
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
            <span className="demo-dot" /> Ambiente demonstrativo
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
            <button
              className="outline"
              onClick={() => void load()}
              disabled={loading}
            >
              <RefreshCw size={15} />
              {loading ? "Atualizando…" : "Atualizar painel"}
            </button>
          </div>
          <div className="demo-banner">
            <ShieldCheck size={17} />
            <span>
              <strong>Modo demonstração.</strong> Dados fictícios para explorar
              o painel. Os portais ainda não estão conectados.
            </span>
            <button onClick={() => setPage("Integrações")}>
              Ver integrações <ArrowUpRight size={14} />
            </button>
          </div>
          {error ? (
            <div className="empty">{error}</div>
          ) : !data ? (
            <div className="empty">Carregando central de operações…</div>
          ) : (
            <>
              {(page === "Visão geral" || page === "Sessões") && (
                <>
                  <div className="stats">
                    {[
                      {
                        label: "Sessões monitoradas",
                        value: data.sessions.length,
                        icon: Radio,
                        note: "Em todos os portais",
                        color: "green",
                      },
                      {
                        label: "Em disputa agora",
                        value: data.sessions.filter(
                          (s) => s.status === "Em disputa",
                        ).length,
                        icon: Gavel,
                        note: "Acompanhe em tempo real*",
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
                            new Date(s.deadline).getTime() - Date.now() <
                            86400000,
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
                        <strong>
                          {item.value.toString().padStart(2, "0")}
                        </strong>
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
                          {[
                            "Todas",
                            "Em disputa",
                            "Convocação",
                            "Agendada",
                          ].map((f) => (
                            <button
                              className={filter === f ? "chosen" : ""}
                              onClick={() => setFilter(f)}
                              key={f}
                            >
                              {f}
                            </button>
                          ))}
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
                                    aria-label={
                                      "Detalhes da sessão " + s.number
                                    }
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
                        sessões <span>Dados demonstrativos</span>
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
                                  {new Date(e.time).toLocaleTimeString(
                                    "pt-BR",
                                    { hour: "2-digit", minute: "2-digit" },
                                  )}
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
                    * Simulação de acompanhamento. Nenhuma consulta aos portais
                    é realizada nesta versão.
                  </p>
                </>
              )}
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
                        Autenticação, permissões, limites de consulta e
                        condições de uso serão validados individualmente.
                        Nenhuma credencial é solicitada neste protótipo.
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
                    <span>Exemplos demonstrativos</span>
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
                          {e.portal} • {date(e.time)}
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
                    Esta versão usa dados demonstrativos. As marcações de
                    leitura são mantidas apenas durante esta visita.
                  </p>
                  <p>
                    Armazenamento persistente, autenticação de usuários e
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
                    Filtre ou pesquise suas sessões, abra os detalhes e
                    acompanhe as mensagens e os prazos. A área Integrações
                    mostra os portais previstos.
                  </p>
                  <p>
                    Os horários seguem o fuso do seu navegador. Confirme sempre
                    informações e prazos no portal de origem antes de agir.
                  </p>
                </section>
              )}
            </>
          )}
          <footer>
            R&S LicitaBot{" "}
            <span>
              Inteligência para acompanhar. Tranquilidade para decidir.
            </span>
            <span>
              <span className="demo-dot" />{" "}
              {data ? "API disponível • demonstração" : "Conectando à API"}
            </span>
          </footer>
        </div>
      </main>
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
            <div className="eyebrow">DETALHES DA SESSÃO • DEMONSTRAÇÃO</div>
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
            <small>Dados fictícios. Nenhuma ação é enviada ao portal.</small>
          </section>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
