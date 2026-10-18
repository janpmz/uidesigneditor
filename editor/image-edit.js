let imageEditSession=null,imageEditSaving=false;
function editablePicture(entry){return !imageEditSession&&entry&&!entry.hidden&&entry.kind==='image'&&!isPagePicture(entry)&&safePictureSource(entry.src)&&!/^data:image\/gif;/i.test(entry.src);}
function pictureToEdit(){const entries=selectedItems();return !regionSelection&&entries.length===1&&editablePicture(entries[0])?entries[0]:null;}
function renderImageEditStatus(){
  const bar=$('image-edit-bar');if(!bar)return;
  bar.hidden=!imageEditSession;
  $('image-edit-name').textContent=imageEditSession?.name||'';
  $('image-edit-done').disabled=imageEditSaving;
  $('image-edit-done').textContent=imageEditSaving?'Saving…':'Done';
  $('image-edit-cancel').disabled=imageEditSaving;
}
function renderImageEditAction(heading,entry){
  if(entry.kind==='image'&&/^data:image\/gif;/i.test(entry.src)){
    const note=document.createElement('p');note.className='note';note.textContent='GIFs keep playing. Move or resize the whole GIF; editing parts needs a still picture.';heading.append(note);return;
  }
  if(!editablePicture(entry))return;
  const button=document.createElement('button');button.textContent='Edit image';button.className='primary image-edit-action';
  button.onclick=()=>openImageEditor(entry.id);
  const note=document.createElement('p');note.className='note';note.textContent='Select and move parts of this image.';
  heading.append(button,note);
}
async function openImageEditor(id){
  if(!editing||imageEditSession||canvasGesture||canvasEditBusy||pictureDropBusy||pictureChoice.open)return;
  const entry=state.items.find(entry=>entry.id===id);if(!editablePicture(entry))return;
  canvasEditBusy=true;
  try{
    await picturesReady;
    if(!state.items.includes(entry))throw new Error('The page changed. Choose Edit image again.');
    const parent=state,before=JSON.stringify(state),image=await selectionImage(entry.src);
    if(state!==parent||JSON.stringify(state)!==before)throw new Error('The page changed. Choose Edit image again.');
    const width=image.naturalWidth,height=image.naturalHeight;
    if(!validPicturePageSize({width,height}))throw new Error('Could not open this image for editing.');
    const layout=validEditorPage(entry.imageContents)&&validPicturePageSize(entry.imageContents.canvas)?copy(entry.imageContents):{
      version:1,canvas:{width,height,background:'transparent',picturePage:true,picturePageSize:{width,height}},
      items:[item('item-'+crypto.randomUUID(),entry.name,'image',0,0,width,height,{src:entry.src,imageBase:true})],
    };
    layout.canvas.picturePage=true;
    imageEditSession={parent,id,name:entry.name,history,future,selected:[...selected],zoom:$('zoom').value,customZoom:$('zoom-custom').value,view:{...canvasView},viewScale:scale,initial:JSON.stringify(layout)};
    state=layout;history=[];future=[];selected.clear();clearCanvasRegion();fieldEdit=null;
    resetCanvasView();closeCanvasMenu();
    if($('editor-tools')?.open)$('editor-tools').close();
    render();stage.focus({preventScroll:true});notify('Edit image. Choose Done to save your changes.');
  }catch(error){notify(error.message||'Could not edit this image.');}
  finally{canvasEditBusy=false;}
}
function restoreImagePage(session){
  state=session.parent;history=session.history;future=session.future;selected=new Set(session.selected);
  imageEditSession=null;imageEditSaving=false;editing=true;clearCanvasRegion();fieldEdit=null;
  Object.assign(canvasView,session.view);scale=session.viewScale;
  $('zoom-custom').value=session.customZoom;$('zoom').value=session.zoom;closeCanvasMenu();
  if($('editor-tools')?.open)$('editor-tools').close();
}
async function finishImageEditor(cancel=false){
  const session=imageEditSession;
  if(!session||imageEditSaving||canvasGesture||canvasEditBusy||pictureDropBusy||pictureChoice.open)return;
  if(cancel||JSON.stringify(state)===session.initial){
    restoreImagePage(session);render();stage.focus({preventScroll:true});return;
  }
  imageEditSaving=true;canvasEditBusy=true;renderImageEditStatus();closeCanvasMenu();
  const before=JSON.stringify(state),width=state.canvas.width,height=state.canvas.height;
  try{
    const canvas=await html2canvas($('phone'),{
      width,height,scale:1,scrollX:0,scrollY:0,logging:false,backgroundColor:null,
      windowWidth:Math.max(document.documentElement.clientWidth,width),windowHeight:Math.max(document.documentElement.clientHeight,height),
      ignoreElements:element=>['selection-overlay','pixel-selection','guide','marquee'].some(name=>element.classList?.contains(name)),
      onclone:cloned=>{
        const phone=cloned.getElementById('phone');phone.classList.remove('editing');
        Object.assign(phone.style,{position:'fixed',left:'0',top:'0',width:width+'px',height:height+'px',transform:'none',boxShadow:'none',borderRadius:'0'});
        cloned.querySelectorAll('dialog').forEach(dialog=>dialog.removeAttribute('open'));
      },
    });
    if(imageEditSession!==session||JSON.stringify(state)!==before)throw new Error('The image changed. Choose Done again.');
    const src=canvas.toDataURL('image/png'),contents=copy(state);
    restoreImagePage(session);
    change(()=>{const entry=state.items.find(entry=>entry.id===session.id);entry.src=src;entry.imageContents=contents;selected=new Set([entry.id]);});
    stage.focus({preventScroll:true});notify('Image saved');
  }catch(error){notify(error.message||'Could not save this image.');}
  finally{imageEditSaving=false;canvasEditBusy=false;renderImageEditStatus();}
}
$('image-edit-done').onclick=()=>finishImageEditor();
$('image-edit-cancel').onclick=()=>finishImageEditor(true);
for(const type of ['click','keydown'])document.addEventListener(type,event=>{
  if(imageEditSaving){event.preventDefault();event.stopImmediatePropagation();}
},true);
