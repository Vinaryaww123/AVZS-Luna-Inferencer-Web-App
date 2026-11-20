/* auth.js — AKUN (sisi aplikasi): status masuk, sinkron pengaturan, tombol Masuk/Keluar, dan fungsi api().
   Halaman masuk/daftar ada di login.html (js/login.js). Butuh server: python server.py. Tanpa server aplikasi tetap jalan tanpa akun.
   Aturan sinkron: masuk ke akun lama = pengaturan lokal diganti data akun; akun baru = membawa pengaturan lokal;
   keluar = pengaturan lokal dihapus dari browser (data tetap aman di akun). */
const AUTH={server:false,user:null}; // server: true bila server akun terdeteksi
function go(u){location.href=u}      // pindah halaman
async function api(path,body,method){
  const r=await fetch('/api/'+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,credentials:'same-origin'});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(j.error||'Error '+r.status),{status:r.status,data:j});
  return j;
}

/* Kirim pengaturan ke server (ditunda 0,8 dtk). Dipanggil oleh save() di config.js. */
let syncT;
function syncUp(){if(!AUTH.user)return;clearTimeout(syncT);syncT=setTimeout(()=>api('data',{data:S},'PUT').catch(()=>{}),800)}

/* Hanya di halaman aplikasi (yang punya tombol #acct) */
if($('#acct')){
  const renderAcct=()=>$('#acct').textContent=AUTH.user?`Keluar (${AUTH.user})`:'Masuk';
  /* Cek status saat halaman dibuka. 401 = server ada tapi belum masuk (mode tamu); error lain = tanpa server. */
  (async()=>{
    try{
      AUTH.user=(await api('me')).username;AUTH.server=true;
      const r=(await api('data')).data;
      if(r&&JSON.stringify(r)!==localStorage.getItem(LS)){localStorage.setItem(LS,JSON.stringify(r));location.reload();return} // data akun lebih baru
      if(!r)await api('data',{data:S},'PUT');
    }catch(e){AUTH.server=e.status==401}
    renderAcct();
  })();
  /* Tombol di header: keluar bila sudah masuk, selain itu ke halaman login */
  $('#acct').onclick=async()=>{
    if(AUTH.user){await api('logout',{}).catch(()=>{});localStorage.removeItem(LS);document.cookie='guest=; Max-Age=0; Path=/';go('login.html');return}
    if(!AUTH.server)return alert('Fitur akun butuh server lokal. Jalankan "python server.py", lalu buka http://localhost:3000/login.html');
    go('login.html?next=app.html');
  };
}
