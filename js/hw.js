/* hw.js — HARDWARE DETECTION & MODEL FIT ESTIMATION
   Data sources (in order): 1) /api/system from server.py (accurate: RAM, NVIDIA VRAM, disk)
                          2) browser (estimate: RAM capped at 8 GB from navigator.deviceMemory, GPU from WebGPU/WebGL)
                          3) your manual input (RAM, VRAM, unified memory) stored in this browser.
   Fit numbers are in the "FIT" section below: change them if the estimate is too optimistic or pessimistic. */
const HW_KEY='luna.hw';
const RAM_OPT=[4,8,12,16,24,32,48,64,96,128,192,256];                      // RAM options (GB)
const VRAM_OPT=[0,2,4,6,8,10,11,12,16,20,24,32,48,64,80,96];                // VRAM options (GB); 0 = no discrete GPU
const near=(v,l)=>l.reduce((a,b)=>Math.abs(b-v)<Math.abs(a-v)?b:a);

/* VRAM estimate from desktop GPU names. Laptop GPUs are deliberately not guessed (their VRAM varies): enter manually. */
const GPU_VRAM=[[/rtx\s*5090/i,32],[/rtx\s*5080/i,16],[/rtx\s*5070\s*ti/i,16],[/rtx\s*5070/i,12],[/rtx\s*5060\s*ti/i,16],[/rtx\s*5060/i,8],
 [/rtx\s*4090/i,24],[/rtx\s*4080/i,16],[/rtx\s*4070\s*ti\s*super/i,16],[/rtx\s*4070\s*ti/i,12],[/rtx\s*4070/i,12],[/rtx\s*4060\s*ti/i,8],[/rtx\s*4060/i,8],
 [/rtx\s*3090/i,24],[/rtx\s*3080\s*ti/i,12],[/rtx\s*3080/i,10],[/rtx\s*3070/i,8],[/rtx\s*3060\s*ti/i,8],[/rtx\s*3060/i,12],[/rtx\s*3050/i,8],
 [/rtx\s*20[78]0/i,8],[/rtx\s*2060/i,6],[/gtx\s*1660/i,6],[/gtx\s*1650/i,4],[/gtx\s*1080\s*ti/i,11],[/gtx\s*10[78]0/i,8],[/gtx\s*1060/i,6],
 [/rx\s*7900\s*xtx/i,24],[/rx\s*7900\s*xt/i,20],[/rx\s*7800/i,16],[/rx\s*7700/i,12],[/rx\s*7600/i,8],[/rx\s*6[89]00/i,16],[/rx\s*6700/i,12],[/rx\s*66\d0/i,8],
 [/arc\s*a770/i,16],[/arc\s*a(750|580)/i,8],[/arc\s*b580/i,12]];
const guessVram=n=>/laptop|mobile|max-q/i.test(n)?0:(GPU_VRAM.find(([r])=>r.test(n))||[,0])[1];

/* Browser-only detection (estimate) */
async function detectBrowser(){
  const n=navigator;let gpu='';
  try{const a=await n.gpu?.requestAdapter(),i=a?.info||await a?.requestAdapterInfo?.();if(i)gpu=[i.vendor,i.architecture,i.description||i.device].filter(Boolean).join(' ')}catch{}
  try{if(!/\d{3,4}/.test(gpu)){const g=document.createElement('canvas').getContext('webgl'),e=g?.getExtension('WEBGL_debug_renderer_info');if(e)gpu=g.getParameter(e.UNMASKED_RENDERER_WEBGL)||gpu}}catch{}
  const unified=/apple\s*(m\d|gpu)/i.test(gpu);
  return{src:'browser',os:n.userAgentData?.platform||n.platform||'',cpu:'',cores:n.hardwareConcurrency||0,
    ram:near(n.deviceMemory||8,RAM_OPT),gpu,vram:unified?0:guessVram(gpu),unified,disk:0};
}
/* Detection via server.py (accurate). Data shape: see system_info() in server.py */
function fromServer(j){
  const g=j.gpus||[],vr=Math.max(0,...g.map(x=>x.vram_gb||guessVram(x.name)));
  return{src:'server',os:`${j.os} ${j.arch}`,cpu:j.cpu,cores:j.cores,ram:near(j.ram_gb,RAM_OPT),gpu:g.map(x=>x.name).join(' + '),
    vram:j.unified?0:near(vr,VRAM_OPT),unified:!!j.unified,disk:j.disk_free_gb};
}
/* Final result = detection + manual corrections (reset=true ignores corrections) */
async function detectHW(reset){
  if(reset)localStorage.removeItem(HW_KEY);
  let h;try{const r=await fetch('/api/system');if(!r.ok)throw 0;h=fromServer(await r.json())}catch{h=await detectBrowser()}
  try{Object.assign(h,JSON.parse(localStorage.getItem(HW_KEY)||'{}'))}catch{}
  return h;
}
const saveHW=h=>localStorage.setItem(HW_KEY,JSON.stringify({ram:h.ram,vram:h.vram,unified:h.unified}));

/* ===== FIT =====
   Model size (GB) -> memory needed = size*1.08 + 1 GB (context cache & overhead, about 4k tokens of context).
   Q4_K_M is roughly 0.61 GB per billion parameters.
   gpu = fits in VRAM (fast) | mix = GPU + RAM (medium) | cpu = CPU only (slow) | no = does not fit.
   Usage limits: VRAM 92%, RAM 65% (Apple Silicon: 70% unified memory). */
const Q4_PER_B=0.61;
const needGB=size=>size*1.08+1;
function fit(size,h){
  const n=needGB(size);
  if(h.unified)return n<=h.ram*.70?'gpu':'no';
  if(h.vram>0&&n<=h.vram*.92)return'gpu';
  if(n<=h.ram*.65)return h.vram>0?'mix':'cpu';
  return'no';
}
/* Largest parameter count (billions, Q4) that fits: fast = on GPU, max = including slow */
function maxParams(h){
  const inv=lim=>Math.max(0,Math.floor((lim-1)/(Q4_PER_B*1.08)));
  const gpu=h.unified?inv(h.ram*.70):h.vram>0?inv(h.vram*.92):0,all=h.unified?gpu:Math.max(gpu,inv(h.ram*.65));
  return{fast:gpu,max:all};
}
