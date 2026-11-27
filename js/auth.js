/* auth.js — ACCOUNTS (app side): sign-in status, settings sync, Sign in/Sign out button, and the api() function.
   The sign-in/register page is login.html (js/login.js). Requires a server: python server.py. Without a server, the app still runs without an account.
   Sync rules: signing into an existing account replaces local settings with account data; a new account carries local settings over;
   signing out removes local settings from the browser (data stays safe in the account). */
const AUTH={server:false,user:null,desktop:false}; // server: true when an account server is detected
function go(u){location.href=u}      // navigate to another page
async function api(path,body,method){
  const r=await fetch('/api/'+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,credentials:'same-origin'});
  const j=await r.json().catch(()=>({}));
  if(!r.ok)throw Object.assign(new Error(j.error||'Error '+r.status),{status:r.status,data:j});
  return j;
}

/* Send settings to the server (debounced by 0.8 s). Called by save() in config.js. */
let syncT;
function syncUp(){if(!AUTH.user)return;clearTimeout(syncT);syncT=setTimeout(()=>api('data',{data:S},'PUT').catch(()=>{}),800)}

/* Only on the app page (which has the #acct button) */
if($('#acct')){
  const renderAcct=()=>$('#acct').textContent=AUTH.user?`Sign out (${AUTH.user})`:'Sign in';
  /* Check status when the page opens. 401 = server exists but not signed in (guest mode); other errors = no server. */
  (async()=>{
    try{
      AUTH.user=(await api('me')).username;AUTH.server=true;
      const r=(await api('data')).data;
      if(r&&JSON.stringify(r)!==localStorage.getItem(LS)){localStorage.setItem(LS,JSON.stringify(r));location.reload();return} // account data is newer
      if(!r)await api('data',{data:S},'PUT');
    }catch(e){
      AUTH.server=e.status==401;AUTH.desktop=!!e.data?.desktop;
      if(AUTH.desktop)$('#acct').classList.add('hidden');   // desktop app: no sign-in/account button
    }
    renderAcct();
  })();
  /* Header button: sign out when signed in, otherwise go to the login page */
  $('#acct').onclick=async()=>{
    if(AUTH.user){await api('logout',{}).catch(()=>{});localStorage.removeItem(LS);document.cookie='guest=; Max-Age=0; Path=/';go('login.html');return}
    if(!AUTH.server)return alert('Account features require the server version of this app. Run "python server.py" to use them.');
    go('login.html?next=app.html');
  };
}
