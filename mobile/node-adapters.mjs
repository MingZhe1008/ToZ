// Deliberately narrow adapters for the existing Store / Cloud, not a Node runtime.
const call=(operation,...args)=>{
  const result=JSON.parse(globalThis.ToZAndroid.call(operation,JSON.stringify(args)));
  if(!result.ok)throw new Error(result.error);
  return result.value;
};
export {call};
export const join=(...parts)=>parts.join('/').replace(/\/+/g,'/');
export const isDeepStrictEqual=(a,b)=>{
  if(Object.is(a,b))return true;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;
  const keys=Object.keys(a);
  return keys.length===Object.keys(b).length&&keys.every(key=>Object.hasOwn(b,key)&&isDeepStrictEqual(a[key],b[key]));
};
export const Buffer={byteLength:value=>new TextEncoder().encode(value).length};
export const mkdirSync=path=>call('mkdir',path);
export const readFileSync=path=>call('read',path);
export const writeFileSync=(path,value)=>call('write',path,String(value));
export const renameSync=(from,to)=>call('rename',from,to);
export const readdirSync=path=>call('list',path);
export const unlinkSync=path=>call('remove',path,false);
export const rmSync=(path,options)=>call('remove',path,!!options?.force);
export class DatabaseSync {
  constructor(path){this.path=path;this.isTransaction=false;call('db-open',path);}
  exec(sql){
    // sqlite execSQL accepts a single statement, including complete trigger bodies.
    let rest=sql.trim();
    while(rest){
      const end=/^CREATE TRIGGER\b/i.test(rest)?rest.indexOf('END;')+3:rest.indexOf(';');
      const statement=end<0?rest:rest.slice(0,end);
      if(!statement)break;
      call('db-exec',this.path,statement,[]);
      if(/^BEGIN\b/i.test(statement))this.isTransaction=true;
      if(/^(COMMIT|ROLLBACK)\b/i.test(statement))this.isTransaction=false;
      rest=end<0?'':rest.slice(end+1).trim();
    }
  }
  prepare(sql){return {
    get:(...args)=>call('db-query',this.path,sql,args)[0],
    all:(...args)=>call('db-query',this.path,sql,args),
    run:(...args)=>call('db-exec',this.path,sql,args)
  };}
  close(){call('db-close',this.path);}
}
