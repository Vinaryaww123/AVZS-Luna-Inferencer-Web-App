/* login.js — halaman masuk/daftar (login.html). Setelah berhasil: sinkron pengaturan lalu pindah ke aplikasi.
   Bergantung pada api() dan go() di js/auth.js serta LS/S di js/config.js. */
const NEXT=(n=>['app.html','models.html'].includes(n)?n:'app.html')(new URLSearchParams(location.search).get('next')); // hanya halaman internal
let kind='login'; // 'login' | 'register'
const msg=(t,c='text-er')=>{const e=$('#lmsg');e.textContent=t;e.className='text-sm '+c;e.classList.toggle('hidden',!t)};

function setKind(k){
  kind=k;
  $('#tLogin').classList.toggle('tab-on',k=='login');$('#tReg').classList.toggle('tab-on',k=='register');
  $('#lp2').parentElement.classList.toggle('hidden',k!='register');$('#lhint').classList.toggle('hidden',k!='register');
  $('#lp').autocomplete=k=='login'?'current-password':'new-password';
  $('#lsubmit').textContent=k=='login'?'Masuk':'Buat akun';
  $('#lsub').textContent=k=='login'?'Masuk untuk melanjutkan ke aplikasi':'Buat akun untuk menyinkronkan pengaturan Anda';
  msg('');
}
$('#tLogin').onclick=()=>setKind('login');
$('#tReg').onclick=()=>setKind('register');
$('#lshow').onchange=e=>['lp','lp2'].forEach(id=>$('#'+id).type=e.target.checked?'text':'password');
$('#guest').href=NEXT;
$('#guest').onclick=()=>{document.cookie='guest=1; Path=/; SameSite=Lax'}; // penanda "tamu": server mengizinkan app.html tanpa login

$('#lform').onsubmit=async e=>{
  e.preventDefault();
  const u=$('#lu').value.trim(),p=$('#lp').value,b=$('#lsubmit'),label=b.textContent;
  if(kind=='register'&&p!==$('#lp2').value)return msg('Konfirmasi kata sandi tidak sama.');
  b.disabled=true;b.textContent='Memproses…';msg('');
  try{
    await api(kind,{username:u,password:p});
    const r=(await api('data')).data;
    if(kind=='login'&&r)localStorage.setItem(LS,JSON.stringify(r)); // akun lama: pakai data akun
    else await api('data',{data:S},'PUT');                          // akun baru: bawa pengaturan lokal
    document.cookie='guest=; Max-Age=0; Path=/';go(NEXT);
  }catch(x){msg(x.message);b.disabled=false;b.textContent=label}
};

/* Saat halaman dibuka: sudah masuk -> langsung ke aplikasi; server tidak ada -> beri petunjuk */
(async()=>{
  try{await api('me');go(NEXT)}
  catch(e){
    if(e.status==401){if(e.data?.allow_guest===false)$('#guestBox').classList.add('hidden')}
    else{
      document.querySelectorAll('#lform input,#lform button,#tLogin,#tReg').forEach(x=>x.disabled=true);
      $('#lform').classList.add('opacity-50');
      msg('Server akun tidak terdeteksi. Jalankan "python server.py", lalu buka http://localhost:3000/login.html. Atau lanjut tanpa akun di bawah.','text-mu');
    }
  }
})();
