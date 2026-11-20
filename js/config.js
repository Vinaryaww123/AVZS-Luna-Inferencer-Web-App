/* config.js — tambah provider, mode, atau model default di sini */
const $=s=>document.querySelector(s),LS='studio-ai.v1';

/* ===== PROVIDER =====
   Satu baris = satu provider. ID (kunci objek) juga dipakai di .env: LUNA_<ID>_API_KEY dan LUNA_<ID>_URL.
   n: nama tampil | url: base URL API | k:1 = butuh kunci API | loc:1 = berjalan lokal
   t: format API -> 'oa' OpenAI-compatible (paling umum), 'an' Anthropic, 'go' Google Gemini,
      'a1' AUTOMATIC1111/Forge (khusus gambar).
   Menambah provider OpenAI-compatible: salin satu baris, ganti ID, n, dan url. Selesai. */
const P={
  /* --- Cloud --- */
  openai:{n:'OpenAI',url:'https://api.openai.com/v1',t:'oa',k:1},
  anthropic:{n:'Anthropic',url:'https://api.anthropic.com/v1',t:'an',k:1},
  google:{n:'Google Gemini',url:'https://generativelanguage.googleapis.com/v1beta',t:'go',k:1},
  openrouter:{n:'OpenRouter',url:'https://openrouter.ai/api/v1',t:'oa',k:1},
  groq:{n:'Groq',url:'https://api.groq.com/openai/v1',t:'oa',k:1},
  mistral:{n:'Mistral',url:'https://api.mistral.ai/v1',t:'oa',k:1},
  deepseek:{n:'DeepSeek',url:'https://api.deepseek.com/v1',t:'oa',k:1},
  xai:{n:'xAI Grok',url:'https://api.x.ai/v1',t:'oa',k:1},
  together:{n:'Together AI',url:'https://api.together.xyz/v1',t:'oa',k:1},
  fireworks:{n:'Fireworks AI',url:'https://api.fireworks.ai/inference/v1',t:'oa',k:1},
  perplexity:{n:'Perplexity',url:'https://api.perplexity.ai',t:'oa',k:1,nolist:1},
  cerebras:{n:'Cerebras',url:'https://api.cerebras.ai/v1',t:'oa',k:1},
  custom:{n:'Kustom (OpenAI-compatible)',url:'',t:'oa',k:1}, // isi URL sendiri di Pengaturan
  /* --- Lokal --- */
  ollama:{n:'Ollama (lokal)',url:'http://localhost:11434/v1',t:'oa',loc:1},
  lmstudio:{n:'LM Studio (lokal)',url:'http://localhost:1234/v1',t:'oa',loc:1},
  unsloth:{n:'Unsloth (lokal)',url:'http://localhost:8888/v1',t:'oa',loc:1},
  llamacpp:{n:'llama.cpp server (lokal)',url:'http://localhost:8080/v1',t:'oa',loc:1},
  vllm:{n:'vLLM (lokal)',url:'http://localhost:8000/v1',t:'oa',loc:1},
  jan:{n:'Jan (lokal)',url:'http://localhost:1337/v1',t:'oa',loc:1},
  koboldcpp:{n:'KoboldCpp (lokal)',url:'http://localhost:5001/v1',t:'oa',loc:1},
  textgen:{n:'text-generation-webui (lokal)',url:'http://localhost:5000/v1',t:'oa',loc:1},
  gpt4all:{n:'GPT4All (lokal)',url:'http://localhost:4891/v1',t:'oa',loc:1},
  localai:{n:'LocalAI (lokal)',url:'http://localhost:8081/v1',t:'oa',loc:1},
  a1111:{n:'AUTOMATIC1111/Forge (lokal, gambar)',url:'http://localhost:7860',t:'a1',loc:1}
};
const ALL=Object.keys(P);
const CH=ALL.filter(p=>P[p].t!='a1'); // provider yang bisa chat

/* ===== MODE (TAB) =====
   n: label tab | ps: provider yang tersedia | ph: placeholder kolom input.
   Tab baru: tambah di sini + OPT + EMPTY, lalu buat cabang di send() (js/ui.js). */
const M={
  chat:{n:'Chat',ps:CH,ph:'Tulis pesan…'},
  coder:{n:'Coder',ps:CH,ph:'Tempel kode atau jelaskan tugas pemrograman… (Shift+Enter untuk baris baru)'},
  multimodal:{n:'Multimodal',ps:CH,ph:'Tanya sesuatu tentang gambar yang dilampirkan…'}, // pakai model yang mendukung vision
  research:{n:'Riset',ps:CH,ph:'Topik atau pertanyaan riset…'},
  image:{n:'Gambar',ps:['openai','google','together','xai','a1111','localai','ollama','lmstudio','unsloth','custom'],ph:'Deskripsikan gambar…'},
  video:{n:'Video',ps:['openai','google'],ph:'Deskripsikan video…'}
};

