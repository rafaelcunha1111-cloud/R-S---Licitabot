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
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await fn();
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Consulta oficial indisponível. Nenhum registro foi importado.",
      );
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const input = {
            type: String(f.get("type")),
            code: String(f.get("code")).trim(),
          };
          setResult(undefined);
          setLookup(undefined);
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
