const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
let session=null,clients=[],activeClient=null,activeDetail=null,editing=null;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
const fmt=n=>{const x=Number(String(n??"").replace(/\s/g,"").replace(",","."));return Number.isFinite(x)?new Intl.NumberFormat("ru-RU",{maximumFractionDigits:1}).format(x):"—"};
async function api(url,opt={}){const r=await fetch(url,{headers:{"Content-Type":"application/json",...(opt.headers||{})},...opt});const data=await r.json().catch(()=>({}));if(r.status===401){showLogin();throw new Error("auth")}if(!r.ok)throw new Error(data.error||"Ошибка");return data}
function setTheme(t){document.documentElement.dataset.theme=t;localStorage.setItem("b97-theme",t);$("#themeBtn").innerHTML=(t==="dark"?'☼ <span>Светлая тема</span>':'☾ <span>Тёмная тема</span>')}
setTheme(localStorage.getItem("b97-theme")||"dark");$("#themeBtn").onclick=()=>setTheme(document.documentElement.dataset.theme==="dark"?"light":"dark");
setTimeout(()=>{if(!session)$("#loginView").classList.remove("hidden")},2300);
async function boot(){try{session=await api("/api/session");showApp();await loadClients()}catch{$("#loginView").classList.remove("hidden")}}
function showLogin(){session=null;$("#appView").classList.add("hidden");$("#loginView").classList.remove("hidden")}
function showApp(){$("#loginView").classList.add("hidden");$("#appView").classList.remove("hidden");$("#who").textContent=session.username;$("#userInitial").textContent=session.username[0].toUpperCase();$("#roleText").textContent=session.role==="developer"?"Разработчик":"Просмотр";$("#adminBtn").style.display=session.role==="developer"?"flex":"none"}
$("#loginForm").onsubmit=async e=>{e.preventDefault();$("#loginError").textContent="";try{session=await api("/api/login",{method:"POST",body:JSON.stringify({username:$("#loginUser").value,password:$("#loginPass").value})});showApp();await loadClients()}catch(err){$("#loginError").textContent=err.message}};
$("#logoutBtn").onclick=async()=>{try{await api("/api/logout",{method:"POST"})}catch{}showLogin()};
$("#refreshBtn").onclick=loadClients;
function statusWarn(c){return /провер|долг|вним|ошиб|нет|-/i.test(String(c.status||""))&&String(c.status||"").trim()!==""}
async function loadClients(){try{const d=await api("/api/clients");clients=d.clients;$("#syncText").textContent="Синхронизировано: "+new Date(d.syncedAt).toLocaleString("ru-RU");renderDashboard();renderClients()}catch(e){$("#syncText").textContent=e.message}}
function renderDashboard(){
  $("#mClients").textContent=clients.length;
  $("#mArea").textContent=fmt(clients.reduce((s,c)=>s+(Number(String(c.area).replace(",","."))||0),0));
  const warn=clients.filter(statusWarn).length;$("#mAttention").textContent=warn;$("#logicWarn").textContent=warn;$("#logicClean").textContent=Math.max(0,clients.length-warn);
  const floors=[...new Set(clients.map(c=>String(c.floor).trim()).filter(Boolean))].sort((a,b)=>(Number(b)||0)-(Number(a)||0));$("#logicFloors").textContent=floors.length;
  $("#floorFilter").innerHTML='<option value="">Все этажи</option>'+floors.map(f=>'<option>'+esc(f)+'</option>').join("");
  const numeric=[...new Set(floors.filter(x=>/^\d+$/.test(x)).map(Number))].sort((a,b)=>b-a);
  $("#building").innerHTML=(numeric.length?numeric:[8,7,6,5,4,3,2,1]).map(f=>{const count=clients.filter(c=>String(c.floor).trim()===String(f)).length;return '<div class="floor"><button data-floor="'+esc(f)+'">'+f+' ЭТАЖ · '+count+'</button><div class="units">'+Array.from({length:Math.max(1,Math.min(count,8))},()=>'<i class="unit"></i>').join("")+'</div></div>'}).join("");
  $$("#building [data-floor]").forEach(b=>b.onclick=()=>{$("#floorFilter").value=b.dataset.floor;renderClients();$("#search").scrollIntoView({behavior:"smooth",block:"center"})});
}
function renderClients(){
  const q=$("#search").value.toLowerCase().trim(),floor=$("#floorFilter").value;
  const rows=clients.filter(c=>(!floor||String(c.floor).trim()===floor)&&(!q||[c.name,c.contract,c.phone,c.rma].join(" ").toLowerCase().includes(q)));
  $("#clientRows").innerHTML=rows.map(c=>'<tr data-num="'+esc(c.num)+'"><td><div class="client-main"><span class="avatar">'+esc((c.name||"?")[0])+'</span><div><b>'+esc(c.name||"Без имени")+'</b><small>'+esc(c.phone||"Телефон не указан")+'</small></div></div></td><td>'+esc(c.contract||"—")+'</td><td>'+esc(c.floor||"—")+'</td><td>'+esc(c.area||"—")+' м²</td><td>'+esc(c.total||"—")+' '+esc(c.currency||"")+'</td><td><span class="badge '+(statusWarn(c)?"warn":"")+'">'+esc(c.status||"Внесено")+'</span></td></tr>').join("");
  $$("#clientRows tr").forEach(r=>r.onclick=()=>openClient(r.dataset.num));
}
$("#search").oninput=renderClients;$("#floorFilter").onchange=renderClients;
async function openClient(num){
  activeClient=clients.find(c=>String(c.num)===String(num));if(!activeClient)return;
  $("#drawerOverlay").classList.remove("hidden");$("#drawerContent").innerHTML='<div class="empty">Загрузка карточки…</div>';
  try{activeDetail=await api("/api/client/"+encodeURIComponent(num));renderDrawer()}catch(e){$("#drawerContent").innerHTML='<div class="empty">'+esc(e.message)+'</div>'}
}
function renderDrawer(){
  const c=activeClient,d=activeDetail,info=[["ФИО",c.name],["Договор",c.contract],["Этаж",c.floor],["Площадь",c.area?c.area+" м²":""],["Цена / м²",c.price],["Стоимость",c.total],["Паспорт",c.passport],["РМА / ИНН",c.rma],["Телефон",c.phone],...d.info.map(x=>[x.label,x.value])];
  $("#drawerContent").innerHTML='<div class="eyebrow">КАРТОЧКА КЛИЕНТА · №'+esc(c.num)+'</div><h2>'+esc(c.name)+'</h2><div class="drawer-sub">'+esc(c.contract)+' · '+esc(d.sheet)+'</div><div class="info-grid">'+info.filter(x=>x[1]).map(x=>'<div><small>'+esc(x[0])+'</small><b>'+esc(x[1])+'</b></div>').join("")+'</div>'+(d.control?.length?'<div class="info-grid">'+d.control.map(x=>'<div><small>'+esc(x.label)+'</small><b>'+esc(x.value)+'</b></div>').join("")+'</div>':'')+'<div class="pay-head"><h3>История платежей</h3>'+(session.role==="developer"?'<button id="addPay" class="outline">+ Добавить</button>':'')+'</div><div class="payments">'+(d.payments.length?d.payments.map(p=>'<div class="pay"><div><b>'+esc(p.date||"Без даты")+'</b><small>'+esc(p.note||"")+'</small></div><div><b>'+esc(p.usd||"—")+' USD</b><small>Курс: '+esc(p.rate||"—")+'</small></div><div><b>'+esc(p.tjs||"—")+' TJS</b><small>'+esc(p.check||"")+'</small></div>'+(session.role==="developer"?'<button data-pay="'+esc(p.id)+'">Изменить</button>':'')+'</div>').join(""):'<div class="empty">Платежи в этой карточке пока не заполнены</div>')+'</div>';
  if(session.role==="developer"){$("#addPay").onclick=()=>editPayment(null);$$("[data-pay]").forEach(b=>b.onclick=()=>editPayment(d.payments.find(p=>p.id===b.dataset.pay)))}
}
function editPayment(p){editing=p||{id:"",date:"",usd:"",rate:"",tjs:"",note:"",check:""};$("#paymentTitle").textContent=p?"Редактирование платежа":"Новый платёж";$("#pDate").value=editing.date||"";$("#pUsd").value=editing.usd||"";$("#pRate").value=editing.rate||"";$("#pTjs").value=editing.tjs||"";$("#pNote").value=editing.note||"";$("#pCheck").value=editing.check||"";$("#deletePay").style.visibility=p?"visible":"hidden";$("#paymentOverlay").classList.remove("hidden")}
$("#paymentForm").onsubmit=async e=>{e.preventDefault();await savePayment(false)};
$("#deletePay").onclick=()=>savePayment(true);
async function savePayment(deleted){try{await api("/api/payments",{method:"POST",body:JSON.stringify({clientNum:activeClient.num,id:editing.id||undefined,date:$("#pDate").value,usd:$("#pUsd").value,rate:$("#pRate").value,tjs:$("#pTjs").value,note:$("#pNote").value,check:$("#pCheck").value,deleted})});$("#paymentOverlay").classList.add("hidden");activeDetail=await api("/api/client/"+activeClient.num);renderDrawer()}catch(e){alert(e.message)}}
$$("[data-close]").forEach(b=>b.onclick=()=>$("#"+b.dataset.close+"Overlay").classList.add("hidden"));$("#drawerOverlay").onclick=e=>{if(e.target===$("#drawerOverlay"))$("#drawerOverlay").classList.add("hidden")};
$("#adminBtn").onclick=()=>{openAdmin();$("#adminOverlay").classList.remove("hidden")};
$$(".tabs button").forEach(b=>b.onclick=()=>{$$(".tabs button").forEach(x=>x.classList.remove("active"));b.classList.add("active");$("#usersTab").classList.toggle("hidden",b.dataset.tab!=="users");$("#activityTab").classList.toggle("hidden",b.dataset.tab!=="activity");if(b.dataset.tab==="activity")loadActivity()});
async function openAdmin(){try{const d=await api("/api/admin/users");$("#userList").innerHTML=d.users.map(u=>'<div class="user-row"><span class="avatar">'+esc(u.username[0].toUpperCase())+'</span><div><b>'+esc(u.username)+'</b><small>'+(u.role==="developer"?"Разработчик":"Только просмотр")+'</small></div><div><b>'+(u.lastSeen?new Date(u.lastSeen).toLocaleString("ru-RU"):"Не в сети")+'</b><small>'+(u.active?"Доступ активен":"Отключён")+'</small></div>'+(u.protected?'<span class="badge">основной</span>':'<button class="toggle-access" data-user="'+esc(u.username)+'" data-active="'+(!u.active)+'">'+(u.active?"Отключить":"Включить")+'</button>')+'</div>').join("");$$("[data-user]").forEach(b=>b.onclick=async()=>{await api("/api/admin/users/"+encodeURIComponent(b.dataset.user),{method:"PATCH",body:JSON.stringify({active:b.dataset.active==="true"})});openAdmin()})}catch(e){$("#adminError").textContent=e.message}}
$("#createUserForm").onsubmit=async e=>{e.preventDefault();$("#adminError").textContent="";try{await api("/api/admin/users",{method:"POST",body:JSON.stringify({username:$("#newUser").value,password:$("#newPass").value,role:$("#newRole").value})});e.target.reset();openAdmin()}catch(err){$("#adminError").textContent=err.message}};
async function loadActivity(){try{const d=await api("/api/admin/activity");$("#activityList").innerHTML=d.activity.map(a=>'<div class="activity-row"><div><b>'+esc(a.username)+' · '+esc(a.action)+'</b><small>'+esc(a.detail||"")+'</small></div><div><code>'+new Date(a.at).toLocaleString("ru-RU")+'</code><small>'+esc(a.ua||"")+'</small></div></div>').join("")||'<div class="empty">История пока пустая</div>'}catch(e){$("#activityList").innerHTML='<div class="empty">'+esc(e.message)+'</div>'}}
boot();