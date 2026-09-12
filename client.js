const $ = id => document.getElementById(id);
const status = message => $('status').textContent = message;
const LOCAL_KEY = 'my-ledger-records-v1';
let busy=false, signedIn=false, pending=null, refreshNumber=0;
function money(cents) {
    const n=BigInt(cents), a=n<0n?-n:n;
    return (n<0n?'-':'')+(a/100n)+'.'+String(a%100n).padStart(2,'0');
}
function controls() {
    $('add-button').disabled=busy||!signedIn;
    $('import').disabled=busy||!signedIn;
    $('refresh').disabled=busy||!signedIn;
}
function signedOut() {
    signedIn=false;pending=null;refreshNumber++;
    $('account').textContent='登录后可在不同浏览器同步自己的账目。';
    $('sign-in').hidden=false;$('sign-out').hidden=true;
    $('refresh').hidden=true;$('import').hidden=true;$('import-hint').hidden=true;
    $('records').replaceChildren();$('balance').textContent='请先登录';
    $('empty-message').hidden=false;$('empty-message').textContent='登录后查看云端记录';
    controls();
}
async function api(path,body) {
    const response=await fetch(path,{cache:'no-store',credentials:'same-origin',
        ...(body?{method:'POST',headers:{'Content-Type':'application/json','X-Ledger-Request':'1'},body:JSON.stringify(body)}:{})});
    const data=await response.json();
    if(response.status===401) signedOut();
    if(!response.ok) throw Error(data.error||'连接失败，请重试。');
    return data;
}
function render(records) {
    let balance=0n; const fragment=document.createDocumentFragment();
    for(const r of records) balance+=r.type==='income'?BigInt(r.cents):-BigInt(r.cents);
    for(const r of [...records].reverse()) {
        const row=document.createElement('li');
        row.className=r.type;
        row.textContent=(r.type==='income'?'收入：':'支出：')+money(r.cents)+' 元'+(r.note?' — '+r.note:'');
        fragment.appendChild(row);
    }
    $('records').replaceChildren(fragment);$('empty-message').hidden=records.length>0;
    $('empty-message').textContent='暂无云端记录';
    $('balance').textContent=money(balance)+' 元';
    $('balance').style.color=balance<0n?'#dc2626':'#16a34a';
}
async function refresh(showMessage=true) {
    const requestNumber=++refreshNumber;
    const {records}=await api('/api/records');
    if(requestNumber!==refreshNumber||!signedIn) return;
    render(records);
    if(showMessage) status('已与云端同步 · '+new Date().toLocaleTimeString());
}
function legacyRecords() {
    const records=JSON.parse(localStorage.getItem(LOCAL_KEY)||'[]');
    if(!Array.isArray(records)) throw Error('旧账目格式不正确。');
    if(!records.every(r=>r&&['income','expense'].includes(r.type)&&Number.isSafeInteger(r.cents)&&r.cents>0&&r.cents<=99999999999&&typeof r.note==='string'&&r.note.length<=200)) throw Error('旧账目中有超出金额或备注限制的记录，未导入。');
    return records;
}
async function start() {
    try {
        const me=await api('/api/me');signedIn=true;
        $('account').textContent='当前账号：'+me.email;
        $('sign-in').hidden=true;$('sign-out').hidden=false;$('refresh').hidden=false;
        try { const count=legacyRecords().length; $('import').hidden=!count;$('import-hint').hidden=!count;
            $('import').textContent='导入此浏览器的 '+count+' 条旧账目';
        } catch { $('import-hint').hidden=false;$('import-hint').textContent='无法读取旧账目，原本地数据已保留。'; }
        controls(); await refresh();
    } catch(error) {
        if(signedIn) status(error.message); else if(!$('sign-in').hidden) status('请先登录，再添加或查看账目。');
        else {status('连接失败，请刷新页面重试。');$('account').textContent='未能连接云端';}
    }
}
$('add-button').addEventListener('click',async()=>{
    const raw=$('amount').value.trim();
    if(!/^\d+(\.\d{1,2})?$/.test(raw)){status('请输入金额，最多两位小数。');return;}
    const [yuan,part='']=raw.split('.');const cents=Number(yuan)*100+Number(part.padEnd(2,'0'));
    if(!Number.isSafeInteger(cents)||cents<=0||cents>99999999999){status('请输入 0.01 至 999999999.99 元。');return;}
    const fields={type:$('type').value,cents,note:$('note').value.trim()};
    const signature=JSON.stringify(fields);
    if(!pending||pending.signature!==signature) pending={signature,record:{...fields,id:crypto.randomUUID()}};
    busy=true;refreshNumber++;controls();status('正在保存…');
    try {
        await api('/api/records',{records:[pending.record]});
        pending=null;$('amount').value='';$('note').value='';
        try {await refresh();status('已保存到云端。');} catch {status('已保存，但明细刷新失败。点击刷新即可，无需重复添加。');}
    } catch(error){status(error.message+' 如需重试，请保持输入不变再点添加。');}
    finally{busy=false;controls();}
});
$('refresh').addEventListener('click',()=>refresh().catch(e=>status(e.message)));
$('import').addEventListener('click',async()=>{
    if(!confirm('将此浏览器中的旧账目导入当前登录账号？原本地记录会保留。')) return;
    busy=true;refreshNumber++;controls();
    try {
        const rows=legacyRecords(); const converted=[];
        for(let i=0;i<rows.length;i++) {
            const r=rows[i];
            const bytes=new TextEncoder().encode(JSON.stringify([i,r.type,r.cents,r.note]));
            const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
            converted.push({type:r.type,cents:r.cents,note:r.note,id:'legacy-'+hash});
        }
        for(let i=0;i<converted.length;i+=100){status('正在导入 '+Math.min(i+100,converted.length)+' / '+converted.length+'…');await api('/api/records',{records:converted.slice(i,i+100)});}
        await refresh();status('旧账目已导入。再次导入同一份记录不会重复添加。');
    } catch(error){status(error.message+' 可重试导入，已成功的同一批记录不会重复添加。');}
    finally{busy=false;controls();}
});
setInterval(()=>{if(signedIn&&!busy&&!document.hidden) refresh(false).catch(e=>status('同步暂停：'+e.message));},15000);
window.addEventListener('focus',()=>{if(signedIn&&!busy) refresh().catch(e=>status(e.message));});
start();