/* Model default per mode+provider (bisa diubah di kolom model, atau lewat .env: LUNA_DEFAULT_<MODE>=provider:model) */
const DM={
  image:{openai:'gpt-image-1',google:'gemini-2.5-flash-image',together:'black-forest-labs/FLUX.1-schnell',xai:'grok-2-image',a1111:'default'}, // a1111: checkpoint ditentukan di server
  video:{openai:'sora-2',google:'veo-3.0-generate-001'}
};

/* Opsi tambahan di atas kolom input untuk tiap mode (HTML + kelas Tailwind) */
/* Kotak centang alat MCP (tab Chat dan Coder). Server dan alat diatur di Pengaturan > MCP. */
const MCP_OPT='<label class="flex items-center gap-1.5" title="Izinkan model memakai alat dari server MCP (atur di Pengaturan > MCP)"><input type="checkbox" id="mcpOn" class="accent-ac"> Alat MCP<span id="mcpN" class="text-xs"></span></label>';
const OPT={
  multimodal:'<label class="filebtn" title="Pilih gambar, atau tempel dengan Ctrl+V di kolom pesan"><svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>Lampirkan gambar<input type="file" id="files" accept="image/*" multiple class="sr-only"></label><div id="thumbs" class="flex flex-wrap gap-2"></div><input type="text" id="sys" placeholder="System prompt (opsional)" class="field min-w-[180px] flex-1 border-transparent bg-cd py-1 text-sm">',
  chat:MCP_OPT+'<input type="text" id="sys" placeholder="System prompt (opsional)" class="field min-w-[180px] flex-1 border-transparent bg-cd py-1 text-sm">',
  research:'<label class="flex items-center gap-1.5"><input type="checkbox" id="web" class="accent-ac"> Pakai web search (Anthropic dan Google)</label>',
  image:'', // diganti panel Pengaturan lanjutan (GEN)
  video:''
};

/* Teks kosong tiap tab */
/* ===== PENGATURAN LANJUTAN GAMBAR / VIDEO =====
   Panel di atas kolom pesan (tab Gambar dan Video) dibuat otomatis dari daftar ini. Satu objek = satu field:
     id     nama nilai; dibaca di js/api.js lewat gen('image'|'video', provider).id
     label  teks label | type: 'select' | 'number' | 'text' | 'lora'
     opts   (select) daftar nilai, atau pasangan [nilai, label] | def: nilai awal ('' = parameter dilewati)
     min/max/step (number) | ph: placeholder | p: provider yang menampilkan field ini
   Nilai tersimpan per provider (ikut tersinkron ke akun). Menambah opsi: tambah satu objek di sini, lalu pakai
   nilainya di image()/video() pada js/api.js. Sampler dan scheduler diisi dari server AUTOMATIC1111/Forge. */
