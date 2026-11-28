/* theme.js — APPEARANCE: light/dark mode, accent color, and animated backgrounds.
   Defaults are {mode:'system', effect:'none'}, so the app looks exactly as before until you change it.
   Effects are drawn on a fixed canvas behind the page; they pause when the tab is hidden and
   become static when the operating system asks for reduced motion. */
const THEME_DEF={mode:'system',effect:'none',speed:1,intensity:1,accent:''};
const THEME_EFFECTS=[['none','None'],['aurora','Aurora'],['stars','Stars'],['grid','Grid'],['waves','Waves'],['particles','Particles']];
const THEME_PRESETS=[['','Default'],['#6366f1','Indigo'],['#8b5cf6','Violet'],['#0ea5e9','Sky'],['#10b981','Emerald'],['#f43f5e','Rose'],['#f59e0b','Amber']];
const themeCfg=()=>({...THEME_DEF,...(S.theme||{})});
const reducedMotion=()=>matchMedia('(prefers-reduced-motion:reduce)').matches;

function themeIsDark(){
  const t=document.documentElement.dataset.theme;
  return t? t=='dark' : matchMedia('(prefers-color-scheme:dark)').matches;
}
function themeOnColor(hex){
  const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex||'');
  if(!m)return'#fff';
  const r=parseInt(m[1],16),g=parseInt(m[2],16),b=parseInt(m[3],16);
  return(0.299*r+0.587*g+0.114*b)>150?'#0b1020':'#fff';
}
function themeColor(c,a){
  c=(c||'').trim();
  if(c.startsWith('#')){
    let h=c.slice(1);
    if(h.length==3)h=h.split('').map(x=>x+x).join('');
    if(h.length==6)return`rgba(${parseInt(h.slice(0,2),16)},${parseInt(h.slice(2,4),16)},${parseInt(h.slice(4,6),16)},${a})`;
  }
  const m=c.match(/rgba?\(([^)]+)\)/);
  if(m){const p=m[1].split(',').map(x=>parseFloat(x));return`rgba(${p[0]},${p[1]},${p[2]},${a})`}
  return c;
}
function applyTheme(){
  const c=themeCfg(),h=document.documentElement;
  if(c.mode=='light'||c.mode=='dark')h.dataset.theme=c.mode;else delete h.dataset.theme;
  if(c.accent){h.style.setProperty('--ac',c.accent);h.style.setProperty('--on',themeOnColor(c.accent))}
  else{h.style.removeProperty('--ac');h.style.removeProperty('--on')}
  fxApply();
}

