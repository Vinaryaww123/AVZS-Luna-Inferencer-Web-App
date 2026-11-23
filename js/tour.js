/* tour.js — INTERACTIVE TUTORIAL (highlight + step by step).
   Edit the tutorial content in the TOUR array. Each step:
     sel   CSS selector of the highlighted element (empty = centered message). The step is skipped if the element is not visible.
     t, d  title and body
     hint  (optional) prompt to try something directly
     wait  (optional) 'click' or 'change': the tutorial advances automatically after you try that element
     act   (optional) action button {label, run, until}: runs something (e.g. opens Settings);
           the tutorial is hidden temporarily and resumes when the `until` element (dialog) closes
   Appears automatically on the first visit. Open it again via the "Tutorial" button in the header.
   Shortcuts: left/right arrow = back/next, Esc = skip. */
const TOUR=[
  {t:'Welcome',d:'This short tutorial guides you through the app step by step. You can skip it at any time.'},
  {sel:'#nav',t:'Choose a task type',d:'Chat for conversations, Coder for programming, Multimodal for asking about images, Research for structured reports, then Image and Video for creating media.',hint:'Try clicking one of the tabs now.',wait:'click'},
  {sel:'#prov',t:'Choose a provider',d:'Cloud providers (OpenAI, Anthropic, Google, and others) need an API key. Local providers (Ollama, LM Studio, and others) run on your computer.',hint:'Try choosing another provider.',wait:'change'},
  {sel:'#cfg',t:'Enter API keys',d:'In Settings, open a provider, paste the API key (or check the server address for local providers), then click Test connection.',act:{label:'Open Settings',run:()=>openSettings(),until:'#dlg'}},
  {sel:'#mdl',t:'Choose a model',d:'Click this field to see all models from the provider, or type a model name yourself. The Load models button refreshes the list.'},
  {sel:'#opt',t:'Options for each tab',d:'The contents adapt to the tab: system prompt, image attachments, MCP tools, or web search for Research.'},
  {sel:'#advBox',t:'Image and video settings',d:'In the Image and Video tabs, open this panel to set size, count, steps, seed, CFG, sampler, LoRA, duration, aspect ratio, and more. The options shown depend on the provider.'},
  {sel:'#composer',t:'Write a prompt',d:'Type a message and press Enter (Shift+Enter for a new line). The Send button changes to Stop while the model is answering.'},
  {t:'Actions below replies',d:'After the model answers, Copy, Read aloud, and Retry prompt buttons appear below the last reply. Retry uses the currently selected model, so it is handy for comparing models.'},
  {sel:'a[href="models.html"]',t:'Local models',d:'View your PC specifications, get recommendations for local models that fit, and search Hugging Face without leaving the app.'},
  {sel:'a[aria-label="Back to main menu"]',t:'Main menu',d:'Return to the homepage at any time.'},
  {sel:'#acct',t:'Account (optional)',d:'Sign in or register to sync settings across devices. Requires a local server: run python server.py.'},
  {sel:'#tourBtn',t:'Done',d:'You are ready to use the app. Open this tutorial again at any time with this button.'}
];
const TOUR_KEY='luna.tour'; // localStorage: 'done' after the tutorial is finished or skipped
let ti=-1,tctl=null,tpause=false;
const T=id=>document.getElementById(id);

/* Build the overlay once: highlight hole (#tHole, a large shadow darkening the rest) and explanation card (#tTip) */
function tourBuild(){
  if(T('tour'))return;
  const d=document.createElement('div');d.id='tour';d.className='hidden';
  d.innerHTML=`<div id="tHole" class="pointer-events-none fixed z-50 rounded-lg transition-all duration-200"></div>
  <div id="tTip" role="dialog" aria-label="Tutorial" aria-live="polite" class="fixed z-[60] w-[min(340px,92vw)] rounded-xl border border-bd bg-sf p-4 text-tx shadow-xl">
    <div class="flex items-start justify-between gap-2"><b id="tT" class="text-base"></b><span id="tN" class="shrink-0 text-xs text-mu"></span></div>
    <p id="tD" class="mt-1.5 text-sm"></p>
    <p id="tH" class="mt-1.5 hidden text-sm font-medium text-ac"></p>
    <div id="tA" class="mt-2.5 hidden"></div>
    <div class="mt-3 flex items-center justify-between gap-2">
      <button id="tSkip" type="button" class="text-sm text-mu hover:text-tx">Skip</button>
      <div class="flex gap-2"><button id="tBack" type="button" class="btn">Back</button><button id="tNext" type="button" class="btn btn-pri">Next</button></div>
    </div>
    <div id="tDots" class="mt-3 flex justify-center gap-1.5"></div>
  </div>`;
  document.body.append(d);
  T('tSkip').onclick=tourEnd;T('tBack').onclick=()=>tourGo(-1);T('tNext').onclick=()=>tourGo(1);
}
const tourOk=j=>!TOUR[j].sel||!!document.querySelector(TOUR[j].sel)?.getClientRects().length; // element visible?

