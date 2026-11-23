/* login.js — sign-in/register page (login.html). On success: sync settings, then go to the app.
   Depends on api() and go() in js/auth.js, plus LS/S in js/config.js. */
const NEXT=(n=>['app.html','models.html'].includes(n)?n:'app.html')(new URLSearchParams(location.search).get('next')); // internal pages only
let kind='login'; // 'login' | 'register'
const msg=(t,c='text-er')=>{const e=$('#lmsg');e.textContent=t;e.className='text-sm '+c;e.classList.toggle('hidden',!t)};

function setKind(k){
  kind=k;
  $('#tLogin').classList.toggle('tab-on',k=='login');$('#tReg').classList.toggle('tab-on',k=='register');
  $('#lp2').parentElement.classList.toggle('hidden',k!='register');$('#lhint').classList.toggle('hidden',k!='register');
  $('#lp').autocomplete=k=='login'?'current-password':'new-password';
  $('#lsubmit').textContent=k=='login'?'Sign in':'Create account';
  $('#lsub').textContent=k=='login'?'Sign in to continue to the app':'Create an account to sync your settings';
  msg('');
}
$('#tLogin').onclick=()=>setKind('login');
$('#tReg').onclick=()=>setKind('register');
$('#lshow').onchange=e=>['lp','lp2'].forEach(id=>$('#'+id).type=e.target.checked?'text':'password');
$('#guest').href=NEXT;
$('#guest').onclick=()=>{document.cookie='guest=1; Path=/; SameSite=Lax'}; // "guest" marker: the server allows app.html without sign-in

$('#lform').onsubmit=async e=>{
  e.preventDefault();
  const u=$('#lu').value.trim(),p=$('#lp').value,b=$('#lsubmit'),label=b.textContent;
  if(kind=='register'&&p!==$('#lp2').value)return msg('Password confirmation does not match.');
  b.disabled=true;b.textContent='Processing…';msg('');
  try{
    await api(kind,{username:u,password:p});
    const r=(await api('data')).data;
    if(kind=='login'&&r)localStorage.setItem(LS,JSON.stringify(r)); // existing account: use account data
    else await api('data',{data:S},'PUT');                          // new account: carry local settings over
    document.cookie='guest=; Max-Age=0; Path=/';go(NEXT);
  }catch(x){msg(x.message);b.disabled=false;b.textContent=label}
};

/* When the page opens: already signed in -> go straight to the app; no server -> show instructions */
(async()=>{
  try{await api('me');go(NEXT)}
  catch(e){
    if(e.status==401){if(e.data?.allow_guest===false)$('#guestBox').classList.add('hidden')}
    else{
      document.querySelectorAll('#lform input,#lform button,#tLogin,#tReg').forEach(x=>x.disabled=true);
      $('#lform').classList.add('opacity-50');
      msg('Account server is not available on this site. Run "python server.py" for accounts, or continue without an account below.','text-mu');
    }
  }
})();