const IMG_ALL=['openai','google','together','xai','a1111','localai','ollama','lmstudio','unsloth','custom'];
const GEN={
  image:[
    {id:'size',label:'Ukuran',type:'select',opts:['512x512','768x768','1024x1024','1536x1024','1024x1536','768x1152','1152x768'],def:'1024x1024',p:['openai','together','a1111','localai','ollama','lmstudio','unsloth','custom']},
    {id:'ratio',label:'Rasio',type:'select',opts:['1:1','3:4','4:3','9:16','16:9'],def:'1:1',p:['google']},
    {id:'n',label:'Jumlah gambar',type:'number',min:1,max:4,step:1,def:1,p:IMG_ALL},
    {id:'quality',label:'Kualitas',type:'select',opts:['auto','low','medium','high'],def:'auto',p:['openai']},
    {id:'bg',label:'Latar',type:'select',opts:[['auto','Otomatis'],['transparent','Transparan'],['opaque','Solid']],def:'auto',p:['openai']},
    {id:'format',label:'Format',type:'select',opts:['png','jpeg','webp'],def:'png',p:['openai']},
    {id:'steps',label:'Steps',type:'number',min:1,max:150,step:1,def:'',ph:'bawaan',p:['together','a1111']},
    {id:'cfg',label:'CFG scale',type:'number',min:1,max:30,step:0.5,def:'',ph:'7',p:['a1111']},
    {id:'sampler',label:'Sampler',type:'select',opts:[],def:'',p:['a1111']},
    {id:'scheduler',label:'Scheduler',type:'select',opts:[],def:'',p:['a1111']},
    {id:'seed',label:'Seed',type:'number',min:-1,max:4294967295,step:1,def:'',ph:'acak',p:['together','a1111']},
    {id:'neg',label:'Negative prompt',type:'text',def:'',ph:'hal yang ingin dihindari',p:['together','a1111']},
    {id:'loras',label:'LoRA',type:'lora',def:[],p:['a1111','together']}
  ],
  video:[
    {id:'seconds',label:'Durasi (detik)',type:'select',opts:['4','8','12'],def:'8',p:['openai']},
    {id:'vsize',label:'Ukuran',type:'select',opts:['1280x720','720x1280','1792x1024','1024x1792'],def:'1280x720',p:['openai']},
    {id:'dur',label:'Durasi (detik)',type:'select',opts:['4','6','8'],def:'8',p:['google']},
    {id:'vratio',label:'Rasio',type:'select',opts:['16:9','9:16'],def:'16:9',p:['google']},
    {id:'res',label:'Resolusi',type:'select',opts:[['','Bawaan'],'720p','1080p'],def:'',p:['google']},
    {id:'vseed',label:'Seed',type:'number',min:0,max:4294967295,step:1,def:'',ph:'acak',p:['google']},
    {id:'vneg',label:'Negative prompt',type:'text',def:'',ph:'hal yang ingin dihindari',p:['google']}
  ]
};
/* Catatan kecil di bawah panel, per "jenis:provider" */
const GEN_HINT={
  'image:a1111':'AUTOMATIC1111/Forge: jalankan dengan --api --cors-allow-origins=*. Checkpoint dipilih lewat kolom model (klik Muat model). LoRA ditambahkan ke prompt sebagai <lora:nama:bobot>.',
  'image:together':'Steps dan seed bergantung model (FLUX schnell hanya beberapa steps). LoRA hanya berlaku untuk model FLUX LoRA; isi path atau URL LoRA.',
  'image:openai':'Kualitas, latar, dan format berlaku untuk model gpt-image. DALL-E 3 selalu menghasilkan 1 gambar.',
  'image:google':'Opsi bergantung model; Gemini membuat satu gambar per permintaan. Bila ditolak, ubah ke nilai bawaan.',
  'video:openai':'Durasi dan ukuran yang didukung bergantung model (mis. sora-2 dan sora-2-pro).',
  'video:google':'Opsi bergantung model Veo; resolusi 1080p biasanya hanya untuk 16:9 dan durasi 8 detik. Bila ditolak, ubah ke nilai bawaan.'
};
/* Nilai pengaturan lanjutan untuk satu provider: nilai tersimpan, atau default dari GEN */
function gen(kind,p){
  const saved=S.gen?.[kind]?.[p]||{},o={};
  for(const f of GEN[kind])if(f.p.includes(p))o[f.id]=saved[f.id]??f.def;
  return o;
}

/* ===== TAB CODER =====
   base: instruksi dasar | tasks: id -> [label, instruksi tugas] | langs: [nilai, label] | temps: pilihan suhu ('' = bawaan provider).
   Prompt sistem dirakit dari base + tugas + bahasa + instruksi tambahan (lihat coderSys() di js/ui.js).
   Suhu hanya dikirim bila dipilih, karena sebagian model penalaran menolak parameter temperature. */
