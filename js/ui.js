/* ui.js — tabs, message sending, settings dialog, and initialization */

/* ===== SMOOTH STREAMING =====
   1) Smart auto-scroll: follow to the bottom only when the user is already near the bottom.
      If you scroll up during inference, a "Jump to bottom" button appears (#jump).
   2) Painter: render the DOM at most once per frame, and reveal text gradually so tokens
      that arrive in bursts still look fluid. Change the number 6 below to
      adjust how fast it catches up with the queue (smaller = faster, larger = slower). */
let pinned=true;
const mainEl=$('#main'),jump=$('#jump');
const follow=()=>{if(pinned)mainEl.scrollTop=mainEl.scrollHeight};
mainEl.addEventListener('scroll',()=>{pinned=mainEl.scrollHeight-mainEl.scrollTop-mainEl.clientHeight<80;jump.classList.toggle('hidden',pinned||!busy)});
jump.onclick=()=>{pinned=true;mainEl.scrollTo({top:mainEl.scrollHeight,behavior:'smooth'})};
function makePainter(o){
  let full='',shown=0,raf=0;
  const step=()=>{
    raf=0;const back=full.length-shown;if(back<=0)return;
    o.classList.add('streaming');                       // blinking cursor (see src/input.css)
    shown+=Math.max(1,Math.ceil(back/6));               // the more queued, the faster it catches up
    if(/[\uD800-\uDBFF]/.test(full[shown-1]))shown++;    // don't split emoji
    o.innerHTML=md(full.slice(0,shown));follow();
    if(shown<full.length)raf=requestAnimationFrame(step);
  };
  return{
    text(){return full},
    set(t){full=t;if(!raf)raf=requestAnimationFrame(step)},                                   // called whenever a token arrives
    flush(){cancelAnimationFrame(raf);raf=0;if(full){shown=full.length;o.innerHTML=md(full);follow()}o.classList.remove('streaming')}, // done: show everything
    stop(){cancelAnimationFrame(raf);raf=0;o.classList.remove('streaming')}                    // stopped/error
  };
}

/* ===== MODEL PICKER =====
   A custom dropdown, not <datalist>. The old bug: datalist only showed options that matched
   the text already in the field, so after choosing one model, other models no longer appeared.
   Now: click/focus the field = show ALL models; typing = filter.
   The model list is stored per provider in MODELS so it survives tab or provider changes. */
const MODELS={};
const mdl=$('#mdl'),mlist=$('#mlist');
function closeMenu(){mlist.classList.add('hidden');mdl.setAttribute('aria-expanded','false')}
function renderMenu(filter=''){
  const all=MODELS[$('#prov').value]||[],q=filter.toLowerCase(),l=all.filter(x=>x.toLowerCase().includes(q));
  mlist.innerHTML=l.length
    ?l.map(x=>`<div role="option" data-m="${esc(x)}" class="cursor-pointer break-all rounded-md px-2.5 py-1.5 hover:bg-cd ${x==mdl.value?'font-semibold text-ac':''}">${esc(x)}</div>`).join('')
    :`<div class="px-2.5 py-1.5 text-sm text-mu">${all.length?'No matches. The name you typed is still used.':'Loading model list…'}</div>`;
  mlist.classList.remove('hidden');mdl.setAttribute('aria-expanded','true');
  mlist.querySelector('.text-ac')?.scrollIntoView({block:'nearest'});
}
/* Get the model list from the selected provider. btn = "Load models" button (optional, for status). */
async function loadModels(btn){
  const p=$('#prov').value;if(btn)btn.textContent='Loading…';
  try{
    MODELS[p]=await models(p);if(btn)btn.textContent=MODELS[p].length+' models';
    if(!mlist.classList.contains('hidden')&&$('#prov').value==p)renderMenu();
  }catch(e){
    if(btn)btn.textContent='Failed to load';
    mlist.innerHTML=`<div class="px-2.5 py-1.5 text-sm text-er">Could not load models: ${esc(e.message)}</div>`;mlist.classList.remove('hidden');
  }
  if(btn)setTimeout(()=>btn.textContent='Load models',2500);
}

/* ===== IMAGE ATTACHMENTS (Multimodal tab) =====
   "Attach image" button (label.filebtn) + small previews with a remove button. Images can also be pasted (Ctrl+V). */
const ATT=[]; // image data URLs waiting to be sent
function renderThumbs(){
  const t=$('#thumbs');if(!t)return;
  t.innerHTML=ATT.map((u,i)=>`<span class="relative"><img src="${u}" alt="" class="h-10 w-10 rounded-md border border-bd object-cover"><button type="button" data-rm="${i}" aria-label="Remove image" class="absolute -right-1.5 -top-1.5 h-4 w-4 rounded-full bg-tx text-[10px] leading-4 text-bg">×</button></span>`).join('');
}
async function addFiles(files){
  for(const f of files){
    if(!f.type.startsWith('image/'))continue;
    ATT.push(await new Promise(ok=>{const r=new FileReader();r.onload=()=>ok(r.result);r.readAsDataURL(f)}));
  }
  renderThumbs();
}

