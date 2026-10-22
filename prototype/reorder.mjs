// Hold for 380 ms to reorder. A regular click and a double click keep their actions.
export function mountReorder({onMove,onReady=()=>{}}){
  let pending=null,active=null,suppressUntil=0;
  const selector='[data-reorder-kind][data-reorder-id]';
  const clear=()=>{if(pending)clearTimeout(pending.timer);pending=null;};
  function finish(commit){
    clear();if(!active)return;
    const {source,target,after}=active;
    document.querySelectorAll('.reorder-source,.reorder-before,.reorder-after').forEach(el=>el.classList.remove('reorder-source','reorder-before','reorder-after'));
    document.body.classList.remove('is-reordering');active=null;suppressUntil=performance.now()+400;
    if(commit&&target&&target!==source){const scope=source.closest('#widget,#task-list,#gantt-rows,#month-grid,#project-nav')?.id;onMove(source.dataset.reorderKind,source.dataset.reorderId,target.dataset.reorderId,after);restoreFocus(source,scope);}
  }
  const restoreFocus=(source,scope)=>{const root=scope?document.getElementById(scope):document;[...root.querySelectorAll(selector)].find(el=>el.dataset.reorderKind===source.dataset.reorderKind&&el.dataset.reorderId===source.dataset.reorderId)?.focus({preventScroll:true});};
  document.addEventListener('pointerdown',event=>{
    if(event.button!==0||event.target.closest('input,textarea,select,[contenteditable],.subtask,.context-menu,.check-button,.calendar-check,[data-action="task-pin"],[data-action="toggle-subtasks"],.row-reschedule,[data-gantt="complete"],[data-gantt="pin"],[data-gantt="schedule"]'))return;
    const source=event.target.closest(selector);if(!source)return;
    clear();pending={x:event.clientX,y:event.clientY,pointer:event.pointerId,source,timer:setTimeout(()=>{
      try{source.setPointerCapture(event.pointerId);}catch{}
      active={source,target:null,after:false,pointer:event.pointerId};source.classList.add('reorder-source');document.body.classList.add('is-reordering');pending=null;onReady();
    },380)};
  });
  document.addEventListener('pointermove',event=>{
    if(pending&&Math.hypot(event.clientX-pending.x,event.clientY-pending.y)>7)clear();
    if(!active||event.pointerId!==active.pointer)return;
    event.preventDefault();
    document.querySelectorAll('.reorder-before,.reorder-after').forEach(el=>el.classList.remove('reorder-before','reorder-after'));
    const target=document.elementFromPoint(event.clientX,event.clientY)?.closest(selector);
    active.target=null;
    if(target&&target!==active.source&&target.dataset.reorderKind===active.source.dataset.reorderKind){
      // Reordering tasks stays within completion and pin groups. Dates never move.
      if(target.dataset.reorderKind==='task'&&(target.dataset.top!==active.source.dataset.top||target.dataset.done!==active.source.dataset.done))return;
      const rect=target.getBoundingClientRect();active.target=target;active.after=event.clientY>rect.top+rect.height/2;
      target.classList.add(active.after?'reorder-after':'reorder-before');
      const scroll=target.closest('.widget-list,.task-list,.gantt-scroll,.projects,.sidebar,.calendar-scroll');
      if(scroll){const bounds=scroll.getBoundingClientRect();if(event.clientY<bounds.top+32)scroll.scrollTop-=18;else if(event.clientY>bounds.bottom-32)scroll.scrollTop+=18;}
    }
  },{passive:false});
  document.addEventListener('pointerup',()=>finish(true));
  document.addEventListener('pointercancel',()=>finish(false));
  window.addEventListener('blur',()=>finish(false));
  document.addEventListener('click',event=>{if(performance.now()<suppressUntil){event.preventDefault();event.stopImmediatePropagation();}},true);
  document.addEventListener('contextmenu',event=>{if(active){event.preventDefault();finish(false);}});
  document.addEventListener('keydown',event=>{
    if(event.key==='Escape'){finish(false);return;}
    if(!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key))return;
    const source=event.target.closest(selector);if(!source)return;
    const kind=source.dataset.reorderKind,container=source.closest('.widget-list,#task-list,#gantt-rows,#month-grid,.nav-group');if(!container)return;
    const candidates=[...container.querySelectorAll(selector)].filter(el=>el.dataset.reorderKind===kind&&el.dataset.top===source.dataset.top&&el.dataset.done===source.dataset.done);
    const target=candidates[candidates.indexOf(source)+(event.key==='ArrowDown'?1:-1)];if(!target)return;
    event.preventDefault();onMove(kind,source.dataset.reorderId,target.dataset.reorderId,event.key==='ArrowDown');restoreFocus(source,container.id);
  });
}
