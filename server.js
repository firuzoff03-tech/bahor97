import express from "express";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const app=express();
app.set("trust proxy",1);
app.use(express.json({limit:"1mb"}));
app.use((req,res,next)=>{
  res.setHeader("X-Content-Type-Options","nosniff");
  res.setHeader("X-Frame-Options","DENY");
  res.setHeader("Referrer-Policy","no-referrer");
  res.setHeader("Permissions-Policy","camera=(), microphone=(), geolocation=()");
  res.setHeader("Content-Security-Policy","default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'");
  next();
});

const PORT=Number(process.env.PORT||3000);
const SHEET_ID=process.env.SHEET_ID||"1ij6PAL4NPnLrTBUMgnJLiVlkrZ0-KgFOT6HsdS7VAkE";
const ADMIN_USER=process.env.ADMIN_USER||"developer";
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||"";
const SESSION_SECRET=process.env.SESSION_SECRET||crypto.randomBytes(32).toString("hex");
const DATA_DIR=process.env.DATA_DIR||".data";
const DATA_FILE=path.join(DATA_DIR,"bahor97.json");
fs.mkdirSync(DATA_DIR,{recursive:true});

const clientSheets={
"1":"Кодиров_М5-130-1-А","2":"Насриддинов_М3-85,6ММ-1-А","3":"Ойназаров_М1-130-1-А","4":"Абдузамонов_А1-130","5":"Насриддинов_М2-130-1-А","6":"Хочаева_69-3-А","7":"Рабиева_85-3","8":"Талбакова_71-3-А","9":"Зиёева_97А","10":"Ниёзов_74А","11":"Ибодова_Б-Б-4-69","12":"Душанов_46А","13":"Муродова_37А","14":"Тагоев_75А","15":"Холова_6А","16":"Шоназриев_32А","17":"Фирузаи_5А","18":"Искандарова_5Э-69мм-А","19":"Турсунова_42А","20":"Чалилова_41А","21":"Хафизов_5С","22":"Сафаров_6-А-55,6","23":"Назриева_129-6-А(Е)","24":"Завурова_20А","25":"Файзов_43А","26":"Хайдарова_7Э-57ММ-А","27":"Муродов_15","28":"Ёдгоров_55,6-7-А","29":"Назров_7Э-82ММ-А","30":"Чурабоев_13С","31":"Сафаров_27Б","32":"Салихов_82А","33":"Садриддинзода_72-8-А","34":"Алиев_129-8-А(Е)","35":"Аброров_1-Х-А 8-55,6"
};

