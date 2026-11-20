/* ui.js — tab, pengiriman pesan, dialog pengaturan, dan inisialisasi */

/* ===== STREAMING YANG HALUS =====
   1) Auto-scroll cerdas: ikut ke bawah hanya bila pengguna memang berada di bawah.
      Jika menggulir ke atas saat inferensi, tampil tombol "Ke bawah" (#jump).
   2) Painter: render DOM maksimal 1x per frame, dan teks ditampilkan bertahap supaya
      token yang datang bergelombang tetap terlihat mengalir. Ubah angka 6 di bawah untuk
      mengatur kecepatan mengejar antrean (kecil = lebih cepat, besar = lebih lambat). */
let pinned=true;
const mainEl=$('#main'),jump=$('#jump');
const follow=()=>{if(pinned)mainEl.scrollTop=mainEl.scrollHeight};
mainEl.addEventListener('scroll',()=>{pinned=mainEl.scrollHeight-mainEl.scrollTop-mainEl.clientHeight<80;jump.classList.toggle('hidden',pinned||!busy)});
jump.onclick=()=>{pinned=true;mainEl.scrollTo({top:mainEl.scrollHeight,behavior:'smooth'})};
function makePainter(o){
  let full='',shown=0,raf=0;
  const step=()=>{
    raf=0;const back=full.length-shown;if(back<=0)return;
    o.classList.add('streaming');                       // kursor berkedip (lihat src/input.css)
    shown+=Math.max(1,Math.ceil(back/6));               // makin banyak antrean, makin cepat mengejar
    if(/[\uD800-\uDBFF]/.test(full[shown-1]))shown++;    // jangan memotong emoji
    o.innerHTML=md(full.slice(0,shown));follow();
    if(shown<full.length)raf=requestAnimationFrame(step);
  };
  return{
    text(){return full},
    set(t){full=t;if(!raf)raf=requestAnimationFrame(step)},                                   // dipanggil tiap token tiba
    flush(){cancelAnimationFrame(raf);raf=0;if(full){shown=full.length;o.innerHTML=md(full);follow()}o.classList.remove('streaming')}, // selesai: tampilkan semua
    stop(){cancelAnimationFrame(raf);raf=0;o.classList.remove('streaming')}                    // dihentikan/error
  };
}

/* ===== PEMILIH MODEL =====
   Dropdown buatan sendiri, bukan <datalist>. Penyebab bug lama: datalist hanya menampilkan opsi yang cocok
   dengan teks yang sudah ada di kolom, jadi setelah memilih satu model, model lain tidak muncul lagi.
   Sekarang: klik/fokus kolom = tampilkan SEMUA model; mengetik = menyaring.
   Daftar model disimpan per provider di MODELS sehingga tidak hilang saat ganti tab atau provider. */
const MODELS={};
const mdl=$('#mdl'),mlist=$('#mlist');
function closeMenu(){mlist.classList.add('hidden');mdl.setAttribute('aria-expanded','false')}
function renderMenu(filter=''){
  const all=MODELS[$('#prov').value]||[],q=filter.toLowerCase(),l=all.filter(x=>x.toLowerCase().includes(q));
  mlist.innerHTML=l.length
    ?l.map(x=>`<div role="option" data-m="${esc(x)}" class="cursor-pointer break-all rounded-md px-2.5 py-1.5 hover:bg-cd ${x==mdl.value?'font-semibold text-ac':''}">${esc(x)}</div>`).join('')
    :`<div class="px-2.5 py-1.5 text-sm text-mu">${all.length?'Tidak ada yang cocok. Nama yang diketik tetap dipakai.':'Memuat daftar model…'}</div>`;
  mlist.classList.remove('hidden');mdl.setAttribute('aria-expanded','true');
  mlist.querySelector('.text-ac')?.scrollIntoView({block:'nearest'});
}
/* Ambil daftar model dari provider terpilih. btn = tombol "Muat model" (opsional, untuk status). */
async function loadModels(btn){
  const p=$('#prov').value;if(btn)btn.textContent='Memuat…';
  try{
    MODELS[p]=await models(p);if(btn)btn.textContent=MODELS[p].length+' model';
    if(!mlist.classList.contains('hidden')&&$('#prov').value==p)renderMenu();
  }catch(e){
    if(btn)btn.textContent='Gagal memuat';
    mlist.innerHTML=`<div class="px-2.5 py-1.5 text-sm text-er">Tidak bisa memuat model: ${esc(e.message)}</div>`;mlist.classList.remove('hidden');
  }
  if(btn)setTimeout(()=>btn.textContent='Muat model',2500);
}

/* ===== LAMPIRAN GAMBAR (tab Multimodal) =====
   Tombol "Lampirkan gambar" (label.filebtn) + pratinjau kecil dengan tombol hapus. Bisa juga tempel gambar (Ctrl+V). */
