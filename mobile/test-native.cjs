// Isolated Node implementation of the native protocol, used only by targeted checks.
const fs=require('node:fs');
const path=require('node:path');
const {DatabaseSync}=require('node:sqlite');
function createBridge(root){
  const dbs=new Map(),filename=name=>path.join(root,name);
  return {
    call(operation,json){
      const [name,value,params]=JSON.parse(json);
      try{
        let result;
        if(operation==='mkdir')result=fs.mkdirSync(filename(name),{recursive:true});
        else if(operation==='read')result=fs.readFileSync(filename(name),'utf8');
        else if(operation==='write')result=fs.writeFileSync(filename(name),value);
        else if(operation==='rename')result=fs.renameSync(filename(name),filename(value));
        else if(operation==='list')result=fs.readdirSync(filename(name));
        else if(operation==='remove')result=fs.rmSync(filename(name),{force:!!value});
        else if(operation==='db-open')dbs.set(name,new DatabaseSync(filename(name)));
        else if(operation==='db-close'){dbs.get(name).close();dbs.delete(name);}
        else if(operation==='db-query')result=dbs.get(name).prepare(value).all(...params);
        else if(operation==='db-exec'){if(params.length)result=dbs.get(name).prepare(value).run(...params);else dbs.get(name).exec(value);}
        else if(operation==='seal')result='sealed:'+name;
        else if(operation==='unseal'){if(!name.startsWith('sealed:'))throw new Error('invalid token');result=name.slice(7);}
        else if(['export','import','quit'].includes(operation))result=true;
        else throw new Error('unknown operation '+operation);
        return JSON.stringify({ok:true,value:typeof result==='bigint'?String(result):result},(_,v)=>typeof v==='bigint'?Number(v):v);
      }catch(error){return JSON.stringify({ok:false,error:error.message});}
    },
    close(){for(const db of dbs.values())db.close();dbs.clear();},
    request(){throw new Error('Network disabled in isolated UI test');}
  };
}
module.exports={createBridge};
