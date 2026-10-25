const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {DatabaseSync}=require('node:sqlite');
const {validateDocument}=require('../desktop/sync-model.cjs');
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const failure=(status,message)=>Object.assign(new Error(message),{status});
function emailOf(value){
  if(typeof value!=='string'||value.length>254||!/^\S+@[^\s@]+\.[^\s@]+$/.test(value))throw failure(400,'请输入有效邮箱');
  return value.trim().toLowerCase();
}
function createService({directory,pepper,sendMail,trustProxy=false,now=Date.now}){
  if(!pepper||pepper.length<32)throw new Error('必须配置至少 32 字符的验证码密钥');
  fs.mkdirSync(directory,{recursive:true});
  const db=new DatabaseSync(path.join(directory,'sync.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS identities(kind TEXT NOT NULL,address TEXT NOT NULL,user_id TEXT NOT NULL,PRIMARY KEY(kind,address));
    CREATE TABLE IF NOT EXISTS codes(email TEXT NOT NULL,purpose TEXT NOT NULL,owner TEXT NOT NULL,digest TEXT NOT NULL,expires INTEGER NOT NULL,attempts INTEGER NOT NULL,PRIMARY KEY(email,purpose,owner));
    CREATE TABLE IF NOT EXISTS sessions(digest TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS documents(user_id TEXT PRIMARY KEY,version INTEGER NOT NULL,data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS revisions(user_id TEXT NOT NULL,version INTEGER NOT NULL,data TEXT NOT NULL,created INTEGER NOT NULL,PRIMARY KEY(user_id,version));
    CREATE TABLE IF NOT EXISTS limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);`);
  if(!db.prepare('PRAGMA table_info(users)').all().some(column=>column.name==='avatar'))db.exec('ALTER TABLE users ADD COLUMN avatar TEXT');
  const digest=(email,purpose,owner,code)=>crypto.createHmac('sha256',pepper).update(JSON.stringify([email,purpose,owner,code])).digest('hex');
  function limit(key,max,duration){
    const row=db.prepare('SELECT * FROM limits WHERE key=?').get(key),time=now();
    if(row&&row.expires>time&&row.count>=max)throw failure(429,'操作过于频繁，请稍后重试');
    db.prepare('INSERT OR REPLACE INTO limits VALUES(?,?,?)').run(key,row&&row.expires>time?row.count+1:1,row&&row.expires>time?row.expires:time+duration);
  }
  function auth(req){
    const token=req.headers.authorization?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
    const session=token&&db.prepare('SELECT * FROM sessions WHERE digest=? AND expires>?').get(hash(token),now());
    if(!session)throw failure(401,'登录已过期，请重新获取验证码登录');
    return session;
  }
  const identities=userId=>db.prepare('SELECT kind,address FROM identities WHERE user_id=? ORDER BY address').all(userId);
  const userOf=id=>({id,identities:identities(id),avatar:db.prepare('SELECT avatar FROM users WHERE id=?').get(id)?.avatar||null});
  async function route(req,body){
    const url=new URL(req.url,'http://localhost');
    const ip=trustProxy?(req.headers['x-real-ip']||req.socket.remoteAddress):req.socket.remoteAddress;
    if(req.method==='GET'&&url.pathname==='/health')return {ok:true,service:'toz-sync',protocol:1};
    if(req.method==='POST'&&url.pathname==='/auth/code'){
      const email=emailOf(body.email),purpose=body.purpose==='bind'?'bind':'login',owner=purpose==='bind'?auth(req).user_id:'';
      limit('send-ip:'+ip,20,3600000);limit('send-email-minute:'+email,1,60000);limit('send-email-day:'+email,20,86400000);
      if(purpose==='bind'&&db.prepare('SELECT user_id FROM identities WHERE kind=? AND address=?').get('email',email)?.user_id===owner)throw failure(400,'该邮箱已绑定');
      const code=String(crypto.randomInt(100000,1000000));
      db.prepare('INSERT OR REPLACE INTO codes VALUES(?,?,?,?,?,0)').run(email,purpose,owner,digest(email,purpose,owner,code),now()+600000);
      try{await sendMail(email,code);}catch{
        db.prepare('DELETE FROM codes WHERE email=? AND purpose=? AND owner=?').run(email,purpose,owner);
        throw failure(503,'验证码邮件发送失败，请稍后重试');
      }
      return {ok:true,retryAfter:60};
    }
    if(req.method==='POST'&&['/auth/login','/auth/bind'].includes(url.pathname)){
      limit('verify-ip:'+ip,60,3600000);
      const email=emailOf(body.email),purpose=url.pathname.endsWith('bind')?'bind':'login',owner=purpose==='bind'?auth(req).user_id:'';
      const code=String(body.code||''),row=db.prepare('SELECT * FROM codes WHERE email=? AND purpose=? AND owner=?').get(email,purpose,owner);
      if(!row||row.expires<=now()||row.attempts>=5)throw failure(400,'验证码已失效，请重新获取');
      db.prepare('UPDATE codes SET attempts=attempts+1 WHERE email=? AND purpose=? AND owner=?').run(email,purpose,owner);
      if(!/^\d{6}$/.test(code)||!crypto.timingSafeEqual(Buffer.from(row.digest),Buffer.from(digest(email,purpose,owner,code))))throw failure(400,'验证码错误');
      db.exec('BEGIN IMMEDIATE');
      try{
        const existing=db.prepare('SELECT user_id FROM identities WHERE kind=? AND address=?').get('email',email);
        if(owner&&existing&&existing.user_id!==owner)throw failure(409,'该邮箱已属于其他账号，不能直接绑定');
        const id=owner||existing?.user_id||crypto.randomUUID();
        db.prepare('INSERT OR IGNORE INTO users(id,created) VALUES(?,?)').run(id,now());
        db.prepare('INSERT OR IGNORE INTO identities VALUES(?,?,?)').run('email',email,id);
        db.prepare('DELETE FROM codes WHERE email=? AND purpose=? AND owner=?').run(email,purpose,owner);
        let token;
        if(!owner){token=crypto.randomBytes(32).toString('hex');db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(hash(token),id,now()+30*86400000);}
        db.exec('COMMIT');return {user:userOf(id),...(token?{token}:{})};
      }catch(e){db.exec('ROLLBACK');throw e;}
    }
    const session=auth(req),id=session.user_id;
    if(req.method==='GET'&&url.pathname==='/account')return {user:userOf(id)};
    if(req.method==='PUT'&&url.pathname==='/account/avatar'){
      limit('avatar:'+id,30,3600000);
      const avatar=body.avatar;
      if(avatar!==null){
        if(typeof avatar!=='string'||avatar.length>140000||!/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(avatar))throw failure(400,'头像格式无效');
        const data=Buffer.from(avatar.slice(22),'base64');
        if(data.length<33||data.length>100000||data.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||data.toString('ascii',12,16)!=='IHDR'||data.readUInt32BE(16)!==128||data.readUInt32BE(20)!==128)throw failure(400,'头像须为 128×128 PNG 图片');
      }
      db.prepare('UPDATE users SET avatar=? WHERE id=?').run(avatar,id);return {user:userOf(id)};
    }
    if(req.method==='POST'&&url.pathname==='/auth/logout'){db.prepare('DELETE FROM sessions WHERE digest=?').run(session.digest);return {ok:true};}
    if(req.method==='GET'&&url.pathname==='/sync'){
      const row=db.prepare('SELECT * FROM documents WHERE user_id=?').get(id);
      return {...(row?{version:row.version,document:JSON.parse(row.data)}:{version:0,document:null}),user:userOf(id)};
    }
    if(req.method==='PUT'&&url.pathname==='/sync'){
      if(!Number.isSafeInteger(body.version)||body.version<0)throw failure(400,'同步版本无效');
      try{validateDocument(body.document);}catch(e){throw failure(400,e.message);}
      db.exec('BEGIN IMMEDIATE');
      try{
        const current=db.prepare('SELECT * FROM documents WHERE user_id=?').get(id);
        if((current?.version||0)!==body.version)throw failure(409,'其他设备已更新，请重新同步');
        if(current)db.prepare('INSERT OR IGNORE INTO revisions VALUES(?,?,?,?)').run(id,current.version,current.data,now());
        const version=body.version+1;
        db.prepare('INSERT OR REPLACE INTO documents VALUES(?,?,?)').run(id,version,JSON.stringify(body.document));
        db.prepare('DELETE FROM revisions WHERE user_id=? AND version<?').run(id,version-30);
        db.exec('COMMIT');return {version};
      }catch(e){db.exec('ROLLBACK');throw e;}
    }
    throw failure(404,'接口不存在');
  }
  const server=http.createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');
    try{
      let size=0,chunks=[];
      for await(const chunk of req){size+=chunk.length;if(size>50*1024*1024)throw failure(413,'同步数据超过 50 MB');chunks.push(chunk);}
      let body={};try{if(size)body=JSON.parse(Buffer.concat(chunks));}catch{throw failure(400,'请求格式无效');}
      if(!body||typeof body!=='object'||Array.isArray(body))throw failure(400,'请求格式无效');
      const result=await route(req,body);res.end(JSON.stringify(result));
    }catch(e){res.statusCode=e.status||500;res.end(JSON.stringify({error:e.status?e.message:'服务暂时不可用'}));}
  });
  server.requestTimeout=30000;server.headersTimeout=15000;
  const cleanup=setInterval(()=>{const time=now();for(const table of ['codes','sessions','limits'])db.prepare(`DELETE FROM ${table} WHERE expires<?`).run(time);},3600000);cleanup.unref();
  return {server,db,close:()=>{clearInterval(cleanup);db.close();}};
}
if(require.main===module){
  const mailer=require('nodemailer').createTransport({host:process.env.SMTP_HOST||'smtp.qq.com',port:465,secure:true,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASS},connectionTimeout:12000,socketTimeout:20000});
  const service=createService({directory:process.env.DATA_DIR||path.join(__dirname,'data'),pepper:process.env.OTP_SECRET,trustProxy:process.env.TRUST_PROXY==='1',sendMail:(to,code)=>mailer.sendMail({from:{name:'ToZ',address:process.env.SMTP_USER},to,subject:'ToZ 登录验证码',text:`你的 ToZ 验证码为：${code}。10 分钟内有效。请勿向他人提供验证码。若非本人操作，请忽略此邮件。`})});
  service.server.listen(Number(process.env.PORT||8787),process.env.HOST||'127.0.0.1');
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>service.server.close(()=>{service.close();process.exit(0);}));
}
module.exports={createService};
