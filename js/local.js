/* local.js — IN-APP INFERENCE (GGUF via wllama, WebAssembly + optional WebGPU).
   The model runs inside the browser window; no Ollama, LM Studio, or Python server is needed.
   Models are downloaded once from Hugging Face and cached by the browser (OPFS). The first
   load can be hundreds of MB to several GB. Everything here is client-side; API keys are not used.

   To add a model to the catalog: add one object to LOCAL_CATALOG (repo + exact GGUF file name).
   Advanced load options are defined in LOCAL_FIELDS and stored in S.local (see js/config.js). */
const WLLAMA_URL='https://cdn.jsdelivr.net/npm/@wllama/wllama@4.0.0/esm/index.js';
const WASM_URL='https://cdn.jsdelivr.net/npm/@wllama/wllama@4.0.0/esm/wasm-from-cdn.js';

const LOCAL_CATALOG=[
  {id:'qwen2.5-1.5b',name:'Qwen2.5 1.5B Instruct',repo:'bartowski/Qwen2.5-1.5B-Instruct-GGUF',gguf:'Qwen2.5-1.5B-Instruct-Q4_K_M.gguf',gb:1.0,note:'General chat · tools · fast on CPU'},
  {id:'qwen2.5-coder-1.5b',name:'Qwen2.5 Coder 1.5B',repo:'bartowski/Qwen2.5-Coder-1.5B-Instruct-GGUF',gguf:'Qwen2.5-Coder-1.5B-Instruct-Q4_K_M.gguf',gb:1.0,note:'Coding · tools · fast on CPU'},
  {id:'llama-3.2-1b',name:'Llama 3.2 1B Instruct',repo:'bartowski/Llama-3.2-1B-Instruct-GGUF',gguf:'Llama-3.2-1B-Instruct-Q4_K_M.gguf',gb:0.8,note:'Very small · tools · fastest'},
  {id:'llama-3.2-3b',name:'Llama 3.2 3B Instruct',repo:'bartowski/Llama-3.2-3B-Instruct-GGUF',gguf:'Llama-3.2-3B-Instruct-Q4_K_M.gguf',gb:2.0,note:'Better quality · tools'},
  {id:'gemma-3-1b',name:'Gemma 3 1B Instruct',repo:'ggml-org/gemma-3-1b-it-GGUF',gguf:'gemma-3-1b-it-Q4_K_M.gguf',gb:0.8,note:'Small · general chat'},
  {id:'gemma-2-2b',name:'Gemma 2 2B Instruct',repo:'bartowski/gemma-2-2b-it-GGUF',gguf:'gemma-2-2b-it-Q4_K_M.gguf',gb:1.7,note:'General chat'},
  {id:'phi-3.5-mini',name:'Phi 3.5 Mini Instruct',repo:'bartowski/Phi-3.5-mini-instruct-GGUF',gguf:'Phi-3.5-mini-instruct-Q4_K_M.gguf',gb:2.4,note:'Reasoning · 3.8B'},
  {id:'smollm2-1.7b',name:'SmolLM2 1.7B Instruct',repo:'bartowski/SmolLM2-1.7B-Instruct-GGUF',gguf:'SmolLM2-1.7B-Instruct-Q4_K_M.gguf',gb:1.1,note:'Small · general chat'},
  {id:'qwen2.5-3b',name:'Qwen2.5 3B Instruct',repo:'bartowski/Qwen2.5-3B-Instruct-GGUF',gguf:'Qwen2.5-3B-Instruct-Q4_K_M.gguf',gb:1.9,note:'Balanced quality · tools'},
  {id:'qwen2.5-coder-3b',name:'Qwen2.5 Coder 3B',repo:'bartowski/Qwen2.5-Coder-3B-Instruct-GGUF',gguf:'Qwen2.5-Coder-3B-Instruct-Q4_K_M.gguf',gb:1.9,note:'Coding · tools'}
];