const ATT=[]; // data URL gambar yang menunggu dikirim
function renderThumbs(){
  const t=$('#thumbs');if(!t)return;
  t.innerHTML=ATT.map((u,i)=>`<span class="relative"><img src="${u}" alt="" class="h-10 w-10 rounded-md border border-bd object-cover"><button type="button" data-rm="${i}" aria-label="Hapus gambar" class="absolute -right-1.5 -top-1.5 h-4 w-4 rounded-full bg-tx text-[10px] leading-4 text-bg">×</button></span>`).join('');
}
async function addFiles(files){
  for(const f of files){
    if(!f.type.startsWith('image/'))continue;
    ATT.push(await new Promise(ok=>{const r=new FileReader();r.onload=()=>ok(r.result);r.readAsDataURL(f)}));
  }
  renderThumbs();
}

/* ===== PENGATURAN PROVIDER =====
   Dua grup (Cloud / Lokal). Tiap provider = satu baris lipat. Cloud: tempel kunci API saja (URL bawaan sudah benar).
   Lokal: periksa alamat server. Tombol "Tes koneksi" memastikan semuanya benar. Daftar provider berasal dari P di config.js. */
let setGroup='cloud';
const hasKey=p=>!!key(p);
const attr=s=>esc(String(s)).replace(/"/g,'&quot;'); // aman untuk angka
function chip(p){const ok=hasKey(p);return`<span class="text-xs ${ok?'text-ac':'text-mu'}">${ok?'Kunci terisi':'Belum diisi'}</span>`}
function renderSettings(open){
  for(const[id,g]of[['gCloud','cloud'],['gLocal','local'],['gMcp','mcp']])$('#'+id).classList.toggle('tab-on',setGroup==g);
  if(setGroup=='mcp')return renderMcp();
  $('#pvs').innerHTML=ALL.filter(p=>!!P[p].loc==(setGroup=='local')).map(p=>{
    const v=P[p],cloud=!v.loc;
    return`<details data-d="${p}" class="group rounded-lg border border-bd bg-sf" ${p==open?'open':''}>
      <summary class="flex cursor-pointer items-center justify-between gap-2 px-3 py-2"><span class="font-medium">${v.n}</span>
        <span class="flex items-center gap-2">${cloud?chip(p):'<span class="text-xs text-mu">Lokal</span>'}<svg viewBox="0 0 24 24" class="h-4 w-4 text-mu transition-transform group-open:rotate-180" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></span></summary>
      <div class="grid gap-2 border-t border-bd p-3">
        ${v.k?`<label class="grid gap-1 text-sm text-mu">Kunci API<input type="password" class="field w-full text-tx" data-p="${p}" data-f="k" placeholder="Tempel kunci API di sini" autocomplete="off" value="${attr(S.k[p]||'')}"></label>`:''}
        <label class="grid gap-1 text-sm text-mu">${cloud?'URL kustom (opsional)':'Alamat server'}<input class="field w-full text-tx" data-p="${p}" data-f="u" placeholder="${attr(v.url)}" value="${attr(S.u[p]||'')}"></label>
        <div class="flex flex-wrap items-center gap-2"><button type="button" class="btn" data-test="${p}">Tes koneksi</button><span class="text-sm" id="t-${p}"></span></div>
        ${v.loc?'<p class="text-xs text-mu">Jika gagal tersambung, aktifkan CORS di server (Ollama: jalankan dengan OLLAMA_ORIGINS="*"; LM Studio: Enable CORS).</p>':''}
      </div></details>`;
  }).join('');
  $('#gCloud').classList.toggle('tab-on',setGroup=='cloud');$('#gLocal').classList.toggle('tab-on',setGroup=='local');
}
function openSettings(p){ // p (opsional) = provider yang langsung dibuka
  setGroup=p&&P[p].loc?'local':'cloud';renderSettings(p);$('#dlg').showModal();
  if(p){const d=$(`#pvs details[data-d=${p}]`);d?.scrollIntoView({block:'nearest'});d?.querySelector('input')?.focus()}
}
async function ping(p){ // uji koneksi: ambil daftar model (atau endpoint A1111)
  if(P[p].t=='a1'){const r=await fetch(base(p)+'/sdapi/v1/sd-models');if(!r.ok)throw new Error(r.status);return'Tersambung'}
  if(P[p].nolist)return hasKey(p)?'Kunci tersimpan (provider ini tanpa daftar model, ketik nama model manual)':'Isi kunci API dulu';
  const l=await models(p);MODELS[p]=l;return`Tersambung · ${l.length} model`;
}

/* Isi daftar provider (dikelompokkan Cloud/Lokal; cloud tanpa kunci diberi tanda) */
function fillProv(k){
  const ps=M[k].ps,opt=p=>`<option value="${p}">${P[p].n}${P[p].k&&p!='custom'&&!key(p)?' (belum ada kunci)':''}</option>`;
  const grp=(t,l)=>l.length?`<optgroup label="${t}">${l.map(opt).join('')}</optgroup>`:'';
  $('#prov').innerHTML=grp('Cloud',ps.filter(p=>!P[p].loc))+grp('Lokal',ps.filter(p=>P[p].loc));
}

/* ===== PANEL PENGATURAN LANJUTAN (tab Gambar dan Video) =====
   Field dibuat dari GEN (config.js) sesuai provider terpilih; nilainya tersimpan per provider di S.gen.
   LoRA: AUTOMATIC1111/Forge memilih dari daftar terpasang di server; Together memakai path/URL manual. */
const A1={tried:false,samplers:[],schedulers:[],loras:[]}; // data dinamis dari server AUTOMATIC1111/Forge
function setGen(kind,p,id,v){
  S.gen=S.gen||{};S.gen[kind]=S.gen[kind]||{};S.gen[kind][p]=S.gen[kind][p]||{};
  S.gen[kind][p][id]=v;save();
}
function loraHTML(p){
  const a1=p=='a1111';
  return`<div class="col-span-full grid gap-1.5"><span class="text-xs text-mu">LoRA</span><div id="loraChips" class="flex flex-wrap gap-1.5"></div>
    <div class="flex flex-wrap items-center gap-1.5">${a1
      ?`<select id="loraName" class="field min-w-[160px] flex-1 text-sm text-tx"><option value="">Pilih LoRA terpasang…</option>${A1.loras.map(n=>`<option value="${attr(n)}">${esc(n)}</option>`).join('')}</select><button type="button" class="btn text-sm" data-a1load>Muat dari server</button>`
      :`<input id="loraName" class="field min-w-[200px] flex-1 text-sm text-tx" placeholder="Path atau URL LoRA (repo Hugging Face / tautan CivitAI)">`}
      <input id="loraW" type="number" min="0" max="2" step="0.05" value="0.8" class="field w-20 text-sm text-tx" title="Bobot (0-2)" aria-label="Bobot LoRA"><button type="button" class="btn text-sm" data-loraadd>Tambah</button></div></div>`;
}
function renderChips(){
  const c=$('#loraChips');if(!c)return;
  c.innerHTML=(gen('image',$('#prov').value).loras||[]).map((x,i)=>`<span class="chip flex items-center gap-1.5 text-xs">${esc(x.n)} · ${x.w}<button type="button" data-loradel="${i}" aria-label="Hapus LoRA" class="text-mu hover:text-er">×</button></span>`).join('');
}
function fieldHTML(f,val,p){
  if(f.type=='lora')return loraHTML(p);
  const lab=`<span class="text-xs text-mu">${f.label}</span>`;
  if(f.type=='select'){
    const list=f.id=='sampler'?[['','(bawaan server)'],...A1.samplers]:f.id=='scheduler'?[['','(bawaan server)'],...A1.schedulers]:[...f.opts];
    if(val&&!list.some(o=>(Array.isArray(o)?o[0]:o)==val))list.push(val); // nilai tersimpan tetap tampil walau daftar belum dimuat
    return`<label class="grid gap-1">${lab}<select data-g="${f.id}" class="field text-sm text-tx">${list.map(o=>{const[v,l]=Array.isArray(o)?o:[o,o];return`<option value="${attr(v)}" ${v==val?'selected':''}>${esc(l)}</option>`}).join('')}</select></label>`;
  }
  const nm=f.type=='number';
  return`<label class="grid gap-1 ${nm?'':'col-span-full'}">${lab}<input data-g="${f.id}" type="${nm?'number':'text'}" ${nm?`min="${f.min}" max="${f.max}" step="${f.step}"`:''} placeholder="${attr(f.ph||'')}" value="${attr(val??'')}" class="field text-sm text-tx"></label>`;
}
function renderGen(){
  const kind=mode,box=$('#advBox'),on=kind=='image'||kind=='video';
  box.classList.toggle('hidden',!on);if(!on)return;
  const p=$('#prov').value,v=gen(kind,p),fs=GEN[kind].filter(f=>f.p.includes(p));
  $('#advTitle').textContent=kind=='image'?'Pengaturan gambar':'Pengaturan video';
  $('#adv').innerHTML=fs.map(f=>fieldHTML(f,v[f.id],p)).join('')||'<p class="col-span-full text-sm text-mu">Provider ini tidak punya pengaturan tambahan.</p>';
  const h=$('#advHint'),t=GEN_HINT[kind+':'+p]||'';h.textContent=t;h.className='px-3 pb-2 text-xs text-mu'+(t?'':' hidden');
  if(kind=='image')renderChips();
  if(kind=='image'&&p=='a1111'&&!A1.tried)loadA1(); // coba muat sampler dan LoRA otomatis (sekali)
}
/* Ambil sampler, scheduler, dan LoRA dari server AUTOMATIC1111/Forge */
async function loadA1(){
  A1.tried=true;const root=base('a1111'),get=async u=>{const r=await fetch(root+u);if(!r.ok)throw new Error(r.status);return r.json()};
  try{
    const[s,sc,l]=await Promise.all([get('/sdapi/v1/samplers'),get('/sdapi/v1/schedulers').catch(()=>[]),get('/sdapi/v1/loras').catch(()=>[])]);
    A1.samplers=s.map(x=>x.name);A1.schedulers=sc.map(x=>x.name||x.label);A1.loras=l.map(x=>x.name||x.alias);
    if(mode=='image'&&$('#prov').value=='a1111')renderGen();
  }catch(e){
    const h=$('#advHint');h.textContent='Tidak bisa terhubung ke AUTOMATIC1111/Forge ('+(/Failed to fetch/.test(e.message)?'periksa alamat dan --cors-allow-origins':e.message)+').';h.className='px-3 pb-2 text-xs text-er';
  }
}
for(const ev of['input','change'])$('#adv').addEventListener(ev,e=>{const g=e.target.dataset?.g;if(g)setGen(mode,$('#prov').value,g,e.target.value)});
$('#adv').addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;const p=$('#prov').value,cur=()=>[...(gen('image',p).loras||[])];
  if(b.dataset.loraadd!=null){
    const n=$('#loraName').value.trim(),w=+$('#loraW').value||0.8;if(!n)return;
    setGen('image',p,'loras',[...cur(),{n,w}]);$('#loraName').value='';renderChips();
  }else if(b.dataset.loradel!=null){const l=cur();l.splice(+b.dataset.loradel,1);setGen('image',p,'loras',l);renderChips()}
  else if(b.dataset.a1load!=null){b.textContent='Memuat…';await loadA1()}
});

