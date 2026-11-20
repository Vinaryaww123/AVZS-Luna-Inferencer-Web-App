/* tour.js — TUTORIAL INTERAKTIF (sorotan + langkah demi langkah).
   Ubah isi tutorial di array TOUR. Tiap langkah:
     sel   selector CSS elemen yang disorot (kosong = pesan di tengah layar). Langkah dilewati bila elemennya tidak tampil.
     t, d  judul dan isi
     hint  (opsional) ajakan untuk mencoba langsung
     wait  (opsional) 'click' atau 'change': tutorial maju sendiri setelah Anda mencoba elemen itu
     act   (opsional) tombol aksi {label, run, until}: menjalankan sesuatu (mis. membuka Pengaturan);
           tutorial disembunyikan sementara dan dilanjutkan saat elemen `until` (dialog) ditutup
   Tampil otomatis pada kunjungan pertama. Buka lagi lewat tombol "Tutorial" di header.
   Pintasan: panah kiri/kanan = mundur/maju, Esc = lewati. */
const TOUR=[
  {t:'Selamat datang',d:'Tutorial singkat ini memandu Anda memakai aplikasi langkah demi langkah. Anda bisa melewatinya kapan saja.'},
  {sel:'#nav',t:'Pilih jenis tugas',d:'Chat untuk percakapan, Coder untuk pemrograman, Multimodal untuk bertanya soal gambar, Riset untuk laporan terstruktur, lalu Gambar dan Video untuk membuat media.',hint:'Coba klik salah satu tab sekarang.',wait:'click'},
  {sel:'#prov',t:'Pilih provider',d:'Cloud (OpenAI, Anthropic, Google, dan lainnya) butuh kunci API. Lokal (Ollama, LM Studio, dan lainnya) berjalan di komputer Anda.',hint:'Coba pilih provider lain.',wait:'change'},
  {sel:'#cfg',t:'Isi kunci API',d:'Di Pengaturan, buka satu provider, tempel kunci API (atau cek alamat server untuk provider lokal), lalu tekan Tes koneksi.',act:{label:'Buka Pengaturan',run:()=>openSettings(),until:'#dlg'}},
  {sel:'#mdl',t:'Pilih model',d:'Klik kolom ini untuk melihat semua model dari provider, atau ketik nama model sendiri. Tombol Muat model menyegarkan daftarnya.'},
  {sel:'#opt',t:'Opsi tiap tab',d:'Isinya menyesuaikan tab: system prompt, lampiran gambar, Alat MCP, atau web search untuk Riset.'},
  {sel:'#advBox',t:'Pengaturan gambar dan video',d:'Di tab Gambar dan Video, buka panel ini untuk mengatur ukuran, jumlah, steps, seed, CFG, sampler, LoRA, durasi, rasio, dan lainnya. Opsi yang tampil menyesuaikan provider.'},
  {sel:'#composer',t:'Tulis prompt',d:'Ketik pesan lalu tekan Enter (Shift+Enter untuk baris baru). Tombol Kirim berubah menjadi Berhenti saat model sedang menjawab.'},
  {t:'Aksi di bawah balasan',d:'Setelah model menjawab, tombol Salin, Bacakan, dan Ulangi prompt muncul di balasan terakhir. Ulangi memakai model yang sedang dipilih, jadi cocok untuk membandingkan model.'},
  {sel:'a[href="models.html"]',t:'Model lokal',d:'Lihat spesifikasi PC Anda, dapatkan rekomendasi model lokal yang cocok, dan cari model di Hugging Face tanpa keluar dari aplikasi.'},
  {sel:'a[aria-label="Kembali ke menu utama"]',t:'Menu utama',d:'Kembali ke homepage kapan saja.'},
  {sel:'#acct',t:'Akun (opsional)',d:'Masuk atau daftar untuk menyinkronkan pengaturan antar perangkat. Butuh server lokal: jalankan python server.py.'},
  {sel:'#tourBtn',t:'Selesai',d:'Anda siap memakai aplikasi. Buka tutorial ini lagi kapan saja lewat tombol ini.'}
];
const TOUR_KEY='luna.tour'; // localStorage: 'done' setelah tutorial selesai atau dilewati
let ti=-1,tctl=null,tpause=false;
const T=id=>document.getElementById(id);

/* Bangun overlay sekali: lubang sorotan (#tHole, bayangan besar menggelapkan sisanya) dan kartu penjelasan (#tTip) */
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
      <button id="tSkip" type="button" class="text-sm text-mu hover:text-tx">Lewati</button>
      <div class="flex gap-2"><button id="tBack" type="button" class="btn">Kembali</button><button id="tNext" type="button" class="btn btn-pri">Lanjut</button></div>
    </div>
    <div id="tDots" class="mt-3 flex justify-center gap-1.5"></div>
  </div>`;
  document.body.append(d);
  T('tSkip').onclick=tourEnd;T('tBack').onclick=()=>tourGo(-1);T('tNext').onclick=()=>tourGo(1);
}
const tourOk=j=>!TOUR[j].sel||!!document.querySelector(TOUR[j].sel)?.getClientRects().length; // elemen tampil?

/* Pindah langkah (dir = +1 maju, -1 mundur); langkah tanpa target tampil dilewati */
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
  T('tNext').textContent=i==TOUR.length-1?'Selesai':'Lanjut';
  T('tDots').innerHTML=TOUR.map((_,k)=>`<i class="h-1.5 w-1.5 rounded-full ${k==i?'bg-ac':'bg-bd'}"></i>`).join('');
  const a=T('tA');a.classList.toggle('hidden',!s.act);a.innerHTML=s.act?`<button id="tAct" type="button" class="btn">${s.act.label}</button>`:'';
  if(s.act)T('tAct').onclick=()=>tourPause(s.act); // aksi: sembunyikan tutorial sampai dialog ditutup
  if(s.wait&&el)el.addEventListener(s.wait,()=>setTimeout(()=>{if(ti==i&&!tpause)tourGo(1)},350),{signal:tctl.signal,once:true}); // interaktif: maju setelah dicoba
  tourPos();T('tNext').focus();
}
function tourPause(act){
  tpause=true;T('tour').classList.add('hidden');
  document.querySelector(act.until).addEventListener('close',()=>{tpause=false;T('tour').classList.remove('hidden');tourGo(1)},{once:true});
  act.run();
}

/* Letakkan sorotan di elemen target dan kartu di bawah/atas target (atau di tengah bila tanpa target) */
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
if(!localStorage.getItem(TOUR_KEY))setTimeout(tourStart,600); // kunjungan pertama
