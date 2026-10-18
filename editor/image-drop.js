// Shared by the standalone drafts. Run npm run sync-images after edits.
// BEGIN PICTURE HELPERS
function pictureType(file){
  const type=(file.type||'').toLowerCase().split(';')[0];
  if(/^image\/(png|jpeg|webp|gif|avif|bmp)$/.test(type))return type;
  if(/^image\/hei(c|f)(-sequence)?$/.test(type))return 'image/heic';
  const ext=(file.name||'').split('.').pop().toLowerCase();
  return {png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',avif:'image/avif',bmp:'image/bmp',heic:'image/heic',heif:'image/heic'}[ext]||null;
}
function safePictureSource(src){return typeof src==='string'&&/^data:image\/png;base64,[a-z0-9+/=]+$/i.test(src);}
function editorPageFile(file){return file.type==='text/html'||/\.html?$/i.test(file.name||'');}
function picturePlacement(width,height,canvas,point,index=0){
  const factor=Math.min(1,canvas.width*.9/width,canvas.height*.9/height);
  const w=Math.max(.1,round(width*factor)),h=Math.max(.1,round(height*factor));
  return {w,h,x:round(point.x-w/2+index*12),y:round(point.y-h/2+index*12)};
}
function pictureDropPlan(pictures,action,canvas,point){
  if(action==='add')return {canvas,replace:false,boxes:pictures.map((picture,index)=>picturePlacement(picture.width,picture.height,canvas,point,index))};
  const width=Math.max(...pictures.map(picture=>picture.width));
  const height=pictures.reduce((sum,picture)=>sum+picture.height,0);
  const factor=Math.min(1,16000/width,16000/height,Math.sqrt(24000000/(width*height)));
  let y=0;
  const boxes=pictures.map(picture=>{
    const box={x:round((width-picture.width)*factor/2),y:round(y*factor),w:Math.max(.1,round(picture.width*factor)),h:Math.max(.1,round(picture.height*factor))};
    y+=picture.height;return box;
  });
  const pageSize={width:Math.ceil(width*factor),height:Math.ceil(height*factor)};
  return {canvas:{...canvas,...pageSize,picturePage:true,picturePageSize:pageSize},replace:true,boxes};
}
// END PICTURE HELPERS

// BEGIN PAGE SIZE HELPERS
function validPicturePageSize(size){return size&&['width','height'].every(key=>Number.isInteger(size[key])&&size[key]>0&&size[key]<=16000)&&size.width*size.height<=24000000;}
function storedPictureSize(src){
  if(!safePictureSource(src))return null;
  try{
    const bytes=Uint8Array.from(atob(src.slice(src.indexOf(',')+1).slice(0,32)),char=>char.charCodeAt(0));
    if(bytes.length!==24||![137,80,78,71,13,10,26,10].every((value,index)=>bytes[index]===value)||String.fromCharCode(...bytes.slice(12,16))!=='IHDR')return null;
    const header=new DataView(bytes.buffer),size={width:header.getUint32(16),height:header.getUint32(20)};
    return validPicturePageSize(size)?size:null;
  }catch{return null;}
}
function picturePageSizeFor(layout){
  if(validPicturePageSize(layout.canvas.picturePageSize))return {...layout.canvas.picturePageSize};
  if(layout.canvas.picturePage)return {width:layout.canvas.width,height:layout.canvas.height};
  const bases=layout.items.filter(entry=>entry.imageBase&&!entry.pictureFragment);
  const sizes=bases.map(entry=>storedPictureSize(entry.src));
  if(!sizes.length||sizes.some(size=>!size))return null;
  const page=pictureDropPlan(sizes,'new',layout.canvas,{x:0,y:0}).canvas;
  return {width:page.width,height:page.height};
}
function pageSizeChoices(layout){
  const page=picturePageSizeFor(layout),options=[
    {value:'393,852',text:'iPhone 16 · 393 × 852'},
    {value:'402,874',text:'iPhone 17 Pro · 402 × 874'},
    {value:'440,956',text:'Large phone · 440 × 956'},
    {value:'768,1024',text:'Tablet · 768 × 1024'},
    {value:'1440,900',text:'Website · 1440 × 900'},
    {value:'1920,1080',text:'Presentation · 1920 × 1080'},
    {value:'1080,1080',text:'Square · 1080 × 1080'},
    {value:'794,1123',text:'A4 page · 794 × 1123'},
  ];
  if(page)options.unshift({value:'page',text:'Page · '+page.width+' × '+page.height});
  const value=layout.canvas.picturePage?'page':layout.canvas.width+','+layout.canvas.height;
  if(!options.some(option=>option.value===value))options.push({value,text:layout.canvas.width+' × '+layout.canvas.height});
  options.push({value:'custom',text:'Custom size…'});
  return {page,options,value};
}
function isPhoneCanvas(canvas){return !canvas.picturePage&&['393,852','402,874','440,956'].includes(canvas.width+','+canvas.height);}
function setPageSize(layout,value,resizeItems=true){
  const page=picturePageSizeFor(layout),size=value==='page'?page:(()=>{const [width,height]=value.split(',').map(Number);return {width,height};})();
  if(!size||!['width','height'].every(key=>Number.isInteger(size[key])&&size[key]>0&&size[key]<=16000))return;
  if(page)layout.canvas.picturePageSize=page;
  const sx=size.width/layout.canvas.width,sy=size.height/layout.canvas.height;
  if(resizeItems)layout.items.forEach(entry=>{entry.x=round(entry.x*sx);entry.y=round(entry.y*sy);entry.w=Math.max(.1,round(entry.w*sx));entry.h=Math.max(.1,round(entry.h*sy));});
  layout.canvas.width=size.width;layout.canvas.height=size.height;
  if(value==='page')layout.canvas.picturePage=true;else delete layout.canvas.picturePage;
}
// END PAGE SIZE HELPERS
// BEGIN PAGE SIZE PICKER
function renderPageSizePicker(preset){
  const choices=pageSizeChoices(state);
  if(choices.page)state.canvas.picturePageSize=choices.page;
  if(preset.options.length!==choices.options.length||choices.options.some((choice,index)=>preset.options[index].value!==choice.value||preset.options[index].textContent!==choice.text)){
    preset.replaceChildren();
    for(const choice of choices.options){const option=document.createElement('option');option.value=choice.value;option.textContent=choice.text;preset.append(option);}
  }
  preset.value=choices.value;
  preset.onchange=()=>{
    if(preset.value==='custom'){preset.value=choices.value;openCustomPageSize(preset);return;}
    change(()=>{if(typeof clearCanvasRegion==='function')clearCanvasRegion();setPageSize(state,preset.value);});
  };
}
const canvasSizeDialog=$('canvas-size-dialog');
let canvasSizeState=null,canvasSizeTrigger=null;
function openCustomPageSize(preset){
  if(canvasSizeDialog.open||canvasViewBusy()||canvasPan||canvasPinch||drag||pictureChoice.open)return;
  canvasSizeState=state;canvasSizeTrigger=preset;
  $('canvas-width').value=state.canvas.width;$('canvas-height').value=state.canvas.height;
  $('canvas-resize-items').checked=false;
  canvasSizeDialog.showModal();$('canvas-width').focus();$('canvas-width').select();
}
$('canvas-size-form').onsubmit=event=>{
  event.preventDefault();
  if(!$('canvas-size-form').reportValidity())return;
  if(state!==canvasSizeState){canvasSizeDialog.close();return;}
  const width=Number($('canvas-width').value),height=Number($('canvas-height').value);
  if(![width,height].every(value=>Number.isInteger(value)&&value>0&&value<=16000))return;
  const resizeItems=$('canvas-resize-items').checked;
  if(width!==state.canvas.width||height!==state.canvas.height)change(()=>{
    if(typeof clearCanvasRegion==='function')clearCanvasRegion();
    setPageSize(state,width+','+height,resizeItems);
  });
  canvasSizeDialog.close();
};
$('canvas-size-cancel').onclick=()=>canvasSizeDialog.close();
canvasSizeDialog.addEventListener('close',()=>{canvasSizeState=null;canvasSizeTrigger?.focus({preventScroll:true});canvasSizeTrigger=null;});
for(const type of ['keydown','drop','paste','copy','cut'])document.addEventListener(type,event=>{
  if(canvasSizeDialog.open){if(type==='drop')event.preventDefault();event.stopImmediatePropagation();}
},true);
// END PAGE SIZE PICKER

const pictureChoice=$('picture-drop-choice');
function choosePictureDrop(){
  pictureChoice.returnValue='';
  return new Promise(resolve=>{
    pictureChoice.addEventListener('close',()=>resolve(['add','new'].includes(pictureChoice.returnValue)?pictureChoice.returnValue:null),{once:true});
    pictureChoice.showModal();$('picture-choice-new').focus();
  });
}
$('picture-choice-add').onclick=()=>pictureChoice.close('add');
$('picture-choice-new').onclick=()=>pictureChoice.close('new');
pictureChoice.onclick=event=>{
  if(event.target!==pictureChoice)return;
  const rect=pictureChoice.getBoundingClientRect();
  if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)pictureChoice.close('cancel');
};
document.addEventListener('keydown',event=>{if(pictureChoice.open)event.stopImmediatePropagation();},true);
function cleanPictureExport(doc){
  doc.querySelector('#picture-drop-choice')?.removeAttribute('open');
  const menu=doc.querySelector('#canvas-edit-menu');if(menu)menu.hidden=true;
  const bar=doc.querySelector('#image-edit-bar');if(bar)bar.hidden=true;
  doc.querySelectorAll('.pixel-selection,.marquee').forEach(node=>node.remove());
}