/* ===== TAB CODER =====
   Preset tugas/bahasa/suhu ada di CODER (config.js). File kode terlampir disisipkan ke pesan sebagai blok kode.
   Blok kode di balasan punya tombol Salin, Unduh, dan Pratinjau (HTML berjalan di iframe sandbox tanpa akses ke data aplikasi). */
const CF=[]; // file kode terlampir: {name,text}
const F3='`'.repeat(3);
function renderCF(){
  const t=$('#cthumbs');if(!t)return;
  t.innerHTML=CF.map((f,i)=>`<span class="chip flex items-center gap-1.5 text-xs">${esc(f.name)}<button type="button" data-crm="${i}" aria-label="Hapus file" class="text-mu hover:text-er">×</button></span>`).join('');
}
async function addCode(files){
  for(const f of files){
    if(f.size>150000){alert(`${f.name} terlalu besar (maksimal 150 KB).`);continue}
    const text=await new Promise(ok=>{const r=new FileReader();r.onload=()=>ok(r.result);r.readAsText(f)});
    if(text.includes('\u0000')){alert(`${f.name} bukan file teks.`);continue}
    if(CF.reduce((a,x)=>a+x.text.length,0)+text.length>400000){alert('Total lampiran melebihi 400 KB.');break}
    CF.push({name:f.name,text});
  }
  renderCF();
}
const withFiles=(files,q)=>files.length?files.map(f=>`File: ${f.name}\n${F3}${f.name.split('.').pop()}\n${f.text}\n${F3}\n\n`).join('')+q:q;
const coderSys=()=>{ // prompt sistem tab Coder dari preset yang dipilih
  const t=$('#task')?.value||'write',l=$('#lang')?.value,x=$('#sys')?.value.trim();
  return[CODER.base,CODER.tasks[t][1],l?`Bahasa/stack: ${CODER.langs.find(a=>a[0]==l)[1]}.`:'',x].filter(Boolean).join('\n');
};
const sysFor=k=>k=='coder'?coderSys():$('#sys')?.value.trim();
const tempFor=k=>{const v=k=='coder'?$('#temp')?.value:'';return v?+v:undefined};
function restoreCoder(){for(const id of['task','lang','temp']){const e=$('#'+id),v=S.cd?.[id];if(e&&v!=null)e.value=v}}
$('#opt').addEventListener('change',e=>{
  if(e.target.id=='cfiles'){const fl=[...e.target.files];e.target.value='';addCode(fl)}
  else if(['task','lang','temp'].includes(e.target.id)){S.cd=S.cd||{};S.cd[e.target.id]=e.target.value;save()}
});
$('#opt').addEventListener('click',e=>{const i=e.target.dataset?.crm;if(i!=null){CF.splice(+i,1);renderCF()}});
/* Tombol di blok kode (delegasi): salin, unduh, pratinjau */
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-cb]');if(!b)return;
  const blk=b.closest('.codeblock'),code=blk.querySelector('code').textContent,a=b.dataset.cb;
  if(a=='copy'){await copyText(code);b.textContent='Tersalin';setTimeout(()=>b.textContent='Salin',1200)}
  else if(a=='dl'){const u=URL.createObjectURL(new Blob([code],{type:'text/plain'})),l=document.createElement('a');l.href=u;l.download='kode.'+blk.dataset.x;l.click();setTimeout(()=>URL.revokeObjectURL(u),1000)}
  else{$('#prevFrame').srcdoc=code;$('#prev').showModal()}
});
$('#prevClose').onclick=()=>$('#prev').close();
$('#prev').addEventListener('close',()=>{$('#prevFrame').srcdoc=''}); // hentikan skrip pratinjau

