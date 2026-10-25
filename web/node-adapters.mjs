// Browser-only persistence for the shared Store / Cloud. One active tab owns it.
const prefix='toz-web-v1:';
export const join=(...parts)=>parts.join('/').replace(/\/+/g,'/');
export {isDeepStrictEqual,Buffer} from '../mobile/node-adapters.mjs';
export const mkdirSync=()=>{};
export function readFileSync(path){const value=localStorage.getItem(prefix+path);if(value===null)throw new Error('文件不存在');return value;}
export const writeFileSync=(path,value)=>localStorage.setItem(prefix+path,String(value));
export function renameSync(from,to){writeFileSync(to,readFileSync(from));localStorage.removeItem(prefix+from);}
export const readdirSync=path=>Object.keys(localStorage).filter(key=>key.startsWith(prefix+path+'/')).map(key=>key.slice((prefix+path+'/').length)).filter(key=>!key.includes('/'));
export const unlinkSync=path=>localStorage.removeItem(prefix+path);
export const rmSync=unlinkSync;
const encode=bytes=>{let value='';for(let i=0;i<bytes.length;i+=8192)value+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(value);};
const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export class DatabaseSync {
  constructor(path){this.path=path;this.isTransaction=false;this.saved=localStorage.getItem(prefix+path);this.open();}
  open(){this.db=new globalThis.tozSQL.Database(this.saved?decode(this.saved):undefined);this.db.run('PRAGMA foreign_keys=ON');}
  persist(){
    try{const value=encode(this.db.export());writeFileSync(this.path,value);this.saved=value;this.db.run('PRAGMA foreign_keys=ON');}
    catch(error){this.db.close();this.open();throw new Error('浏览器存储空间不足或不可用，保存失败。请导出备份后释放空间。',{cause:error});}
  }
  exec(sql){
    this.db.exec(sql);
    if(/^BEGIN\b/i.test(sql.trim()))this.isTransaction=true;
    if(/^(COMMIT|ROLLBACK)\b/i.test(sql.trim()))this.isTransaction=false;
    if(!this.isTransaction)this.persist();
  }
  prepare(sql){
    const query=args=>{const statement=this.db.prepare(sql);try{statement.bind(args);const rows=[];while(statement.step())rows.push(statement.getAsObject());return rows;}finally{statement.free();}};
    return {get:(...args)=>query(args)[0],all:(...args)=>query(args),run:(...args)=>{this.db.run(sql,args);if(!this.isTransaction)this.persist();}};
  }
  close(){this.db.close();}
}
