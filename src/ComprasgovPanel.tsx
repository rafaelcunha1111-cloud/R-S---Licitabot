import { ComprasgovSessionLink } from "./ComprasgovSessionLink";
import { ComprasgovSearch } from "./ComprasgovSearch";
import {
  normalizePncpControl,
  pncpLocation,
  pncpPreview,
  comprasgovErrorMessage,
} from "./comprasgov-lookup";
import { useState } from "react";
type RecordData = {
  contratacaoExcluida?: boolean;
  idCompra: string;
  numeroControlePNCP: string;
  orgaoEntidadeRazaoSocial: string;
  objetoCompra: string;
  situacaoCompraNomePncp?: string;
  dataAtualizacaoPncp?: string;
  dataAberturaPropostaPncp?: string;
  dataEncerramentoPropostaPncp?: string;
};
export function ComprasgovPanel({
  request,
  onImported,
}: {
  request: (path: string, method?: string, body?: unknown) => Promise<any>;
  onImported: () => Promise<void>;
}) {
  const [result, setResult] = useState<{
    data: RecordData;
    sourceUrl: string;
    fetchedAt: string;
  }>();
  const [lookup, setLookup] = useState<{ type: string; code: string }>();
  const [monitor, setMonitor] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [pncp, setPncp] = useState<ReturnType<typeof pncpPreview>>();
  const location =
    lookup?.type === "numeroControlePNCPCompra"
      ? pncpLocation(lookup.code)
      : undefined;
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      const failure = comprasgovErrorMessage(e);
      if (failure.code === "comprasgov_not_found") {
        setNotFound(true);
        setResult(undefined);
      }
      setMessage(failure.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel info">
      <h2>Compras.gov.br — dados públicos oficiais</h2>
      <p>
        Consulta documentada de contratações publicadas (Lei 14.133). Não lê
        chat, mensagens do pregoeiro, convocações ou sessão ao vivo. A
        referência deve vir do registro oficial, não do nome de uma pasta do
        Drive.
      </p>
      <ComprasgovSessionLink request={request} onImported={onImported} />
      <ComprasgovSearch request={request} disabled={busy} onSelect={(id) => {
        setResult(undefined); setNotFound(false); setPncp(undefined); setMonitor(false);
        const input = {type:"idCompra",code:id}; setLookup(input);
        void act(async()=>{setResult(await request("/api/comprasgov/contract?"+new URLSearchParams(input)));});
      }} />
      <details><summary>Consulta avançada por identificador PNCP ou ID</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const input = {
            type: String(f.get("type")),
            code: normalizePncpControl(String(f.get("code"))),
          };
          setResult(undefined);
          setLookup(input);
          setNotFound(false);
          setPncp(undefined);
          void act(async () => {
            const data = await request(
              "/api/comprasgov/contract?" + new URLSearchParams(input),
            );
            setResult(data);
            setLookup(input);
          });
        }}
      >
        <label className="field">
          Tipo de identificador
          <select name="type">
            <option value="numeroControlePNCPCompra">
              Número de controle PNCP
            </option>
            <option value="idCompra">
              ID da compra Compras.gov.br (17 dígitos)
            </option>
          </select>
        </label>
        <label className="field">
          Identificador oficial
          <input
            name="code"
            required
            maxLength={100}
            placeholder="Copie do edital ou do registro oficial"
          />
        </label>
        <button className="outline" disabled={busy}>
          Consultar na API oficial
        </button>
      </form>
      </details>
      {notFound && location && (
        <div className="demo-banner">
          <div>
            <strong>Consulte a outra fonte oficial</strong>
            <p>
              O PNCP reúne publicações de diferentes plataformas. Um resultado
              lá não será tratado como registro do Compras.gov.br.
            </p>
            <button
              className="outline"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  setPncp(undefined);
                  const response = await request(
                    `/api/pncp/contratacao/${location.cnpj}/${location.year}/${location.sequence}?only=procurement`,
                  );
                  const status = response.procurement?.status;
                  if (status === 404 || status === 204) {
                    setMessage(
                      "A consulta ao PNCP também não retornou um registro. Confira o identificador no edital original.",
                    );
                    return;
                  }
                  if (status !== 200) {
                    setMessage(
                      "Não foi possível confirmar o registro no PNCP. A fonte pode estar indisponível ou ter recusado o acesso.",
                    );
                    return;
                  }
                  const found = pncpPreview(
                    response.procurement.data,
                    location.control,
                  );
                  if (!found) {
                    setMessage(
                      "A resposta do PNCP não permitiu confirmar o identificador solicitado. Nenhum dado foi importado.",
                    );
                    return;
                  }
                  setPncp(found);
                  setMessage(
                    "Registro encontrado no PNCP, fonte distinta da base Compras.gov.br. Nenhum monitoramento foi ativado.",
                  );
                })
              }
            >
              Consultar este número no PNCP
            </button>
            <p>
              <a
                href={location.publicUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir publicação no site do PNCP
              </a>
            </p>
          </div>
        </div>
      )}
      {pncp && location && (
        <div className="panel info">
          <h3>Fonte: PNCP — consulta sob demanda</h3>
          <p>Número confirmado: {pncp.control}</p>
          {pncp.agency && <p>Órgão: {pncp.agency}</p>}
          {pncp.object && <p>{pncp.object}</p>}
          {pncp.publisher && (
            <p>Publicador informado pelo PNCP: {pncp.publisher}</p>
          )}
          {pncp.status && <p>Situação publicada: {pncp.status}</p>}
          {pncp.originUrl && (
            <p>
              <a
                href={pncp.originUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Abrir sistema de origem informado pelo PNCP
              </a>
            </p>
          )}
          <p>
            Não importado e não incluído no monitoramento do Compras.gov.br.
            Chat e convocações continuam fora desta consulta.
          </p>
        </div>
      )}
      {result && lookup && (
        <>
          <h3>{result.data.orgaoEntidadeRazaoSocial}</h3>
          {result.data.contratacaoExcluida === true && (
            <p role="alert">
              Este registro está marcado como excluído na fonte oficial.
            </p>
          )}
          <p>{result.data.objetoCompra}</p>
          <p>
            ID: {result.data.idCompra} • PNCP: {result.data.numeroControlePNCP}
          </p>
          <p>
            Situação publicada:{" "}
            {result.data.situacaoCompraNomePncp || "não informada"}
            <br />
            Atualização declarada pela fonte:{" "}
            {result.data.dataAtualizacaoPncp || "não informada"}
            <br />
            Consulta efetuada em:{" "}
            {new Date(result.fetchedAt).toLocaleString("pt-BR")}
          </p>
          <p>
            <a
              href={result.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver resposta na fonte oficial
            </a>
          </p>
          <p>
            Datas da fonte sem fuso explícito são mantidas como texto, sem criar
            prazos automáticos.
          </p>
          <label>
            <input
              type="checkbox"
              checked={monitor}
              onChange={(e) => setMonitor(e.target.checked)}
            />{" "}
            Verificar alterações desses dados públicos a cada cinco minutos (com
            backoff e limites)
          </label>
          <p>
            <button
              className="outline"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  await request("/api/comprasgov/import", "POST", {
                    lookup,
                    monitorPublic: monitor,
                  });
                  setResult(undefined);
                  setLookup(undefined);
                  setMessage(
                    "Dados oficiais importados. Mensagens e convocações não são monitoradas.",
                  );
                  await onImported();
                })
              }
            >
              Importar registro oficial no servidor
            </button>
          </p>
        </>
      )}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