/* ===== PROVIDER SETTINGS =====
   Two groups (Cloud / Local). Each provider = one collapsible row. Cloud: just paste the API key (the default URL is already correct).
   Local: check the server address. The "Test connection" button confirms everything works. The provider list comes from P in config.js. */
let setGroup='cloud';
const hasKey=p=>!!key(p);
const attr=s=>esc(String(s)).replace(/"/g,'&quot;'); // safe for attributes
function chip(p){const ok=hasKey(p);return`<span class="text-xs ${ok?'text-ac':'text-mu'}">${ok?'Key set':'Not set'}</span>`}
function renderSettings(open){
  for(const[id,g]of[['gCloud','cloud'],['gLocal','local'],['gMcp','mcp']])$('#'+id).classList.toggle('tab-on',setGroup==g);
  if(setGroup=='mcp')return renderMcp();
  $('#pvs').innerHTML=ALL.filter(p=>!!P[p].loc==(setGroup=='local')).map(p=>{
    const v=P[p],cloud=!v.loc;
    return`<details data-d="${p}" class="group rounded-lg border border-bd bg-sf" ${p==open?'open':''}>
      <summary class="flex cursor-pointer items-center justify-between gap-2 px-3 py-2"><span class="font-medium">${v.n}</span>
        <span class="flex items-center gap-2">${cloud?chip(p):'<span class="text-xs text-mu">Local</span>'}<svg viewBox="0 0 24 24" class="h-4 w-4 text-mu transition-transform group-open:rotate-180" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></summary>
      <div class="grid gap-2 border-t border-bd p-3">
        ${v.k?`<label class="grid gap-1 text-sm text-mu">API key<input type="password" class="field w-full text-tx" data-p="${p}" data-f="k" placeholder="Paste API key here" autocomplete="off" value="${attr(S.k[p]||'')}"></label>`:''}
        <label class="grid gap-1 text-sm text-mu">${cloud?'Custom URL (optional)':'Server address'}<input class="field w-full text-tx" data-p="${p}" data-f="u" placeholder="${attr(v.url)}" value="${attr(S.u[p]||'')}"></label>
        <div class="flex flex-wrap items-center gap-2"><button type="button" class="btn" data-test="${p}">Test connection</button><span class="text-sm" id="t-${p}"></span></div>
        ${v.loc?'<p class="text-xs text-mu">If the connection fails, enable CORS on the server (Ollama: run with OLLAMA_ORIGINS="*"; LM Studio: Enable CORS).</p>':''}
      </div></details>`;
  }).join('');
  $('#gCloud').classList.toggle('tab-on',setGroup=='cloud');$('#gLocal').classList.toggle('tab-on',setGroup=='local');
}
function openSettings(p){ // p (optional) = provider to open directly
  setGroup=p&&P[p].loc?'local':'cloud';renderSettings(p);$('#dlg').showModal();
  if(p){const d=$(`#pvs details[data-d=${p}]`);d?.scrollIntoView({block:'nearest'});d?.querySelector('input')?.focus()}
}
async function ping(p){ // connection test: fetch the model list (or the A1111 endpoint)
  if(P[p].t=='a1'){const r=await fetch(base(p)+'/sdapi/v1/sd-models');if(!r.ok)throw new Error(r.status);return'Connected'}
  if(P[p].nolist)return hasKey(p)?'Key saved (this provider has no model list; type the model name manually)':'Enter the API key first';
  const l=await models(p);MODELS[p]=l;return`Connected · ${l.length} models`;
}

/* Fill the provider list (grouped Cloud/Local; cloud providers without a key are marked) */
function fillProv(k){
  const ps=M[k].ps,opt=p=>`<option value="${p}">${P[p].n}${P[p].k&&p!='custom'&&!key(p)?' (no key yet)':''}</option>`;
  const grp=(t,l)=>l.length?`<optgroup label="${t}">${l.map(opt).join('')}</optgroup>`:'';
  $('#prov').innerHTML=grp('Cloud',ps.filter(p=>!P[p].loc))+grp('Local',ps.filter(p=>P[p].loc));
}

/* ===== ADVANCED SETTINGS PANEL (Image and Video tabs) =====
   Fields are generated from GEN (config.js) for the selected provider; values are stored per provider in S.gen.
   LoRA: AUTOMATIC1111/Forge chooses from the installed list on the server; Together uses a manual path/URL. */
const A1={tried:false,samplers:[],schedulers:[],loras:[]}; // dynamic data from the AUTOMATIC1111/Forge server
function setGen(kind,p,id,v){
  S.gen=S.gen||{};S.gen[kind]=S.gen[kind]||{};S.gen[kind][p]=S.gen[kind][p]||{};
  S.gen[kind][p][id]=v;save();
}
function loraHTML(p){
  const a1=p=='a1111';
  return`<div class="col-span-full grid gap-1.5"><span class="text-xs text-mu">LoRA</span><div id="loraChips" class="flex flex-wrap gap-1.5"></div>
    <div class="flex flex-wrap items-center gap-1.5">${a1
      ?`<select id="loraName" class="field min-w-[160px] flex-1 text-sm text-tx"><option value="">Choose an installed LoRA…</option>${A1.loras.map(n=>`<option value="${attr(n)}">${esc(n)}</option>`).join('')}</select><button type="button" class="btn text-sm" data-a1load>Load from server</button>`
      :`<input id="loraName" class="field min-w-[200px] flex-1 text-sm text-tx" placeholder="LoRA path or URL (Hugging Face repo / CivitAI link)">`}
      <input id="loraW" type="number" min="0" max="2" step="0.05" value="0.8" class="field w-20 text-sm text-tx" title="Weight (0-2)" aria-label="LoRA weight"><button type="button" class="btn text-sm" data-loraadd>Add</button></div></div>`;
}
function renderChips(){
  const c=$('#loraChips');if(!c)return;
  c.innerHTML=(gen('image',$('#prov').value).loras||[]).map((x,i)=>`<span class="chip flex items-center gap-1.5 text-xs">${esc(x.n)} · ${x.w}<button type="button" data-loradel="${i}" aria-label="Remove LoRA" class="text-mu hover:text-er">×</button></span>`).join('');
}
function fieldHTML(f,val,p){
  if(f.type=='lora')return loraHTML(p);
  const lab=`<span class="text-xs text-mu">${f.label}</span>`;
  if(f.type=='select'){
    const list=f.id=='sampler'?[['','(server default)'],...A1.samplers]:f.id=='scheduler'?[['','(server default)'],...A1.schedulers]:[...f.opts];
    if(val&&!list.some(o=>(Array.isArray(o)?o[0]:o)==val))list.push(val); // saved value stays visible even if the list is not loaded yet
    return`<label class="grid gap-1">${lab}<select data-g="${f.id}" class="field text-sm text-tx">${list.map(o=>{const[v,l]=Array.isArray(o)?o:[o,o];return`<option value="${attr(v)}" ${v==val?'selected':''}>${esc(l)}</option>`}).join('')}</select></label>`;
  }
  const nm=f.type=='number';
  return`<label class="grid gap-1 ${nm?'':'col-span-full'}">${lab}<input data-g="${f.id}" type="${nm?'number':'text'}" ${nm?`min="${f.min}" max="${f.max}" step="${f.step}"`:''} placeholder="${attr(f.ph||'')}" value="${attr(val??'')}" class="field text-sm text-tx"></label>`;
}
function renderGen(){
  const kind=mode,box=$('#advBox'),on=kind=='image'||kind=='video';
  box.classList.toggle('hidden',!on);if(!on)return;
  const p=$('#prov').value,v=gen(kind,p),fs=GEN[kind].filter(f=>f.p.includes(p));
  $('#advTitle').textContent=kind=='image'?'Image settings':'Video settings';
  $('#adv').innerHTML=fs.map(f=>fieldHTML(f,v[f.id],p)).join('')||'<p class="col-span-full text-sm text-mu">This provider has no additional settings.</p>';
  const h=$('#advHint'),t=GEN_HINT[kind+':'+p]||'';h.textContent=t;h.className='px-3 pb-2 text-xs text-mu'+(t?'':' hidden');
  if(kind=='image')renderChips();
  if(kind=='image'&&p=='a1111'&&!A1.tried)loadA1(); // try to load samplers and LoRA automatically (once)
}
/* Fetch samplers, schedulers, and LoRA from the AUTOMATIC1111/Forge server */
async function loadA1(){
  A1.tried=true;const root=base('a1111'),get=async u=>{const r=await fetch(root+u);if(!r.ok)throw new Error(r.status);return r.json()};
  try{
    const[s,sc,l]=await Promise.all([get('/sdapi/v1/samplers'),get('/sdapi/v1/schedulers').catch(()=>[]),get('/sdapi/v1/loras').catch(()=>[])]);
    A1.samplers=s.map(x=>x.name);A1.schedulers=sc.map(x=>x.name||x.label);A1.loras=l.map(x=>x.name||x.alias);
    if(mode=='image'&&$('#prov').value=='a1111')renderGen();
  }catch(e){
    const h=$('#advHint');h.textContent='Cannot connect to AUTOMATIC1111/Forge ('+(/Failed to fetch/.test(e.message)?'check the address and --cors-allow-origins':e.message)+').';h.className='px-3 pb-2 text-xs text-er';
  }
}
for(const ev of['input','change'])$('#adv').addEventListener(ev,e=>{const g=e.target.dataset?.g;if(g)setGen(mode,$('#prov').value,g,e.target.value)});
$('#adv').addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;const p=$('#prov').value,cur=()=>[...(gen('image',p).loras||[])];
  if(b.dataset.loraadd!=null){
    const n=$('#loraName').value.trim(),w=+$('#loraW').value||0.8;if(!n)return;
    setGen('image',p,'loras',[...cur(),{n,w}]);$('#loraName').value='';renderChips();
  }else if(b.dataset.loradel!=null){const l=cur();l.splice(+b.dataset.loradel,1);setGen('image',p,'loras',l);renderChips()}
  else if(b.dataset.a1load!=null){b.textContent='Loading…';await loadA1()}
});

