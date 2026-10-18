// BEGIN FIT CONTENT
function canFitContent(entry){
  return ['label','icon','reading','tab','button','textbox'].includes(entry.kind)&&Boolean(entry.text?.trim()||entry.icon);
}
function fitContentRects(node){
  const content=node.querySelector('.content');if(!content)return [];
  const rects=[],walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){
    if(!walker.currentNode.textContent.trim())continue;
    const range=document.createRange();range.selectNodeContents(walker.currentNode);
    rects.push(...[...range.getClientRects()].filter(rect=>rect.width>0&&rect.height>0));
  }
  return rects;
}
function fitContentBounds(rects){
  if(!rects.length)return null;
  const left=Math.min(...rects.map(rect=>rect.left)),top=Math.min(...rects.map(rect=>rect.top));
  return {left,top,width:Math.max(...rects.map(rect=>rect.right))-left,height:Math.max(...rects.map(rect=>rect.bottom))-top};
}
function measureContentBox(entry,node){
  const before=fitContentBounds(fitContentRects(node));if(!before)return null;
  const original=node.getBoundingClientRect(),zoom=original.width/entry.w;
  if(!(zoom>0))return null;
  const probe=node.cloneNode(true);probe.classList.remove('selected');probe.setAttribute('aria-hidden','true');probe.removeAttribute('tabindex');
  Object.assign(probe.style,{left:'0',top:'0',height:'auto',width:entry.wrap?entry.w+'px':'max-content',visibility:'hidden',pointerEvents:'none'});
  node.parentNode.append(probe);
  try{
    if(entry.wrap){
      const lines=fitContentRects(probe),bounds=fitContentBounds(lines);if(!bounds)return null;
      const styles=getComputedStyle(probe),inset=['paddingLeft','paddingRight','borderLeftWidth','borderRightWidth'].reduce((sum,key)=>sum+(parseFloat(styles[key])||0),0);
      probe.style.width=Math.ceil((bounds.width/zoom+inset)*64)/64+'px';
      const fitted=fitContentRects(probe);
      // Keep each line as it was before the box changed.
      if(lines.length!==fitted.length||lines.some((rect,index)=>Math.abs(rect.width-fitted[index].width)>.01||Math.abs(rect.height-fitted[index].height)>.01))probe.style.width=entry.w+'px';
    }
    const box=probe.getBoundingClientRect(),after=fitContentBounds(fitContentRects(probe));if(!after)return null;
    return {
      x:round(entry.x+(before.left-original.left-after.left+box.left)/zoom),
      y:round(entry.y+(before.top-original.top-after.top+box.top)/zoom),
      w:Math.ceil(box.width/zoom*100)/100,h:Math.ceil(box.height/zoom*100)/100,
    };
  }finally{probe.remove();}
}
function contentFitPlans(entries){
  const nodes=[...$('phone').querySelectorAll('.item')],plans=[];
  for(const entry of entries){
    if(entry.hidden||!canFitContent(entry))continue;
    const node=nodes.find(node=>node.dataset.id===entry.id);if(!node)continue;
    const box=measureContentBox(entry,node);
    if(box&&['x','y','w','h'].every(key=>Number.isFinite(box[key]))&&box.w>0&&box.h>0&&['x','y','w','h'].some(key=>Math.abs(box[key]-entry[key])>.02))plans.push({entry,box});
  }
  return plans;
}
async function fitCanvasSelection(){
  if(!editing||canvasGesture||canvasEditBusy||regionSelection)return;
  const entries=selectedItems().filter(canFitContent);if(!entries.length)return;
  const before=JSON.stringify(state),ids=[...selected].join(',');canvasEditBusy=true;
  try{
    await document.fonts?.ready;
    if(before!==JSON.stringify(state)||ids!==[...selected].join(',')||!editing||regionSelection)return;
    const plans=contentFitPlans(entries);
    if(plans.length)change(()=>{for(const {entry,box} of plans)Object.assign(entry,box);});
    notify(plans.length?'Box fitted to content':'Box already fits content');
  }catch{notify('Could not fit this box.');}finally{canvasEditBusy=false;}
}
// END FIT CONTENT