function validEditorPage(page){
  return Boolean(page?.version===1&&page.canvas&&['width','height'].every(key=>Number.isFinite(page.canvas[key])&&page.canvas[key]>0&&page.canvas[key]<=16000)&&Array.isArray(page.items)&&page.items.every(entry=>entry&&['x','y','w','h'].every(key=>Number.isFinite(entry[key]))&&entry.w>0&&entry.h>0&&['label','icon','shape','reading','tab','button','textbox','image'].includes(entry.kind)&&(entry.kind!=='image'||safePictureSource(entry.src))));
}
async function readEditorPage(file){
  const doc=new DOMParser().parseFromString(await file.text(),'text/html');
  let page;try{page=JSON.parse(doc.getElementById('initial-layout')?.textContent||'null');}catch{}
  if(!validEditorPage(page))throw new Error('Use an HTML file saved by this editor.');
  return copy(page);
}
function addEditorPage(page,point){
  const factor=Math.min(1,state.canvas.width*.9/page.canvas.width,state.canvas.height*.9/page.canvas.height);
  const x=point.x-page.canvas.width*factor/2,y=point.y-page.canvas.height*factor/2;
  const entries=page.items.filter(entry=>!entry.hidden).map(source=>{
    const entry=copy(source);entry.id='item-'+crypto.randomUUID();entry.x=round(x+source.x*factor);entry.y=round(y+source.y*factor);entry.w=Math.max(.1,round(source.w*factor));entry.h=Math.max(.1,round(source.h*factor));delete entry.imageBase;
    for(const key of ['fontSize','iconSize','radius','borderWidth','iconOffsetX'])if(Number.isFinite(source[key]))entry[key]=round(source[key]*factor);
    entry.contentScale=(source.contentScale||1)*factor;return entry;
  });
  state.items.push(...entries);selected=new Set(entries.map(entry=>entry.id));
}

