export async function chooseAvatar(){
  const file=await new Promise(resolve=>{
    const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';
    const finish=value=>{document.removeEventListener('toz:avatar-cancel',cancel);resolve(value);};
    const cancel=()=>finish(null);
    document.addEventListener('toz:avatar-cancel',cancel,{once:true});
    input.addEventListener('change',()=>finish(input.files?.[0]||null),{once:true});
    input.addEventListener('cancel',cancel,{once:true});input.click();
  });
  if(!file)return null;
  if(file.size>5*1024*1024||!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('请选择不超过 5 MB 的 PNG、JPEG 或 WebP 图片');
  const bitmap=await createImageBitmap(file),size=Math.min(bitmap.width,bitmap.height);
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
  canvas.getContext('2d').drawImage(bitmap,(bitmap.width-size)/2,(bitmap.height-size)/2,size,size,0,0,128,128);bitmap.close();
  return canvas.toDataURL('image/png');
}
