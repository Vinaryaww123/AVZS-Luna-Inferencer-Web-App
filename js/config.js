/* config.js — add providers, modes, or default models here */
const $=s=>document.querySelector(s),LS='studio-ai.v1';

/* ===== PROVIDERS =====
   One line = one provider. The ID (object key) is also used in .env: LUNA_<ID>_API_KEY and LUNA_<ID>_URL.
   n: display name | url: API base URL | k:1 = requires an API key | loc:1 = runs locally
   t: API format -> 'oa' OpenAI-compatible (most common), 'an' Anthropic, 'go' Google Gemini,
      'a1' AUTOMATIC1111/Forge (image only).
   Adding an OpenAI-compatible provider: copy one line, change the ID, n, and url. Done. */
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
  custom:{n:'Custom (OpenAI-compatible)',url:'',t:'oa',k:1}, // set your own URL in Settings
  /* --- Local --- */
  ollama:{n:'Ollama (local)',url:'http://localhost:11434/v1',t:'oa',loc:1},
  lmstudio:{n:'LM Studio (local)',url:'http://localhost:1234/v1',t:'oa',loc:1},
  unsloth:{n:'Unsloth (local)',url:'http://localhost:8888/v1',t:'oa',loc:1},
  llamacpp:{n:'llama.cpp server (local)',url:'http://localhost:8080/v1',t:'oa',loc:1},
  vllm:{n:'vLLM (local)',url:'http://localhost:8000/v1',t:'oa',loc:1},
  jan:{n:'Jan (local)',url:'http://localhost:1337/v1',t:'oa',loc:1},
  koboldcpp:{n:'KoboldCpp (local)',url:'http://localhost:5001/v1',t:'oa',loc:1},
  textgen:{n:'text-generation-webui (local)',url:'http://localhost:5000/v1',t:'oa',loc:1},
  gpt4all:{n:'GPT4All (local)',url:'http://localhost:4891/v1',t:'oa',loc:1},
  localai:{n:'LocalAI (local)',url:'http://localhost:8081/v1',t:'oa',loc:1},
  a1111:{n:'AUTOMATIC1111/Forge (local, image)',url:'http://localhost:7860',t:'a1',loc:1}
};
const ALL=Object.keys(P);
const CH=ALL.filter(p=>P[p].t!='a1'); // providers that can chat

/* ===== MODES (TABS) =====
   n: tab label | ps: available providers | ph: input placeholder.
   New tab: add it here + OPT + EMPTY, then create a branch in send() (js/ui.js). */
const M={
  chat:{n:'Chat',ps:CH,ph:'Write a message…'},
  coder:{n:'Coder',ps:CH,ph:'Paste code or describe a programming task… (Shift+Enter for a new line)'},
  multimodal:{n:'Multimodal',ps:CH,ph:'Ask something about the attached image…'}, // use a model that supports vision
  research:{n:'Research',ps:CH,ph:'Research topic or question…'},
  image:{n:'Image',ps:['openai','google','together','xai','a1111','localai','ollama','lmstudio','unsloth','custom'],ph:'Describe an image…'},
  video:{n:'Video',ps:['openai','google'],ph:'Describe a video…'}
};

/* Default model per mode+provider (can be changed in the model field, or via .env: LUNA_DEFAULT_<MODE>=provider:model) */
const DM={
  image:{openai:'gpt-image-1',google:'gemini-2.5-flash-image',together:'black-forest-labs/FLUX.1-schnell',xai:'grok-2-image',a1111:'default'}, // a1111: checkpoint is set on the server
  video:{openai:'sora-2',google:'veo-3.0-generate-001'}
};

