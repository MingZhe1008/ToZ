const {isDeepStrictEqual: equal}=require('node:util');
const {validateSnapshot}=require('./store.cjs');

// Only business data travels to the server. Window, startup and reading preferences stay local.
function documentOf(snapshot){
  return {schema:1,tasks:structuredClone(snapshot.tasks),projects:[...snapshot.projects],recurrences:structuredClone(snapshot.recurrences||[]),projectColors:{...snapshot.preferences?.projectColors},projectTrash:structuredClone(snapshot.preferences?.projectTrash||[])};
}
function validateDocument(value){
  if(!value||value.schema!==1||!Array.isArray(value.projects)||!Array.isArray(value.recurrences))throw new Error('同步数据格式无效');
  if(!Array.isArray(value.tasks)||value.tasks.some(t=>!value.projects.includes(t.project)))throw new Error('同步任务所属分区不存在');
  if(Object.keys(value).some(key=>!['schema','tasks','projects','recurrences','projectColors','projectTrash'].includes(key)))throw new Error('同步数据包含未知字段');
  validateSnapshot({...value,preferences:{projectColors:value.projectColors,projectTrash:value.projectTrash}});
  return value;
}
function mergeDocuments(base,local,remote,choice){
  if(!remote)return {document:local,conflicts:[]};
  base=base||{tasks:[],projects:[],recurrences:[],projectColors:{},projectTrash:[]};
  const conflicts=[];
  const pick=(b,l,r,key)=>{
    if(equal(l,r)||equal(b,r))return l;
    if(equal(b,l))return r;
    // Two offline clients can generate the same untouched periodic occurrence independently.
    if(!b&&l?.repeatId&&r?.repeatId&&l.events?.length===1&&r.events?.length===1&&l.events[0].type==='create'&&r.events[0].type==='create'&&equal({...l,events:[]},{...r,events:[]}))return r;
    conflicts.push(key);return choice==='cloud'?r:l;
  };
  const records=(key,id)=>{
    const maps=[base,local,remote].map(s=>new Map((s[key]||[]).map(v=>[v[id],v])));
    return [...new Set(maps.flatMap(m=>[...m.keys()]))].map(k=>pick(...maps.map(m=>m.get(k)),key+':'+k)).filter(v=>v!==undefined);
  };
  const projects=[...new Set([...base.projects,...local.projects,...remote.projects])].filter(name=>pick(base.projects.includes(name),local.projects.includes(name),remote.projects.includes(name),'分区:'+name));
  const colors={};
  for(const name of projects){const c=pick(base.projectColors?.[name],local.projectColors?.[name],remote.projectColors?.[name],'颜色:'+name);if(c!==undefined)colors[name]=c;}
  let document={schema:1,tasks:records('tasks','id'),recurrences:records('recurrences','id'),projects,projectColors:colors,projectTrash:records('projectTrash','name')};
  try{validateDocument(document);}catch{
    // Cross-record edits (rename vs create, purge vs edit) must be resolved as a complete document.
    conflicts.push('分区、周期或父子任务关联');
    document=choice==='cloud'?remote:local;
  }
  return {document:structuredClone(document),conflicts};
}
module.exports={documentOf,validateDocument,mergeDocuments};
