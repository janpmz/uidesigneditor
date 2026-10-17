let regionSelection=null,canvasGesture=null,canvasClipboard=null,canvasPasteCount=0,canvasEditBusy=false;
const canvasMenu=$('canvas-edit-menu');
function isPagePicture(entry){
  if(entry.kind!=='image'||entry.pictureFragment)return false;
  if(entry.imageBase)return true;
  return Boolean(state.canvas.picturePage&&entry===state.items.find(item=>!item.hidden&&item.kind==='image')&&entry.x===0&&entry.y===0&&entry.w===state.canvas.width&&entry.h===state.canvas.height);
}
function regionSources(box){return state.items.filter(entry=>!entry.hidden&&entry.kind==='image'&&boxesOverlap(entry,box));}
function regionIsCurrent(region){
  const current=regionSources(region.box);
  return region.state===state&&region.sources.length===current.length&&region.sources.every((source,index)=>['id','src','x','y','w','h','opacity'].every(key=>current[index][key]===source[key]));
}
function clearCanvasRegion(){regionSelection=null;}
function renderSelection(){
  const phone=$('phone');phone.querySelectorAll('.selection-overlay,.pixel-selection').forEach(node=>node.remove());
  if(regionSelection&&(selected.size||!regionIsCurrent(regionSelection)))regionSelection=null;
  if(regionSelection&&editing){
    const box=canvasGesture?.preview||regionSelection.box,outline=document.createElement('div');outline.className='pixel-selection';
    outline.setAttribute('aria-label','Selected picture area');
    Object.assign(outline.style,{left:box.x+'px',top:box.y+'px',width:box.w+'px',height:box.h+'px'});phone.append(outline);return;
  }
  if(selectedItems().length&&selectedItems().every(isPagePicture))return;
  renderNativeSelection();
}
function rememberRegion(box){
  const area=clippedArea(box,state.canvas);if(area.w<1||area.h<1)return null;
  return {box:area,state,sources:regionSources(area).map(entry=>({...entry})),plan:null,pending:null};
}
function canvasSurface(width,height){const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.ceil(width));canvas.height=Math.max(1,Math.ceil(height));return canvas;}
const selectionImages=new Map();
function selectionImage(src){
  if(!selectionImages.has(src)){
    const promise=new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('Could not read this picture.'));image.src=src;});
    selectionImages.set(src,promise);if(selectionImages.size>8)selectionImages.delete(selectionImages.keys().next().value);
  }
  return selectionImages.get(src);
}
function pageBackgroundPixels(){
  const canvas=canvasSurface(1,1),ctx=canvas.getContext('2d');ctx.fillStyle=state.canvas.background;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];
}
async function makeRegionPlan(region){
  if(region.plan)return region.plan;if(region.pending)return region.pending;
  region.pending=(async()=>{
    const sources=region.sources,images=await Promise.all(sources.map(source=>selectionImage(source.src)));
    if(!regionIsCurrent(region))throw new Error('The page changed. Select the area again.');
    const area=region.box,ratio=Math.min(4,Math.sqrt(24000000/(area.w*area.h)),Math.max(1,...images.map((image,index)=>image.naturalWidth/sources[index].w)));
    const crop=canvasSurface(area.w*ratio,area.h*ratio),ctx=crop.getContext('2d'),patches=[];
    ctx.scale(crop.width/area.w,crop.height/area.h);
    for(let index=0;index<sources.length;index++){
      const source=sources[index],image=images[index];ctx.globalAlpha=source.opacity??1;
      ctx.drawImage(image,source.x-area.x,source.y-area.y,source.w,source.h);
      const box=sourcePixelArea(area,source,image.naturalWidth,image.naturalHeight);if(!box.w||!box.h)continue;
      const base=isPagePicture(state.items.find(entry=>entry.id===source.id));
      if(!base&&box.w===image.naturalWidth&&box.h===image.naturalHeight){patches.push({id:source.id,hidden:true});continue;}
      const surface=canvasSurface(image.naturalWidth,image.naturalHeight),context=surface.getContext('2d');context.drawImage(image,0,0);
      if(base){const pixels=context.getImageData(0,0,surface.width,surface.height);fillPixelArea(pixels.data,surface.width,surface.height,box,pageBackgroundPixels());context.putImageData(pixels,0,0);}
      else context.clearRect(box.x,box.y,box.w,box.h);
      patches.push({id:source.id,src:surface.toDataURL('image/png')});
    }
    const entry=item('item-'+crypto.randomUUID(),'Picture selection','image',area.x,area.y,area.w,area.h,{src:crop.toDataURL('image/png'),pictureFragment:true});
    region.plan={entry,patches};return region.plan;
  })();
  return region.pending;
}
function applyRegionPatches(plan){for(const patch of plan.patches){const entry=state.items.find(item=>item.id===patch.id);if(entry){Object.assign(entry,patch);delete entry.imageContents;}}}
function prepareRegion(region){makeRegionPlan(region).catch(error=>{if(regionSelection===region)notify(error.message);});}
function closeCanvasMenu(){canvasMenu.hidden=true;}
function backgroundMergeSelection(){
  const entries=selectedItems(),bases=state.items.filter(entry=>!entry.hidden&&isPagePicture(entry));
  if(regionSelection||!entries.length||!bases.length||entries.some(entry=>entry.kind!=='image'||!entry.pictureFragment))return null;
  return {entries,bases};
}
async function mergeSelectionIntoBackground(){
  if(!editing||canvasGesture||canvasEditBusy||pictureDropBusy||pictureChoice.open)return;
  const selection=backgroundMergeSelection();if(!selection)return;
  canvasEditBusy=true;
  const before=JSON.stringify(state),{entries,bases}=selection,ids=new Set([...bases,...entries].map(entry=>entry.id));
  const sources=state.items.filter(entry=>ids.has(entry.id)),width=state.canvas.width,height=state.canvas.height;
  try{
    const images=await Promise.all(sources.map(source=>selectionImage(source.src)));
    if(JSON.stringify(state)!==before)throw new Error('The page changed. Choose No item again.');
    const ratio=Math.min(4,Math.sqrt(24000000/(width*height)),Math.max(1,...images.map((image,index)=>Math.max(image.naturalWidth/sources[index].w,image.naturalHeight/sources[index].h))));
    const canvas=await html2canvas($('phone'),{
      width,height,scale:ratio,scrollX:0,scrollY:0,logging:false,backgroundColor:state.canvas.background,
      windowWidth:Math.max(document.documentElement.clientWidth,width),windowHeight:Math.max(document.documentElement.clientHeight,height),
      ignoreElements:element=>['selection-overlay','pixel-selection','guide','marquee'].some(name=>element.classList?.contains(name))||(element.classList?.contains('item')&&!ids.has(element.dataset.id)),
      onclone:cloned=>{
        const phone=cloned.getElementById('phone');phone.classList.remove('editing');
        Object.assign(phone.style,{position:'fixed',left:'0',top:'0',width:width+'px',height:height+'px',transform:'none',boxShadow:'none',borderRadius:'0'});
        cloned.querySelectorAll('dialog').forEach(dialog=>dialog.removeAttribute('open'));
      },
    });
    if(JSON.stringify(state)!==before)throw new Error('The page changed. Choose No item again.');
    const background=item(bases[0].id,bases.length===1?bases[0].name:'Page background','image',0,0,width,height,{src:canvas.toDataURL('image/png'),imageBase:true});
    change(()=>{
      state.items=state.items.flatMap(entry=>entry.id===background.id?[background]:ids.has(entry.id)?[]:[entry]);
      regionSelection=null;selected.clear();
    });
    stage.focus({preventScroll:true});notify('Merged into background');
  }catch(error){notify(error.message||'Could not merge this item.');}
  finally{canvasEditBusy=false;}
}
function endCanvasGesture(cancel=false){
  const gesture=canvasGesture;if(!gesture)return;
  canvasGesture=null;gesture.cancelled=cancel;gesture.box?.remove();
  if(stage.hasPointerCapture(gesture.pointer))stage.releasePointerCapture(gesture.pointer);
  if(cancel){if(gesture.changed)state=JSON.parse(gesture.before);selected=new Set(gesture.selectionBefore);regionSelection=gesture.regionBefore?rememberRegion(gesture.regionBefore.box):null;}
  else if(gesture.changed){remember(gesture.before);regionSelection=null;}
  render();
}
function moveGestureItems(gesture,point,event){
  let dx=point.x-gesture.start.x,dy=point.y-gesture.start.y;
  if(event?.shiftKey){if(Math.abs(dx)>Math.abs(dy))dy=0;else dx=0;}
  gesture.items.forEach((entry,index)=>Object.assign(entry,gesture.starts[index]));
  const snap=value=>gesture.type!=='pixels'&&$('snap')?.checked&&!event?.altKey?Math.round(value/4)*4:round(value);
  if(gesture.type==='resize')scaleItemFromCorner(gesture.items[0],gesture.starts[0],dx,dy,state.canvas,snap);
  else{const bounds=boundsOf(gesture.items);moveWithin(gesture.items,dx===0?0:snap(bounds.x+dx)-bounds.x,dy===0?0:snap(bounds.y+dy)-bounds.y,state.canvas);}
  gesture.changed=gesture.before!==JSON.stringify(state);
  for(const entry of gesture.items){const node=[...$('phone').querySelectorAll('.item')].find(node=>node.dataset.id===entry.id);if(node)styleItem(node,entry);}
  renderSelection();
}
function applyPixelGesture(gesture){
  if(gesture.cancelled||!gesture.plan||!gesture.moved)return;
  if(!gesture.lifted){
    if(!regionIsCurrent(gesture.regionBefore)){endCanvasGesture(true);return;}
    applyRegionPatches(gesture.plan);const entry=copy(gesture.plan.entry);state.items.push(entry);
    selected=new Set([entry.id]);regionSelection=null;gesture.items=[entry];gesture.starts=[copy(entry)];gesture.lifted=true;gesture.changed=true;renderPhone();renderLayers();renderInspector();
  }
  moveGestureItems(gesture,gesture.latest,gesture.event);
}
stage.addEventListener('pointerdown',event=>{
  if(!editing||event.button!==0)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(canvasGesture||canvasEditBusy||pictureDropBusy||pictureChoice.open)return;
  closeCanvasMenu();stage.focus({preventScroll:true});
  const point=phonePoint(event),hit=event.target.closest('.item,.selection-overlay'),id=hit?.dataset.id;
  const entry=state.items.find(item=>item.id===id),items=selectedItems().filter(item=>!isPagePicture(item));
  const common={pointer:event.pointerId,start:point,latest:point,selectionBefore:[...selected],regionBefore:regionSelection,before:JSON.stringify(state),changed:false,moved:false};
  if(regionSelection&&pointInArea(point,regionSelection.box)){
    const gesture=canvasGesture={...common,type:'pixels'};
    gesture.ready=makeRegionPlan(regionSelection).then(plan=>{gesture.plan=plan;if(canvasGesture===gesture)applyPixelGesture(gesture);}).catch(error=>{notify(error.message);if(canvasGesture===gesture)endCanvasGesture(true);});
  }else if(!event.shiftKey&&items.length&&(pointInArea(point,boundsOf(items))||event.target.closest('.group-grip,.resize-handle'))){
    regionSelection=null;canvasGesture={...common,type:event.target.closest('.resize-handle')?'resize':'move',items,starts:items.map(copy)};
  }else{
    regionSelection=null;
    canvasGesture={...common,type:'box',pixels:Boolean(state.canvas.picturePage&&(!entry||entry.kind==='image')),hitId:entry&&!isPagePicture(entry)?id:null,base:event.shiftKey?[...selected]:[],startX:event.clientX,startY:event.clientY};
    if(canvasGesture.pixels||!event.shiftKey)selected.clear();drawBox(canvasGesture,event);refreshSelection();
  }
  stage.setPointerCapture(event.pointerId);
},true);
stage.addEventListener('pointermove',event=>{
  const gesture=canvasGesture;if(!gesture||event.pointerId!==gesture.pointer)return;
  event.preventDefault();event.stopImmediatePropagation();gesture.latest=phonePoint(event);gesture.event={shiftKey:event.shiftKey,altKey:event.altKey};
  const distance=Math.hypot(gesture.latest.x-gesture.start.x,gesture.latest.y-gesture.start.y);
  if(distance>.1)gesture.moved=true;
  if(gesture.type==='box'){
    drawBox(gesture,event);const box=boxBetween(gesture.start,gesture.latest);
    if(gesture.pixels){regionSelection=rememberRegion(box);renderSelection();}
    else{selected=new Set([...gesture.base,...itemIdsInSelection(state.items.filter(entry=>!isPagePicture(entry)),box)]);refreshSelection();}
  }else if(gesture.type==='pixels'){
    const box=gesture.regionBefore.box;gesture.preview={...box,x:clamp(box.x+gesture.latest.x-gesture.start.x,0,state.canvas.width-box.w),y:clamp(box.y+gesture.latest.y-gesture.start.y,0,state.canvas.height-box.h)};
    applyPixelGesture(gesture);renderSelection();
  }else if(gesture.moved)moveGestureItems(gesture,gesture.latest,gesture.event);
},true);
stage.addEventListener('pointerup',async event=>{
  const gesture=canvasGesture;if(!gesture||event.pointerId!==gesture.pointer)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(gesture.type==='pixels'&&gesture.moved){gesture.finishing=true;await gesture.ready;if(canvasGesture!==gesture)return;applyPixelGesture(gesture);}
  if(gesture.type==='box'){
    if(!gesture.moved&&gesture.hitId){selected=new Set(event.shiftKey?gesture.base.includes(gesture.hitId)?gesture.base.filter(id=>id!==gesture.hitId):[...gesture.base,gesture.hitId]:[gesture.hitId]);regionSelection=null;}
    else if(gesture.pixels&&regionSelection)prepareRegion(regionSelection);
  }
  endCanvasGesture();
},true);
for(const type of ['pointercancel','lostpointercapture'])stage.addEventListener(type,event=>{if(canvasGesture?.pointer===event.pointerId){event.stopImmediatePropagation();if(type!=='lostpointercapture'||!canvasGesture.finishing)endCanvasGesture(true);}},true);