/* Extra options above the input field for each mode (HTML + Tailwind classes) */
/* MCP tools checkbox (Chat and Coder tabs). Servers and tools are configured in Settings > MCP. */
const MCP_OPT='<label class="flex items-center gap-1.5" title="Allow the model to use tools from MCP servers (configure in Settings > MCP)"><input type="checkbox" id="mcpOn" class="accent-ac"> MCP tools<span id="mcpN" class="text-xs"></span></label>';
const OPT={
  multimodal:'<label class="filebtn" title="Choose an image, or paste it with Ctrl+V in the message field"><svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>Attach image<input type="file" id="files" accept="image/*" multiple class="sr-only"></label><div id="thumbs" class="flex flex-wrap gap-2"></div><input type="text" id="sys" placeholder="System prompt (optional)" class="field min-w-[180px] flex-1 border-transparent bg-cd py-1 text-sm">',
  chat:MCP_OPT+'<input type="text" id="sys" placeholder="System prompt (optional)" class="field min-w-[180px] flex-1 border-transparent bg-cd py-1 text-sm">',
  research:'<label class="flex items-center gap-1.5"><input type="checkbox" id="web" class="accent-ac"> Use web search (Anthropic and Google)</label>',
  image:'', // replaced by the advanced settings panel (GEN)
  video:''
};

/* Empty-state text for each tab */
/* ===== ADVANCED IMAGE / VIDEO SETTINGS =====
   The panel above the message field (Image and Video tabs) is generated automatically from this list. One object = one field:
     id     value name; read in js/api.js via gen('image'|'video', provider).id
     label  label text | type: 'select' | 'number' | 'text' | 'lora'
     opts   (select) list of values, or [value, label] pairs | def: initial value ('' = parameter omitted)
     min/max/step (number) | ph: placeholder | p: providers that show this field
   Values are stored per provider (synced to the account). To add an option: add one object here, then use
   its value in image()/video() in js/api.js. Sampler and scheduler are filled from the AUTOMATIC1111/Forge server. */
const IMG_ALL=['openai','google','together','xai','a1111','localai','ollama','lmstudio','unsloth','custom'];
const GEN={
  image:[
    {id:'size',label:'Size',type:'select',opts:['512x512','768x768','1024x1024','1536x1024','1024x1536','768x1152','1152x768'],def:'1024x1024',p:['openai','together','a1111','localai','ollama','lmstudio','unsloth','custom']},
    {id:'ratio',label:'Aspect ratio',type:'select',opts:['1:1','3:4','4:3','9:16','16:9'],def:'1:1',p:['google']},
    {id:'n',label:'Number of images',type:'number',min:1,max:4,step:1,def:1,p:IMG_ALL},
    {id:'quality',label:'Quality',type:'select',opts:['auto','low','medium','high'],def:'auto',p:['openai']},
    {id:'bg',label:'Background',type:'select',opts:[['auto','Automatic'],['transparent','Transparent'],['opaque','Solid']],def:'auto',p:['openai']},
    {id:'format',label:'Format',type:'select',opts:['png','jpeg','webp'],def:'png',p:['openai']},
    {id:'steps',label:'Steps',type:'number',min:1,max:150,step:1,def:'',ph:'default',p:['together','a1111']},
    {id:'cfg',label:'CFG scale',type:'number',min:1,max:30,step:0.5,def:'',ph:'7',p:['a1111']},
    {id:'sampler',label:'Sampler',type:'select',opts:[],def:'',p:['a1111']},
    {id:'scheduler',label:'Scheduler',type:'select',opts:[],def:'',p:['a1111']},
    {id:'seed',label:'Seed',type:'number',min:-1,max:4294967295,step:1,def:'',ph:'random',p:['together','a1111']},
    {id:'neg',label:'Negative prompt',type:'text',def:'',ph:'things to avoid',p:['together','a1111']},
    {id:'loras',label:'LoRA',type:'lora',def:[],p:['a1111','together']}
  ],
  video:[
    {id:'seconds',label:'Duration (seconds)',type:'select',opts:['4','8','12'],def:'8',p:['openai']},
    {id:'vsize',label:'Size',type:'select',opts:['1280x720','720x1280','1792x1024','1024x1792'],def:'1280x720',p:['openai']},
    {id:'dur',label:'Duration (seconds)',type:'select',opts:['4','6','8'],def:'8',p:['google']},
    {id:'vratio',label:'Aspect ratio',type:'select',opts:['16:9','9:16'],def:'16:9',p:['google']},
    {id:'res',label:'Resolution',type:'select',opts:[['','Default'],'720p','1080p'],def:'',p:['google']},
    {id:'vseed',label:'Seed',type:'number',min:0,max:4294967295,step:1,def:'',ph:'random',p:['google']},
    {id:'vneg',label:'Negative prompt',type:'text',def:'',ph:'things to avoid',p:['google']}
  ]
};
/* Small note below the panel, per "kind:provider" */
const GEN_HINT={
  'image:a1111':'AUTOMATIC1111/Forge: run with --api --cors-allow-origins=*. The checkpoint is selected in the model field (click Load models). LoRA is added to the prompt as <lora:name:weight>.',
  'image:together':'Steps and seed depend on the model (FLUX schnell needs only a few steps). LoRA applies only to FLUX LoRA models; enter the LoRA path or URL.',
  'image:openai':'Quality, background, and format apply to gpt-image models. DALL-E 3 always produces 1 image.',
  'image:google':'Options depend on the model; Gemini creates one image per request. If rejected, change to the default value.',
  'video:openai':'Supported duration and size depend on the model (e.g. sora-2 and sora-2-pro).',
  'video:google':'Options depend on the Veo model; 1080p resolution is usually only for 16:9 and 8-second duration. If rejected, change to the default value.'
};
/* Advanced setting values for one provider: saved values, or defaults from GEN */
function gen(kind,p){
  const saved=S.gen?.[kind]?.[p]||{},o={};
  for(const f of GEN[kind])if(f.p.includes(p))o[f.id]=saved[f.id]??f.def;
  return o;
}