function renderPicture(content,entry){
  if(!safePictureSource(entry.src))return;
  const image=document.createElement('img');image.src=entry.src;image.alt=entry.name;image.draggable=false;content.append(image);
}
function pictureDeadline(promise,ms){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('This picture took too long to open.')),ms);
    promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
  });
}
function loadPictureBlob(blob){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(blob),image=new Image();
    image.onload=()=>{URL.revokeObjectURL(url);resolve(image);};
    image.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Could not open this picture.'));};image.src=url;
  });
}
// BEGIN PICTURE READER
async function readPicture(file){
  const type=pictureType(file);
  if(!type)throw new Error('Use a PNG, JPG, WebP, GIF, AVIF, BMP, HEIC, or HEIF picture.');
  const blob=file.type===type?file:new Blob([file],{type});
  let image;
  try{image=await pictureDeadline(loadPictureBlob(blob),20000);}
  catch(error){
    if(type!=='image/heic')throw error;
    try{image=await pictureDeadline(HeicTo({blob,type:'image/png'}).then(loadPictureBlob),30000);}
    catch{throw new Error('Could not open this HEIC picture.');}
  }
  const width=image.naturalWidth,height=image.naturalHeight;
  if(!width||!height||width>16000||height>16000||width*height>24000000)throw new Error('Use a picture under 24 million pixels, with each side under 16,000 pixels.');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  try{
    canvas.getContext('2d').drawImage(image,0,0);
    return {name:file.name||'Picture',src:canvas.toDataURL('image/png'),width,height};
  }finally{canvas.width=canvas.height=1;}
}
// END PICTURE READER

