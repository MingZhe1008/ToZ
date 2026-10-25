const {createBridge}=require('./test-native.cjs');
globalThis.ToZAndroid=createBridge(process.env.TOZ_ANDROID_TEST_DIR);
if(process.env.TOZ_ANDROID_ACCOUNT_TEST==='1'){
  const user={id:'ui-account',identities:[{address:'android-ui@example.com'}]};
  let version=1,document={schema:1,projects:['个人'],recurrences:[],projectColors:{},projectTrash:[],tasks:[{
    id:'remote-account-task',title:'电脑同步到手机的任务',note:'',project:'个人',planStart:null,plan:null,initialPlan:null,started:null,completedDate:null,done:false,subtasks:[],
    events:[{id:'remote-account-event',type:'create',date:'2026-10-25',at:'2026-10-25T10:00:00Z'}]
  }]};
  globalThis.tozMockCloud={fail:false,gets:0};
  globalThis.ToZAndroid.request=(id,url,method,_headers,raw)=>setTimeout(()=>{
    let body;
    if(url.endsWith('/auth/login'))body={user,token:'test-only-ui-token'};
    else if(url.endsWith('/auth/logout'))body={};
    else if(globalThis.tozMockCloud.fail){globalThis.tozNativeEvent('http',{id,error:'模拟断网，离线修改已保留'});return;}
    else if(url.endsWith('/sync')&&method==='PUT'){
      const request=JSON.parse(raw);
      if(request.version!==version){globalThis.tozNativeEvent('http',{id,status:409,body:JSON.stringify({error:'过期同步版本'})});return;}
      document=request.document;version++;body={version};
    }else{globalThis.tozMockCloud.gets++;body={version,document,user};}
    globalThis.tozNativeEvent('http',{id,status:200,body:JSON.stringify(body)});
  },10);
}
