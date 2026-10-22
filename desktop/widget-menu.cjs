// Native menus remain usable when the transparent widget is only 68px high.
function widgetMenuTemplate(settings,clickThrough,actions){
  return [
    {label:'添加待办',click:actions.add},
    {label:settings.widgetCollapsed?'展开浮窗':'折叠浮窗',click:actions.collapse},
    {type:'separator'},
    {label:'窗口始终置顶',type:'checkbox',checked:settings.widgetPinned,click:item=>actions.pin(item.checked)},
    {label:'鼠标穿透',type:'checkbox',checked:clickThrough,click:item=>actions.through(item.checked)},
    {label:'解除鼠标穿透',enabled:clickThrough,click:()=>actions.through(false)},
    {type:'separator'},
    {label:'背景不透明度…',click:actions.appearance},
    {label:'设置…',click:actions.settings},
    {label:'打开工作台',click:actions.main}
  ];
}
module.exports={widgetMenuTemplate};
