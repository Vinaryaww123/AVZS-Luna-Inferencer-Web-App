/* models.js — halaman Model Lokal: spesifikasi PC, rekomendasi, pencarian Hugging Face, unduh ke Ollama.
   Rekomendasi diambil langsung dari Hugging Face (model GGUF yang sedang tren) lalu disaring sesuai spesifikasi Anda,
   jadi daftarnya selalu baru dan tidak ada nama model yang ditulis mati di kode. */
const HF='https://huggingface.co';
let hw=null,recI=0,lastSearch=[];
const attr=s=>esc(String(s)).replace(/"/g,'&quot;');
const fmt=n=>n>=1e6?(n/1e6).toFixed(1)+' jt':n>=1e3?(n/1e3).toFixed(1)+' rb':String(n);
/* Kategori rekomendasi: o = parameter pencarian Hugging Face (ubah/tambah sesuai selera) */
const REC=[{n:'Chat',o:{pipeline:'text-generation'}},{n:'Multimodal (gambar)',o:{pipeline:'image-text-to-text'}},{n:'Coding',o:{pipeline:'text-generation',q:'coder'}}];
const BADGE={gpu:['Cepat · muat di GPU','text-ac'],mix:['Sedang · GPU + RAM','text-mu'],cpu:['Lambat · hanya CPU','text-mu'],no:['Tidak muat','text-er']};
const badge=f=>`<span class="chip text-xs ${BADGE[f][1]}">${BADGE[f][0]}</span>`;
/* Ambil jumlah parameter (miliar) dari nama repo, mis. "Qwen3-8B" -> 8. "A3B"/"E4B" (parameter aktif) diabaikan. */
const paramsOf=id=>{const m=[...id.matchAll(/(?<![A-Za-z0-9.])(\d+(?:\.\d+)?)[bB](?![A-Za-z])/g)].map(x=>+x[1]);return m.length?Math.max(...m):0};
const QUANT=/(?:UD-)?(?:IQ\d_[A-Z]+(?:_\d)?|Q\d_K_(?:XL|[SML])|Q\d_K|Q\d_\d|Q\d|MXFP4|BF16|F16|F32)/i;

/* ---------- Hugging Face API (publik, tanpa kunci) ---------- */
async function hfSearch(o){
  const run=async sort=>{
    const u=new URL(HF+'/api/models');const q=u.searchParams;
    if(o.q)q.set('search',o.q);if(o.gguf)q.set('filter','gguf');if(o.pipeline)q.set('pipeline_tag',o.pipeline);
    q.set('sort',sort);q.set('direction','-1');q.set('limit',o.limit||30);
    for(const x of['downloads','likes','pipeline_tag','lastModified'])q.append('expand[]',x);
    const r=await fetch(u);if(!r.ok)throw new Error('Hugging Face menjawab '+r.status);return r.json();
  };
  try{return await run(o.sort)}catch(e){if(o.sort=='trendingScore')return run('downloads');throw e} // trending tak tersedia -> unduhan
}
/* Daftar varian kuantisasi (ukuran file GGUF dijumlahkan per kuantisasi; file mmproj untuk vision diabaikan) */
async function hfVariants(id){
  const r=await fetch(`${HF}/api/models/${id}/tree/main?recursive=true`);if(!r.ok)throw new Error('Hugging Face menjawab '+r.status);
  const g={};
  for(const f of(await r.json()))if(f.type=='file'&&/\.gguf$/i.test(f.path)&&!/mmproj/i.test(f.path)){
    const q=(f.path.match(QUANT)?.[0]||'GGUF').toUpperCase();g[q]=(g[q]||0)+(f.lfs?.size||f.size||0);
  }
  return Object.entries(g).map(([q,b])=>({q,gb:b/1e9})).sort((a,b)=>a.gb-b.gb);
}

/* ---------- Unduh lewat Ollama (API lokal Ollama, butuh OLLAMA_ORIGINS="*") ---------- */
async function pullOllama(model,bar,txt){
  const root=base('ollama').replace(/\/v1$/,''),say=(t,c='text-mu')=>{txt.textContent=t;txt.className='mt-1 text-xs '+c};
  say('Menghubungi Ollama…');
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
    bar.style.width='100%';say('Selesai. Di aplikasi pilih provider Ollama, lalu klik Muat model.','text-ac');
  }catch(e){say(/Failed to fetch/.test(e.message)?'Tidak bisa terhubung ke Ollama. Pastikan Ollama berjalan dan OLLAMA_ORIGINS="*" sudah diatur.':e.message,'text-er')}
}

