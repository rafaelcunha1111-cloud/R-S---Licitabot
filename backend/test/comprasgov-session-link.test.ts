import {test} from 'node:test';
import assert from 'node:assert/strict';
import {comprasgovSessionLink} from '../../src/comprasgov-session-link.js';
const link='https://cnetmobile.estaleiro.serpro.gov.br/comprasnet-web/public/compras/acompanhamento-compra?compra=16010205000722026';
test('public link extracts exact reference without changing purchase number',()=>{
 const r=comprasgovSessionLink(link)!;assert.equal(r.id,'16010205000722026');assert.equal(r.uasg,'160102');assert.equal(r.number,'72');assert.equal(r.year,'2026');assert.equal(r.url,link);
 assert.equal(comprasgovSessionLink(link+'&token=do-not-store')!.url,link);
});
test('public link rejects credentials, external hosts, duplicate IDs and malformed references',()=>{
 for(const bad of [link.replace('https:','http:'),link.replace('cnetmobile.estaleiro.serpro.gov.br','evil.example'),link.replace('https://','https://user:pass@'),link+'&compra=16010205000732026',link+'#secret',link.replace('2026','26')])assert.equal(comprasgovSessionLink(bad),undefined);
});
