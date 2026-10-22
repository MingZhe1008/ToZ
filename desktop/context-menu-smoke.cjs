module.exports=async function contextMenuSmoke(webContents,surface,id,leaveOpen=false){
  return webContents.executeJavaScript(`(() => {
    const row=document.querySelector(${JSON.stringify('.'+(surface==='widget'?'widget-row':'task-row')+'[data-task="'+id+'"]')}),layouts=[];
    if(!row)throw new Error('分类菜单测试任务不可见');
    for(const x of [8,innerWidth/3,innerWidth/2,innerWidth-8]){
      row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:x,clientY:innerHeight-12}));
      const menu=document.querySelector('.context-menu:not(.context-submenu)'),parent=menu.querySelector('[aria-haspopup="menu"]');parent.click();
      const sub=document.querySelector('.context-submenu'),a=menu.getBoundingClientRect(),b=sub.getBoundingClientRect();
      const fit=[a,b].every(r=>r.left>=7&&r.right<=innerWidth-7&&r.top>=7&&r.bottom<=innerHeight-7),separate=a.right+3<=b.left||b.right+3<=a.left;
      if(sub.hidden||!fit||!separate||sub.querySelectorAll('[aria-checked="true"]').length!==1)throw new Error('二级菜单被裁切、重叠或当前分区标记错误');
      layouts.push({width:innerWidth,x,parent:{left:a.left,right:a.right},submenu:{left:b.left,right:b.right},fit,separate});
    }
    if(!${JSON.stringify(leaveOpen)})document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    return {ok:true,layouts};
  })()`);
};