/* ===== MCP (alat untuk model) =====
   Server dan alat berasal dari mcp.json lewat server.py (/api/mcp/...). Browser hanya memanggil; tidak ada perintah yang dijalankan dari sini.
   S.mcp: {on: dipakai di Chat/Coder, confirm: minta konfirmasi (bawaan: ya), off: {"server": true, "server/alat": true} = dimatikan}.
   Alur pesan: mcpEnabled() -> daftar alat aktif -> agent() di api.js -> mcpRun() menjalankan tiap panggilan (dengan konfirmasi). */
const MCP={cache:{},tools:{},allow:new Set()}; // cache: server -> Promise alat | tools: server -> alat | allow: izin selama sesi
const CHV='<svg viewBox="0 0 24 24" class="h-4 w-4 text-mu transition-transform group-open:rotate-180" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
const mcpServers=async()=>(await api('mcp/servers')).servers;
const mcpLoad=server=>MCP.cache[server]||(MCP.cache[server]=api('mcp/tools',{server}).then(r=>(MCP.tools[server]=r.tools),e=>{delete MCP.cache[server];throw e}));
function mcpText(r){ // hasil MCP -> teks untuk model
  const t=(r.content||[]).map(x=>x.type=='text'?x.text:x.type=='image'?'[gambar]':x.resource?.text||JSON.stringify(x)).join('\n')||JSON.stringify(r.structuredContent||r);
  return(r.isError?'Error: ':'')+t;
}
function updateMcpCount(){
  const n=$('#mcpN');if(!n)return;const off=S.mcp?.off||{};let c=0;
  for(const[s,ts]of Object.entries(MCP.tools))if(!off[s])c+=ts.filter(t=>!off[s+'/'+t.name]).length;
  n.textContent=c?` (${c})`:'';
}
/* Kumpulkan alat aktif dari semua server. fn = nama fungsi untuk model (hanya huruf, angka, _ dan -, maks 64). */
async function mcpEnabled(say){
  const off=S.mcp?.off||{},list=[],map={};let sv;
  try{sv=await mcpServers()}catch(e){throw new Error('MCP butuh server.py (buka lewat http://localhost). '+e.message)}
  for(const s of sv){
    if(off[s.name])continue;
    try{
      for(const t of await mcpLoad(s.name)){
        if(off[s.name+'/'+t.name])continue;
        const fn=('mcp_'+s.name+'__'+t.name).replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,64),sc=t.inputSchema;
        map[fn]={fn,server:s.name,tool:t.name,description:t.description||'',schema:sc&&sc.type?sc:{type:'object',properties:{}}};list.push(map[fn]);
      }
    }catch(e){say(`[MCP] server ${s.name} gagal dimuat: ${e.message}\n\n`)}
  }
  updateMcpCount();return{list,map};
}
/* Dialog konfirmasi: true bila diizinkan */
function mcpAsk(label,args){
  return new Promise(res=>{
    const d=$('#mcpOk');$('#mcpOkName').textContent=label;$('#mcpOkArgs').textContent=JSON.stringify(args,null,2);d.dataset.r='deny';
    const pick=e=>{const b=e.target.closest('[data-r]');if(b){d.dataset.r=b.dataset.r;d.close()}};
    d.addEventListener('click',pick);
    d.addEventListener('close',()=>{d.removeEventListener('click',pick);if(d.dataset.r=='always')MCP.allow.add(label);res(d.dataset.r!='deny')},{once:true});
    d.showModal();
  });
}
/* Jalankan satu panggilan alat dari model: konfirmasi -> server.py -> teks hasil. Jejaknya ditampilkan sebagai blok "tool". */
async function mcpRun(c,map,say){
  const t=map[c.fn];if(!t)return'Alat tidak dikenal.';
  const label=`${t.server}.${t.tool}`;let out;
  if(S.mcp?.confirm!==false&&!MCP.allow.has(label)&&!(await mcpAsk(label,c.args)))out='Pengguna menolak pemanggilan alat ini.';
  else try{out=mcpText(await api('mcp/call',{server:t.server,tool:t.tool,arguments:c.args}))}catch(e){out='Error: '+e.message}
  say(`\n\n${F3}tool\n${label}(${JSON.stringify(c.args).slice(0,300)})\n→ ${out.slice(0,1500).replace(/```/g,'` ` `')}\n${F3}\n\n`);
  return out.slice(0,20000);
}
/* Panel Pengaturan > MCP: daftar server dari mcp.json, aktif/nonaktif, daftar alat */
async function renderMcp(){
  const box=$('#pvs');box.innerHTML='<p class="text-sm text-mu">Memuat…</p>';let sv;
  try{sv=await mcpServers()}catch(e){box.innerHTML=`<p class="text-sm text-mu">MCP butuh server lokal. Jalankan <code>python server.py</code>, lalu buka aplikasi lewat http://localhost:3000 (galat: ${esc(e.message)}).</p>`;return}
  const off=S.mcp?.off||{};
  box.innerHTML=`<label class="flex items-center gap-1.5 text-sm"><input id="mcpConfirm" type="checkbox" class="accent-ac" ${S.mcp?.confirm===false?'':'checked'}> Minta konfirmasi sebelum alat dijalankan</label>`
    +(sv.length?sv.map(s=>`<details class="group rounded-lg border border-bd bg-sf"><summary class="flex cursor-pointer items-center justify-between gap-2 px-3 py-2"><span class="font-medium">${esc(s.name)}</span><span class="flex items-center gap-2"><span class="text-xs text-mu">${s.type}${s.ready?' · aktif':''}</span>${CHV}</span></summary>
      <div class="grid gap-2 border-t border-bd p-3"><label class="flex items-center gap-1.5 text-sm"><input type="checkbox" data-moff="${attr(s.name)}" class="accent-ac" ${off[s.name]?'':'checked'}> Pakai server ini</label>
      <div data-tl class="grid gap-1"></div><div class="flex flex-wrap items-center gap-2"><button type="button" class="btn text-sm" data-mload="${attr(s.name)}">Muat alat</button><span class="text-sm text-mu" data-mst></span></div></div></details>`).join('')
      :'<p class="text-sm text-mu">Belum ada server MCP. Salin <code>mcp.example.json</code> menjadi <code>mcp.json</code> lalu isi server yang Anda mau.</p>')
    +'<div><button type="button" class="btn text-sm" id="mcpReload">Muat ulang mcp.json</button></div>';
}
async function mcpShowTools(name,det){
  const st=det.querySelector('[data-mst]'),tl=det.querySelector('[data-tl]'),off=S.mcp?.off||{};
  st.className='text-sm text-mu';st.textContent='Memuat… (server dimulai bila belum berjalan)';
  try{
    const ts=await mcpLoad(name);
    tl.innerHTML=ts.length?ts.map(t=>`<label class="flex items-start gap-1.5 text-sm"><input type="checkbox" data-moff="${attr(name+'/'+t.name)}" class="mt-1 accent-ac" ${off[name+'/'+t.name]?'':'checked'}><span><b>${esc(t.name)}</b><br><span class="text-xs text-mu">${esc((t.description||'').slice(0,160))}</span></span></label>`).join(''):'<p class="text-sm text-mu">Server ini tidak punya alat.</p>';
    st.textContent=ts.length+' alat';updateMcpCount();
  }catch(e){st.className='text-sm text-er';st.textContent='Gagal: '+e.message.slice(0,200)}
}
function restoreMcp(){const e=$('#mcpOn');if(e){e.checked=!!S.mcp?.on;updateMcpCount()}}
$('#gMcp').onclick=()=>{setGroup='mcp';renderSettings()};
$('#pvs').addEventListener('click',async e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.mload)mcpShowTools(b.dataset.mload,b.closest('details'));
  else if(b.id=='mcpReload'){b.textContent='Memuat…';try{await api('mcp/reload',{})}catch{}MCP.cache={};MCP.tools={};renderMcp()}
});
$('#pvs').addEventListener('change',e=>{
  const t=e.target;S.mcp=S.mcp||{};
  if(t.id=='mcpConfirm'){S.mcp.confirm=t.checked;save()}
  else if(t.dataset.moff!=null){S.mcp.off=S.mcp.off||{};if(t.checked)delete S.mcp.off[t.dataset.moff];else S.mcp.off[t.dataset.moff]=true;save();updateMcpCount()}
});
$('#opt').addEventListener('change',e=>{ // kotak centang "Alat MCP" di tab Chat/Coder
  if(e.target.id!='mcpOn')return;
  S.mcp=S.mcp||{};S.mcp.on=e.target.checked;save();
  if(e.target.checked)mcpEnabled(()=>{}).then(r=>{if(!r.list.length)alert('Belum ada alat MCP aktif. Atur server di Pengaturan > MCP.')}).catch(x=>{e.target.checked=false;S.mcp.on=false;save();alert('Alat MCP tidak bisa dimuat: '+x.message)});
});

