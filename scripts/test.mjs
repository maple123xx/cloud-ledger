import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
import worker from '../dist/server/index.js';
const sqlite=new DatabaseSync(':memory:');
for(const f of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql'))) sqlite.exec(fs.readFileSync('drizzle/'+f,'utf8'));
const DB={prepare(sql){return {bind(...values){return {all:async()=>({results:sqlite.prepare(sql).all(...values)}),run:()=>sqlite.prepare(sql).run(...values)}}}},async batch(statements){sqlite.exec('BEGIN');try {const values=statements.map(s=>s.run());sqlite.exec('COMMIT');return values;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
const origin='https://ledger.test';
async function call(path,owner,body,extra={}) {
 const headers={...(owner?{'oai-authenticated-user-id':owner,'oai-authenticated-user-email':owner+'@test.invalid'}:{}),...(body?{'Content-Type':'application/json',Origin:origin,'X-Ledger-Request':'1'}:{}),...extra};
 return worker.fetch(new Request(origin+path,{headers,...(body?{method:'POST',body:JSON.stringify(body)}:{})}),{DB});
}
assert.equal((await call('/api/records',null)).status,401);
const rows=[{id:'test-income',type:'income',cents:10000,note:'工资'},{id:'test-expense',type:'expense',cents:2550,note:'午餐'}];
assert.equal((await call('/api/records','alice',{records:rows})).status,200);
assert.equal((await call('/api/records','alice',{records:rows})).status,200);
const a=await (await call('/api/records','alice')).json();assert.equal(a.records.length,2);
assert.equal(a.records.reduce((n,r)=>n+(r.type==='income'?r.cents:-r.cents),0),7450);
assert.equal((await (await call('/api/records','bob')).json()).records.length,0);
assert.equal((await call('/api/records','bob',{records:[rows[0]]})).status,200);
assert.equal((await (await call('/api/records','bob')).json()).records.length,1);
assert.equal((await call('/api/records','alice',{records:rows},{Origin:'https://evil.test'})).status,403);
assert.equal((await call('/api/records','alice',{records:[{...rows[0],cents:-1}]})).status,400);
assert.equal((await call('/api/records','alice',{records:[{...rows[0],cents:1.5}]})).status,400);
const html=await (await call('/',null)).text();assert.match(html,/signin-with-chatgpt/);assert.match(html,/setInterval/);assert.ok(!html.includes('src="/client.js"'));
console.log('PASS: anonymous denial, account isolation, persistence, retry deduplication, amount validation, cross-origin rejection and built page');