/* ---------- Tampilan ---------- */
function renderHW(){
  const s=hw,cpu=s.cpu?`${s.cpu}${s.cores?` (${s.cores} thread)`:''}`:s.cores?`${s.cores} thread`:'-';
  $('#hwCards').innerHTML=[['Sistem',s.os],['CPU',cpu],['GPU',s.gpu],['Disk kosong',s.disk?s.disk+' GB':'']].map(([k,v])=>
    `<div class="card"><div class="text-xs text-mu">${k}</div><div class="mt-0.5 break-words text-sm">${esc(String(v||'-'))}</div></div>`).join('');
  $('#hwRam').value=s.ram;$('#hwVram').value=s.vram;$('#hwUni').checked=!!s.unified;
  $('#hwSrc').textContent=s.src=='server'?'Terbaca dari server.py di komputer ini (akurat). Anda tetap bisa mengoreksi RAM/VRAM di bawah.':'Perkiraan dari browser: RAM hanya terbaca sampai 8 GB dan VRAM ditebak dari nama GPU. Jalankan python server.py untuk deteksi akurat, atau koreksi manual di bawah.';
  const m=maxParams(s);
  $('#hwSum').textContent=s.unified||s.vram>0?`Perkiraan: model sampai ~${m.fast} miliar parameter (kuantisasi Q4) berjalan cepat di GPU, dan sampai ~${m.max} miliar masih bisa jalan lebih lambat.`:`Tanpa GPU diskrit: model sampai ~${m.max} miliar parameter (kuantisasi Q4) bisa jalan di CPU, dengan kecepatan lebih lambat.`;
}
function card(m){
  const b=paramsOf(m.id),f=b?fit(b*Q4_PER_B,hw):null;
  return`<article class="card" data-id="${attr(m.id)}"><div class="flex flex-wrap items-start justify-between gap-2"><div class="min-w-0">
    <a href="${HF}/${attr(m.id)}" target="_blank" rel="noopener" class="break-all font-medium text-ac hover:underline">${esc(m.id)}</a>
    <div class="mt-0.5 text-xs text-mu">${m.pipeline_tag?esc(m.pipeline_tag)+' · ':''}${fmt(m.downloads||0)} unduhan · ${fmt(m.likes||0)} suka${b?` · ~${b}B parameter`:''}</div></div>
    ${f?badge(f):'<span class="chip text-xs text-mu">Cek varian</span>'}</div>
    <button type="button" class="btn mt-2 text-sm" data-var="${attr(m.id)}">Lihat varian dan perintah</button><div class="vars mt-2 hidden"></div></article>`;
}
function varRows(id,vs){
  if(!vs.length)return'<p class="text-sm text-mu">Repo ini tidak punya file GGUF. Model non-GGUF perlu dikonversi atau dijalankan dengan vLLM/transformers.</p>';
  return`<div class="grid gap-1.5">${vs.map(v=>{const tag=`hf.co/${id}:${v.q}`;return`<div class="rounded-lg border border-bd p-2 text-sm">
    <div class="flex flex-wrap items-center justify-between gap-2"><span><b>${esc(v.q)}</b> · ${v.gb.toFixed(1)} GB</span>${badge(fit(v.gb,hw))}</div>
    <div class="mt-1.5 flex flex-wrap gap-1.5">
      <button type="button" class="btn px-2 py-1 text-xs" data-copy="ollama run ${attr(tag)}">Salin: ollama run</button>
      <button type="button" class="btn px-2 py-1 text-xs" data-copy="llama-server -hf ${attr(id)}:${attr(v.q)}">Salin: llama-server</button>
      <button type="button" class="btn btn-pri px-2 py-1 text-xs" data-pull="${attr(tag)}">Unduh ke Ollama</button></div>
    <div class="mt-1.5 hidden"><div class="h-1.5 rounded bg-cd"><div class="h-1.5 w-0 rounded bg-ac transition-all"></div></div><p class="mt-1 text-xs text-mu"></p></div></div>`}).join('')}</div>`;
}
const RANK={gpu:0,mix:1,cpu:2};
function renderRec(){
  const l=(REC[recI].data||[]).map(m=>({m,f:paramsOf(m.id)?fit(paramsOf(m.id)*Q4_PER_B,hw):'no'})).filter(x=>x.f!='no')
    .sort((a,b)=>RANK[a.f]-RANK[b.f]).slice(0,12).map(x=>x.m);   // yang paling cepat di PC Anda lebih dulu (urutan tren dipertahankan)
  $('#recList').innerHTML=l.length?l.map(card).join(''):'<p class="text-sm text-mu">Tidak ada model tren yang cocok dengan spesifikasi ini. Coba cari manual di bawah.</p>';
}
async function loadRec(i){
  recI=i;document.querySelectorAll('#recTabs button').forEach((b,k)=>b.classList.toggle('tab-on',k==i));
  $('#recList').innerHTML='<p class="text-sm text-mu">Memuat dari Hugging Face…</p>';
  try{if(!REC[i].data)REC[i].data=await hfSearch({...REC[i].o,gguf:true,sort:'trendingScore',limit:60});if(recI==i)renderRec()}
  catch(e){$('#recList').innerHTML=`<p class="text-sm text-er">Gagal memuat: ${esc(e.message)}</p>`}
}
function refresh(){renderHW();renderRec();$('#sList').innerHTML=lastSearch.map(card).join('')}

