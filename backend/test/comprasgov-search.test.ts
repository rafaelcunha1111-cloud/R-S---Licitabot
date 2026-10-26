import {test} from 'node:test';
import assert from 'node:assert/strict';
import {searchSchema,searchComprasgov} from '../src/comprasgov-search.js';
const query={uasg:'170131',modalidade:'5' as const,inicio:'2023-01-01',fim:'2023-12-31',pagina:1};
const row={idCompra:'17013105000172023',numeroControlePNCP:'00394460000141-1-001631/2023',orgaoEntidadeRazaoSocial:'Fixture',objetoCompra:'Fixture',unidadeOrgaoCodigoUnidade:'170131',numeroCompra:'00017'};
test('search validates UASG, real dates, bounded period, modality and page',()=>{
 for(const bad of [{uasg:'abc'},{inicio:'2023-02-30'},{fim:'2022-12-31'},{fim:'2025-01-01'},{pagina:0},{modalidade:'unknown'},{numero:'1/2023'}])assert.equal(searchSchema.safeParse({...query,...bad}).success,false);
});
test('search uses official endpoint, bounded page, filters number without falsifying source total',async()=>{
 const r=await searchComprasgov({...query,numero:'17'},async(url,options)=>{
  const u=new URL(String(url));assert.equal(u.origin,'https://dadosabertos.compras.gov.br');assert.equal(u.searchParams.get('unidadeOrgaoCodigoUnidade'),'170131');assert.equal(u.searchParams.get('codigoModalidade'),'5');assert.equal(u.searchParams.get('tamanhoPagina'),'10');assert.equal(options?.redirect,'error');
  return Response.json({resultado:[row,{...row,numeroCompra:'18'}],totalRegistros:22,totalPaginas:3});
 });
 assert.equal(r.resultado.length,1);assert.equal(r.totalRegistros,22);assert.equal(r.totalPaginas,3);
});
test('search refuses wrong unit and handles provider rate limits',async()=>{
 await assert.rejects(searchComprasgov(query,async()=>Response.json({resultado:[{...row,unidadeOrgaoCodigoUnidade:'999999'}],totalRegistros:1,totalPaginas:1})),/comprasgov_unexpected_record/);
 await assert.rejects(searchComprasgov(query,async()=>new Response('',{status:429,headers:{'retry-after':'600'}})),(e:any)=>e.code==='comprasgov_rate_limited'&&e.retrySeconds===600);
});
