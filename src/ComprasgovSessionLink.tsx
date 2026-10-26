import {useState} from 'react';
import {comprasgovSessionLink} from './comprasgov-session-link';
import {comprasgovErrorMessage} from './comprasgov-lookup';
export function ComprasgovSessionLink({request,onImported}:{request:(path:string,method?:string,body?:unknown)=>Promise<any>;onImported:()=>Promise<void>}) {
 const [link,setLink]=useState('');const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');const [canSave,setCanSave]=useState(false);
 const ref=comprasgovSessionLink(link);
 return <section className="panel info">
 <h3>Compra pelo link de acompanhamento público</h3>
 <p>Cole o link do Compras.gov.br. A leitura automática de sessões, mensagens e convocações ainda depende de interface oficial autorizada. Abrir ou cadastrar o link não ativa essa leitura.</p>
 <form onSubmit={e=>{e.preventDefault();if(!ref)return;setBusy(true);setCanSave(false);setMessage('');void request('/api/comprasgov/contract?'+new URLSearchParams({type:'idCompra',code:ref.id})).then(()=>{setMessage('Registro encontrado na base de dados abertos. Use a consulta avançada pelo ID abaixo para visualizar e importar os dados oficiais.');}).catch(e=>{setMessage(comprasgovErrorMessage(e).message);if(e?.code==='comprasgov_not_found'||e?.message?.includes('comprasgov_not_found'))setCanSave(true);}).finally(()=>setBusy(false));}}>
 <label className="field">Link público da compra<input type="url" value={link} required maxLength={1000} placeholder="https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra=…" onChange={e=>{setLink(e.target.value);setCanSave(false);setMessage('');}} disabled={busy}/></label>
 {link&&!ref&&<p role="alert">Use o link público de acompanhamento com um único parâmetro compra de 17 dígitos.</p>}
 {ref&&<><p>Referência extraída do link, não verificada: UASG {ref.uasg} • compra {ref.number}/{ref.year} • ID {ref.id}</p><p><a href={ref.url} target="_blank" rel="noopener noreferrer">Abrir acompanhamento no Compras.gov.br</a></p></>}
 <button className="outline" disabled={busy||!ref}>Conferir ID na base de dados abertos</button>
 </form>
 {message&&<p role="status">{message}</p>}
 {canSave&&ref&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setMessage('');void request('/api/procurements','POST',{portal:'Comprasnet',externalRef:ref.url,agency:String(f.get('agency')),object:String(f.get('object'))}).then(async()=>{setCanSave(false);setMessage('Cadastro manual salvo, sem verificação oficial nem monitoramento da sessão. Você pode cadastrar prazos e receber os alertas desses prazos.');await onImported();}).catch(e=>setMessage(e instanceof Error?e.message:'Não foi possível salvar.')).finally(()=>setBusy(false));}}>
 <h4>Guardar referência como cadastro manual</h4><p>A ausência na base não impede guardar o link. Órgão e objeto abaixo serão informações fornecidas por você.</p>
 <label className="field">Órgão informado por você<input name="agency" required maxLength={500}/></label>
 <label className="field">Objeto informado por você<input name="object" required maxLength={2000}/></label>
 <button className="outline" disabled={busy}>Salvar cadastro manual sem monitoramento</button>
 </form>}
 </section>;
}