/* ===== CODER TAB =====
   base: base instruction | tasks: id -> [label, task instruction] | langs: [value, label] | temps: temperature choices ('' = provider default).
   The system prompt is assembled from base + task + language + additional instructions (see coderSys() in js/ui.js).
   Temperature is sent only when selected, because some reasoning models reject the temperature parameter. */
const CODER={
  base:'You are a senior programming assistant. Answer in the language the user uses. Show complete, ready-to-run code inside language-tagged code blocks. Give brief explanations, state assumptions, and do not invent APIs that do not exist. If information is missing, ask one clarifying question. Prefer simple, safe, and maintainable solutions.',
  tasks:{
    write:['Write code','Write new code according to the request.'],
    explain:['Explain code','Explain the code step by step in easy-to-understand language.'],
    debug:['Find bugs','Find the cause of the bug, explain it, then provide the smallest possible fix.'],
    refactor:['Refactor','Clean up and simplify the code without changing its behavior.'],
    review:['Review code','Review the code for bugs, security, performance, and readability; order findings by importance.'],
    test:['Write tests','Write unit tests covering normal and edge cases.'],
    convert:['Convert language','Convert the code to the selected language while preserving its behavior.'],
    optimize:['Optimize','Optimize performance and explain the trade-offs.'],
    docs:['Documentation','Write clear comments and documentation.']
  },
  langs:[['','Language: automatic'],['python','Python'],['javascript','JavaScript'],['typescript','TypeScript'],['html','HTML/CSS'],['csharp','C#'],['cpp','C++'],['c','C'],['java','Java'],['kotlin','Kotlin'],['go','Go'],['rust','Rust'],['php','PHP'],['sql','SQL'],['bash','Bash'],['gdscript','GDScript (Godot)'],['lua','Lua']],
  temps:[['','Temperature: default'],['0.2','0.2 (precise)'],['0.7','0.7'],['1','1.0 (creative)']]
};
const selHTML=(id,label,l)=>`<select id="${id}" class="field text-sm" aria-label="${label}">${l.map(([v,t])=>`<option value="${v}">${t}</option>`).join('')}</select>`;
OPT.coder=MCP_OPT+selHTML('task','Task',Object.entries(CODER.tasks).map(([k,v])=>[k,v[0]]))+selHTML('lang','Language',CODER.langs)+selHTML('temp','Temperature',CODER.temps)
  +'<label class="filebtn" title="Attach code files as context"><svg viewBox="0 0 24 24" class="h-4 w-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m21.4 11.1-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5"/></svg>Attach code files<input type="file" id="cfiles" multiple class="sr-only" accept=".py,.js,.ts,.tsx,.jsx,.html,.css,.json,.md,.txt,.cs,.cpp,.c,.h,.hpp,.java,.kt,.go,.rs,.php,.sql,.sh,.gd,.lua,.yml,.yaml,.toml,.xml,.rb,.swift"></label><div id="cthumbs" class="flex flex-wrap gap-1.5"></div>'
  +'<input type="text" id="sys" placeholder="Additional instructions (optional)" class="field min-w-[180px] flex-1 border-transparent bg-cd py-1 text-sm">';