/* ---------- animated background ---------- */
const FX={raf:0,type:'none',t:0,t0:0,w:0,h:0,dpr:1,stars:[],parts:[]};
function fxCanvas(){
  let c=document.getElementById('fx');
  if(!c){c=document.createElement('canvas');c.id='fx';c.setAttribute('aria-hidden','true');document.body.prepend(c)}
  return c;
}
function fxSize(c){
  FX.dpr=Math.min(2,window.devicePixelRatio||1);
  FX.w=window.innerWidth;FX.h=window.innerHeight;
  c.width=Math.round(FX.w*FX.dpr);c.height=Math.round(FX.h*FX.dpr);
  const x=c.getContext('2d');x.setTransform(FX.dpr,0,0,FX.dpr,0,0);
  FX.stars=Array.from({length:90},()=>({x:Math.random(),y:Math.random(),z:.35+Math.random()*.9,p:Math.random()*Math.PI*2}));
  FX.parts=Array.from({length:48},()=>({x:Math.random(),y:Math.random(),vx:(Math.random()-.5)*.012,vy:(Math.random()-.5)*.012,r:1+Math.random()*1.6}));
}
function fxStop(){
  if(FX.raf)cancelAnimationFrame(FX.raf);
  FX.raf=0;FX.type='none';
  const c=document.getElementById('fx');
  if(c){c.classList.remove('on');const x=c.getContext('2d');x.clearRect(0,0,c.width,c.height)}
  document.body.classList.remove('fx-on');
}
function fxApply(){
  const c=themeCfg();
  if(c.effect=='none'){fxStop();return}
  const cv=fxCanvas();
  cv.classList.add('on');document.body.classList.add('fx-on');
  if(FX.raf)cancelAnimationFrame(FX.raf);
  FX.type=c.effect;FX.t0=performance.now();FX.t=0;fxSize(cv);
  const loop=ts=>{
    if(FX.type=='none')return;
    FX.t=(ts-FX.t0)/1000;
    if(!document.hidden)fxDraw();
    FX.raf=reducedMotion()?0:requestAnimationFrame(loop);
  };
  FX.raf=requestAnimationFrame(loop);
}
function fxDraw(){
  const cv=document.getElementById('fx');if(!cv)return;
  const x=cv.getContext('2d'),w=FX.w,h=FX.h,dark=themeIsDark(),c=themeCfg();
  const accent=getComputedStyle(document.documentElement).getPropertyValue('--ac').trim()||'#3f4fd8';
  const speed=Math.max(.1,+c.speed||1),intensity=Math.max(.1,+c.intensity||1),t=FX.t;
  x.clearRect(0,0,w,h);
  if(FX.type=='aurora'){
    const cols=[accent,dark?'#7c3aed':'#a5b4fc',dark?'#0891b2':'#bae6fd'];
    for(let i=0;i<3;i++){
      const px=w*(.5+Math.sin(t*.10*speed+i*2.1)*.28),py=h*(.5+Math.cos(t*.08*speed+i*1.7)*.30);
      const r=Math.min(w,h)*(.34+.10*Math.sin(t*.12*speed+i))*(.85+.35*intensity);
      const g=x.createRadialGradient(px,py,0,px,py,r);
      g.addColorStop(0,themeColor(cols[i],.20*intensity));g.addColorStop(1,themeColor(cols[i],0));
      x.fillStyle=g;x.fillRect(0,0,w,h);
    }
  }else if(FX.type=='stars'){
    const col=dark?'#e2e8f0':'#334155';
    for(const s of FX.stars){
      const py=(s.y+t*.008*speed*s.z)%1,px=(s.x+t*.0015*speed)%1;
      const a=(.20+.60*Math.abs(Math.sin(t*.7+s.p)))*intensity,sz=s.z*1.5;
      x.fillStyle=themeColor(col,Math.min(1,a));x.fillRect(px*w,py*h,sz,sz);
    }
  }else if(FX.type=='grid'){
    const horizon=h*.56,glow=x.createLinearGradient(0,horizon-90,0,horizon+30);
    glow.addColorStop(0,themeColor(accent,0));glow.addColorStop(.5,themeColor(accent,.16*intensity));glow.addColorStop(1,themeColor(accent,0));
    x.fillStyle=glow;x.fillRect(0,horizon-90,w,120);
    x.strokeStyle=themeColor(accent,.20*intensity);x.lineWidth=1;
    for(let i=-12;i<=12;i++){x.beginPath();x.moveTo(w/2,horizon);x.lineTo(w/2+i*(w/9),h);x.stroke()}
    for(let k=0;k<14;k++){
      const z=((k+t*.25*speed)%14)/14,y=horizon+(h-horizon)*z*z;
      x.strokeStyle=themeColor(accent,(.05+.18*z)*intensity);x.beginPath();x.moveTo(0,y);x.lineTo(w,y);x.stroke();
    }
  }else if(FX.type=='waves'){
    for(let i=0;i<3;i++){
      x.beginPath();
      for(let px=0;px<=w;px+=6){
        const py=h*(.30+i*.16)+Math.sin(px*.006+t*(1.1+i*.25)*speed+i)*h*(.035+.015*i)*(.8+.4*intensity);
        px?x.lineTo(px,py):x.moveTo(px,py);
      }
      x.strokeStyle=themeColor(accent,(.20-i*.04)*intensity);x.lineWidth=1.4;x.stroke();
    }
  }else if(FX.type=='particles'){
    const pos=[];
    for(const p of FX.parts){
      const px=((p.x+t*p.vx*speed)%1+1)%1,py=((p.y+t*p.vy*speed)%1+1)%1;
      pos.push([px*w,py*h,p.r]);
      x.fillStyle=themeColor(accent,.55*intensity);x.beginPath();x.arc(px*w,py*h,p.r,0,7);x.fill();
    }
    for(let i=0;i<pos.length;i++)for(let j=i+1;j<pos.length;j++){
      const dx=pos[i][0]-pos[j][0],dy=pos[i][1]-pos[j][1],d=Math.hypot(dx,dy);
      if(d<130){x.strokeStyle=themeColor(accent,(1-d/130)*.18*intensity);x.lineWidth=1;x.beginPath();x.moveTo(pos[i][0],pos[i][1]);x.lineTo(pos[j][0],pos[j][1]);x.stroke()}
    }
  }
}
window.addEventListener('resize',()=>{if(FX.type!='none'){const c=document.getElementById('fx');if(c){fxSize(c);if(reducedMotion())fxDraw()}}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&FX.type!='none'&&!FX.raf)fxApply()});

