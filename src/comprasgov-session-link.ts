const origin = 'https://cnetmobile.estaleiro.serpro.gov.br';
const path = '/comprasnet-web/public/compras/acompanhamento-compra';
// Parsing a public reference is not verification of its existence or content.
export function comprasgovSessionLink(value: string) {
 try {
  const url=new URL(value.trim());
  if(url.origin!==origin || url.pathname!==path || url.username || url.password || url.hash) return undefined;
  if(url.searchParams.getAll('compra').length!==1) return undefined;
  const id=url.searchParams.get('compra')!;
  if(!/^\d{17}$/.test(id)) return undefined;
  const canonical=new URL(path,origin);canonical.searchParams.set('compra',id);
  return {id,url:canonical.toString(),uasg:id.slice(0,6),modalityCode:id.slice(6,8),number:String(Number(id.slice(8,13))),year:id.slice(13)};
 } catch {return undefined;}
}