/* Defaults are deliberately conservative: CPU, 4k context, f16 KV cache.
   n_gpu_layers: 0 = CPU only; set it to 999 (or another layer count) to use WebGPU. */
const LOCAL_DEF={
  n_ctx:4096,n_batch:512,n_ubatch:512,n_gpu_layers:0,n_threads:0,
  cache_type_k:'f16',cache_type_v:'f16',flash_attn:false,offload_kqv:true,kv_unified:false,ctx_shift:true,
  temp:0.7,top_k:40,top_p:0.95,min_p:0.05,penalty_repeat:1.1,max_tokens:1024,seed:-1
};
const LOCAL_LOAD_IDS=new Set(['n_ctx','n_batch','n_ubatch','n_gpu_layers','n_threads','cache_type_k','cache_type_v','flash_attn','offload_kqv','kv_unified','ctx_shift']);
const LOCAL_FIELDS=[
  {g:'Memory and speed (reload the model after changing these)',f:[
    {id:'n_ctx',label:'Context size (n_ctx)',type:'number',min:512,max:131072,step:512,hint:'Tokens kept in memory. Larger needs more RAM; 4096–8192 is a good start.'},
    {id:'n_batch',label:'Batch (n_batch)',type:'number',min:32,max:2048,step:32,hint:'Prompt processing batch. Larger can be faster but needs more memory.'},
    {id:'n_ubatch',label:'Micro-batch (n_ubatch)',type:'number',min:32,max:1024,step:32,hint:'Physical batch. Usually equal to or smaller than n_batch.'},
    {id:'n_gpu_layers',label:'GPU layers (n_gpu_layers)',type:'number',min:0,max:999,step:1,hint:'0 = CPU. 999 = all layers on WebGPU (when the browser supports it).'},
    {id:'n_threads',label:'CPU threads (0 = auto)',type:'number',min:0,max:64,step:1,hint:'Leave 0 unless you want to limit CPU use.'},
    {id:'cache_type_k',label:'KV cache K',type:'select',opts:['f16','q8_0','q5_1','q5_0','q4_1','q4_0','f32'],hint:'q8_0 saves memory with little quality loss.'},
    {id:'cache_type_v',label:'KV cache V',type:'select',opts:['f16','q8_0','q5_1','q5_0','q4_1','q4_0','f32'],hint:'Must be f16 for some models when flash attention is on.'},
    {id:'flash_attn',label:'Flash attention',type:'bool',hint:'Faster attention on supported models; may be incompatible with some KV cache types.'},
    {id:'offload_kqv',label:'Offload K/Q/V to GPU',type:'bool',hint:'Used with WebGPU. Disable if you get GPU memory errors.'},
    {id:'kv_unified',label:'Unified KV cache',type:'bool',hint:'One cache for all slots. Usually leave off for a single chat.'},
    {id:'ctx_shift',label:'Shift context when full',type:'bool',hint:'Keeps the newest tokens when the context is full instead of failing.'}
  ]},
  {g:'Sampling (applies to every message)',f:[
    {id:'temp',label:'Temperature',type:'number',min:0,max:2,step:0.05,hint:'Higher = more creative; lower = more focused.'},
    {id:'top_k',label:'Top K',type:'number',min:0,max:200,step:1,hint:'0 disables the top-K filter.'},
    {id:'top_p',label:'Top P',type:'number',min:0,max:1,step:0.01,hint:'Nucleus sampling. 0.95 is a common value.'},
    {id:'min_p',label:'Min P',type:'number',min:0,max:1,step:0.01,hint:'Minimum probability relative to the best token.'},
    {id:'penalty_repeat',label:'Repeat penalty',type:'number',min:0.5,max:2,step:0.05,hint:'Higher discourages repetition; 1.0 disables it.'},
    {id:'max_tokens',label:'Max new tokens',type:'number',min:64,max:8192,step:64,hint:'Upper limit for one reply.'},
    {id:'seed',label:'Seed (-1 = random)',type:'number',min:-1,max:2147483647,step:1,hint:'Set a value for reproducible output.'}
  ]}
];