/* ---------- settings panel (Settings > Appearance) ---------- */
function renderTheme(){
  const box=$('#pvs');if(!box)return;
  const c=themeCfg();
  const modeOpts=[['system','Follow the system'],['light','Light'],['dark','Dark']];
  const effectBtns=THEME_EFFECTS.map(([v,n])=>`<button type="button" data-th-effect="${v}" class="btn px-2 py-1.5 text-sm ${c.effect==v?'border-ac font-semibold text-ac':''}">${n}</button>`).join('');
  const swatches=THEME_PRESETS.map(([v,n])=>`<button type="button" data-th-accent="${v}" title="${n}" aria-label="${n}" class="h-7 w-7 rounded-full border ${v?'border-bd':'border-dashed border-mu'} ${c.accent==v?'ring-2 ring-ac ring-offset-2 ring-offset-sf':''}" style="${v?`background:${v}`:'background:linear-gradient(135deg,var(--sf) 45%,var(--mu) 45%,var(--mu) 55%,var(--sf) 55%)'}"></button>`).join('');
  box.innerHTML=`<div class="grid gap-3">
    <div class="rounded-lg border border-bd p-3"><b class="text-sm">Color mode</b><p class="mb-2 mt-0.5 text-xs text-mu">The default follows your operating system.</p>
      <select id="thMode" class="field w-full text-sm">${modeOpts.map(([v,n])=>`<option value="${v}" ${c.mode==v?'selected':''}>${n}</option>`).join('')}</select></div>
    <div class="rounded-lg border border-bd p-3"><b class="text-sm">Animated background</b><p class="mb-2 mt-0.5 text-xs text-mu">Decorative only. Default is None, so the original appearance is unchanged.</p>
      <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3">${effectBtns}</div></div>
    <div class="rounded-lg border border-bd p-3"><b class="text-sm">Accent color</b><p class="mb-2 mt-0.5 text-xs text-mu">Default uses the original palette.</p>
      <div class="flex flex-wrap items-center gap-2">${swatches}<label class="ml-1 flex items-center gap-1.5 text-xs text-mu">Custom<input id="thAccent" type="color" value="${c.accent||'#3f4fd8'}" class="h-7 w-9 cursor-pointer rounded border border-bd bg-sf p-0.5"></label></div></div>
    <div class="grid gap-3 rounded-lg border border-bd p-3 sm:grid-cols-2">
      <label class="grid gap-1 text-sm"><span class="flex justify-between text-xs text-mu"><span>Animation speed</span><b id="thSpeedV" class="text-tx">${(+c.speed).toFixed(1)}×</b></span><input id="thSpeed" type="range" min="0.2" max="3" step="0.1" value="${c.speed}" class="accent-ac"></label>
      <label class="grid gap-1 text-sm"><span class="flex justify-between text-xs text-mu"><span>Intensity</span><b id="thIntV" class="text-tx">${(+c.intensity).toFixed(1)}×</b></span><input id="thIntensity" type="range" min="0.2" max="2" step="0.1" value="${c.intensity}" class="accent-ac"></label>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2"><p class="text-xs text-mu">Effects pause when this tab is hidden and become static with reduced motion.</p><button type="button" id="thReset" class="btn text-sm">Reset appearance</button></div>
  </div>`;
}
function themeSet(k,v,rerender){
  S.theme={...themeCfg(),[k]:v};save();applyTheme();
  if(rerender)renderTheme();
}
document.addEventListener('change',e=>{
  if(e.target.id=='thMode')themeSet('mode',e.target.value,false);
  else if(e.target.id=='thAccent')themeSet('accent',e.target.value,false);
  else if(e.target.id=='thSpeed'){themeSet('speed',+e.target.value,false);$('#thSpeedV').textContent=(+e.target.value).toFixed(1)+'×'}
  else if(e.target.id=='thIntensity'){themeSet('intensity',+e.target.value,false);$('#thIntV').textContent=(+e.target.value).toFixed(1)+'×'}
});
document.addEventListener('input',e=>{
  if(e.target.id=='thSpeed'){const v=+e.target.value;S.theme={...themeCfg(),speed:v};applyTheme();$('#thSpeedV').textContent=v.toFixed(1)+'×'}
  else if(e.target.id=='thIntensity'){const v=+e.target.value;S.theme={...themeCfg(),intensity:v};applyTheme();$('#thIntV').textContent=v.toFixed(1)+'×'}
});
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-th-effect],[data-th-accent],#thReset');if(!b)return;
  if(b.id=='thReset'){S.theme={mode:'system',effect:'none',speed:1,intensity:1,accent:''};save();applyTheme();renderTheme()}
  else if(b.dataset.thEffect!=null)themeSet('effect',b.dataset.thEffect,true);
  else if(b.dataset.thAccent!=null)themeSet('accent',b.dataset.thAccent,true);
});

applyTheme();