/* ===== CODER TAB =====
   Task/language/temperature presets are in CODER (config.js). Attached code files are inserted into the message as code blocks.
   Code blocks in replies have Copy, Download, and Preview buttons (HTML runs in a sandboxed iframe without access to app data). */
const CF=[]; // attached code files: {name,text}
const F3='`'.repeat(3);
function renderCF(){
  const t=$('#cthumbs');if(!t)return;
  t.innerHTML=CF.map((f,i)=>`<span class="chip flex items-center gap-1.5 text-xs">${esc(f.name)}<button type="button" data-crm="${i}" aria-label="Remove file" class="text-mu hover:text-er">×</button></span>`).join('');
}
async function addCode(files){
  for(const f of files){
    if(f.size>150000){alert(`${f.name} is too large (maximum 150 KB).`);continue}
    const text=await new Promise(ok=>{const r=new FileReader();r.onload=()=>ok(r.result);r.readAsText(f)});
    if(text.includes('\u0000')){alert(`${f.name} is not a text file.`);continue}
    if(CF.reduce((a,x)=>a+x.text.length,0)+text.length>400000){alert('Total attachments exceed 400 KB.');break}
    CF.push({name:f.name,text});
  }
  renderCF();
}
const withFiles=(files,q)=>files.length?files.map(f=>`File: ${f.name}\n${F3}${f.name.split('.').pop()}\n${f.text}\n${F3}\n\n`).join('')+q:q;
const coderSys=()=>{ // Coder tab system prompt from the selected presets
  const t=$('#task')?.value||'write',l=$('#lang')?.value,x=$('#sys')?.value.trim();
  return[CODER.base,CODER.tasks[t][1],l?`Language/stack: ${CODER.langs.find(a=>a[0]==l)[1]}.`:'',x].filter(Boolean).join('\n');
};
const sysFor=k=>k=='coder'?coderSys():$('#sys')?.value.trim();
const tempFor=k=>{const v=k=='coder'?$('#temp')?.value:'';return v?+v:undefined};
function restoreCoder(){for(const id of['task','lang','temp']){const e=$('#'+id),v=S.cd?.[id];if(e&&v!=null)e.value=v}}
$('#opt').addEventListener('change',e=>{
  if(e.target.id=='cfiles'){const fl=[...e.target.files];e.target.value='';addCode(fl)}
  else if(['task','lang','temp'].includes(e.target.id)){S.cd=S.cd||{};S.cd[e.target.id]=e.target.value;save()}
});
$('#opt').addEventListener('click',e=>{const i=e.target.dataset?.crm;if(i!=null){CF.splice(+i,1);renderCF()}});
/* Code block buttons (delegated): copy, download, preview */
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-cb]');if(!b)return;
  const blk=b.closest('.codeblock'),code=blk.querySelector('code').textContent,a=b.dataset.cb;
  if(a=='copy'){await copyText(code);b.textContent='Copied';setTimeout(()=>b.textContent='Copy',1200)}
  else if(a=='dl'){const u=URL.createObjectURL(new Blob([code],{type:'text/plain'})),l=document.createElement('a');l.href=u;l.download='code.'+blk.dataset.x;l.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
  else{$('#prevFrame').srcdoc=code;$('#prev').showModal()}
});
$('#prevClose').onclick=()=>$('#prev').close();
$('#prev').addEventListener('close',()=>{$('#prevFrame').srcdoc=''}); // stop preview scripts

