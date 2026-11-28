/* sessions.js — LOCAL SESSIONS + CONTEXT VIEW.
   Sessions are stored separately from account settings in localStorage, so they are never sent to
   db.json or synced to another device. A session belongs to one tab (Chat, Coder, Agent, Multimodal).
   Images are kept when they fit; if the browser storage quota is full, images are dropped first. */
const SESS_KEY='luna.sessions.v1',SESS_CUR='luna.sessions.current';
const SESS={list:[],cur:{},rendered:{},warned:false};
const sessNow=()=>Date.now();
const sessId=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,7);
const sessGet=id=>SESS.list.find(s=>s.id===id)||null;
const sessTok=s=>Math.ceil(String(s||'').length/4);
const sessModeName=k=>M[k]?.n||k;
const sessClean=m=>({role:m.role=='assistant'?'assistant':'user',content:String(m.content||''),...(m.images?.length?{images:[...m.images]}:{})});

function sessLoad(){
  try{const a=JSON.parse(localStorage.getItem(SESS_KEY)||'[]');if(Array.isArray(a))SESS.list=a.filter(s=>s&&s.id&&M[s.mode]&&Array.isArray(s.messages))}catch{}
  try{const c=JSON.parse(localStorage.getItem(SESS_CUR)||'{}');if(c&&typeof c=='object')SESS.cur=c}catch{}
}
function sessPersist(){
  const write=()=>{
    localStorage.setItem(SESS_KEY,JSON.stringify(SESS.list));
    localStorage.setItem(SESS_CUR,JSON.stringify(SESS.cur));
  };
  try{write();return}
  catch(e){
    // Quota: images are the largest part, so drop them first.
    for(const s of SESS.list)for(const m of s.messages||[])delete m.images;
    try{write();if(!SESS.warned){SESS.warned=true;console.warn('Session storage was full; images were removed from saved sessions.')}return}catch{}
    // Still full: keep the newest sessions and the last 60 messages of each.
    SESS.list=SESS.list.sort((a,b)=>(b.updated||0)-(a.updated||0)).slice(0,20);
    for(const s of SESS.list)s.messages=(s.messages||[]).slice(-60);
    try{write();if(!SESS.warned){SESS.warned=true;console.warn('Session storage was full; older sessions were trimmed.')}}catch(e2){console.warn('Sessions could not be saved:',e2)}
  }
}
function sessCreate(k,title){
  const s={id:sessId(),title:title||'New chat',mode:k,created:sessNow(),updated:sessNow(),provider:'',model:'',messages:[]};
  SESS.list.unshift(s);return s;
}
function sessTitle(k){
  const m=(H[k]||[]).find(x=>x.role=='user');
  if(!m)return'New chat';
  const t=String(m.content||'').replace(/\s+/g,' ').trim();
  return(t?t.slice(0,70):'Image message')||'New chat';
}
function sessSave(k){
  if(!H[k])return;
  let s=sessGet(SESS.cur[k]);
  if(!s){s=sessCreate(k);SESS.cur[k]=s.id}
  s.mode=k;s.messages=(H[k]||[]).map(sessClean);s.updated=sessNow();
  s.provider=$('#prov')?.value||'';s.model=$('#mdl')?.value||'';
  if(!s.title||s.title=='New chat')s.title=sessTitle(k);
  sessPersist();
  if($('#sesDlg')?.open)renderSessions();
  if($('#ctxDlg')?.open)renderContext();
}
function sessEnsureMode(k){
  if(!H[k])return;
  if(!SESS.cur[k]||!sessGet(SESS.cur[k])){const s=sessCreate(k);SESS.cur[k]=s.id;sessPersist()}
  if(!SESS.rendered[k]){
    const s=sessGet(SESS.cur[k]);
    H[k]=(s?.messages||[]).map(sessClean);
    sessRenderLog(k);SESS.rendered[k]=true;
  }
}
function sessEmpty(k){
  return`<div class="empty mx-auto mt-[10vh] max-w-md px-3 text-center"><img data-brand="logo" alt="" class="mx-auto mb-3 h-12 w-12 opacity-80"><p class="text-mu">${EMPTY[k]||''}</p></div>`;
}
function sessRenderLog(k){
  const log=document.querySelector(`.log[data-k=${k}]`);if(!log)return;
  if(!H[k]?.length){log.innerHTML=sessEmpty(k)}
  else log.innerHTML=H[k].map(m=>{
    if(m.role=='user')return`<div class="msg msg-u">${esc(m.content||'')}${(m.images||[]).map(u=>`<img src="${u}" class="mt-1.5 max-h-32" alt="">`).join('')}</div>`;
    return`<div class="msg">${md(m.content||'')}</div>`;
  }).join('');
  if(typeof applyBrand=='function')applyBrand();
  if(typeof pinned!=='undefined'&&pinned&&typeof mainEl!=='undefined')mainEl.scrollTop=mainEl.scrollHeight;
}
function sessNew(k){
  if(H[k]?.length)sessSave(k);
  const cur=sessGet(SESS.cur[k]);
  if(cur&&!cur.messages.length){ // reuse an empty current session instead of stacking empty ones
    cur.title='New chat';cur.updated=sessNow();sessPersist();
  }else{
    const s=sessCreate(k);SESS.cur[k]=s.id;sessPersist();
  }
  H[k]=[];if(typeof last!=='undefined')last[k]=null;SESS.rendered[k]=true;
  sessRenderLog(k);renderSessions();
}
function sessSwitch(id){
  const s=sessGet(id);if(!s)return;
  sessSave(mode);
  SESS.cur[s.mode]=id;SESS.rendered[s.mode]=true;H[s.mode]=(s.messages||[]).map(sessClean);
  if(typeof last!=='undefined')last[s.mode]=null;
  if(mode!==s.mode){setMode(s.mode);sessRenderLog(s.mode)}
  else sessRenderLog(s.mode);
  sessPersist();renderSessions();$('#sesDlg')?.close();
}
function sessDelete(id){
  const s=sessGet(id);if(!s)return;
  if(!confirm(`Delete session "${s.title}"?`))return;
  SESS.list=SESS.list.filter(x=>x.id!==id);
  if(SESS.cur[s.mode]==id){
    const next=SESS.list.filter(x=>x.mode==s.mode).sort((a,b)=>(b.updated||0)-(a.updated||0))[0];
    if(typeof last!=='undefined')last[s.mode]=null;
    if(next){SESS.cur[s.mode]=next.id;SESS.rendered[s.mode]=true;H[s.mode]=(next.messages||[]).map(sessClean);sessRenderLog(s.mode)}
    else{const n=sessCreate(s.mode);SESS.cur[s.mode]=n.id;SESS.rendered[s.mode]=true;H[s.mode]=[];sessRenderLog(s.mode)}
  }
  sessPersist();renderSessions();
}
function sessRename(id){
  const s=sessGet(id);if(!s)return;
  const t=prompt('Session name:',s.title);
  if(t==null)return;
  s.title=t.trim().slice(0,80)||'New chat';s.updated=sessNow();sessPersist();renderSessions();
}
function renderSessions(){
  const box=$('#sesList');if(!box)return;
  const list=[...SESS.list].sort((a,b)=>(b.updated||0)-(a.updated||0));
  box.innerHTML=list.length?list.map(s=>{
    const on=SESS.cur[s.mode]==s.id;
    return`<div class="rounded-lg border ${on?'border-ac bg-cd':'border-bd'} p-2">
      <div class="flex flex-wrap items-start justify-between gap-2"><div class="min-w-0 flex-1"><b class="block truncate text-sm">${esc(s.title||'New chat')}</b>
        <div class="text-xs text-mu">${sessModeName(s.mode)} · ${(s.messages||[]).length} messages · ${new Date(s.updated||s.created).toLocaleString()}</div></div>
      <div class="flex shrink-0 gap-1"><button type="button" class="btn px-2 py-1 text-xs" data-sopen="${s.id}">Open</button><button type="button" class="btn px-2 py-1 text-xs" data-sren="${s.id}">Rename</button><button type="button" class="btn px-2 py-1 text-xs" data-sdel="${s.id}">Delete</button></div></div></div>`;
  }).join(''):'<p class="text-sm text-mu">No sessions yet. Start a conversation, or click New session.</p>';
}
function renderContext(){
  const box=$('#ctxBody');if(!box)return;
  const k=mode,msgs=H[k]||[],sys=(typeof sysFor=='function'?sysFor(k):'')||'';
  const local=$('#prov')?.value=='inapp',win=local&&typeof localCtxSize=='function'?localCtxSize():0;
  const tokens=msgs.reduce((a,m)=>a+sessTok(m.content)+(m.images?.length||0)*85,0)+sessTok(sys);
  const pct=win?Math.min(100,Math.round(tokens/win*100)):0;
  const s=sessGet(SESS.cur[k]);
  const stat=(t,v)=>`<div class="rounded-lg border border-bd p-2"><div class="text-[11px] text-mu">${t}</div><div class="text-sm font-semibold">${v}</div></div>`;
  const rows=msgs.map((m,i)=>{
    const t=sessTok(m.content),txt=String(m.content||'');
    return`<div class="rounded-lg border border-bd p-2"><div class="flex flex-wrap items-center justify-between gap-2"><span class="text-xs font-semibold ${m.role=='assistant'?'text-ac':'text-mu'}">${m.role=='assistant'?'Assistant':'User'} ${i+1}</span><span class="flex items-center gap-2 text-[11px] text-mu">${t} tokens${m.images?.length?` · ${m.images.length} image(s)`:''}<button type="button" class="btn px-1.5 py-0.5 text-[11px]" data-crmmsg="${i}">Remove</button></span></div>
      <pre class="mt-1 max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs text-mu">${esc(txt.length>900?txt.slice(0,900)+'…':txt)}</pre></div>`;
  }).join('');
  box.innerHTML=`<div class="grid grid-cols-2 gap-1.5 sm:grid-cols-4">${stat('Tab',sessModeName(k))}${stat('Messages',msgs.length)}${stat('Estimated tokens',tokens)}${stat('Context window',win?win+' tokens':'Provider-defined')}</div>
    ${win?`<div class="mt-2"><div class="flex justify-between text-xs text-mu"><span>Context usage</span><span>${pct}%</span></div><div class="mt-1 h-1.5 rounded bg-cd"><div class="h-1.5 rounded ${pct>85?'bg-er':'bg-ac'}" style="width:${pct}%"></div></div></div>`:''}
    <div class="mt-3 rounded-lg border border-bd p-2"><div class="flex items-center justify-between gap-2"><b class="text-sm">System prompt</b><span class="text-xs text-mu">${sessTok(sys)} tokens</span></div><pre class="mt-1 max-h-24 overflow-auto whitespace-pre-wrap break-words text-xs text-mu">${esc(sys||'(empty)')}</pre></div>
    <div class="mt-3 flex flex-wrap items-center justify-between gap-2"><b class="text-sm">Messages in this session</b><div class="flex flex-wrap gap-1"><button type="button" class="btn px-2 py-1 text-xs" id="ctxTrim">Keep last 10</button><button type="button" class="btn px-2 py-1 text-xs" id="ctxExport">Export</button><button type="button" class="btn px-2 py-1 text-xs" id="ctxClear">Clear context</button></div></div>
    <div class="mt-2 grid gap-1.5">${rows||'<p class="text-sm text-mu">This session has no messages yet.</p>'}</div>
    <p class="mt-2 text-xs text-mu">Estimated tokens use ~4 characters per token. The provider may count differently. Session: ${esc(s?.title||'current')}.</p>`;
}
function sessExport(){
  const k=mode,s=sessGet(SESS.cur[k]);
  const data={title:s?.title||'Session',mode:k,provider:$('#prov')?.value||'',model:$('#mdl')?.value||'',system:(typeof sysFor=='function'?sysFor(k):'')||'',messages:H[k]||[]};
  const u=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  const a=document.createElement('a');a.href=u;a.download='luna-session-'+new Date().toISOString().slice(0,10)+'.json';a.click();
  setTimeout(()=>URL.revokeObjectURL(u),1000);
}
function sessInit(){
  sessLoad();
  if(!$('#sesBtn'))return;
  $('#sesBtn').onclick=()=>{renderSessions();$('#sesDlg').showModal()};
  $('#ctxBtn').onclick=()=>{renderContext();$('#ctxDlg').showModal()};
  $('#sesClose').onclick=()=>$('#sesDlg').close();
  $('#ctxClose').onclick=()=>$('#ctxDlg').close();
  $('#sesNew').onclick=()=>sessNew(mode);
  $('#sesExport').onclick=()=>{
    const u=URL.createObjectURL(new Blob([JSON.stringify(SESS.list,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=u;a.download='luna-sessions-'+new Date().toISOString().slice(0,10)+'.json';a.click();
    setTimeout(()=>URL.revokeObjectURL(u),1000);
  };
  $('#sesList').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.sopen)sessSwitch(b.dataset.sopen);
    else if(b.dataset.sren)sessRename(b.dataset.sren);
    else if(b.dataset.sdel)sessDelete(b.dataset.sdel);
  });
  $('#ctxBody').addEventListener('click',e=>{
    const b=e.target.closest('button');if(!b)return;
    const k=mode;
    if(b.dataset.crmmsg!=null){H[k].splice(+b.dataset.crmmsg,1);sessSave(k);sessRenderLog(k);renderContext()}
    else if(b.id=='ctxClear'){if(confirm('Clear all messages in this session?')){H[k]=[];if(typeof last!=='undefined')last[k]=null;sessSave(k);sessRenderLog(k);renderContext()}}
    else if(b.id=='ctxTrim'){if(confirm('Keep only the last 10 messages?')){H[k]=H[k].slice(-10);sessSave(k);sessRenderLog(k);renderContext()}}
    else if(b.id=='ctxExport')sessExport();
  });
  window.addEventListener('beforeunload',()=>{try{sessSave(mode)}catch{}});
}