// BEGIN CANVAS CLIPBOARD
function readCanvasClipboard(text){
  try{
    const payload=JSON.parse(text);if(payload.type!=='layout-items'||payload.version!==1||!Array.isArray(payload.items)||!payload.items.length)return null;
    if(!payload.items.every(entry=>entry&&['label','icon','shape','reading','tab','button','textbox','image'].includes(entry.kind)&&['x','y','w','h'].every(key=>Number.isFinite(entry[key]))&&entry.w>0&&entry.h>0&&(entry.kind!=='image'||safePictureSource(entry.src))))return null;
    return {items:payload.items,cut:payload.cut===true};
  }catch{return null;}
}
function canvasClipboardText(){return JSON.stringify({type:'layout-items',version:1,items:canvasClipboard.items,cut:canvasClipboard.cut});}
async function writeCanvasClipboard(){try{await Promise.race([navigator.clipboard.writeText(canvasClipboardText()),new Promise(resolve=>setTimeout(resolve,500))]);}catch{}}
function storeCanvasClipboard(entries,cut,event){
  canvasClipboard={items:copy(entries),cut};canvasPasteCount=0;
  event?.clipboardData?.setData('text/plain',canvasClipboardText());void writeCanvasClipboard();
}
async function copyCanvasSelection(cut=false,event){
  if(canvasEditBusy)return;
  if(regionSelection){
    canvasEditBusy=true;const region=regionSelection;
    try{
      const plan=await makeRegionPlan(region);if(regionSelection!==region||!regionIsCurrent(region))return;
      storeCanvasClipboard([plan.entry],cut,event);
      if(cut)change(()=>{applyRegionPatches(plan);regionSelection=null;selected.clear();});
      notify(cut?'Selection cut. Paste to place it.':'Selection copied');
    }catch(error){notify(error.message);}finally{canvasEditBusy=false;}
  }else{
    const entries=selectedItems();if(!entries.length)return;storeCanvasClipboard(entries,cut,event);
    if(cut)deleteSelected();notify(cut?'Items cut':'Items copied');
  }
}
function pasteCanvasClipboard(payload=canvasClipboard){
  if(!payload?.items?.length)return false;
  canvasClipboard=copy(payload);const entries=copy(payload.items),offset=payload.cut&&canvasPasteCount===0?0:12*(canvasPasteCount+1);canvasPasteCount++;
  moveWithin(entries,offset,offset,state.canvas);
  change(()=>{
    regionSelection=null;
    for(const entry of entries){entry.id='item-'+crypto.randomUUID();entry.name=(entry.name||'Item')+' copy';entry.hidden=false;delete entry.imageBase;state.items.push(entry);}
    selected=new Set(entries.map(entry=>entry.id));
  });notify(entries.length===1?'Item pasted':entries.length+' items pasted');return true;
}
// END CANVAS CLIPBOARD
function canvasTextTarget(target){return Boolean(target?.closest?.('input,textarea,select,[contenteditable]:not([contenteditable="false"])'));}
function canEditCanvas(event){return editing&&!canvasGesture&&!canvasEditBusy&&!pictureChoice.open&&!$('icon-picker')?.open&&!canvasTextTarget(event.target);}
for(const type of ['copy','cut'])document.addEventListener(type,event=>{
  if(!canEditCanvas(event)||(!regionSelection&&!selectedItems().length))return;
  event.preventDefault();event.stopImmediatePropagation();void copyCanvasSelection(type==='cut',event);
},true);
document.addEventListener('paste',event=>{
  if(!canEditCanvas(event))return;
  const files=[...(event.clipboardData?.files||[])].filter(file=>pictureType(file));
  if(files.length){
    event.preventDefault();event.stopImmediatePropagation();
    void handlePictureDrop({dataTransfer:{files},clientX:NaN,clientY:NaN,preventDefault(){}});return;
  }
  const payload=readCanvasClipboard(event.clipboardData?.getData('text/plain'));if(!payload)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(JSON.stringify(payload)!==JSON.stringify(canvasClipboard))canvasPasteCount=0;
  pasteCanvasClipboard(payload);
},true);
document.addEventListener('keydown',event=>{
  if(canvasTextTarget(event.target)||pictureChoice.open||$('icon-picker')?.open)return;
  if(event.key==='Escape'&&!canvasMenu.hidden){event.preventDefault();event.stopImmediatePropagation();closeCanvasMenu();return;}
  if(canvasGesture){event.preventDefault();event.stopImmediatePropagation();if(event.key==='Escape')endCanvasGesture(true);return;}
  if(!editing||canvasEditBusy||$('editor-tools')?.open)return;
  const command=event.metaKey||event.ctrlKey,key=event.key.toLowerCase();
  if(command&&(key==='c'||key==='x')&&(regionSelection||selectedItems().length)){event.preventDefault();event.stopImmediatePropagation();void copyCanvasSelection(key==='x');return;}
  if(command&&key==='a'&&state.canvas.picturePage){event.preventDefault();event.stopImmediatePropagation();selected.clear();regionSelection=rememberRegion({x:0,y:0,w:state.canvas.width,h:state.canvas.height});renderSelection();prepareRegion(regionSelection);return;}
  if(event.key==='Escape'&&regionSelection){event.preventDefault();event.stopImmediatePropagation();regionSelection=null;render();return;}
  if(regionSelection&&(event.key==='Delete'||event.key==='Backspace')){
    event.preventDefault();event.stopImmediatePropagation();canvasEditBusy=true;
    void (async()=>{const region=regionSelection;try{const plan=await makeRegionPlan(region);if(regionSelection===region&&regionIsCurrent(region))change(()=>{applyRegionPatches(plan);regionSelection=null;});}catch(error){notify(error.message);}finally{canvasEditBusy=false;}})();
  }
},true);
if($('copy-items'))$('copy-items').onclick=()=>copyCanvasSelection();
if($('paste-items'))$('paste-items').onclick=async()=>{
  if(pasteCanvasClipboard())return;
  try{const text=await Promise.race([navigator.clipboard.readText(),new Promise(resolve=>setTimeout(()=>resolve(''),700))]);const payload=readCanvasClipboard(text);if(payload&&pasteCanvasClipboard(payload))return;}catch{}
  notify('Copy items or a picture selection first.');
};
stage.addEventListener('contextmenu',event=>{
  if(!canEditCanvas(event)||pictureDropBusy)return;
  if(!regionSelection||!pointInArea(phonePoint(event),regionSelection.box)){
    const id=event.target.closest('.item,.selection-overlay')?.dataset.id;
    if(id&&!selected.has(id)){regionSelection=null;selected=new Set([id]);refreshSelection();}
  }
  if(!regionSelection&&!selectedItems().length)return;
  event.preventDefault();event.stopImmediatePropagation();canvasMenu.hidden=false;
  $('canvas-menu-edit-image').hidden=!pictureToEdit();
  $('canvas-menu-fit-content').disabled=Boolean(regionSelection)||!selectedItems().some(canFitContent);
  $('canvas-menu-no-item').hidden=!backgroundMergeSelection();
  canvasMenu.style.left=clamp(event.clientX,8,Math.max(8,window.innerWidth-canvasMenu.offsetWidth-8))+'px';canvasMenu.style.top=clamp(event.clientY,8,Math.max(8,window.innerHeight-canvasMenu.offsetHeight-8))+'px';
  $('canvas-menu-paste').disabled=!canvasClipboard;$('canvas-menu-cut').focus({preventScroll:true});
},true);
$('canvas-menu-cut').onclick=()=>{closeCanvasMenu();void copyCanvasSelection(true);};
$('canvas-menu-copy').onclick=()=>{closeCanvasMenu();void copyCanvasSelection();};
$('canvas-menu-paste').onclick=()=>{closeCanvasMenu();pasteCanvasClipboard();};
$('canvas-menu-fit-content').onclick=()=>{closeCanvasMenu();return fitCanvasSelection();};
$('canvas-menu-no-item').onclick=()=>{closeCanvasMenu();return mergeSelectionIntoBackground();};
$('canvas-menu-edit-image').onclick=()=>{closeCanvasMenu();const entry=pictureToEdit();if(entry)return openImageEditor(entry.id);};
document.addEventListener('pointerdown',event=>{if(!canvasMenu.contains(event.target))closeCanvasMenu();},true);
