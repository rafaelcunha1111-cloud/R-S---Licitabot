export function normalizePncpControl(value: string) {
  return value.trim().replace(/^(\d{14}-1-\d{6})-(\d{4})$/, "$1/$2");
}
export function pncpLocation(value: string) {
  const control = normalizePncpControl(value);
  const match = /^(\d{14})-1-(\d{6})\/(\d{4})$/.exec(control);
  return match
    ? {
        control,
        cnpj: match[1],
        year: match[3],
        sequence: Number(match[2]),
        publicUrl: `https://pncp.gov.br/app/editais/${match[1]}/${match[3]}/${Number(match[2])}`,
      }
    : undefined;
}
export function comprasgovErrorMessage(error: unknown) {
  const e = error as { code?: unknown; message?: unknown };
  const code =
    typeof e?.code === "string"
      ? e.code
      : typeof e?.message === "string"
        ? e.message.split(": ").at(-1)
        : "";
  const messages: Record<string, string> = {
    comprasgov_not_found:
      "Não encontrado na base de dados abertos do Compras.gov.br. Isso não significa que a contratação não exista no PNCP ou em outra plataforma.",
    comprasgov_rate_limited:
      "A fonte limitou as consultas. Aguarde o intervalo informado antes de tentar novamente.",
    comprasgov_access_denied:
      "A fonte oficial recusou esta consulta. Não há confirmação dos dados; não informe senha do portal.",
    comprasgov_busy:
      "Outra consulta oficial está em andamento. Aguarde alguns segundos.",
    comprasgov_unavailable:
      "A API oficial está indisponível ou não respondeu a tempo. Nenhum registro foi importado.",
  };
  return {
    code,
    message:
      code && Object.hasOwn(messages, code)
        ? messages[code]
        : typeof e?.message === "string"
          ? e.message
          : "Não foi possível consultar a fonte oficial.",
  };
}
export function pncpPreview(value: unknown, expectedControl: string) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const data = value as Record<string, unknown>;
  if (data.numeroControlePNCP !== expectedControl) return undefined;
  const orgao =
    data.orgaoEntidade && typeof data.orgaoEntidade === "object"
      ? (data.orgaoEntidade as Record<string, unknown>)
      : undefined;
  let originUrl: string | undefined;
  try {
    if (typeof data.linkSistemaOrigem === "string") {
      const url = new URL(data.linkSistemaOrigem);
      if (url.protocol === "https:" && !url.username && !url.password)
        originUrl = url.toString();
    }
  } catch {}
  return {
    control: expectedControl,
    object:
      typeof data.objetoCompra === "string" ? data.objetoCompra : undefined,
    agency:
      typeof orgao?.razaoSocial === "string" ? orgao.razaoSocial : undefined,
    publisher:
      typeof data.nomeRazaoSocialUsuario === "string"
        ? data.nomeRazaoSocialUsuario
        : undefined,
    status:
      typeof data.situacaoCompraNome === "string"
        ? data.situacaoCompraNome
        : undefined,
    originUrl,
  };
}
