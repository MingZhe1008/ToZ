export function mountContextMenu({resolve,items,onCommand,icon=()=>'',onRootArrow}){
  const panel=(label,extra='')=>{const el=document.createElement('div');el.className='context-menu '+extra;el.role='menu';el.hidden=true;el.setAttribute('aria-label',label);document.body.append(el);return el;};
  const menu=panel('操作菜单'),submenu=panel('移动到分区','context-submenu');
  let target=null,origin=null,parentButton=null,hideTimer;
  const models=new WeakMap();
  const closeSubmenu=()=>{clearTimeout(hideTimer);submenu.hidden=true;parentButton?.setAttribute('aria-expanded','false');parentButton=null;};
  const close=(focus=false)=>{closeSubmenu();menu.hidden=true;target=null;origin?.setAttribute('aria-expanded','false');if(focus&&origin?.isConnected)origin.focus({preventScroll:true});};
  function addButton(root,item){
    if(item.separator){const divider=document.createElement('div');divider.className='context-menu-separator';divider.role='separator';root.append(divider);return;}
    const button=document.createElement('button');button.type='button';button.role=item.checked===undefined?'menuitem':item.type==='checkbox'?'menuitemcheckbox':'menuitemradio';button.dataset.contextCommand=item.key;button.setAttribute('aria-label',item.label);button.title=item.label;button.disabled=!!item.disabled;models.set(button,item);
    if(item.icon){const glyph=document.createElement('span');glyph.className='context-icon';glyph.setAttribute('aria-hidden','true');glyph.innerHTML=icon(item.icon);button.append(glyph);}
    if(item.danger)button.classList.add('danger');
    if(item.color){const dot=document.createElement('i');dot.className='context-color';dot.style.backgroundColor=item.color;dot.setAttribute('aria-hidden','true');button.append(dot);}
    const label=document.createElement('span');label.className='context-item-label';label.textContent=item.label;button.append(label);
    if(item.checked!==undefined){button.setAttribute('aria-checked',String(item.checked));if(item.checked){const mark=document.createElement('span');mark.className='context-current';mark.textContent='✓';mark.setAttribute('aria-hidden','true');button.append(mark);}}
    if(item.children){button.setAttribute('aria-haspopup','menu');button.setAttribute('aria-expanded','false');const arrow=document.createElement('span');arrow.className='context-submenu-arrow';arrow.textContent='›';arrow.setAttribute('aria-hidden','true');button.append(arrow);}
    if(item.shortcut){const hint=document.createElement('kbd');hint.className='context-shortcut';hint.textContent=item.shortcut;button.append(hint);}
    root.append(button);return button;
  }
  function openSubmenu(button,focus=false){
    const item=models.get(button);if(!item?.children||button.disabled)return;clearTimeout(hideTimer);
    if(parentButton!==button||submenu.hidden){
      closeSubmenu();parentButton=button;button.setAttribute('aria-expanded','true');submenu.replaceChildren();
      for(const child of item.children)addButton(submenu,child);
      submenu.hidden=false;submenu.style.left='0px';submenu.style.top='0px';
      const row=button.getBoundingClientRect(),box=submenu.getBoundingClientRect();let main=menu.getBoundingClientRect();
      if(main.right+4+box.width>innerWidth-8&&main.left-box.width-4<8&&main.width+box.width+4<=innerWidth-16){menu.style.left='8px';main=menu.getBoundingClientRect();}
      const right=main.right+4,left=main.left-box.width-4;
      submenu.style.left=Math.max(8,Math.min(right+box.width<=innerWidth-8?right:left,innerWidth-box.width-8))+'px';
      submenu.style.top=Math.max(8,Math.min(row.top,innerHeight-box.height-8))+'px';
    }
    if(focus)(submenu.querySelector('[aria-checked="true"]')||submenu.querySelector('button:not(:disabled)'))?.focus({preventScroll:true});
  }
  const open=(entity,x,y,source)=>{
    close();target=entity;origin=source;
    if(entity.kind==='menubar')source?.setAttribute('aria-expanded','true');
    const title=document.createElement('div');title.className='context-menu-title';title.textContent=entity.label;menu.replaceChildren(title);
    for(const item of items(entity))addButton(menu,item);
    menu.hidden=false;menu.style.left='0px';menu.style.top='0px';
    const r=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(x,innerWidth-r.width-8))+'px';menu.style.top=Math.max(8,Math.min(y,innerHeight-r.height-8))+'px';
    menu.querySelector('button:not(:disabled)')?.focus({preventScroll:true});
  };
  document.addEventListener('contextmenu',event=>{
    if(event.defaultPrevented||event.target.closest('input,textarea,[contenteditable],dialog'))return;
    const entity=resolve(event.target);if(!entity)return;event.preventDefault();open(entity,event.clientX,event.clientY,event.target.closest('button,[tabindex]'));
  });
  const click=event=>{
    const button=event.target.closest('[data-context-command]');if(!button||button.disabled)return;
    event.stopPropagation();const item=models.get(button);if(item.children){openSubmenu(button,true);return;}
    const entity=target;close();onCommand(item.key,entity,item.value);
  };
  menu.addEventListener('click',click);submenu.addEventListener('click',click);
  menu.addEventListener('pointerover',event=>{const button=event.target.closest('button');if(!button)return;if(models.get(button)?.children)openSubmenu(button);else closeSubmenu();});
  const leave=event=>{if(event.relatedTarget?.closest?.('.context-menu'))return;clearTimeout(hideTimer);hideTimer=setTimeout(closeSubmenu,200);};
  menu.addEventListener('pointerleave',leave);submenu.addEventListener('pointerleave',leave);submenu.addEventListener('pointerenter',()=>clearTimeout(hideTimer));
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.context-menu')&&!event.target.closest('[data-menu]'))close();},true);
  document.addEventListener('scroll',event=>{if(event.target!==menu&&event.target!==submenu)close();},true);
  window.addEventListener('resize',()=>close());window.addEventListener('blur',()=>close());
  document.addEventListener('keydown',event=>{
    if(!menu.hidden){
      const inSubmenu=submenu.contains(document.activeElement),active=document.activeElement;
      if(!inSubmenu&&target?.kind==='menubar'&&['ArrowLeft','ArrowRight'].includes(event.key)&&!models.get(active)?.children){event.preventDefault();event.stopImmediatePropagation();onRootArrow?.(origin,event.key==='ArrowLeft'?-1:1);return;}
      if(event.key==='Escape'||event.key==='ArrowLeft'&&inSubmenu){
        event.preventDefault();event.stopImmediatePropagation();if(inSubmenu){const parent=parentButton;closeSubmenu();parent?.focus({preventScroll:true});}else close(true);return;
      }
      if(event.key==='ArrowRight'&&models.get(active)?.children){event.preventDefault();event.stopImmediatePropagation();openSubmenu(active,true);return;}
      if(event.key==='Tab'){close();return;}
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
        event.preventDefault();event.stopImmediatePropagation();const root=inSubmenu?submenu:menu,buttons=[...root.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(active);
        if(!inSubmenu)closeSubmenu();
        buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowUp'?-1:1)+buttons.length)%buttons.length]?.focus({preventScroll:false});return;
      }
      if(!event.ctrlKey&&!event.metaKey)event.stopImmediatePropagation();
    }else if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){
      if(event.target.closest('input,textarea,[contenteditable],dialog'))return;
      const entity=resolve(event.target);if(!entity)return;event.preventDefault();const r=event.target.getBoundingClientRect();open(entity,r.left+12,r.top+20,event.target);
    }
  },true);
  return {close,openAt(element,entity){const r=element.getBoundingClientRect();open(entity,r.left,r.bottom+4,element);}};
}

