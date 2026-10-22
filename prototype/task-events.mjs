export function eventTone(event){
  if(['task_restore','subtask_restore'].includes(event.type)||event.type==='complete'||event.type==='subtask'&&(event.done===true||event.done===undefined&&event.reason?.startsWith('完成：')))return 'success';
  if(['reopen','later','cancel_repeat','repeat_stop','task_delete','subtask_delete','subtask_purge'].includes(event.type)||event.type==='subtask'&&(event.done===false||event.reason?.startsWith('重新打开：')))return 'warning';
  if(['start','earlier','schedule','plan_start'].includes(event.type))return 'teal';
  if(['subtask_add','edit','subtask_rename','project_move'].includes(event.type))return 'purple';
  return 'neutral';
}