/* ===== MCP (tools for models) =====
   Servers and tools come from mcp.json through server.py (/api/mcp/...). The browser only calls them; no commands are executed from here.
   S.mcp: {on: used in Chat/Coder, confirm: ask for confirmation (default: yes), off: {"server": true, "server/tool": true} = disabled}.
   Message flow: mcpEnabled() -> active tool list -> agent() in api.js -> mcpRun() runs each call (with confirmation). */
const MCP={cache:{},tools:{},allow:new Set()}; // cache: server -> tools Promise | tools: server -> tools | allow: session permissions
const CHV='<svg viewBox="0 0 24 24" class="h-4 w-4 text-mu transition-transform group-open:rotate-180" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
const mcpServers=async()=>(await api('mcp/servers')).servers;
const mcpLoad=server=>MCP.cache[server]||(MCP.cache[server]=api('mcp/tools',{server}).then(r=>(MCP.tools[server]=r.tools),e=>{delete MCP.cache[server];throw e}));
function mcpText(r){ // MCP result -> text for the model
  const t=(r.content||[]).map(x=>x.type=='text'?x.text:x.type=='image'?'[image]':x.resource?.text||JSON.stringify(x)).join('\n')||JSON.stringify(r.structuredContent||r);
  return(r.isError?'Error: ':'')+t;
}
function updateMcpCount(){
  const n=$('#mcpN');if(!n)return;const off=S.mcp?.off||{};let c=0;
  for(const[s,ts]of Object.entries(MCP.tools))if(!off[s])c+=ts.filter(t=>!off[s+'/'+t.name]).length;
  n.textContent=c?` (${c})`:'';
}
/* Collect active tools from all servers. fn = function name for the model (letters, numbers, _ and - only, max 64). */
async function mcpEnabled(say){
  const off=S.mcp?.off||{},list=[],map={};let sv;
  try{sv=await mcpServers()}catch(e){throw new Error('MCP needs server.py (open via http://localhost). '+e.message)}
  for(const s of sv){
    if(off[s.name])continue;
    try{
      for(const t of await mcpLoad(s.name)){
        if(off[s.name+'/'+t.name])continue;
        const fn=('mcp_'+s.name+'__'+t.name).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,64),sc=t.inputSchema;
        map[fn]={fn,server:s.name,tool:t.name,description:t.description||'',schema:sc&&sc.type?sc:{type:'object',properties:{}}};list.push(map[fn]);
      }
    }catch(e){say(`[MCP] server ${s.name} failed to load: ${e.message}\n\n`)}
  }
  updateMcpCount();return{list,map};
}
/* Confirmation dialog: true if allowed */
function mcpAsk(label,args){
  return new Promise(res=>{
    const d=$('#mcpOk');$('#mcpOkName').textContent=label;$('#mcpOkArgs').textContent=JSON.stringify(args,null,2);d.dataset.r='deny';
    const pick=e=>{const b=e.target.closest('[data-r]');if(b){d.dataset.r=b.dataset.r;d.close()}};
    d.addEventListener('click',pick);
    d.addEventListener('close',()=>{d.removeEventListener('click',pick);if(d.dataset.r=='always')MCP.allow.add(label);res(d.dataset.r!='deny')},{once:true});
    d.showModal();
  });
}
/* Run one tool call from the model: confirmation -> server.py -> result text. The trace is shown as a "tool" block. */
async function mcpRun(c,map,say){
  const t=map[c.fn];if(!t)return'Unknown tool.';
  const label=`${t.server}.${t.tool}`;let out;
  if(S.mcp?.confirm!==false&&!MCP.allow.has(label)&&!(await mcpAsk(label,c.args)))out='The user denied this tool call.';
  else try{out=mcpText(await api('mcp/call',{server:t.server,tool:t.tool,arguments:c.args}))}catch(e){out='Error: '+e.message}
  say(`\n\n${F3}tool\n${label}(${JSON.stringify(c.args).slice(0,300)})\n→ ${out.slice(0,1500).replace(/```/g,'` ` `')}\n${F3}\n\n`);
  return out.slice(0,20000);
}
/* Settings > MCP panel: server list from mcp.json, enable/disable, tool list */
async function renderMcp(){
  const box=$('#pvs');box.innerHTML='<p class="text-sm text-mu">Loading…</p>';let sv;
  try{sv=await mcpServers()}catch(e){box.innerHTML=`<p class="text-sm text-mu">MCP needs a local server. Run <code>python server.py</code>, then open the app at http://localhost:3000 (error: ${esc(e.message)}).</p>`;return}
  const off=S.mcp?.off||{};
  box.innerHTML=`<label class="flex items-center gap-1.5 text-sm"><input id="mcpConfirm" type="checkbox" class="accent-ac" ${S.mcp?.confirm===false?'':'checked'}> Ask for confirmation before running tools</label>`
    +(sv.length?sv.map(s=>`<details class="group rounded-lg border border-bd bg-sf"><summary class="flex cursor-pointer items-center justify-between gap-2 px-3 py-2"><span class="font-medium">${esc(s.name)}</span><span class="flex items-center gap-2"><span class="text-xs text-mu">${s.type}${s.ready?' · active':''}</span>${CHV}</span></summary>
      <div class="grid gap-2 border-t border-bd p-3"><label class="flex items-center gap-1.5 text-sm"><input type="checkbox" data-moff="${attr(s.name)}" class="accent-ac" ${off[s.name]?'':'checked'}> Use this server</label>
      <div data-tl class="grid gap-1"></div><div class="flex flex-wrap items-center gap-2"><button type="button" class="btn text-sm" data-mload="${attr(s.name)}">Load tools</button><span class="text-sm text-mu" data-mst></span></div></div></details>`).join('')
      :'<p class="text-sm text-mu">No MCP servers yet. Copy <code>mcp.example.json</code> to <code>mcp.json</code> and configure the servers you want.</p>')
    +'<div><button type="button" class="btn text-sm" id="mcpReload">Reload mcp.json</button></div>';
}
async function mcpShowTools(name,det){
  const st=det.querySelector('[data-mst]'),tl=det.querySelector('[data-tl]'),off=S.mcp?.off||{};
  st.className='text-sm text-mu';st.textContent='Loading… (the server starts if it is not already running)';
  try{
    const ts=await mcpLoad(name);
    tl.innerHTML=ts.length?ts.map(t=>`<label class="flex items-start gap-1.5 text-sm"><input type="checkbox" data-moff="${attr(name+'/'+t.name)}" class="mt-1 accent-ac" ${off[name+'/'+t.name]?'':'checked'}><span><b>${esc(t.name)}</b><br><span class="text-xs text-mu">${esc((t.description||'').slice(0,160))}</span></span></label>`).join(''):'<p class="text-sm text-mu">This server has no tools.</p>';
    st.textContent=ts.length+' tools';updateMcpCount();
  }catch(e){st.className='text-sm text-er';st.textContent='Failed: '+e.message.slice(0,200)}
}
function restoreMcp(){const e=$('#mcpOn');if(e){e.checked=!!S.mcp?.on;updateMcpCount()}}
$('#gMcp').onclick=()=>{setGroup='mcp';renderSettings()};
$('#pvs').addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.mload)mcpShowTools(b.dataset.mload,b.closest('details'));
  else if(b.id=='mcpReload'){b.textContent='Loading…';try{await api('mcp/reload',{})}catch{}MCP.cache={};MCP.tools={};renderMcp()}
});
$('#pvs').addEventListener('change',e=>{
  const t=e.target;S.mcp=S.mcp||{};
  if(t.id=='mcpConfirm'){S.mcp.confirm=t.checked;save()}
  else if(t.dataset.moff!=null){S.mcp.off=S.mcp.off||{};if(t.checked)delete S.mcp.off[t.dataset.moff];else S.mcp.off[t.dataset.moff]=true;save();updateMcpCount()}
});
$('#opt').addEventListener('change',e=>{ // "MCP tools" checkbox in the Chat/Coder tabs
  if(e.target.id!='mcpOn')return;
  S.mcp=S.mcp||{};S.mcp.on=e.target.checked;save();
  if(e.target.checked)mcpEnabled(()=>{}).then(r=>{if(!r.list.length)alert('No active MCP tools. Configure servers in Settings > MCP.')}).catch(x=>{e.target.checked=false;S.mcp.on=false;save();alert('MCP tools could not be loaded: '+x.message)});
});

