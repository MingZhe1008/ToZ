export function cloudPresentation(state){
  if(!state?.user)return {badge:'离线',title:'离线使用 · 未登录账号',save:'离线使用 · 本机已保存',account:'尚未登录',detail:'离线数据仍会自动保存在此电脑。',footnote:'离线使用，数据保存在这台电脑。'};
  const email=state.user.identities?.[0]?.address||'已登录';
  const progress=state.busy?'同步中':state.error||state.conflicts?.length?'同步待处理':state.pending?'待同步':state.lastSync?'云端已同步':'等待同步';
  const detail=state.busy?'正在同步…':state.error||state.conflicts?.length?'同步待处理':state.pending?'本机修改已保存，等待同步':state.lastSync?'上次同步 '+new Date(state.lastSync).toLocaleTimeString('zh-CN'):'已登录，等待同步';
  return {badge:'已登录',title:email+' · '+progress,save:'本机已保存 · '+progress,account:email,detail,footnote:'已登录账号，任务先保存在本机，再同步到其他电脑。'};
}
