import { z } from 'zod';
import { COMPRASGOV_ORIGIN, ComprasgovError, publicPurchaseSchema } from './comprasgov.js';
export const SEARCH_PATH = '/modulo-contratacoes/1_consultarContratacoes_PNCP_14133';
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v);
export const searchSchema = z.object({
  uasg: z.string().trim().regex(/^\d{6}$/),
  modalidade: z.enum(['5','6']),
  inicio: date,
  fim: date,
  numero: z.string().trim().regex(/^\d{1,5}$/).optional(),
  pagina: z.coerce.number().int().min(1).max(10000).default(1),
}).refine(v => v.fim >= v.inicio && Date.parse(v.fim)-Date.parse(v.inicio) <= 366*86400000, {message:'Informe um período de até 366 dias.'});
export async function searchComprasgov(input: z.infer<typeof searchSchema>, request: typeof fetch = fetch) {
  const q = searchSchema.parse(input);
  const url = new URL(SEARCH_PATH, COMPRASGOV_ORIGIN);
  for (const [key,value] of Object.entries({pagina:q.pagina,tamanhoPagina:10,unidadeOrgaoCodigoUnidade:q.uasg,codigoModalidade:q.modalidade,dataPublicacaoPncpInicial:q.inicio,dataPublicacaoPncpFinal:q.fim})) url.searchParams.set(key,String(value));
  let response: Response;
  try { response = await request(url,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(20000)}); }
  catch { throw new ComprasgovError('comprasgov_unavailable'); }
  if (response.status===429) {
    const raw=response.headers.get('retry-after');
    const seconds=raw && /^\d+$/.test(raw) ? Number(raw) : raw ? Math.ceil((Date.parse(raw)-Date.now())/1000) : 300;
    throw new ComprasgovError('comprasgov_rate_limited',Number.isFinite(seconds)?Math.min(86400,Math.max(300,seconds)):300);
  }
  if(response.status===401 || response.status===403) throw new ComprasgovError('comprasgov_access_denied');
  if(!response.ok) throw new ComprasgovError('comprasgov_unavailable');
  const reader=response.body?.getReader();
  if(!reader) throw new ComprasgovError('comprasgov_invalid_response');
  const chunks:Uint8Array[]=[]; let size=0;
  try {
    while(true) { const part=await reader.read(); if(part.done) break; size+=part.value.length; if(size>2097152) {await reader.cancel();throw new ComprasgovError('comprasgov_response_too_large');} chunks.push(part.value); }
  } finally {reader.releaseLock();}
  let body;
  try {body=z.object({resultado:z.array(publicPurchaseSchema).max(10),totalRegistros:z.number().int().nonnegative(),totalPaginas:z.number().int().nonnegative()}).parse(JSON.parse(Buffer.concat(chunks).toString('utf8')));}
  catch {throw new ComprasgovError('comprasgov_invalid_response');}
  if(body.resultado.some(r=>r.unidadeOrgaoCodigoUnidade!==q.uasg)) throw new ComprasgovError('comprasgov_unexpected_record');
  return {...body,resultado:body.resultado.filter(r=>!q.numero || Number(r.numeroCompra)===Number(q.numero)),pagina:q.pagina,filteredByNumber:!!q.numero,sourceUrl:url.toString(),fetchedAt:new Date().toISOString(),scope:'public_contract_data'};
}
