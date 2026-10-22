const test=require('node:test');
const assert=require('node:assert/strict');
const {widgetMenuTemplate}=require('./widget-menu.cjs');
test('浮窗菜单区分窗口置顶、折叠与穿透，并将选择交给原生操作',()=>{
  const calls=[],actions=Object.fromEntries(['add','collapse','pin','through','appearance','settings','main'].map(key=>[key,value=>calls.push([key,value])]));
  const menu=widgetMenuTemplate({widgetPinned:true,widgetCollapsed:true},true,actions);
  assert.equal(menu.find(i=>i.label==='展开浮窗').click,actions.collapse);
  const pin=menu.find(i=>i.label==='窗口始终置顶');assert.equal(pin.type,'checkbox');assert.equal(pin.checked,true);pin.click({checked:false});
  menu.find(i=>i.label==='解除鼠标穿透').click();menu.find(i=>i.label==='背景不透明度…').click();
  assert.deepEqual(calls,[['pin',false],['through',false],['appearance',undefined]]);
  assert.equal(widgetMenuTemplate({widgetPinned:false,widgetCollapsed:false},false,actions).find(i=>i.label==='解除鼠标穿透').enabled,false);
});