const CODER={
  base:'Kamu adalah asisten pemrograman senior. Jawab dalam bahasa yang dipakai pengguna. Tampilkan kode lengkap yang siap dijalankan di dalam blok kode bertanda bahasa. Beri penjelasan singkat, sebutkan asumsi, dan jangan mengarang API yang tidak ada. Jika informasi kurang, ajukan satu pertanyaan klarifikasi. Utamakan solusi yang sederhana, aman, dan mudah dirawat.',
  tasks:{
    write:['Tulis kode','Tulis kode baru sesuai permintaan.'],
    explain:['Jelaskan kode','Jelaskan kode langkah demi langkah dengan bahasa yang mudah dipahami.'],
    debug:['Cari bug','Temukan penyebab bug, jelaskan, lalu berikan perbaikan seminimal mungkin.'],
    refactor:['Refactor','Rapikan dan sederhanakan kode tanpa mengubah perilakunya.'],
    review:['Review kode','Tinjau kode dari sisi bug, keamanan, performa, dan keterbacaan; urutkan dari yang terpenting.'],
    test:['Tulis tes','Tulis tes unit yang mencakup kasus normal dan kasus tepi.'],
    convert:['Konversi bahasa','Ubah kode ke bahasa yang dipilih dan pertahankan perilakunya.'],
    optimize:['Optimasi','Optimalkan performa dan jelaskan trade-off-nya.'],
    docs:['Dokumentasi','Tulis komentar dan dokumentasi yang jelas.']
  },
  langs:[['','Bahasa: otomatis'],['python','Python'],['javascript','JavaScript'],['typescript','TypeScript'],['html','HTML/CSS'],['csharp','C#'],['cpp','C++'],['c','C'],['java','Java'],['kotlin','Kotlin'],['go','Go'],['rust','Rust'],['php','PHP'],['sql','SQL'],['bash','Bash'],['gdscript','GDScript (Godot)'],['lua','Lua']],
  temps:[['','Suhu: bawaan'],['0.2','0.2 (presisi)'],['0.7','0.7'],['1','1.0 (kreatif)']]
};
const selHTML=(id,label,l)=>`<select id="${id}" class="field text-sm" aria-label="${label}">${l.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select>`;
OPT.coder=MCP_OPT+selHTML('task','Tugas',Object.entries(CODER.tasks).map(([k,v])=>[k,v[0]]))+selHTML('lang','Bahasa',CODER.langs)+selHTML('temp','Suhu',CODER.temps)
  +'<label class="filebtn" title="Lampirkan file kode sebagai konteks"><svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>Lampirkan file kode<input type="file" id="cfiles" multiple class="sr-only" accept=".py,.js,.ts,.tsx,.jsx,.html,.css,.json,.md,.txt,.cs,.cpp,.c,.h,.hpp,.java,.kt,.go,.rs,.php,.sql,.sh,.gd,.lua,.yml,.yaml,.toml,.xml,.rb,.swift"></label><div id="cthumbs" class="flex flex-wrap gap-1.5"></div>'
  +'<input type="text" id="sys" placeholder="Instruksi tambahan (opsional)" class="field min-w-[180px] flex-1 border-transparent bg-cd py-1 text-sm">';

const EMPTY={
  coder:'Asisten pemrograman: tulis, jelaskan, cari bug, refactor, atau review kode. Pilih tugas dan bahasa di bawah, lampirkan file kode bila perlu, lalu tulis permintaan Anda.',
  multimodal:'Lampirkan satu atau beberapa gambar lalu ajukan pertanyaan. Pilih model yang mendukung gambar (vision), mis. GPT-4o, Claude, Gemini, atau llava di Ollama.',
  chat:'Mulai percakapan dengan model pilihan Anda.',
  research:'Masukkan topik. Model akan memecahnya jadi sub-pertanyaan, menelitinya satu per satu, lalu menulis laporan.',
  image:'Tulis deskripsi gambar yang Anda inginkan.',
  video:'Tulis deskripsi video. Proses bisa memakan beberapa menit.'
};

/* Penyimpanan (localStorage): k = kunci API, u = URL kustom, m = provider+model terakhir per mode */
let S=JSON.parse(localStorage.getItem(LS)||'{}');S.k=S.k||{};S.u=S.u||{};S.m=S.m||{};S.gen=S.gen||{};
const save=()=>{localStorage.setItem(LS,JSON.stringify(S));if(typeof syncUp=="function")syncUp()}; // syncUp: js/auth.js
let mode='chat',busy=null;const H={chat:[],coder:[],multimodal:[]}; // riwayat percakapan per mode

/* ===== HELPER ===== */
const ENV=window.ENV||{}; // dari js/env.js (hasil build .env)
const envDef=k=>{const v=ENV["LUNA_DEFAULT_"+k.toUpperCase()],i=v?v.indexOf(":"):-1;return i>0?{p:v.slice(0,i),m:v.slice(i+1)}:null}; // model awal dari .env
const splitUrl=u=>{const m=u.match(/^data:(.+?);base64,(.*)$/);return{mime:m[1],data:m[2]}}; // data URL gambar -> {mime,data}
const base=p=>(S.u[p]||ENV[`LUNA_${p.toUpperCase()}_URL`]||P[p].url).replace(/\/$/,''); // prioritas: Pengaturan > .env > bawaan
const key=p=>S.k[p]||ENV[`LUNA_${p.toUpperCase()}_API_KEY`]||''; // prioritas: Pengaturan > .env
const gu=p=>base('google')+p+(p.includes('?')?'&':'?')+'key='+encodeURIComponent(key('google'));
const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
/* ===== MARKDOWN MINI + BLOK KODE =====
   Blok kode: label bahasa, tombol Salin/Unduh (+ Pratinjau untuk HTML), dan pewarnaan sintaks ringan tanpa pustaka.
   Menambah bahasa: daftarkan di LMAP (keluarga pewarnaan) dan EXT (ekstensi file untuk Unduh).
   Keluarga pewarnaan di FAM: k = kata kunci, c = penanda komentar baris. Warna token ada di css/style.css (--tk-*). */
