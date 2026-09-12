const PAGE = "__HTML__";
const MAX_CENTS = 99999999999;
function json(value,status=200) {
  return Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
function database(env) { if(!env.DB) throw Error('Database unavailable'); return env.DB; }
function valid(r) {
  return r && typeof r.id==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(r.id)
    && ['income','expense'].includes(r.type) && Number.isSafeInteger(r.cents)
    && r.cents>0 && r.cents<=MAX_CENTS && typeof r.note==='string' && r.note.length<=200;
}
export default {
  async fetch(request,env) {
    const url=new URL(request.url);
    if(url.pathname==='/' && ['GET','HEAD'].includes(request.method)) {
      return new Response(request.method==='HEAD'?null:PAGE,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'}});
    }
    if(!url.pathname.startsWith('/api/')) return new Response('Not found',{status:404});
    // These headers are set by the Sites dispatcher, never by the page.
    const owner=request.headers.get('oai-authenticated-user-id');
    const email=request.headers.get('oai-authenticated-user-email');
    if(!owner || !email) return json({error:'请先登录 ChatGPT 账号。'},401);
    try {
      if(url.pathname==='/api/me' && request.method==='GET') return json({email});
      if(url.pathname==='/api/records' && request.method==='GET') {
        const result=await database(env).prepare('SELECT id,type,cents,note,created_at AS createdAt FROM ledger_records WHERE owner = ? ORDER BY created_at ASC,id ASC').bind(owner).all();
        return json({records:result.results});
      }
      if(url.pathname==='/api/records' && request.method==='POST') {
        if(request.headers.get('Origin')!==url.origin || request.headers.get('X-Ledger-Request')!=='1') return json({error:'请求来源无效，请刷新页面。'},403);
        if(!request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'请求格式不正确。'},415);
        // Bound the decoded body before accepting a batch import.
        const reader=request.body?.getReader();
        if(!reader) return json({error:'请求为空。'},400);
        let size=0; const chunks=[];
        while(true) { const part=await reader.read(); if(part.done) break; size+=part.value.byteLength; if(size>120000) {await reader.cancel();return json({error:'每次最多导入 100 条记录。'},413);} chunks.push(part.value); }
        const bytes=new Uint8Array(size); let offset=0; for(const c of chunks){bytes.set(c,offset);offset+=c.length;}
        let body; try { body=JSON.parse(new TextDecoder().decode(bytes)); } catch {return json({error:'请求格式不正确。'},400);}
        const rows=body?.records;
        if(!Array.isArray(rows)||rows.length<1||rows.length>100||!rows.every(valid)) return json({error:'金额、备注或记录格式不正确。'},400);
        const now=Date.now();
        const db=database(env);
        // Composite owner/id key makes retries safe and isolates accounts.
        await db.batch(rows.map((r,i)=>db.prepare('INSERT INTO ledger_records (owner,id,type,cents,note,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(owner,id) DO NOTHING').bind(owner,r.id,r.type,r.cents,r.note,now+i)));
        return json({ok:true});
      }
      return json({error:'接口不存在。'},404);
    } catch(error) {
      console.error('Ledger storage failure',error?.message);
      return json({error:'云端暂时不可用，请稍后重试。你的输入已保留。'},503);
    }
  }
};