/* ===== ACTION BAR BELOW REPLIES =====
   Appears below the last reply: Copy, Read aloud (browser speech synthesis), Retry prompt.
   "Retry" sends the same prompt again with the currently selected provider/model,
   so it can be used to compare models. The old result is replaced by the new one.
   Icons: outline-style SVG paths; change the contents of ICON to change the icons. */
const last={}; // last prompt per tab: {q, imgs, um}
const ICON={
  copy:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  speak:'<path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/>',
  redo:'<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>'
};
async function copyText(t){
  try{await navigator.clipboard.writeText(t)}
  catch{const a=document.createElement('textarea');a.value=t;document.body.append(a);a.select();document.execCommand('copy');a.remove()}
}
function addActs(o,k){
  o.parentElement.querySelectorAll('.acts').forEach(x=>x.remove());
  const txt=o._pt?.text(),d=document.createElement('div');d.className='acts mt-2 flex gap-0.5';
  const mk=(title,svg,fn)=>{
    const x=document.createElement('button');x.className='ibtn';x.title=title;x.setAttribute('aria-label',title);
    x.innerHTML=`<svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svg}</svg>`;
    x.onclick=()=>fn(x);d.append(x);
  };
  if(txt&&!o.classList.contains('msg-e')){
    mk('Copy',ICON.copy,async x=>{await copyText(txt);x.classList.add('text-ac');setTimeout(()=>x.classList.remove('text-ac'),1200)});
    mk('Read aloud',ICON.speak,()=>{
      if(speechSynthesis.speaking){speechSynthesis.cancel();return}
      const u=new SpeechSynthesisUtterance(txt.replace(/[`*#]/g,''));  // u.lang='en-US' to force a language
      speechSynthesis.speak(u);
    });
  }
  mk('Retry prompt',ICON.redo,()=>redo(k));
  o.append(d);
}
function redo(k){
  if(busy||!last[k])return;
  speechSynthesis?.cancel();
  const h=H[k],l=last[k];
  if(h&&h.at(-1)?.role=='assistant'&&h.at(-2)===l.um){h.pop();h.pop()}   // remove the old reply from history
  document.querySelector(`.log[data-k=${k}]`).lastElementChild.remove();    // remove the old reply bubble
  send({regen:1});
}

/* Switch tab: show the log, fill the provider list, and set mode-specific options */
function setMode(k){
  mode=k;
  document.querySelectorAll('#nav button').forEach(b=>b.classList.toggle('tab-on',b.dataset.k==k));
  document.querySelectorAll('.log').forEach(l=>{l.classList.toggle('hidden',l.dataset.k!=k);l.classList.toggle('flex',l.dataset.k==k)});
  const ps=M[k].ps;fillProv(k);
  const s=S.m[k]||envDef(k)||{};$('#prov').value=ps.includes(s.p)?s.p:ps[0];
  $('#in').placeholder=M[k].ph;$('#opt').innerHTML=OPT[k];renderThumbs();renderCF();restoreCoder();restoreMcp();$('#in').classList.toggle('font-mono',k=='coder');
  setProv();
}
function setProv(){
  const p=$('#prov').value,s=S.m[mode]||envDef(mode)||{};
  $('#mdl').value=s.p==p?s.m||'':(DM[mode]?.[p]||'');
  renderGen(); // advanced settings panel follows the provider
  closeMenu();
}
function persist(){S.m[mode]={p:$('#prov').value,m:$('#mdl').value.trim()};save()}
function add(k,cls,html){const d=document.createElement('div');d.className='msg '+cls;d.innerHTML=html||'';document.querySelector(`.log[data-k=${k}]`).append(d);follow();return d}

/* Research flow: plan -> sub-questions -> final report */
async function research(p,m,q,o,sig){
  const web=$('#web')?.checked,ask=async(t,on)=>{let s='';await stream(p,m,[{role:'user',content:t}],'',x=>{s+=x;on&&on(s)},sig,web);return s};
  o.textContent='Planning the research…';
  const pl=await ask(`Break this research topic into 4 complementary sub-questions. Reply ONLY with a JSON array of strings.\nTopic: ${q}`);
  let qs;try{qs=JSON.parse(pl.match(/\[[\s\S]*\]/)[0])}catch{qs=[q]}
  let notes='';
  for(let i=0;i<qs.length;i++){
    o.textContent=`Researching ${i+1} of ${qs.length}: ${qs[i]}`;
    notes+=`### ${qs[i]}\n${await ask(`Answer concisely and factually. Cite sources or uncertainty if any.\n${qs[i]}`)}\n\n`;
  }
  o.textContent='Writing the report…';
  await ask(`Write a structured research report (summary, key findings, analysis, conclusion, limitations) about: ${q}\nUse the same language as the topic. Base it on the following notes:\n\n${notes}`,s=>o._pt.set(s));
}

/* Read attachments and then clear them */
const readImgs=async()=>{const r=[...ATT];ATT.length=0;renderThumbs();return r};

/* Send the message for the active tab. Adding a new tab: create an if(k==...) branch below. */
async function send(opt){ // opt.regen = resend the last prompt
  if(busy){busy.abort();return}
  const rg=opt?.regen?last[mode]:null,q=rg?rg.q:$('#in').value.trim();if(!q)return;
  const k=mode,p=$('#prov').value,m=$('#mdl').value.trim();
  if(!m)return add(k,'msg-e','Enter a model name first. Click "Load models" to see the list from the provider.');
  if(P[p].k&&p!='custom'&&!key(p)){add(k,'msg-e',`API key for ${P[p].n} is not set. Enter it in Settings first.`);return openSettings(p)}
  persist();const E=document.querySelector(`.log[data-k=${k}] .empty`);if(E)E.remove();
  document.querySelectorAll('.acts').forEach(x=>x.remove());
  pinned=true;const imgs=rg?rg.imgs:k=='multimodal'?await readImgs():[];const files=rg?rg.files:k=='coder'?CF.splice(0):[];renderCF();last[k]={q,imgs,files};const cq=withFiles(files,q); // cq = message + attached file contents
  if(!rg)add(k,'msg-u',esc(q)+files.map(f=>`<div class="chip mt-1.5 text-xs">${esc(f.name)}</div>`).join('')+imgs.map(i=>`<img src="${i}" class="mt-1.5 max-h-32" alt="">`).join(''));if(!rg){$('#in').value='';$('#in').style.height='auto'}
  const sig=(busy=new AbortController()).signal;$('#go').textContent='Stop';
  const o=add(k,'','<span class="dots"><i></i><i></i><i></i></span>'),pt=o._pt=makePainter(o); // animated dots until the first token arrives
 let acc='';
  try{
    if(H[k]){ // chat and multimodal: conversation history
      H[k].push(last[k].um={role:'user',content:cq,images:imgs});
      const say=x=>{acc+=x;pt.set(acc)},tl=(k=='chat'||k=='coder')&&$('#mcpOn')?.checked?await mcpEnabled(say):null; // MCP tools enabled?
      if(tl?.list.length)await agent(p,m,H[k],sysFor(k),say,sig,tempFor(k),tl.list,c=>mcpRun(c,tl.map,say));
      else await stream(p,m,H[k],sysFor(k),say,sig,false,tempFor(k));
      H[k].push({role:'assistant',content:acc});
    }else if(k=='research'){
      await research(p,m,q,o,sig);
    }else if(k=='image'){
      o.textContent='Creating image…';
      const us=await image(p,m,q,sig);
      o.innerHTML=`<div class="grid gap-2 ${us.length>1?'sm:grid-cols-2':''}">${us.map((u,i)=>`<figure><img alt="Image result ${i+1}" src="${u}"><a href="${u}" download="image-${i+1}.${u.match(/^data:image\/(\w+)/)?.[1]||'png'}" target="_blank" rel="noopener">Download image</a></figure>`).join('')}</div>`;
    }else{
      const u=await video(p,m,q,t=>o.textContent=t,sig);
      o.innerHTML=`<video controls src="${u}"></video><a href="${u}" download="video.mp4">Download video</a>`;
    }
  pt.flush();
  }catch(e){
    pt.stop();
    if(e.name=='AbortError'){if(H[k]){if(acc)H[k].push({role:'assistant',content:acc});else H[k].pop()}o.innerHTML=md(acc)+(acc?'\n':'')+'(stopped)'}
    else{o.className+=' msg-e';o.textContent=e.message+(/Failed to fetch/.test(e.message)?' — check the connection, API key, or the provider\'s CORS settings.':'');if(H[k])H[k].pop()}
  }
  addActs(o,k);
  busy=null;$('#go').textContent='Send';jump.classList.add('hidden');
}

/* Initialization */
$('#nav').innerHTML=Object.keys(M).map(k=>`<button data-k="${k}" class="tab flex-1 whitespace-nowrap">${M[k].n}</button>`).join('');
$('#main').innerHTML=Object.keys(M).map(k=>`<div class="log hidden flex-col gap-2.5" data-k="${k}"><div class="empty mx-auto mt-[10vh] max-w-md px-3 text-center"><img data-brand="logo" alt="" class="mx-auto mb-3 h-12 w-12 opacity-80"><p class="text-mu">${EMPTY[k]}</p></div></div>`).join('');
applyBrand(); // apply the logo to the empty states (created after brand.js ran)
$('#nav').onclick=e=>{const k=e.target.dataset?.k;if(k){persist();setMode(k)}};
$('#prov').onchange=()=>{setProv();persist()};
/* Model picker: open, filter, choose, close */
const openMenu=()=>{renderMenu();if(!MODELS[$('#prov').value])loadModels()}; // load automatically if no list yet
mdl.onfocus=openMenu;
mdl.onclick=()=>{if(mlist.classList.contains('hidden'))openMenu()};
mdl.oninput=()=>renderMenu(mdl.value);
mdl.onchange=persist;
mdl.onkeydown=e=>{if(e.key=='Escape'||e.key=='Enter'){closeMenu();if(e.key=='Enter')persist()}};
mdl.onblur=closeMenu;
mlist.onmousedown=e=>{ // mousedown (not click) so it runs before the field loses focus
  e.preventDefault();
  const m=e.target.closest('[data-m]')?.dataset.m;if(!m)return;
  mdl.value=m;persist();closeMenu();
};
$('#ld').onclick=()=>loadModels($('#ld'));
$('#go').onclick=send;
$('#in').onkeydown=e=>{if(e.key=='Enter'&&!e.shiftKey){e.preventDefault();send()}};
$('#in').oninput=e=>{e.target.style.height='auto';e.target.style.height=e.target.scrollHeight+'px'};
/* Provider settings: typing, switching groups, connection tests */
$('#pvs').oninput=e=>{
  const d=e.target.dataset;if(!d.p)return;
  S[d.f][d.p]=e.target.value.trim();save();
  if(d.f=='k'){const c=e.target.closest('details').querySelector('summary span.text-xs');c.outerHTML=chip(d.p)} // update status
};
$('#pvs').addEventListener('click',async e=>{
  const p=e.target.dataset?.test;if(!p)return;
  const out=$('#t-'+p),set=(t,c)=>{out.textContent=t;out.className='text-sm '+c};
  set('Testing…','text-mu');
  try{set(await ping(p),'text-ac')}
  catch(x){const m=/Failed to fetch/.test(x.message)?'cannot connect (check the address and CORS)':x.message.slice(0,140);set('Failed: '+m,'text-er')}
});
$('#gCloud').onclick=()=>{setGroup='cloud';renderSettings()};
$('#gLocal').onclick=()=>{setGroup='local';renderSettings()};
$('#dlg').addEventListener('close',()=>{const v=$('#prov').value;fillProv(mode);$('#prov').value=v}); // refresh "(no key yet)" labels
/* Image attachments: file input, remove buttons, paste from clipboard */
$('#opt').addEventListener('change',e=>{if(e.target.id=='files'){addFiles(e.target.files);e.target.value=''}});
$('#opt').addEventListener('click',e=>{const i=e.target.dataset?.rm;if(i!=null){ATT.splice(+i,1);renderThumbs()}});
$('#in').addEventListener('paste',e=>{const f=[...(e.clipboardData?.files||[])];if(mode=='multimodal'&&f.length){e.preventDefault();addFiles(f)}});
/* Logo: upload from Settings (stored in the browser) or restore the default */
$('#logoFile').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{localStorage.setItem(LOGO_KEY,r.result);applyBrand()};r.readAsDataURL(f)};
$('#logoReset').onclick=()=>{localStorage.removeItem(LOGO_KEY);applyBrand()};
$('#cfg').onclick=()=>openSettings();
$('#cl').onclick=()=>$('#dlg').close();
setMode('chat');