const EMPTY={
  coder:'Programming assistant: write, explain, find bugs, refactor, or review code. Choose a task and language below, attach code files if needed, then write your request.',
  multimodal:'Attach one or more images and ask a question. Choose a model that supports images (vision), e.g. GPT-4o, Claude, Gemini, or llava on Ollama.',
  chat:'Start a conversation with the model of your choice.',
  research:'Enter a topic. The model will break it into sub-questions, investigate them one by one, then write a report.',
  image:'Write a description of the image you want.',
  video:'Write a description of the video. The process may take several minutes.'
};

/* Storage (localStorage): k = API keys, u = custom URLs, m = last provider+model per mode */
let S=JSON.parse(localStorage.getItem(LS)||'{}');S.k=S.k||{};S.u=S.u||{};S.m=S.m||{};S.gen=S.gen||{};
const save=()=>{localStorage.setItem(LS,JSON.stringify(S));if(typeof syncUp=="function")syncUp()}; // syncUp: js/auth.js
let mode='chat',busy=null;const H={chat:[],coder:[],multimodal:[]}; // conversation history per mode

/* ===== HELPERS ===== */
const ENV=window.ENV||{}; // from js/env.js (built from .env)
const envDef=k=>{const v=ENV["LUNA_DEFAULT_"+k.toUpperCase()],i=v?v.indexOf(":"):-1;return i>0?{p:v.slice(0,i),m:v.slice(i+1)}:null}; // initial model from .env
const splitUrl=u=>{const m=u.match(/^data:(.+?);base64,(.*)$/);return{mime:m[1],data:m[2]}}; // image data URL -> {mime,data}
const base=p=>(S.u[p]||ENV[`LUNA_${p.toUpperCase()}_URL`]||P[p].url).replace(/\/$/,''); // priority: Settings > .env > default
const key=p=>S.k[p]||ENV[`LUNA_${p.toUpperCase()}_API_KEY`]||''; // priority: Settings > .env
const gu=p=>base('google')+p+(p.includes('?')?'&':'?')+'key='+encodeURIComponent(key('google'));
const esc=s=>s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
/* ===== MINI MARKDOWN + CODE BLOCKS =====
   Code blocks: language label, Copy/Download buttons (+ Preview for HTML), and lightweight syntax highlighting without libraries.
   Adding a language: register it in LMAP (highlighting family) and EXT (file extension for Download).
   Highlighting families in FAM: k = keywords, c = line comment marker. Token colors are in css/style.css (--tk-*). */