/* ---------- Event ---------- */
document.addEventListener('click',async e=>{
  const t=e.target.closest('button');if(!t)return;
  if(t.dataset.var){ // buka/tutup daftar varian
    const box=t.parentElement.querySelector('.vars');
    if(!box.classList.contains('hidden')){box.classList.add('hidden');return}
    t.textContent='Memuat varian…';
    try{box.innerHTML=varRows(t.dataset.var,await hfVariants(t.dataset.var))}catch(x){box.innerHTML=`<p class="text-sm text-er">${esc(x.message)}</p>`}
    box.classList.remove('hidden');t.textContent='Sembunyikan varian';
  }else if(t.dataset.copy){
    try{await navigator.clipboard.writeText(t.dataset.copy)}catch{const a=document.createElement('textarea');a.value=t.dataset.copy;document.body.append(a);a.select();document.execCommand('copy');a.remove()}
    const o=t.textContent;t.textContent='Tersalin';setTimeout(()=>t.textContent=o,1200);
  }else if(t.dataset.pull){
    const pg=t.closest('.rounded-lg').lastElementChild;pg.classList.remove('hidden');t.disabled=true;
    await pullOllama(t.dataset.pull,pg.querySelector('.bg-ac'),pg.querySelector('p'));t.disabled=false;
  }
});
$('#sform').onsubmit=async e=>{
  e.preventDefault();$('#sList').innerHTML='<p class="text-sm text-mu">Mencari…</p>';
  try{lastSearch=await hfSearch({q:$('#sq').value.trim(),gguf:$('#sgguf').checked,sort:$('#ssort').value});
    $('#sList').innerHTML=lastSearch.length?lastSearch.map(card).join(''):'<p class="text-sm text-mu">Tidak ada hasil.</p>'}
  catch(x){$('#sList').innerHTML=`<p class="text-sm text-er">Gagal mencari: ${esc(x.message)}</p>`}
};
const setHW=()=>{hw.ram=+$('#hwRam').value;hw.vram=+$('#hwVram').value;hw.unified=$('#hwUni').checked;saveHW(hw);refresh()};
['hwRam','hwVram','hwUni'].forEach(id=>$('#'+id).onchange=setHW);
$('#hwRedo').onclick=async()=>{hw=await detectHW(true);refresh()};

/* ---------- Mulai ---------- */
(async()=>{
  $('#hwRam').innerHTML=RAM_OPT.map(v=>`<option value="${v}">${v} GB</option>`).join('');
  $('#hwVram').innerHTML=VRAM_OPT.map(v=>`<option value="${v}">${v?v+' GB':'Tidak ada / terintegrasi'}</option>`).join('');
  $('#recTabs').innerHTML=REC.map((r,i)=>`<button type="button" class="tab">${r.n}</button>`).join('');
  $('#recTabs').onclick=e=>{const i=[...$('#recTabs').children].indexOf(e.target.closest('button'));if(i>=0)loadRec(i)};
  hw=await detectHW();renderHW();loadRec(0);
})();
