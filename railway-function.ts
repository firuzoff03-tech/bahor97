import { Hono } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { Pool } from "pg";
import { randomBytes, createHash } from "node:crypto";

const app = new Hono();
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 6, idleTimeoutMillis: 30000 });
const SHEET_ID = "1ij6PAL4NPnLrTBUMgnJLiVlkrZ0-KgFOT6HsdS7VAkE";
const ADMIN_USER = process.env.ADMIN_USER || "Developer";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const SESSION_MS = 12 * 60 * 60 * 1000;

const sha = (v:string) => createHash("sha256").update(v).digest("hex");

async function initDb(){
  await pool.query("CREATE TABLE IF NOT EXISTS b97v2_sessions(token_hash TEXT PRIMARY KEY, username TEXT NOT NULL, expires_at BIGINT NOT NULL, created_at BIGINT NOT NULL)");
  await pool.query("DELETE FROM b97v2_sessions WHERE expires_at < $1",[Date.now()]);
  console.log("BAHOR97_V2_READY");
}
await initDb();

function csvParse(text:string){
  const rows:string[][]=[]; let row:string[]=[]; let cell=""; let q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i], n=text[i+1];
    if(q){
      if(c==='"' && n==='"'){cell+='"';i++}
      else if(c==='"') q=false;
      else cell+=c;
    } else {
      if(c==='"') q=true;
      else if(c===','){row.push(cell);cell=""}
      else if(c==='\n'){row.push(cell);rows.push(row);row=[];cell=""}
      else if(c!=='\r') cell+=c;
    }
  }
  row.push(cell); if(row.some(x=>x!=="")) rows.push(row);
  return rows;
}
async function clients(){
  const url=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent("КЛИЕНТЫ")}`;
  const r=await fetch(url,{headers:{"user-agent":"Bahor97CRM/2"}});
  if(!r.ok) throw new Error("Google Sheets "+r.status);
  const rows=csvParse(await r.text());
  const h=rows.findIndex(r=>String(r[0]||"").trim()==="№");
  return rows.slice(h>=0?h+1:1).filter(r=>r.some(x=>String(x||"").trim())).map(r=>({
    num:r[0]||"",name:r[1]||"",contract:r[2]||"",floor:r[3]||"",area:r[4]||"",
    currency:r[5]||"",price:r[6]||"",total:r[7]||"",passport:r[8]||"",rma:r[9]||"",
    phone:r[10]||"",payments:r[11]||"",control:r[12]||""
  })).filter(x=>x.num||x.name);
}
async function auth(c:any){
  const raw=getCookie(c,"b97v2");
  if(!raw) return false;
  const q=await pool.query("SELECT username,expires_at FROM b97v2_sessions WHERE token_hash=$1",[sha(raw)]);
  if(!q.rows.length || Number(q.rows[0].expires_at)<Date.now()) return false;
  return q.rows[0].username;
}
async function needAuth(c:any,next:any){
  const u=await auth(c); if(!u) return c.json({error:"auth"},{status:401});
  c.set("user",u); await next();
}

const page=`<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bahor-97 CRM</title>
<style>
:root{--bg:#071217;--panel:#0c1c23e8;--line:#24404a;--text:#eff6f4;--muted:#8ea1a7;--gold:#d4a85c;--green:#60c493;--red:#df7569}
*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,Arial;background:radial-gradient(circle at 80% 0,#15313c 0,transparent 35%),linear-gradient(135deg,#061116,#0a1a21 55%,#071217);color:var(--text);min-height:100vh}
body:before{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(#ffffff05 1px,transparent 1px),linear-gradient(90deg,#ffffff05 1px,transparent 1px);background-size:36px 36px}
.hidden{display:none!important}.glass{background:var(--panel);border:1px solid var(--line);box-shadow:0 24px 80px #0008;backdrop-filter:blur(18px)}
.login{min-height:100vh;display:grid;place-items:center;padding:24px}.login-card{width:min(460px,94vw);padding:36px;border-radius:24px;position:relative;overflow:hidden}.login-card:before{content:"";position:absolute;right:-35px;top:-20px;width:180px;height:180px;border:1px solid #d4a85c33;transform:rotate(45deg)}
.logo{display:flex;align-items:center;gap:12px}.mark{width:52px;height:52px;border:1px solid #d4a85c88;border-radius:15px;display:grid;place-items:center;color:var(--gold);font-weight:900}.logo b{letter-spacing:.08em}.logo small{display:block;color:var(--muted);font-size:9px;margin-top:4px}.ey{margin-top:32px;color:var(--gold);font-size:10px;letter-spacing:.22em;font-weight:800}.login h1{font-size:38px;line-height:1.05;margin:12px 0}.login p{color:var(--muted);line-height:1.55}.field{display:block;margin-top:15px;font-size:10px;letter-spacing:.12em;color:#a5b5ba}.field input{width:100%;margin-top:7px;padding:14px;border:1px solid var(--line);border-radius:12px;background:#071319;color:white;outline:none}.field input:focus{border-color:#d4a85c88}.primary{width:100%;margin-top:20px;padding:14px;border:0;border-radius:12px;background:var(--gold);color:#101a1f;font-weight:900;cursor:pointer}.err{min-height:22px;color:#ff9a8d;margin-top:10px;font-size:13px}
.app{display:grid;grid-template-columns:240px 1fr;min-height:100vh;position:relative}.side{padding:24px;border-right:1px solid var(--line);background:#07151ae8}.side .logo{margin-bottom:38px}.nav{display:block;width:100%;text-align:left;padding:12px 14px;margin:7px 0;border:1px solid transparent;border-radius:12px;background:transparent;color:#b8c5c9;cursor:pointer}.nav.active{background:#10262e;border-color:#28444f;color:white}.side-foot{position:fixed;bottom:20px;left:20px;width:200px}.logout{width:100%;padding:10px;border:1px solid var(--line);border-radius:10px;background:transparent;color:#c7d2d5;cursor:pointer}
.main{padding:32px 36px}.top{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.top h1{margin:5px 0 0;font-size:32px}.sync{color:var(--muted);font-size:12px;margin-top:8px}.refresh{padding:11px 14px;border-radius:10px;border:1px solid var(--line);background:#0b1c22;color:white;cursor:pointer}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:24px}.card{padding:20px;border-radius:16px}.card small{color:var(--muted);font-size:10px;letter-spacing:.13em}.card strong{display:block;font-size:31px;margin:8px 0 2px}.card span{font-size:12px;color:#90a4aa}
.panel{margin-top:16px;padding:20px;border-radius:18px}.tools{display:flex;justify-content:space-between;gap:14px;align-items:center;margin-bottom:14px}.tools h2{margin:0;font-size:19px}.search{width:min(430px,55vw);padding:11px 13px;border:1px solid var(--line);border-radius:10px;background:#071319;color:white}
table{width:100%;border-collapse:collapse}th,td{padding:12px 10px;border-bottom:1px solid #203740;text-align:left;font-size:13px}th{font-size:10px;color:#789097;letter-spacing:.12em}.row{cursor:pointer}.row:hover{background:#ffffff05}.badge{display:inline-flex;padding:5px 8px;border-radius:999px;background:#15362a;color:#85d9ad;font-size:11px}.badge.warn{background:#3a2421;color:#ef9b8d}
.modal-bg{position:fixed;inset:0;background:#000a;display:grid;place-items:center;padding:20px;z-index:50}.modal{width:min(760px,95vw);max-height:86vh;overflow:auto;border-radius:20px;padding:24px}.modal-head{display:flex;justify-content:space-between;gap:20px}.x{border:0;background:transparent;color:white;font-size:25px;cursor:pointer}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-top:18px}.info{padding:12px;border:1px solid var(--line);border-radius:12px;background:#071319}.info small{display:block;color:var(--muted);font-size:10px;margin-bottom:5px}.info b{font-size:14px}
@media(max-width:850px){.app{grid-template-columns:1fr}.side{display:none}.main{padding:20px}.cards{grid-template-columns:1fr}.table-wrap{overflow:auto}.top{align-items:center}.grid{grid-template-columns:1fr}}
</style></head><body>
<section id="login" class="login">
  <div class="login-card glass">
    <div class="logo"><div class="mark">Б97</div><div><b>ЧДММ «БАХОР-97»</b><small>PRIVATE CONSTRUCTION CRM · V2</small></div></div>
    <div class="ey">ЗАКРЫТАЯ СИСТЕМА</div><h1>Управление стройкой<br>в одном месте.</h1>
    <p>Клиенты, договоры, площади и контроль базы без лишних экранов.</p>
    <form id="form"><label class="field">ЛОГИН<input id="user" value="Developer" autocomplete="username"></label><label class="field">ПАРОЛЬ<input id="pass" type="password" autocomplete="current-password"></label><button class="primary">ВОЙТИ</button><div id="err" class="err"></div></form>
  </div>
</section>
<section id="app" class="app hidden">
  <aside class="side"><div class="logo"><div class="mark">Б97</div><div><b>БАХОР-97</b><small>CRM V2</small></div></div><button class="nav active">Обзор</button><button class="nav">Клиенты</button><div class="side-foot"><button id="logout" class="logout">Выйти</button></div></aside>
  <main class="main"><div class="top"><div><div class="ey" style="margin:0">БАЗА ДОГОВОРОВ</div><h1>Панель управления</h1><div id="sync" class="sync">Загрузка данных…</div></div><button id="refresh" class="refresh">↻ Обновить</button></div>
  <section class="cards"><div class="card glass"><small>КЛИЕНТЫ</small><strong id="mc">—</strong><span>договоров</span></div><div class="card glass"><small>ПЛОЩАДЬ</small><strong id="ma">—</strong><span>м² всего</span></div><div class="card glass"><small>КОНТРОЛЬ</small><strong id="mw">—</strong><span>требуют внимания</span></div></section>
  <section class="panel glass"><div class="tools"><h2>Клиенты</h2><input id="search" class="search" placeholder="ФИО, договор, телефон…"></div><div class="table-wrap"><table><thead><tr><th>КЛИЕНТ</th><th>ДОГОВОР</th><th>ЭТАЖ</th><th>ПЛОЩАДЬ</th><th>СТОИМОСТЬ</th><th>КОНТРОЛЬ</th></tr></thead><tbody id="rows"></tbody></table></div></section>
  </main>
</section>
<div id="modal" class="modal-bg hidden"><div class="modal glass"><div class="modal-head"><div><div class="ey" style="margin:0">КАРТОЧКА КЛИЕНТА</div><h2 id="mn"></h2></div><button id="close" class="x">×</button></div><div id="mg" class="grid"></div></div></div>
<script>
const $=s=>document.querySelector(s); let data=[];
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
async function api(url,opt={}){const r=await fetch(url,{headers:{"content-type":"application/json"},...opt});const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||"Ошибка");return j}
async function boot(){try{await api("/api/session");showApp();load()}catch{}}
function showApp(){$("#login").classList.add("hidden");$("#app").classList.remove("hidden")}
$("#form").onsubmit=async e=>{e.preventDefault();$("#err").textContent="";try{await api("/api/login",{method:"POST",body:JSON.stringify({username:$("#user").value,password:$("#pass").value})});showApp();load()}catch(x){$("#err").textContent=x.message}}
$("#logout").onclick=async()=>{try{await api("/api/logout",{method:"POST"})}catch{}location.reload()}
$("#refresh").onclick=load; $("#search").oninput=render;
function warn(c){return /провер|долг|ошиб|вним/i.test(c.control||"")}
async function load(){try{const r=await api("/api/clients");data=r.clients;$("#sync").textContent="Синхронизировано: "+new Date().toLocaleString("ru-RU");$("#mc").textContent=data.length;$("#ma").textContent=new Intl.NumberFormat("ru-RU",{maximumFractionDigits:1}).format(data.reduce((s,c)=>s+(parseFloat(String(c.area).replace(",","."))||0),0));$("#mw").textContent=data.filter(warn).length;render()}catch(e){$("#sync").textContent=e.message}}
function render(){const q=$("#search").value.toLowerCase();const a=data.filter(c=>!q||[c.name,c.contract,c.phone,c.rma].join(" ").toLowerCase().includes(q));$("#rows").innerHTML=a.map(c=>"<tr class=\"row\" data-n=\""+esc(c.num)+"\"><td><b>"+esc(c.name||"—")+"</b><br><small>"+esc(c.phone||"")+"</small></td><td>"+esc(c.contract||"—")+"</td><td>"+esc(c.floor||"—")+"</td><td>"+esc(c.area||"—")+" м²</td><td>"+esc(c.total||"—")+" "+esc(c.currency||"")+"</td><td><span class=\"badge "+(warn(c)?"warn":"")+"\">"+esc(c.control||"Внесено")+"</span></td></tr>").join("");document.querySelectorAll(".row").forEach(r=>r.onclick=()=>openCard(r.dataset.n))}
function openCard(n){const c=data.find(x=>String(x.num)===String(n));if(!c)return;$("#mn").textContent=c.name||"Клиент";const fields=[["№",c.num],["Договор",c.contract],["Этаж",c.floor],["Площадь",c.area?c.area+" м²":""],["Валюта",c.currency],["Цена / м²",c.price],["Стоимость",c.total],["Паспорт",c.passport],["РМА / ИНН",c.rma],["Телефон",c.phone],["Платежи",c.payments],["Контроль",c.control]];$("#mg").innerHTML=fields.filter(x=>x[1]).map(x=>"<div class=\"info\"><small>"+esc(x[0])+"</small><b>"+esc(x[1])+"</b></div>").join("");$("#modal").classList.remove("hidden")}
$("#close").onclick=()=>$("#modal").classList.add("hidden");$("#modal").onclick=e=>{if(e.target.id==="modal")$("#modal").classList.add("hidden")}
boot();
</script></body></html>`;

app.use("*",async(c,next)=>{await next();c.header("X-Content-Type-Options","nosniff");c.header("X-Frame-Options","DENY");c.header("Referrer-Policy","no-referrer");c.header("Cache-Control","no-store")});
app.get("/health",c=>c.json({ok:true,version:2}));
app.get("/",c=>c.html(page));
app.get("/setup",c=>c.redirect("/"));
app.get("/api/session",async c=>{const u=await auth(c);return u?c.json({username:u,role:"developer"}):c.json({error:"auth"},{status:401})});
app.post("/api/login",async c=>{
  const b=await c.req.json().catch(()=>({}));
  const username=String(b.username||"").trim(), password=String(b.password||"");
  if(username.toLowerCase()!==ADMIN_USER.toLowerCase() || !ADMIN_PASSWORD || password!==ADMIN_PASSWORD) return c.json({error:"Неверный логин или пароль"},{status:401});
  const raw=randomBytes(32).toString("base64url"), now=Date.now();
  await pool.query("INSERT INTO b97v2_sessions(token_hash,username,expires_at,created_at) VALUES($1,$2,$3,$4)",[sha(raw),ADMIN_USER,now+SESSION_MS,now]);
  setCookie(c,"b97v2",raw,{httpOnly:true,secure:true,sameSite:"Strict",path:"/",maxAge:SESSION_MS/1000});
  return c.json({ok:true});
});
app.post("/api/logout",async c=>{const raw=getCookie(c,"b97v2");if(raw)await pool.query("DELETE FROM b97v2_sessions WHERE token_hash=$1",[sha(raw)]);deleteCookie(c,"b97v2",{path:"/"});return c.json({ok:true})});
app.get("/api/clients",needAuth,async c=>{try{return c.json({clients:await clients()})}catch(e:any){return c.json({error:"Не удалось загрузить Google Таблицу",detail:String(e?.message||e)},{status:502})}});

export default app;