function defaultData(){return {users:[],activity:[],paymentOverrides:{}}}
function readData(){
  try{return {...defaultData(),...JSON.parse(fs.readFileSync(DATA_FILE,"utf8"))}}catch{return defaultData()}
}
function writeData(data){
  const tmp=DATA_FILE+".tmp";
  fs.writeFileSync(tmp,JSON.stringify(data,null,2));
  fs.renameSync(tmp,DATA_FILE);
}
function parseCsv(text){
  const rows=[];let row=[],cell="",quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i],n=text[i+1];
    if(c==='"'&&quoted&&n==='"'){cell+='"';i++;continue}
    if(c==='"'){quoted=!quoted;continue}
    if(c===","&&!quoted){row.push(cell);cell="";continue}
    if((c==="\n"||c==="\r")&&!quoted){
      if(c==="\r"&&n==="\n")i++;
      row.push(cell);cell="";
      if(row.some(v=>v!==""))rows.push(row);
      row=[];continue;
    }
    cell+=c;
  }
  if(cell||row.length){row.push(cell);rows.push(row)}
  return rows;
}
async function fetchSheet(sheet){
  const url=`https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}&t=${Date.now()}`;
  const r=await fetch(url,{headers:{"User-Agent":"Bahor97-CRM/1.0"}});
  if(!r.ok)throw new Error("Google Sheet HTTP "+r.status);
  return parseCsv(await r.text());
}
function clientFromRow(r){
  return {num:r[0]||"",name:r[1]||"",contract:r[2]||"",floor:r[3]||"",area:r[4]||"",currency:r[5]||"",price:r[6]||"",total:r[7]||"",passport:r[8]||"",rma:r[9]||"",phone:r[10]||"",payments:r[11]||"",status:r[12]||""};
}
function parseDetail(rows,clientNum){
  const header=rows.findIndex(r=>String(r[0]||"").trim()==="Дата");
  const top=header<0?rows:rows.slice(0,header);
  const info=[],control=[];
  for(const r of top){
    if(r[0]&&r[1])info.push({label:String(r[0]).trim(),value:String(r[1]).trim()});
    if(r[3]&&r[4])info.push({label:String(r[3]).trim(),value:String(r[4]).trim()});
    if(r[7]&&r[8])control.push({label:String(r[7]).trim(),value:String(r[8]).trim()});
  }
  const payments=[];
  if(header>=0){
    rows.slice(header+1).forEach((r,index)=>{
      if(!r.some(v=>String(v||"").trim()))return;
      payments.push({id:`b:${clientNum}:${index}`,baseIndex:index,date:r[0]||"",usd:r[1]||"",rate:r[2]||"",tjs:r[3]||"",note:r[4]||"",check:r[5]||""});
    });
  }
  return {info,control,payments};
}
function mergePayments(clientNum,base){
  const d=readData(),o=d.paymentOverrides||{},result=[];
  for(const p of base){
    const x=o[p.id];
    if(x?.deleted)continue;
    result.push(x?{...p,...x,id:p.id,baseIndex:p.baseIndex}:p);
  }
  for(const [id,x] of Object.entries(o)){
    if(id.startsWith(`n:${clientNum}:`)&&!x.deleted)result.push({...x,id,baseIndex:null});
  }
  return result;
}
function hashPassword(password,salt=crypto.randomBytes(16).toString("hex")){
  const hash=crypto.scryptSync(password,salt,64).toString("hex");
  return {salt,hash};
}
function verifyPassword(password,user){
  try{
    const got=crypto.scryptSync(password,user.salt,64);
    const want=Buffer.from(user.hash,"hex");
    return want.length===got.length&&crypto.timingSafeEqual(got,want);
  }catch{return false}
}
const sessions=new Map(),attempts=new Map();
function signToken(raw){return crypto.createHmac("sha256",SESSION_SECRET).update(raw).digest("hex")}
function parseCookies(req){
  const out={};String(req.headers.cookie||"").split(";").forEach(x=>{const i=x.indexOf("=");if(i>0)out[x.slice(0,i).trim()]=decodeURIComponent(x.slice(i+1).trim())});return out;
}
function auth(req){
  const raw=parseCookies(req).b97_session;if(!raw)return null;
  const key=signToken(raw),s=sessions.get(key);
  if(!s||s.expires<Date.now()){if(s)sessions.delete(key);return null}
  s.lastSeen=Date.now();return s;
}
function requireAuth(req,res,next){const s=auth(req);if(!s)return res.status(401).json({error:"auth"});req.user=s;next()}
function requireDeveloper(req,res,next){const s=auth(req);if(!s)return res.status(401).json({error:"auth"});if(s.role!=="developer")return res.status(403).json({error:"forbidden"});req.user=s;next()}
function addActivity(req,action,detail=""){
  const d=readData();d.activity.unshift({id:crypto.randomUUID(),username:req.user?.username||"system",action,detail,at:new Date().toISOString(),ip:req.ip||"",ua:String(req.headers["user-agent"]||"").slice(0,220)});
  d.activity=d.activity.slice(0,400);writeData(d);
}
function findUser(username){
  if(username===ADMIN_USER&&ADMIN_PASSWORD)return {username:ADMIN_USER,role:"developer",active:true,envAdmin:true};
  return readData().users.find(u=>u.username===username)||null;
}