/* ===== BAR AKSI DI BAWAH BALASAN =====
   Muncul di balasan terakhir: Salin, Bacakan (speech synthesis browser), Ulangi prompt.
   "Ulangi" mengirim prompt yang sama lagi dengan provider/model yang sedang dipilih,
   jadi bisa dipakai untuk membandingkan model. Hasil lama diganti hasil baru.
   Ikon: path SVG gaya outline; ganti isi ICON untuk mengubah ikon. */
const last={}; // prompt terakhir per tab: {q, imgs, um}
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
    mk('Salin',ICON.copy,async x=>{await copyText(txt);x.classList.add('text-ac');setTimeout(()=>x.classList.remove('text-ac'),1200)});
    mk('Bacakan',ICON.speak,()=>{
      if(speechSynthesis.speaking){speechSynthesis.cancel();return}
      const u=new SpeechSynthesisUtterance(txt.replace(/[`*#]/g,''));  // u.lang='id-ID' untuk memaksa bahasa
      speechSynthesis.speak(u);
    });
  }
  mk('Ulangi prompt',ICON.redo,()=>redo(k));
  o.append(d);
}
function redo(k){
  if(busy||!last[k])return;
  speechSynthesis?.cancel();
  const h=H[k],l=last[k];
  if(h&&h.at(-1)?.role=='assistant'&&h.at(-2)===l.um){h.pop();h.pop()}   // buang balasan lama dari riwayat
  document.querySelector(`.log[data-k=${k}]`).lastElementChild.remove();    // buang gelembung balasan lama
  send({regen:1});
}

/* Ganti tab: tampilkan log, isi daftar provider, dan opsi khusus mode */
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
  renderGen(); // panel pengaturan lanjutan mengikuti provider
  closeMenu();
}
function persist(){S.m[mode]={p:$('#prov').value,m:$('#mdl').value.trim()};save()}
function add(k,cls,html){const d=document.createElement('div');d.className='msg '+cls;d.innerHTML=html||'';document.querySelector(`.log[data-k=${k}]`).append(d);follow();return d}

/* Alur riset: rencana -> sub-pertanyaan -> laporan akhir */
async function research(p,m,q,o,sig){
  const web=$('#web')?.checked,ask=async(t,on)=>{let s='';await stream(p,m,[{role:'user',content:t}],'',x=>{s+=x;on&&on(s)},sig,web);return s};
  o.textContent='Menyusun rencana riset…';
  const pl=await ask(`Pecah topik riset ini menjadi 4 sub-pertanyaan yang saling melengkapi. Balas HANYA dengan array JSON berisi string.\nTopik: ${q}`);
  let qs;try{qs=JSON.parse(pl.match(/\[[\s\S]*\]/)[0])}catch{qs=[q]}
  let notes='';
  for(let i=0;i<qs.length;i++){
    o.textContent=`Meneliti ${i+1} dari ${qs.length}: ${qs[i]}`;
    notes+=`### ${qs[i]}\n${await ask(`Jawab dengan ringkas dan faktual. Sebutkan sumber atau ketidakpastian bila ada.\n${qs[i]}`)}\n\n`;
  }
  o.textContent='Menulis laporan…';
  await ask(`Susun laporan riset terstruktur (ringkasan, temuan utama, analisis, kesimpulan, keterbatasan) tentang: ${q}\nGunakan bahasa yang sama dengan topik. Dasarkan pada catatan berikut:\n\n${notes}`,s=>o._pt.set(s));
}

/* Ambil lampiran lalu kosongkan */
const readImgs=async()=>{const r=[...ATT];ATT.length=0;renderThumbs();return r};

/* Kirim pesan sesuai tab aktif. Tambah tab baru: buat cabang if(k==...) di bawah. */
async function send(opt){ // opt.regen = kirim ulang prompt terakhir
  if(busy){busy.abort();return}
  const rg=opt?.regen?last[mode]:null,q=rg?rg.q:$('#in').value.trim();if(!q)return;
  const k=mode,p=$('#prov').value,m=$('#mdl').value.trim();
  if(!m)return add(k,'msg-e','Isi nama model dulu. Klik "Muat model" untuk melihat daftar dari provider.');
  if(P[p].k&&p!='custom'&&!key(p)){add(k,'msg-e',`Kunci API ${P[p].n} belum diisi. Isi dulu di Pengaturan.`);return openSettings(p)}
  persist();const E=document.querySelector(`.log[data-k=${k}] .empty`);if(E)E.remove();
  document.querySelectorAll('.acts').forEach(x=>x.remove());
  pinned=true;const imgs=rg?rg.imgs:k=='multimodal'?await readImgs():[];const files=rg?rg.files:k=='coder'?CF.splice(0):[];renderCF();last[k]={q,imgs,files};const cq=withFiles(files,q); // cq = pesan + isi file terlampir
  if(!rg)add(k,'msg-u',esc(q)+files.map(f=>`<div class="chip mt-1.5 text-xs">${esc(f.name)}</div>`).join('')+imgs.map(i=>`<img src="${i}" class="mt-1.5 max-h-32" alt="">`).join(''));if(!rg){$('#in').value='';$('#in').style.height='auto'}
  const sig=(busy=new AbortController()).signal;$('#go').textContent='Berhenti';
  const o=add(k,'','<span class="dots"><i></i><i></i><i></i></span>'),pt=o._pt=makePainter(o); // titik animasi sampai token pertama tiba
 let acc='';
  try{
    if(H[k]){ // chat dan multimodal: riwayat percakapan
      H[k].push(last[k].um={role:'user',content:cq,images:imgs});
      const say=x=>{acc+=x;pt.set(acc)},tl=(k=='chat'||k=='coder')&&$('#mcpOn')?.checked?await mcpEnabled(say):null; // alat MCP aktif?
      if(tl?.list.length)await agent(p,m,H[k],sysFor(k),say,sig,tempFor(k),tl.list,c=>mcpRun(c,tl.map,say));
      else await stream(p,m,H[k],sysFor(k),say,sig,false,tempFor(k));
      H[k].push({role:'assistant',content:acc});
    }else if(k=='research'){
      await research(p,m,q,o,sig);
    }else if(k=='image'){
      o.textContent='Membuat gambar…';
      const us=await image(p,m,q,sig);
      o.innerHTML=`<div class="grid gap-2 ${us.length>1?'sm:grid-cols-2':''}">${us.map((u,i)=>`<figure><img alt="Hasil gambar ${i+1}" src="${u}"><a href="${u}" download="gambar-${i+1}.${u.match(/^data:image\/(\w+)/)?.[1]||'png'}" target="_blank" rel="noopener">Unduh gambar</a></figure>`).join('')}</div>`;
    }else{
      const u=await video(p,m,q,t=>o.textContent=t,sig);
      o.innerHTML=`<video controls src="${u}"></video><a href="${u}" download="video.mp4">Unduh video</a>`;
    }
  pt.flush();
  }catch(e){
    pt.stop();
    if(e.name=='AbortError'){if(H[k]){if(acc)H[k].push({role:'assistant',content:acc});else H[k].pop()}o.innerHTML=md(acc)+(acc?'\n':'')+'(dihentikan)'}
    else{o.className+=' msg-e';o.textContent=e.message+(/Failed to fetch/.test(e.message)?' — periksa koneksi, kunci API, atau pengaturan CORS provider.':'');if(H[k])H[k].pop()}
  }
  addActs(o,k);
  busy=null;$('#go').textContent='Kirim';jump.classList.add('hidden');
}

/* Inisialisasi */
$('#nav').innerHTML=Object.keys(M).map(k=>`<button data-k="${k}" class="tab flex-1 whitespace-nowrap">${M[k].n}</button>`).join('');
$('#main').innerHTML=Object.keys(M).map(k=>`<div class="log hidden flex-col gap-2.5" data-k="${k}"><div class="empty mx-auto mt-[10vh] max-w-md px-3 text-center"><img data-brand="logo" alt="" class="mx-auto mb-3 h-12 w-12 opacity-80"><p class="text-mu">${EMPTY[k]}</p></div></div>`).join('');
applyBrand(); // pasang logo pada keadaan kosong (dibuat setelah brand.js berjalan)
$('#nav').onclick=e=>{const k=e.target.dataset?.k;if(k){persist();setMode(k)}};
$('#prov').onchange=()=>{setProv();persist()};
/* Pemilih model: buka, saring, pilih, tutup */
const openMenu=()=>{renderMenu();if(!MODELS[$('#prov').value])loadModels()}; // muat otomatis bila belum ada daftar
mdl.onfocus=openMenu;
mdl.onclick=()=>{if(mlist.classList.contains('hidden'))openMenu()};
mdl.oninput=()=>renderMenu(mdl.value);
mdl.onchange=persist;
mdl.onkeydown=e=>{if(e.key=='Escape'||e.key=='Enter'){closeMenu();if(e.key=='Enter')persist()}};
mdl.onblur=closeMenu;
mlist.onmousedown=e=>{ // mousedown (bukan click) supaya terjadi sebelum kolom kehilangan fokus
  e.preventDefault();
  const m=e.target.closest('[data-m]')?.dataset.m;if(!m)return;
  mdl.value=m;persist();closeMenu();
};
$('#ld').onclick=()=>loadModels($('#ld'));
$('#go').onclick=send;
$('#in').onkeydown=e=>{if(e.key=='Enter'&&!e.shiftKey){e.preventDefault();send()}};
$('#in').oninput=e=>{e.target.style.height='auto';e.target.style.height=e.target.scrollHeight+'px'};
/* Pengaturan provider: ketik, ganti grup, tes koneksi */
$('#pvs').oninput=e=>{
  const d=e.target.dataset;if(!d.p)return;
  S[d.f][d.p]=e.target.value.trim();save();
  if(d.f=='k'){const c=e.target.closest('details').querySelector('summary span.text-xs');c.outerHTML=chip(d.p)} // perbarui status
};
$('#pvs').addEventListener('click',async e=>{
  const p=e.target.dataset?.test;if(!p)return;
  const out=$('#t-'+p),set=(t,c)=>{out.textContent=t;out.className='text-sm '+c};
  set('Menguji…','text-mu');
  try{set(await ping(p),'text-ac')}
  catch(x){const m=/Failed to fetch/.test(x.message)?'tidak bisa terhubung (periksa alamat dan CORS)':x.message.slice(0,140);set('Gagal: '+m,'text-er')}
});
$('#gCloud').onclick=()=>{setGroup='cloud';renderSettings()};
$('#gLocal').onclick=()=>{setGroup='local';renderSettings()};
$('#dlg').addEventListener('close',()=>{const v=$('#prov').value;fillProv(mode);$('#prov').value=v}); // segarkan label "(belum ada kunci)"
/* Lampiran gambar: input file, tombol hapus, tempel dari clipboard */
$('#opt').addEventListener('change',e=>{if(e.target.id=='files'){addFiles(e.target.files);e.target.value=''}});
$('#opt').addEventListener('click',e=>{const i=e.target.dataset?.rm;if(i!=null){ATT.splice(+i,1);renderThumbs()}});
$('#in').addEventListener('paste',e=>{const f=[...(e.clipboardData?.files||[])];if(mode=='multimodal'&&f.length){e.preventDefault();addFiles(f)}});
/* Logo: unggah dari Pengaturan (disimpan di browser) atau kembalikan ke bawaan */
$('#logoFile').onchange=e=>{const f=e.target.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{localStorage.setItem(LOGO_KEY,r.result);applyBrand()};r.readAsDataURL(f)};
$('#logoReset').onclick=()=>{localStorage.removeItem(LOGO_KEY);applyBrand()};
$('#cfg').onclick=()=>openSettings();
$('#cl').onclick=()=>$('#dlg').close();
setMode('chat');