/* Move between steps (dir = +1 forward, -1 back); steps without a visible target are skipped */
function tourGo(dir){
  let j=ti+dir;
  while(j>=0&&j<TOUR.length&&!tourOk(j))j+=dir;
  if(j>=TOUR.length)return tourEnd();
  if(j>=0)tourShow(j);
}
function tourShow(i){
  tctl?.abort();tctl=new AbortController();ti=i;
  const s=TOUR[i],el=s.sel&&document.querySelector(s.sel);
  T('tT').textContent=s.t;T('tD').textContent=s.d;T('tN').textContent=`${i+1} / ${TOUR.length}`;
  T('tH').textContent=s.hint||'';T('tH').classList.toggle('hidden',!s.hint);
  T('tBack').disabled=i==0;T('tBack').classList.toggle('opacity-40',i==0);
  T('tNext').textContent=i==TOUR.length-1?'Done':'Next';
  T('tDots').innerHTML=TOUR.map((_,k)=>`<i class="h-1.5 w-1.5 rounded-full ${k==i?'bg-ac':'bg-bd'}"></i>`).join('');
  const a=T('tA');a.classList.toggle('hidden',!s.act);a.innerHTML=s.act?`<button id="tAct" type="button" class="btn">${s.act.label}</button>`:'';
  if(s.act)T('tAct').onclick=()=>tourPause(s.act); // action: hide the tutorial until the dialog closes
  if(s.wait&&el)el.addEventListener(s.wait,()=>setTimeout(()=>{if(ti==i&&!tpause)tourGo(1)},350),{signal:tctl.signal,once:true}); // interactive: advance after trying
  tourPos();T('tNext').focus();
}
function tourPause(act){
  tpause=true;T('tour').classList.add('hidden');
  document.querySelector(act.until).addEventListener('close',()=>{tpause=false;T('tour').classList.remove('hidden');tourGo(1)},{once:true});
  act.run();
}

/* Position the highlight on the target element and the card below/above it (or centered when there is no target) */
function tourPos(){
  if(ti<0||tpause)return;
  const s=TOUR[ti],el=s.sel&&document.querySelector(s.sel),h=T('tHole'),tip=T('tTip'),vw=innerWidth,vh=innerHeight,pad=6,dim='0 0 0 9999px rgba(0,0,0,.55)';
  if(el){
    el.scrollIntoView({block:'nearest'});const r=el.getBoundingClientRect(),th=tip.offsetHeight,below=r.bottom+pad+12+th<=vh;
    Object.assign(h.style,{left:r.left-pad+'px',top:r.top-pad+'px',width:r.width+pad*2+'px',height:r.height+pad*2+'px',boxShadow:'0 0 0 2px var(--ac),'+dim});
    tip.style.top=Math.max(8,below?r.bottom+pad+12:r.top-pad-12-th)+'px';
    tip.style.left=Math.max(8,Math.min(r.left,vw-tip.offsetWidth-8))+'px';
  }else{
    Object.assign(h.style,{left:vw/2+'px',top:vh/2+'px',width:'0px',height:'0px',boxShadow:dim});
    tip.style.top=Math.max(8,(vh-tip.offsetHeight)/2)+'px';tip.style.left=Math.max(8,(vw-tip.offsetWidth)/2)+'px';
  }
}
function tourStart(){tourBuild();tpause=false;ti=-1;T('tour').classList.remove('hidden');tourGo(1)}
function tourEnd(){
  tctl?.abort();ti=-1;tpause=false;T('tour')?.classList.add('hidden');
  try{localStorage.setItem(TOUR_KEY,'done')}catch{}
  $('#tourBtn')?.focus();
}
addEventListener('resize',tourPos);addEventListener('scroll',tourPos,true);
addEventListener('keydown',e=>{
  if(ti<0||tpause||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;
  if(e.key=='Escape'){e.preventDefault();tourEnd()}else if(e.key=='ArrowRight')tourGo(1);else if(e.key=='ArrowLeft')tourGo(-1);
});
$('#tourBtn').onclick=tourStart;
if(!localStorage.getItem(TOUR_KEY))setTimeout(tourStart,600); // first visit
