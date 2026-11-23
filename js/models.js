/* models.js — Local Models page: PC specifications, recommendations, Hugging Face search, download to Ollama.
   Recommendations come directly from Hugging Face (trending GGUF models) and are then filtered by your specifications,
   so the list is always current and no model names are hard-coded. */
const HF='https://huggingface.co';
let hw=null,recI=0,lastSearch=[];
const attr=s=>esc(String(s)).replace(/"/g,'&quot;');
const fmt=n=>n>=1e6?(n/1e6).toFixed(1)+'M':n>=1e3?(n/1e3).toFixed(1)+'K':String(n);
/* Recommendation categories: o = Hugging Face search parameters (change/add as you like) */
const REC=[{n:'Chat',o:{pipeline:'text-generation'}},{n:'Multimodal (image)',o:{pipeline:'image-text-to-text'}},{n:'Coding',o:{pipeline:'text-generation',q:'coder'}}];
const BADGE={gpu:['Fast · fits in GPU','text-ac'],mix:['Medium · GPU + RAM','text-mu'],cpu:['Slow · CPU only','text-mu'],no:['Does not fit','text-er']};
const badge=f=>`<span class="chip text-xs ${BADGE[f][1]}">${BADGE[f][0]}</span>`;
/* Get the parameter count (billions) from the repo name, e.g. "Qwen3-8B" -> 8. "A3B"/"E4B" (active parameters) are ignored. */
const paramsOf=id=>{const m=[...id.matchAll(/(?<![A-Za-z0-9.])(\d+(?:\.\d+)?)[bB](?![A-Za-z])/g)].map(x=>+x[1]);return m.length?Math.max(...m):0};
const QUANT=/(?:UD-)?(?:IQ\d_[A-Z]+(?:_\d)?|Q\d_K_(?:XL|[SML])|Q\d_K|Q\d_\d|Q\d|MXFP4|BF16|F16|F32)/i;

/* ---------- Hugging Face API (public, no key) ---------- */
async function hfSearch(o){
  const run=async sort=>{
    const u=new URL(HF+'/api/models');const q=u.searchParams;
    if(o.q)q.set('search',o.q);if(o.gguf)q.set('filter','gguf');if(o.pipeline)q.set('pipeline_tag',o.pipeline);
    q.set('sort',sort);q.set('direction','-1');q.set('limit',o.limit||30);
    for(const x of['downloads','likes','pipeline_tag','lastModified'])q.append('expand[]',x);
    const r=await fetch(u);if(!r.ok)throw new Error('Hugging Face replied '+r.status);return r.json();
  };
  try{return await run(o.sort)}catch(e){if(o.sort=='trendingScore')return run('downloads');throw e} // trending unavailable -> downloads
}
/* List quantization variants (GGUF file sizes summed per quantization; mmproj files for vision are ignored) */
async function hfVariants(id){
  const r=await fetch(`${HF}/api/models/${id}/tree/main?recursive=true`);if(!r.ok)throw new Error('Hugging Face replied '+r.status);
  const g={};
  for(const f of(await r.json()))if(f.type=='file'&&/\.gguf$/i.test(f.path)&&!/mmproj/i.test(f.path)){
    const q=(f.path.match(QUANT)?.[0]||'GGUF').toUpperCase();g[q]=(g[q]||0)+(f.lfs?.size||f.size||0);
  }
  return Object.entries(g).map(([q,b])=>({q,gb:b/1e9})).sort((a,b)=>a.gb-b.gb);
}

/* ---------- Download via Ollama (local Ollama API, requires OLLAMA_ORIGINS="*") ---------- */
async function pullOllama(model,bar,txt){
  const root=base('ollama').replace(/\/v1$/,''),say=(t,c='text-mu')=>{txt.textContent=t;txt.className='mt-1 text-xs '+c};
  say('Contacting Ollama…');
  try{
    const r=await fetch(root+'/api/pull',{method:'POST',body:JSON.stringify({model,stream:true})});
    if(!r.ok)throw new Error(r.status+' '+(await r.text()).slice(0,120));
    const rd=r.body.getReader(),dec=new TextDecoder();let buf='';
    for(;;){
      const{done,value}=await rd.read();if(done)break;
      buf+=dec.decode(value,{stream:true});const L=buf.split('\n');buf=L.pop();
      for(const l of L)if(l.trim()){
        const j=JSON.parse(l);if(j.error)throw new Error(j.error);
        const pct=j.total?Math.round((j.completed||0)/j.total*100):null;
        if(pct!=null)bar.style.width=pct+'%';say(pct!=null?`${j.status} ${pct}%`:j.status);
      }
    }
    bar.style.width='100%';say('Done. In the app, choose the Ollama provider, then click Load models.','text-ac');
  }catch(e){say(/Failed to fetch/.test(e.message)?'Cannot connect to Ollama. Make sure Ollama is running and OLLAMA_ORIGINS="*" is configured.':e.message,'text-er')}
}

/* ---------- Display ---------- */
function renderHW(){
  const s=hw,cpu=s.cpu?`${s.cpu}${s.cores?` (${s.cores} threads)`:''}`:s.cores?`${s.cores} threads`:'-';
  $('#hwCards').innerHTML=[['System',s.os],['CPU',cpu],['GPU',s.gpu],['Free disk',s.disk?s.disk+' GB':'']].map(([k,v])=>
    `<div class="card"><div class="text-xs text-mu">${k}</div><div class="mt-0.5 break-words text-sm">${esc(String(v||'-'))}</div></div>`).join('');
  $('#hwRam').value=s.ram;$('#hwVram').value=s.vram;$('#hwUni').checked=!!s.unified;
  $('#hwSrc').textContent=s.src=='server'?'Read from server.py on this computer (accurate). You can still correct RAM/VRAM below.':'Estimated from the browser: RAM is only readable up to 8 GB and VRAM is guessed from the GPU name. Run python server.py for accurate detection, or correct it manually below.';
  const m=maxParams(s);
  $('#hwSum').textContent=s.unified||s.vram>0?`Estimate: models up to ~${m.fast} billion parameters (Q4 quantization) run fast on the GPU, and up to ~${m.max} billion can still run more slowly.`:`No discrete GPU: models up to ~${m.max} billion parameters (Q4 quantization) can run on the CPU, at slower speed.`;
}
function card(m){
  const b=paramsOf(m.id),f=b?fit(b*Q4_PER_B,hw):null;
  return`<article class="card" data-id="${attr(m.id)}"><div class="flex flex-wrap items-start justify-between gap-2"><div class="min-w-0">
    <a href="${HF}/${attr(m.id)}" target="_blank" rel="noopener" class="break-all font-medium text-ac hover:underline">${esc(m.id)}</a>
    <div class="mt-0.5 text-xs text-mu">${m.pipeline_tag?esc(m.pipeline_tag)+' · ':''}${fmt(m.downloads||0)} downloads · ${fmt(m.likes||0)} likes${b?` · ~${b}B parameters`:''}</div></div>
    ${f?badge(f):'<span class="chip text-xs text-mu">Check variants</span>'}</div>
    <button type="button" class="btn mt-2 text-sm" data-var="${attr(m.id)}">View variants and commands</button><div class="vars mt-2 hidden"></div></article>`;
}
function varRows(id,vs){
  if(!vs.length)return'<p class="text-sm text-mu">This repo has no GGUF files. Non-GGUF models must be converted or run with vLLM/transformers.</p>';
  return`<div class="grid gap-1.5">${vs.map(v=>{const tag=`hf.co/${id}:${v.q}`;return`<div class="rounded-lg border border-bd p-2 text-sm">
    <div class="flex flex-wrap items-center justify-between gap-2"><span><b>${esc(v.q)}</b> · ${v.gb.toFixed(1)} GB</span>${badge(fit(v.gb,hw))}</div>
    <div class="mt-1.5 flex flex-wrap gap-1.5">
      <button type="button" class="btn px-2 py-1 text-xs" data-copy="ollama run ${attr(tag)}">Copy: ollama run</button>
      <button type="button" class="btn px-2 py-1 text-xs" data-copy="llama-server -hf ${attr(id)}:${attr(v.q)}">Copy: llama-server</button>
      <button type="button" class="btn btn-pri px-2 py-1 text-xs" data-pull="${attr(tag)}">Download to Ollama</button></div>
    <div class="mt-1.5 hidden"><div class="h-1.5 rounded bg-cd"><div class="h-1.5 w-0 rounded bg-ac transition-all"></div></div><p class="mt-1 text-xs text-mu"></p></div></div>`}).join('')}</div>`;
}
const RANK={gpu:0,mix:1,cpu:2};
function renderRec(){
  const l=(REC[recI].data||[]).map(m=>({m,f:paramsOf(m.id)?fit(paramsOf(m.id)*Q4_PER_B,hw):'no'})).filter(x=>x.f!='no')
    .sort((a,b)=>RANK[a.f]-RANK[b.f]).slice(0,12).map(x=>x.m);   // fastest on your PC first (trending order preserved)
  $('#recList').innerHTML=l.length?l.map(card).join(''):'<p class="text-sm text-mu">No trending models match these specifications. Try searching manually below.</p>';
}
async function loadRec(i){
  recI=i;document.querySelectorAll('#recTabs button').forEach((b,k)=>b.classList.toggle('tab-on',k==i));
  $('#recList').innerHTML='<p class="text-sm text-mu">Loading from Hugging Face…</p>';
  try{if(!REC[i].data)REC[i].data=await hfSearch({...REC[i].o,gguf:true,sort:'trendingScore',limit:60});if(recI==i)renderRec()}
  catch(e){$('#recList').innerHTML=`<p class="text-sm text-er">Failed to load: ${esc(e.message)}</p>`}
}
function refresh(){renderHW();renderRec();$('#sList').innerHTML=lastSearch.map(card).join('')}

/* ---------- Event handlers ---------- */
document.addEventListener('click',async e=>{
  const t=e.target.closest('button');if(!t)return;
  if(t.dataset.var){ // open/close the variant list
    const box=t.parentElement.querySelector('.vars');
    if(!box.classList.contains('hidden')){box.classList.add('hidden');return}
    t.textContent='Loading variants…';
    try{box.innerHTML=varRows(t.dataset.var,await hfVariants(t.dataset.var))}catch(x){box.innerHTML=`<p class="text-sm text-er">${esc(x.message)}</p>`}
    box.classList.remove('hidden');t.textContent='Hide variants';
  }else if(t.dataset.copy){
    try{await navigator.clipboard.writeText(t.dataset.copy)}catch{const a=document.createElement('textarea');a.value=t.dataset.copy;document.body.append(a);a.select();document.execCommand('copy');a.remove()}
    const o=t.textContent;t.textContent='Copied';setTimeout(()=>t.textContent=o,1200);
  }else if(t.dataset.pull){
    const pg=t.closest('.rounded-lg').lastElementChild;pg.classList.remove('hidden');t.disabled=true;
    await pullOllama(t.dataset.pull,pg.querySelector('.bg-ac'),pg.querySelector('p'));t.disabled=false;
  }
});
$('#sform').onsubmit=async e=>{
  e.preventDefault();$('#sList').innerHTML='<p class="text-sm text-mu">Searching…</p>';
  try{lastSearch=await hfSearch({q:$('#sq').value.trim(),gguf:$('#sgguf').checked,sort:$('#ssort').value});
    $('#sList').innerHTML=lastSearch.length?lastSearch.map(card).join(''):'<p class="text-sm text-mu">No results.</p>'}
  catch(x){$('#sList').innerHTML=`<p class="text-sm text-er">Search failed: ${esc(x.message)}</p>`}
};
const setHW=()=>{hw.ram=+$('#hwRam').value;hw.vram=+$('#hwVram').value;hw.unified=$('#hwUni').checked;saveHW(hw);refresh()};
['hwRam','hwVram','hwUni'].forEach(id=>$('#'+id).onchange=setHW);
$('#hwRedo').onclick=async()=>{hw=await detectHW(true);refresh()};

/* ---------- Start ---------- */
(async()=>{
  $('#hwRam').innerHTML=RAM_OPT.map(v=>`<option value="${v}">${v} GB</option>`).join('');
  $('#hwVram').innerHTML=VRAM_OPT.map(v=>`<option value="${v}">${v?v+' GB':'None / integrated'}</option>`).join('');
  $('#recTabs').innerHTML=REC.map((r,i)=>`<button type="button" class="tab">${r.n}</button>`).join('');
  $('#recTabs').onclick=e=>{const i=[...$('#recTabs').children].indexOf(e.target.closest('button'));if(i>=0)loadRec(i)};
  hw=await detectHW();renderHW();loadRec(0);
})();