// BEGIN DROP ACTION
let pictureDropBusy=false;
async function handlePictureDrop(event){
  $('stage').classList.remove('picture-drop');
  const files=[...(event.dataTransfer?.files||[])];if(!files.length)return;
  event.preventDefault();
  if(!editing){notify('Go back to editing to add pictures.');return;}
  if(typeof imageEditSession!=='undefined'&&imageEditSession){notify('Choose Done or Cancel before opening a file.');return;}
  if(pictureDropBusy){notify('Still opening pictures. Please wait.');return;}
  pictureDropBusy=true;
  try{
    await picturesReady;
    if(typeof projectsReady!=='undefined')await projectsReady;
    const targetState=state;
    const stageRect=$('stage').getBoundingClientRect();
    const onStage=Number.isFinite(event.clientX)&&Number.isFinite(event.clientY)&&event.clientX>=stageRect.left&&event.clientX<=stageRect.right&&event.clientY>=stageRect.top&&event.clientY<=stageRect.bottom;
    const dropPoint=onStage?phonePoint(event):canvasViewCenter();
    const action=await choosePictureDrop(files);if(!action)return;
    if(files.some(editorPageFile)){
      if(files.length!==1)throw new Error('Drop one HTML page at a time.');
      const page=await readEditorPage(files[0]);if(state!==targetState)throw new Error('The page changed. Drop the file again.');
      if(action==='new'&&typeof createProject==='function')createProject(page,files[0].name);
      else change(()=>{if(typeof clearCanvasRegion==='function')clearCanvasRegion();if(action==='new'){state=page;selected.clear();resetCanvasView();}else addEditorPage(page,dropPoint);});
      if($('editor-tools')?.open)$('editor-tools').close();$('stage').focus({preventScroll:true});notify(action==='new'?'Page opened':'Page items added');return;
    }
    const pictures=[],errors=[];
    notify(files.some(file=>pictureType(file)==='image/heic')?'Opening HEIC picture…':'Opening pictures…');
    for(const file of files){
      try{pictures.push(await readPicture(file));}catch(error){errors.push(error.message);}
    }
    if(!pictures.length){notify(errors[0]);return;}
    if(state!==targetState){notify('The draft changed. Please drop the pictures again.');return;}
    const plan=pictureDropPlan(pictures,action,state.canvas,dropPoint);
    const entries=pictures.map((picture,index)=>{
      const box=plan.boxes[index];
      return item('item-'+crypto.randomUUID(),picture.name,'image',box.x,box.y,box.w,box.h,{src:picture.src,...(plan.replace?{imageBase:true}:{})});
    });
    if(action==='new'&&typeof createProject==='function')createProject({version:1,canvas:plan.canvas,items:entries},pictures[0].name);
    else {
      change(()=>{
        if(typeof clearCanvasRegion==='function')clearCanvasRegion();
        if(plan.replace){state.canvas=plan.canvas;state.items=[];resetCanvasView();}
        state.items.push(...entries);selected=new Set(plan.replace?[]:entries.map(entry=>entry.id));
      });
    }
    if($('editor-tools')?.open)$('editor-tools').close();
    $('stage').focus({preventScroll:true});
    notify((plan.replace?'Picture page opened':pictures.length===1?'Picture added':pictures.length+' pictures added')+(errors.length?'. Could not open '+errors.length+(errors.length===1?' file.':' files.'):''));
  }catch(error){notify(error.message||'Could not open this picture.');}
  finally{pictureDropBusy=false;}
}
// END DROP ACTION
document.addEventListener('dragover',event=>{
  if(![...(event.dataTransfer?.types||[])].includes('Files'))return;
  event.preventDefault();event.dataTransfer.dropEffect=editing&&!pictureDropBusy?'copy':'none';
  if(editing&&!pictureDropBusy)$('stage').classList.add('picture-drop');
});
document.addEventListener('dragleave',event=>{if(!event.relatedTarget)$('stage').classList.remove('picture-drop');});
document.addEventListener('dragend',()=>$('stage').classList.remove('picture-drop'));
document.addEventListener('drop',handlePictureDrop);

// Keep large pictures when the draft exceeds the browser's small text store.
let pictureDB=null,pictureStoreReady=false,pictureSaved='',pictureSaveWarning=false,pictureLocalSaved=true;
function warnPictureSave(){if(!pictureSaveWarning){pictureSaveWarning=true;notify('Could not save this draft here. Use Copy HTML to keep a copy.');}}
function savePictureDraft(localSaved){
  pictureLocalSaved=localSaved;if(!pictureStoreReady)return;
  if(!pictureDB){if(!localSaved)warnPictureSave();return;}
  const value=JSON.stringify(state);if(value===pictureSaved)return;pictureSaved=value;
  try{
    const transaction=pictureDB.transaction('drafts','readwrite');transaction.objectStore('drafts').put(copy(state),STORAGE);
    transaction.onabort=transaction.onerror=()=>{pictureSaved='';if(!localSaved)warnPictureSave();};
  }catch{pictureSaved='';if(!localSaved)warnPictureSave();}
}
const pictureStartState=JSON.stringify(state);
const picturesReady=(async()=>{
  try{
    pictureDB=await new Promise((resolve,reject)=>{
      const request=indexedDB.open('ui-design-editor-pictures-v1',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    const saved=await new Promise((resolve,reject)=>{
      const request=pictureDB.transaction('drafts').objectStore('drafts').get(STORAGE);
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    if(saved?.version===1&&JSON.stringify(state)===pictureStartState){state=saved;selected.clear();render();}
  }catch{}
  pictureStoreReady=true;savePictureDraft(pictureLocalSaved);
})();