app.get("/api/health",(req,res)=>res.json({ok:true}));
app.post("/api/login",(req,res)=>{
  const ip=req.ip||"unknown",now=Date.now(),a=attempts.get(ip)||{count:0,until:0};
  if(a.until>now)return res.status(429).json({error:"Слишком много попыток. Подождите 15 минут."});
  const username=String(req.body?.username||"").trim(),password=String(req.body?.password||"");
  const user=findUser(username);
  let ok=false;
  if(user?.envAdmin)ok=password===ADMIN_PASSWORD;
  else if(user?.active)ok=verifyPassword(password,user);
  if(!ok){
    a.count++;if(a.count>=8){a.until=now+15*60_000;a.count=0}attempts.set(ip,a);
    return res.status(401).json({error:"Неверный логин или пароль"});
  }
  attempts.delete(ip);
  const raw=crypto.randomBytes(32).toString("base64url"),key=signToken(raw);
  sessions.set(key,{username:user.username,role:user.role||"viewer",expires:now+12*60*60_000,lastSeen:now});
  res.cookie("b97_session",raw,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",maxAge:12*60*60_000,path:"/"});
  req.user=sessions.get(key);addActivity(req,"login","Вход в систему");
  res.json({ok:true,username:user.username,role:user.role||"viewer"});
});
app.post("/api/logout",requireAuth,(req,res)=>{
  const raw=parseCookies(req).b97_session;if(raw)sessions.delete(signToken(raw));
  addActivity(req,"logout","Выход из системы");res.clearCookie("b97_session",{path:"/"});res.json({ok:true});
});
app.get("/api/session",(req,res)=>{const s=auth(req);if(!s)return res.status(401).json({authenticated:false});res.json({authenticated:true,username:s.username,role:s.role})});

app.get("/api/clients",requireAuth,async(req,res)=>{
  try{
    const rows=await fetchSheet("КЛИЕНТЫ");
    const headerIndex=rows.findIndex(r=>String(r[0]||"").trim()==="№");
    const start=headerIndex>=0?headerIndex+1:1;
    const clients=rows.slice(start).map(clientFromRow).filter(x=>x.num||x.name);
    res.json({clients,syncedAt:new Date().toISOString()});
  }catch(e){res.status(502).json({error:"Не удалось прочитать Google Таблицу",detail:String(e.message||e)})}
});
app.get("/api/client/:num",requireAuth,async(req,res)=>{
  const num=String(req.params.num),sheet=clientSheets[num];
  if(!sheet)return res.status(404).json({error:"Клиент не найден"});
  try{
    const rows=await fetchSheet(sheet),detail=parseDetail(rows,num);
    detail.payments=mergePayments(num,detail.payments);
    addActivity(req,"open_client",num);res.json({sheet,...detail});
  }catch(e){res.status(502).json({error:"Не удалось прочитать карточку клиента",detail:String(e.message||e)})}
});
app.post("/api/payments",requireDeveloper,(req,res)=>{
  const b=req.body||{},clientNum=String(b.clientNum||"");
  if(!clientSheets[clientNum])return res.status(400).json({error:"Некорректный клиент"});
  const id=String(b.id||(`n:${clientNum}:${crypto.randomUUID()}`));
  const d=readData();d.paymentOverrides[id]={date:String(b.date||""),usd:String(b.usd||""),rate:String(b.rate||""),tjs:String(b.tjs||""),note:String(b.note||""),check:String(b.check||""),deleted:!!b.deleted,updatedBy:req.user.username,updatedAt:new Date().toISOString()};
  writeData(d);addActivity(req,b.deleted?"delete_payment":"save_payment",`${clientNum} / ${id}`);res.json({ok:true,id});
});

app.get("/api/admin/users",requireDeveloper,(req,res)=>{
  const d=readData(),presence={};
  for(const s of sessions.values()){presence[s.username]=Math.max(presence[s.username]||0,s.lastSeen||0)}
  const users=[{username:ADMIN_USER,role:"developer",active:true,protected:true},...d.users].map(u=>({...u,salt:undefined,hash:undefined,lastSeen:presence[u.username]||null}));
  res.json({users});
});
app.post("/api/admin/users",requireDeveloper,(req,res)=>{
  const username=String(req.body?.username||"").trim().toLowerCase(),password=String(req.body?.password||""),role=req.body?.role==="developer"?"developer":"viewer";
  if(!/^[a-z0-9_.-]{3,40}$/.test(username))return res.status(400).json({error:"Логин: 3–40 символов, латиница/цифры"});
  if(password.length<8)return res.status(400).json({error:"Пароль минимум 8 символов"});
  if(username===ADMIN_USER||findUser(username))return res.status(409).json({error:"Такой логин уже существует"});
  const d=readData(),hp=hashPassword(password);d.users.push({username,role,active:true,...hp,createdAt:new Date().toISOString()});writeData(d);
  addActivity(req,"create_user",username+" / "+role);res.json({ok:true});
});
app.patch("/api/admin/users/:username",requireDeveloper,(req,res)=>{
  const username=String(req.params.username);if(username===ADMIN_USER)return res.status(400).json({error:"Основного разработчика отключить нельзя"});
  const d=readData(),u=d.users.find(x=>x.username===username);if(!u)return res.status(404).json({error:"Не найден"});
  u.active=!!req.body?.active;writeData(d);
  for(const [k,s] of sessions.entries())if(s.username===username&&!u.active)sessions.delete(k);
  addActivity(req,u.active?"enable_user":"disable_user",username);res.json({ok:true});
});
app.get("/api/admin/activity",requireDeveloper,(req,res)=>res.json({activity:readData().activity.slice(0,200)}));

app.use(express.static("public",{extensions:["html"]}));
app.get("*",(req,res)=>res.sendFile(path.resolve("public/index.html")));
app.listen(PORT,"0.0.0.0",()=>console.log(`Bahor-97 CRM listening on ${PORT}`));