const LOC={engine:null,loading:null,model:null,info:null,progress:{loaded:0,total:0},error:'',ctl:null};
let wllamaModule=null;

const lesc=s=>String(s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const lattr=lesc;
const fmtBytes=n=>{if(!n)return'0 B';const u=['B','KB','MB','GB','TB'];let i=0;while(n>=1024&&i<u.length-1){n/=1024;i++}return n.toFixed(i>2?1:0)+' '+u[i]};
const localCfg=()=>({...LOCAL_DEF,...(S.local||{})});
const localInfo=id=>id=='custom'?{id:'custom',name:'Custom GGUF',gb:0,note:'Load a local .gguf file or any Hugging Face repo.'}:(LOCAL_CATALOG.find(m=>m.id===id)||null);
const localModels=()=>[...LOCAL_CATALOG.map(m=>m.id),'custom'];
const localModelLabel=(p,x)=>p!='inapp'?x:(localInfo(x)?.name||x)+(localInfo(x)?.gb?` · ~${localInfo(x).gb} GB`:'');
const localCtxSize=()=>Math.max(512,+localCfg().n_ctx||4096);

function localSet(id,v){
  S.local=S.local||{};S.local[id]=v;save();
  if(LOCAL_LOAD_IDS.has(id)){const h=$('#rtHint');if(h){h.textContent='Reload the model to apply load-time settings.';h.className='text-xs text-er'}}
}

/* ---------- wllama module + model loading ---------- */
async function localModule(){
  if(!wllamaModule){
    try{
      const [m,w]=await Promise.all([import(WLLAMA_URL),import(WASM_URL)]);
      wllamaModule={Wllama:m.Wllama,WasmFromCDN:w.default};
    }catch(e){throw new Error('Could not load the in-app runtime from the CDN. Check your internet connection. '+e.message)}
  }
  return wllamaModule;
}
async function localEngine(){
  if(LOC.engine)return LOC.engine;
  const {Wllama,WasmFromCDN}=await localModule();
  const quiet={debug(){},log(){},warn:console.warn,error:console.error};
  LOC.engine=new Wllama(WasmFromCDN,{logger:quiet});
  return LOC.engine;
}
function localParams(){
  const c=localCfg(),p={
    n_ctx:Math.max(512,+c.n_ctx||4096),n_batch:Math.max(32,+c.n_batch||512),n_ubatch:Math.max(32,+c.n_ubatch||512),
    n_gpu_layers:Math.max(0,+c.n_gpu_layers||0),cache_type_k:c.cache_type_k||'f16',cache_type_v:c.cache_type_v||'f16',
    flash_attn:!!c.flash_attn,offload_kqv:c.offload_kqv!==false,kv_unified:!!c.kv_unified,ctx_shift:c.ctx_shift!==false
  };
  if(+c.n_threads>0)p.n_threads=+c.n_threads;
  return p;
}
async function localLoad(sel){
  if(LOC.loading){LOC.error='A model is already loading.';renderRuntimeStatus();return false}
  let w;
  try{w=await localEngine()}catch(e){LOC.error=e.message;renderRuntime();return false}
  if(w.isModelLoaded()){try{await w.exit()}catch{}}
  LOC.error='';LOC.loading=sel;LOC.progress={loaded:0,total:0};LOC.ctl=new AbortController();
  const params={...localParams(),signal:LOC.ctl.signal,progressCallback:({loaded,total})=>{LOC.progress={loaded,total};localProgress()}};
  renderRuntime();
  try{
    if(sel.blob)await w.loadModel([sel.blob],params);
    else if(sel.url)await w.loadModelFromUrl(sel.url,params);
    else await w.loadModelFromHF({repo:sel.repo,...(sel.gguf?{file:sel.gguf}:{quant:sel.quant||'Q4_K_M'})},params);
    LOC.model={id:sel.id||'custom',name:sel.name||sel.gguf||sel.repo||'Custom model',repo:sel.repo||'',gguf:sel.gguf||''};
    LOC.info=w.getLoadedContextInfo();
    S.local=S.local||{};S.local.last={id:LOC.model.id,repo:LOC.model.repo,gguf:LOC.model.gguf,name:LOC.model.name};save();
    const field=$('#mdl');
    if(field&&$('#prov')?.value=='inapp'){field.value=LOC.model.id;if(typeof persist=='function')persist()}
    return true;
  }catch(e){
    LOC.error=(e.name==='AbortError'?'Loading cancelled.':(e.message||String(e))).slice(0,700);
    try{if(w.isModelLoaded())await w.exit()}catch{}
    LOC.model=null;LOC.info=null;return false;
  }finally{LOC.loading=null;LOC.ctl=null;renderRuntime()}
}
async function localUnload(){
  if(LOC.engine){try{await LOC.engine.exit()}catch{}}
  LOC.model=null;LOC.info=null;LOC.error='';renderRuntime();
}
function localPing(){
  if(LOC.engine?.isModelLoaded())return`Loaded · ${LOC.model?.name||'model'} · ${LOC.info?.n_ctx||'?'} ctx`;
  return(navigator.gpu?'Runtime ready (WebGPU detected) · choose a model':'Runtime ready (CPU) · choose a model');
}

/* ---------- chat completion ---------- */
async function localChat(m,msgs,sys,on,sig,temp,tools,st){
  const w=LOC.engine;
  if(!w?.isModelLoaded())throw new Error('No in-app model is loaded. Click "Runtime" next to Load models, choose a model, and load it first.');
  if(LOC.model?.id&&LOC.model.id!='custom'&&m&&m!==LOC.model.id)throw new Error(`"${m}" is not loaded. Open Runtime and load it first (the loaded model is ${LOC.model.name}).`);
  const info=LOC.info||w.getLoadedContextInfo();
  if(info&&info.has_chat===false)throw new Error('This GGUF file has no chat template. Choose an Instruct/Chat model instead.');
  const c=localCfg();
  const messages=sys?[{role:'system',content:sys}]:[];
  for(const x of msgs){
    if(x.native){messages.push(x.native);continue}
    let content=x.content||'';
    if(x.images?.length)content+='\n[Image attachments are not available in the in-app runtime.]';
    messages.push({role:x.role=='assistant'?'assistant':'user',content});
  }
  const params={
    messages,stream:true,abortSignal:sig,cache_prompt:true,
    temperature:temp!=null?temp:+c.temp,top_k:+c.top_k,top_p:+c.top_p,min_p:+c.min_p,
    penalty_repeat:+c.penalty_repeat,max_tokens:+c.max_tokens
  };
  if(+c.seed>=0)params.seed=+c.seed;
  if(tools?.length)params.tools=tools.map(x=>({type:'function',function:{name:x.fn,description:x.description||'',parameters:x.schema||{type:'object',properties:{}}}}));
  let it;
  try{it=await w.createChatCompletion(params)}
  catch(e){throw new Error(localError(e))}
  const tc={};
  try{
    for await(const j of it){
      const d=j.choices?.[0]?.delta;if(!d)continue;
      if(d.content)on(d.content);
      for(const call of d.tool_calls||[]){
        const o=tc[call.index??0]=tc[call.index??0]||{id:'',fn:'',args:''};
        if(call.id)o.id=call.id;
        if(call.function?.name)o.fn+=call.function.name;
        if(call.function?.arguments)o.args+=call.function.arguments;
      }
    }
  }catch(e){throw new Error(localError(e))}
  if(st)st.calls=Object.values(tc).filter(o=>o.fn).map((o,i)=>{let a={};try{a=o.args?JSON.parse(o.args):{}}catch{}return{id:o.id||'call_'+i,fn:o.fn,args:a}});
}
function localError(e){
  const m=(e?.message||String(e)).replace(/\s+/g,' ').slice(0,700);
  if(/kv_cache|context|too (?:many|long)|exceed/i.test(m))return m+' — Increase the context size in Runtime or start a new session.';
  if(/out of memory|oom|alloc/i.test(m))return m+' — Use a smaller model or a smaller context/batch in Runtime.';
  return m;
}

/* ---------- runtime dialog ---------- */
function localFieldHTML(f){
  const c=localCfg(),v=c[f.id];
  if(f.type=='bool')return`<label class="flex items-start gap-2 rounded-lg border border-bd p-2 text-sm" title="${lattr(f.hint||'')}"><input type="checkbox" data-lset="${f.id}" class="mt-1 accent-ac" ${v?'checked':''}><span><b>${lesc(f.label)}</b><br><span class="text-[11px] text-mu">${lesc(f.hint||'')}</span></span></label>`;
  if(f.type=='select')return`<label class="grid gap-1"><span class="text-xs text-mu">${lesc(f.label)}</span><select data-lset="${f.id}" class="field text-sm">${f.opts.map(o=>`<option value="${lattr(o)}" ${o==v?'selected':''}>${lesc(o)}</option>`).join('')}</select><span class="text-[11px] text-mu">${lesc(f.hint||'')}</span></label>`;
  return`<label class="grid gap-1"><span class="text-xs text-mu">${lesc(f.label)}</span><input data-lset="${f.id}" type="number" min="${f.min}" max="${f.max}" step="${f.step}" value="${lattr(v)}" class="field text-sm"><span class="text-[11px] text-mu">${lesc(f.hint||'')}</span></label>`;
}
function renderRuntimeStatus(){
  const s=$('#rtStatus');if(!s)return;
  if(LOC.loading){
    const p=LOC.progress||{},pct=p.total?Math.round(p.loaded/p.total*100):0,name=LOC.loading.name||LOC.loading.gguf||LOC.loading.repo||'model';
    s.className='rounded-xl border border-bd bg-cd p-3 text-sm';
    s.innerHTML=`<div class="flex items-center justify-between gap-2"><b>Loading ${lesc(name)}</b><span>${pct}%</span></div><div class="mt-2 h-1.5 rounded bg-sf"><div class="h-1.5 rounded bg-ac transition-all" style="width:${pct}%"></div></div><div class="mt-1 text-xs text-mu">${fmtBytes(p.loaded)} / ${fmtBytes(p.total)}</div><button type="button" class="btn mt-2 px-2 py-1 text-xs" data-rtcancel>Cancel</button>`;
    return;
  }
  if(LOC.error){
    s.className='rounded-xl border border-er bg-cd p-3 text-sm text-er';
    s.innerHTML=`<b>Runtime error</b><br>${lesc(LOC.error)}`;
    return;
  }
  if(LOC.info&&LOC.model){
    const w=LOC.engine,i=LOC.info,c=localCfg();
    s.className='rounded-xl border border-ac bg-cd p-3 text-sm';
    s.innerHTML=`<div class="flex flex-wrap items-center justify-between gap-2"><b>${lesc(LOC.model.name)}</b><span class="chip text-xs text-ac">Loaded</span></div><div class="mt-1 grid gap-0.5 text-xs text-mu sm:grid-cols-2"><span>Context: ${i.n_ctx} tokens (trained ${i.n_ctx_train})</span><span>Batch: ${i.n_batch} / ${i.n_ubatch}</span><span>Threads: ${w?.getNumThreads?.()||'?'}${w?.isMultithread?.()?' (multi-thread)':' (single-thread)'}</span><span>GPU layers: ${c.n_gpu_layers}${w?.isSupportWebGPU?.()?' · WebGPU available':' · CPU'}</span></div>`;
    return;
  }
  s.className='rounded-xl border border-bd bg-cd p-3 text-sm text-mu';
  s.innerHTML=`No in-app model is loaded. Choose a model below. ${navigator.gpu?'WebGPU is available; set GPU layers to 999 in the advanced settings to use it.':'WebGPU is not available, so the model will run on the CPU.'}`;
}
function renderRuntime(){
  const dlg=$('#inappDlg');if(!dlg)return;
  const loaded=LOC.engine?.isModelLoaded();
  $('#rtModels').innerHTML=LOCAL_CATALOG.map(m=>{
    const on=loaded&&LOC.model?.id===m.id;
    return`<div class="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-bd p-2"><div class="min-w-0"><b class="text-sm">${lesc(m.name)}</b><div class="text-xs text-mu">~${m.gb} GB · ${lesc(m.note)}</div></div>${on?'<button type="button" class="btn px-2 py-1 text-xs" data-lmunload>Unload</button>':`<button type="button" class="btn px-2 py-1 text-xs" data-lmload="${lattr(m.id)}" ${LOC.loading?'disabled':''}>Load</button>`}</div>`;
  }).join('');
  $('#rtCfg').innerHTML=LOCAL_FIELDS.map(g=>`<div class="col-span-full mt-1 border-t border-bd pt-2 text-xs font-semibold text-mu first:mt-0 first:border-0 first:pt-0">${lesc(g.g)}</div>`+g.f.map(localFieldHTML).join('')).join('');
  const repo=$('#rtRepo'),gguf=$('#rtGguf');
  if(repo&&!repo.value&&S.local.last?.repo)repo.value=S.local.last.repo;
  if(gguf&&!gguf.value&&S.local.last?.gguf)gguf.value=S.local.last.gguf;
  renderRuntimeStatus();
}
function openRuntime(){renderRuntime();$('#inappDlg')?.showModal()}
let localPrT=0;
function localProgress(){const n=performance.now();if(n-localPrT<150)return;localPrT=n;renderRuntimeStatus()}

/* Dialog events. Guarded so the same file can be loaded on pages without the dialog. */
(function(){
  const dlg=$('#inappDlg');if(!dlg)return;
  $('#rtClose').onclick=()=>dlg.close();
  dlg.addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;
    if(b.dataset.lmload){
      const m=localInfo(b.dataset.lmload);if(m)await localLoad({...m});
    }else if(b.dataset.lmunload!=null||b.id=='rtUnload'){await localUnload()}
    else if(b.dataset.rtcancel!=null){LOC.ctl?.abort()}
    else if(b.id=='rtLoadHF'){
      const repo=$('#rtRepo').value.trim(),gguf=$('#rtGguf').value.trim();
      if(!repo){$('#rtRepo').focus();return}
      await localLoad({id:'custom',name:gguf||repo,repo,gguf,gb:0});
    }else if(b.id=='rtClear'){
      if(!confirm('Delete all models cached by the in-app runtime? You will need to download them again.'))return;
      if(LOC.engine?.isModelLoaded())await localUnload();
      try{await(await localEngine()).cacheManager.clear();LOC.error='';renderRuntime()}catch(x){LOC.error=x.message;renderRuntimeStatus()}
    }
  });
  dlg.addEventListener('change',e=>{
    const id=e.target.dataset?.lset;if(!id)return;
    let v=e.target.type=='checkbox'?e.target.checked:e.target.value;
    if(e.target.type=='number')v=e.target.value===''?'':+e.target.value;
    localSet(id,v);
  });
  $('#rtFile').addEventListener('change',async e=>{
    const f=e.target.files[0];e.target.value='';if(!f)return;
    await localLoad({id:'custom',name:f.name,blob:f,gb:f.size/1e9});
  });
})();
