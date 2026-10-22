// Runs against our own isolated Electron QA window; never submits the draft.
module.exports=async function datePickerSmoke(webContents,formId){
  return webContents.executeJavaScript(`(() => {
    const form=document.getElementById(${JSON.stringify(formId)}),results=[];
    const check=(ok,label)=>{if(!ok)throw new Error(label);results.push(label);};
    for(const name of ['startDate','date']){
      const input=form.elements[name],root=input.nextElementSibling,panel=root.querySelector('.picker-panel'),trigger=root.querySelector('.date-trigger'),original=input.value;
      trigger.click();check(!panel.hidden,name+': open');
      const [year,month]=panel.querySelector('strong').textContent.match(/\\d+/g).map(Number);
      const title=()=>panel.querySelector('strong').textContent.match(/\\d+/g).map(Number).join('-');
      const shift=delta=>{const svg=panel.querySelector('[data-picker-move="'+delta+'"] svg');svg.dispatchEvent(new MouseEvent('click',{bubbles:true,composed:true,cancelable:true}));check(!panel.hidden,name+': month panel stays open');};
      for(let i=0;i<3;i++)shift(1);
      for(let i=0;i<3;i++)shift(-1);
      check(title()===year+'-'+month,name+': round trip');check(input.value===original,name+': browsing preserves input');
      for(let i=0;i<13-month;i++)shift(1);
      check(title()===(year+1)+'-1',name+': January across year boundary');
      const selected=(year+1)+'-01-15';panel.querySelector('[data-pick-date="'+selected+'"]').click();
      check(input.value===selected&&panel.hidden,name+': selecting commits and closes');
      if(name==='startDate')check(form.elements.date.value>=selected,name+': finish follows start');
      trigger.click();form.querySelector('[name="title"]')?.click();
      if(form.querySelector('[name="title"]'))check(panel.hidden,name+': outside closes');
      else trigger.click();
    }
    form.closest('dialog').close();return {ok:true,results};
  })()`);
};
