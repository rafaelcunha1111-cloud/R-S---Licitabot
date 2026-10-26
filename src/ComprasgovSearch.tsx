import { useState } from 'react';
import { comprasgovErrorMessage } from './comprasgov-lookup';
type Props={request:(path:string,method?:string,body?:unknown)=>Promise<any>;onSelect:(id:string)=>void;disabled:boolean};
export function ComprasgovSearch({request,onSelect,disabled}:Props){
 const [query,setQuery]=useState<Record<string,string>>();
 const [results,setResults]=useState<any>();
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [year,setYear]=useState(String(new Date().getFullYear()));
 const [inicio,setInicio]=useState(`${new Date().getFullYear()}-01-01`);
 const [fim,setFim]=useState(`${new Date().getFullYear()}-12-31`);
 async function search(q:Record<string,string>){
  setBusy(true);setError('');setResults(undefined);setQuery(q);
  try{setResults(await request('/api/comprasgov/search?'+new URLSearchParams(q)));}
  catch(e){setError(comprasgovErrorMessage(e).message);}
  finally{setBusy(false);}
 }
 return <>
 <h3>Pesquisar compra por unidade e número</h3>
 <p>Pesquise os dados publicados no Compras.gov.br. Use a UASG e o número completo do edital (72 e 90072 são números diferentes). As datas são de publicação, não da sessão. Esta pesquisa não informa a etapa da sessão ao vivo.</p>
 <form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const q:Record<string,string>={pagina:'1'};for(const [k,v] of f.entries())if(String(v).trim())q[k]=String(v).trim();void search(q);}}>
 <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:16}}>
 <label className="field">Unidade compradora (UASG)<input name="uasg" required pattern="[0-9]{6}" inputMode="numeric" maxLength={6} placeholder="6 dígitos do edital"/></label>
 <label className="field">Modalidade<select name="modalidade"><option value="5">Pregão</option><option value="6">Dispensa</option></select></label>
 <label className="field">Número da compra (sem o ano)<input name="numero" pattern="[0-9]{1,5}" maxLength={5} inputMode="numeric" placeholder="Ex.: 90017"/></label>
 <label className="field">Ano de publicação<input type="number" min="2000" max="2100" value={year} onChange={e=>{const v=e.target.value;setYear(v);if(/^\d{4}$/.test(v)){setInicio(`${v}-01-01`);setFim(`${v}-12-31`);}}} required/></label>
 <label className="field">Publicação a partir de<input type="date" name="inicio" value={inicio} onChange={e=>setInicio(e.target.value)} required/></label>
 <label className="field">Publicação até<input type="date" name="fim" value={fim} onChange={e=>setFim(e.target.value)} required/></label>
 </div>
 <p>A pesquisa começa pelo ano inteiro. Restrinja as datas somente se souber quando o edital foi publicado. O número filtra a página consultada; avance as páginas para conferir os demais registros.</p>
 <button className="outline" disabled={busy||disabled}>{busy?'Pesquisando…':'Pesquisar compras'}</button>
 </form>
 {error&&<p role="alert">{error}</p>}
 {results&&<div aria-live="polite">
 <p>Página {results.pagina} de {results.totalPaginas||1} • {results.totalRegistros} registros na fonte antes do filtro por número.</p>
 {results.resultado.length===0&&<>
 <p>Nenhuma compra corresponde nesta página. Isso não confirma inexistência do processo. O intervalo consultado foi de {query?.inicio} a {query?.fim}, pela data de publicação.</p>
 <p>Um edital publicado antes desse intervalo pode ter sessão agora. Confira também o número completo, incluindo eventual prefixo 900, e o ano no edital.</p>
 <button className="outline" disabled={busy||disabled} onClick={()=>{const y=query!.inicio.slice(0,4);setYear(y);setInicio(`${y}-01-01`);setFim(`${y}-12-31`);void search({...query!,pagina:'1',inicio:`${y}-01-01`,fim:`${y}-12-31`});}}>Pesquisar o ano inteiro</button>{' '}
 {query?.numero&&<button className="outline" disabled={busy||disabled} onClick={()=>{const {numero,...rest}=query;void search({...rest,pagina:'1'});}}>Listar compras da UASG sem filtrar número</button>}
 </>}
 {results.resultado.map((r:any)=><article className="panel info" key={r.idCompra}>
 <h3>{r.modalidadeNome} nº {r.numeroCompra}{r.anoCompraPncp ? `/${r.anoCompraPncp}` : ""} • UASG {r.unidadeOrgaoCodigoUnidade}</h3>
 <p>{r.orgaoEntidadeRazaoSocial}</p><p>{r.objetoCompra}</p><p>Situação publicada: {r.situacaoCompraNomePncp||'não informada'}</p>
 <button className="outline" disabled={busy||disabled} onClick={()=>onSelect(r.idCompra)}>Selecionar compra</button>
 </article>)}
 <p>Fonte: API de Dados Abertos Compras.gov.br • consulta em {new Date(results.fetchedAt).toLocaleString('pt-BR')}</p>
 <button className="outline" disabled={busy||disabled||results.pagina<=1} onClick={()=>void search({...query!,pagina:String(results.pagina-1)})}>Página anterior</button>{' '}
 <button className="outline" disabled={busy||disabled||results.pagina>=results.totalPaginas} onClick={()=>void search({...query!,pagina:String(results.pagina+1)})}>Próxima página</button>
 </div>}
 </>;
}