const FAM={
  py:{k:'def class import from as return if elif else for while in not and or is None True False try except finally with lambda yield pass break continue raise async await global self func var extends signal const match enum static end then local function nil',c:'#'},
  clike:{k:'function const let var return if else for while do switch case break continue new class struct enum static void int float double bool boolean char string true false null undefined this try catch finally throw public private protected namespace using import export from default package interface extends implements async await fn mut pub impl trait use match func type go defer chan fun val typeof instanceof of in as',c:'//'},
  sql:{k:'select from where insert into values update set delete create table alter drop join left right inner outer on group by order having limit and or not null as distinct union primary key foreign references index',c:'--',i:1},
  sh:{k:'if then else elif fi for while do done case esac function in echo cd ls export local return exit sudo',c:'#'},
  json:{k:'true false null',c:''}
};
const LMAP={python:'py',py:'py',gdscript:'py',gd:'py',lua:'py',javascript:'clike',js:'clike',typescript:'clike',ts:'clike',jsx:'clike',tsx:'clike',c:'clike',cpp:'clike','c++':'clike',csharp:'clike',cs:'clike',java:'clike',kotlin:'clike',kt:'clike',go:'clike',rust:'clike',rs:'clike',php:'clike',swift:'clike',sql:'sql',bash:'sh',sh:'sh',shell:'sh',zsh:'sh',json:'json'};
const EXT={python:'py',py:'py',gdscript:'gd',gd:'gd',lua:'lua',javascript:'js',js:'js',typescript:'ts',ts:'ts',jsx:'jsx',tsx:'tsx',c:'c',cpp:'cpp','c++':'cpp',csharp:'cs',cs:'cs',java:'java',kotlin:'kt',kt:'kt',go:'go',rust:'rs',rs:'rs',php:'php',swift:'swift',sql:'sql',bash:'sh',sh:'sh',json:'json',html:'html',css:'css',xml:'xml',yaml:'yml',yml:'yml',md:'md'};
/* Pewarnaan: komentar, string, angka, kata kunci. Masukan sudah di-escape HTML. */
function hl(code,lang){
  const f=FAM[LMAP[lang]];if(!f)return code;
  const com=f.c=='//'?'//[^\\n]*|/\\*[\\s\\S]*?\\*/':f.c?f.c+'[^\\n]*':'(?!)';
  const re=new RegExp('('+com+')|("(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\\\n])*`)|\\b(\\d+(?:\\.\\d+)?)\\b|\\b('+f.k.replace(/ /g,'|')+')\\b',f.i?'gi':'g');
  return code.replace(re,(m,c,s,n)=>`<i class="tk-${c?'c':s?'s':n?'n':'k'}">${m}</i>`);
}
function codeBlock(p){
  const m=p.match(/^```([\w+#.-]*)[^\n]*\n?([\s\S]*?)(```)?$/),l=(m[1]||'').toLowerCase();
  const acts=m[3]?`<span class="cb-acts">${l=='html'||l=='svg'?'<button type="button" data-cb="prev">Pratinjau</button>':''}<button type="button" data-cb="copy">Salin</button><button type="button" data-cb="dl">Unduh</button></span>`:''; // tombol hanya untuk blok yang sudah selesai
  return`<div class="codeblock" data-x="${EXT[l]||'txt'}"><div class="cb-head"><span>${l||'kode'}</span>${acts}</div><pre><code>${hl(m[2].replace(/\n$/,''),l)}</code></pre></div>`;
}
const inline=p=>p.replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/^#{1,3} (.+)$/gm,'<h4>$1</h4>').replace(/\*\*([^*\n]+)\*\*/g,'<b>$1</b>');
const md=s=>esc(s).split(/(```[\s\S]*?(?:```|$))/).map((p,i)=>i%2?codeBlock(p):inline(p.replace(/^\n/,'').replace(/\n$/,''))).join(''); // genap = teks biasa, ganjil = blok kode (juga yang belum ditutup saat streaming)
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