const FAM={
  py:{k:'def class import from as return if elif else for while in not and or is None True False try except finally with lambda yield pass break continue raise async await global self func var extends signal const match enum static end then local function nil',c:'#'},
  clike:{k:'function const let var return if else for while do switch case break continue new class struct enum static void int float double bool boolean char string true false null undefined this try catch finally throw public private protected namespace using import export from default package interface extends implements async await fn mut pub impl trait use match func type go defer chan fun val typeof instanceof of in as',c:'//'},
  sql:{k:'select from where insert into values update set delete create table alter drop join left right inner outer on group by order having limit and or not null as distinct union primary key foreign references index',c:'--',i:1},
  sh:{k:'if then else elif fi for while do done case esac function in echo cd ls export local return exit sudo',c:'#'},
  json:{k:'true false null',c:''}
};
const LMAP={python:'py',py:'py',gdscript:'py',gd:'py',lua:'py',javascript:'clike',js:'clike',typescript:'clike',ts:'clike',jsx:'clike',tsx:'clike',c:'clike',cpp:'clike','c++':'clike',csharp:'clike',cs:'clike',java:'clike',kotlin:'clike',kt:'clike',go:'clike',rust:'clike',rs:'clike',php:'clike',swift:'clike',sql:'sql',bash:'sh',sh:'sh',shell:'sh',zsh:'sh',json:'json'};
const EXT={python:'py',py:'py',gdscript:'gd',gd:'gd',lua:'lua',javascript:'js',js:'js',typescript:'ts',ts:'ts',jsx:'jsx',tsx:'tsx',c:'c',cpp:'cpp','c++':'cpp',csharp:'cs',cs:'cs',java:'java',kotlin:'kt',kt:'kt',go:'go',rust:'rs',rs:'rs',php:'php',swift:'swift',sql:'sql',bash:'sh',sh:'sh',json:'json',html:'html',css:'css',xml:'xml',yaml:'yml',yml:'yml',md:'md'};
/* Highlighting: comments, strings, numbers, keywords. Input is already HTML-escaped. */
function hl(code,lang){
  const f=FAM[LMAP[lang]];if(!f)return code;
  const com=f.c=='//'?'//[^\\n]*|/\\*[\\s\\S]*?\\*/':f.c?f.c+'[^\\n]*':'(?!)';
  const re=new RegExp('('+com+')|("(?:\\\\.|[^"\\\\\\n])*"|\'(?:\\\\.|[^\'\\\\\\n])*\'|`(?:\\\\.|[^`\\\\\\n])*`)|\\b(\\d+(?:\\.\\d+)?)\\b|\\b('+f.k.replace(/ /g,'|')+')\\b',f.i?'gi':'g');
  return code.replace(re,(m,c,s,n)=>`<i class="tk-${c?'c':s?'s':n?'n':'k'}">${m}</i>`);
}
function codeBlock(p){
  const m=p.match(/^```([\w+#.-]*)[^\n]*\n?([\s\S]*?)(```)?$/),l=(m[1]||'').toLowerCase();
  const acts=m[3]?`<span class="cb-acts">${l=='html'||l=='svg'?'<button type="button" data-cb="prev">Preview</button>':''}<button type="button" data-cb="copy">Copy</button><button type="button" data-cb="dl">Download</button></span>`:''; // buttons only for completed blocks
  return`<div class="codeblock" data-x="${EXT[l]||'txt'}"><div class="cb-head"><span>${l||'code'}</span>${acts}</div><pre><code>${hl(m[2].replace(/\n$/,''),l)}</code></pre></div>`;
}
const inline=p=>p.replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/^#{1,3} (.+)$/gm,'<h4>$1</h4>').replace(/\*\*([^*\n]+)\*\*/g,'<b>$1</b>');
const md=s=>esc(s).split(/(```[\s\S]*?(?:```|$))/).map((p,i)=>i%2?codeBlock(p):inline(p.replace(/^\n/,'').replace(/\n$/,''))).join(''); // even = plain text, odd = code block (including unclosed ones during streaming)
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
