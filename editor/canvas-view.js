// BEGIN CANVAS VIEW
const canvasView={x:0,y:0,width:0,height:0,page:'',mode:null};
let canvasPan=null,canvasSpace=false;
const canvasTouches=new Map();
let canvasPinch=null;
function canvasViewBounds(all=false){
  const page={x:0,y:0,w:state.canvas.width,h:state.canvas.height};
  return all?boundsOf([page,...state.items.filter(entry=>!entry.hidden)]):page;
}
function canvasViewPoint(clientX,clientY){
  const rect=stage.getBoundingClientRect();
  return {x:(clientX-rect.left-canvasView.x)/scale,y:(clientY-rect.top-canvasView.y)/scale};
}
function canvasViewCenter(){
  return {x:(canvasView.width/2-canvasView.x)/scale,y:(canvasView.height/2-canvasView.y)/scale};
}
function drawCanvasView(){
  const mount=$('phone-mount');
  Object.assign(mount.style,{left:canvasView.x+'px',top:canvasView.y+'px',width:state.canvas.width*scale+'px',height:state.canvas.height*scale+'px'});
  $('phone').style.transform=`scale(${scale})`;
  if(typeof sizeRectangleHandles==='function')sizeRectangleHandles();
  stage.style.backgroundPosition=canvasView.x+'px '+canvasView.y+'px';
  stage.style.backgroundSize=(24*scale)+'px '+(24*scale)+'px';
}
function renderCanvasView(){
  const {width,height}=stage.getBoundingClientRect();if(width<1||height<1)return;
  const mode=$('zoom').value,page=[state.canvas.width,state.canvas.height,Boolean(state.canvas.picturePage)].join(',');
  const changed=canvasView.page!==page||canvasView.mode!==mode;
  if(changed||canvasView.width!==width||canvasView.height!==height){
    if(mode==='fit'||mode==='all'){
      const box=canvasViewBounds(mode==='all');
      scale=clamp(Math.min(1,(width-64)/box.w,(height-64)/box.h),.01,16);
      canvasView.x=(width-box.w*scale)/2-box.x*scale;canvasView.y=(height-box.h*scale)/2-box.y*scale;
    }else{
      const center=canvasView.width?canvasViewCenter():{x:state.canvas.width/2,y:state.canvas.height/2};
      scale=clamp(Number(mode)||1,.01,16);
      canvasView.x=width/2-center.x*scale;canvasView.y=height/2-center.y*scale;
    }
  }
  Object.assign(canvasView,{width,height,page,mode});drawCanvasView();
}
function setCanvasZoom(value,anchor){
  if(!Number.isFinite(value))return;
  const next=clamp(value,.01,16),rect=stage.getBoundingClientRect();
  const at=anchor?{x:anchor.x-rect.left,y:anchor.y-rect.top}:{x:rect.width/2,y:rect.height/2};
  const world={x:(at.x-canvasView.x)/scale,y:(at.y-canvasView.y)/scale};
  const option=$('zoom-custom');option.value=String(next);option.textContent=Math.round(next*10000)/100+'%';
  $('zoom').value=String(next);canvasView.mode=String(next);
  scale=next;canvasView.x=at.x-world.x*scale;canvasView.y=at.y-world.y*scale;drawCanvasView();
}
function resetCanvasView(){canvasView.mode=null;canvasView.page='';$('zoom').value='fit';}
function holdCanvasView(){setCanvasZoom(scale);}
function canvasViewBusy(){return Boolean(canvasGesture||canvasEditBusy||pictureDropBusy);}
function canvasTouchPans(event){
  if(event.pointerType!=='touch'||typeof compactViewport==='undefined'||!compactViewport.matches||rectangleSelectionArmed||canvasTextTarget(event.target)||event.target.closest('.make-item-action'))return false;
  if(!editing)return true;
  if(event.target.closest('.group-grip,.resize-handle,[data-rectangle-resize],[data-arrow-end]'))return false;
  const id=event.target.closest('.item,.selection-overlay')?.dataset.id;
  return !selectedItems().some(entry=>entry.id===id&&!isPagePicture(entry));
}
function endCanvasPan(event){
  if(canvasPan?.pointer!==event.pointerId)return;
  canvasPan=null;stage.classList.remove('panning');
  if(stage.hasPointerCapture(event.pointerId))stage.releasePointerCapture(event.pointerId);
}
function stopCanvasTouch(event){
  if(!canvasTouches.has(event.pointerId))return;
  canvasTouches.delete(event.pointerId);
  if(canvasPinch){
    event.preventDefault();event.stopImmediatePropagation();
    if(canvasTouches.size===0){canvasPinch=null;stage.classList.remove('panning');}
    if(stage.hasPointerCapture(event.pointerId))stage.releasePointerCapture(event.pointerId);
  }
}
stage.addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch'){
    canvasTouches.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(canvasTouches.size===2){
      if(canvasEditBusy||pictureDropBusy)return;
      if(canvasPan)endCanvasPan({pointerId:canvasPan.pointer});
      if(canvasGesture)endCanvasGesture(true);
      if(drag)endDrag({pointerId:drag.pointer},true);
      const [a,b]=[...canvasTouches.values()];
      canvasPinch={distance:Math.max(1,Math.hypot(b.x-a.x,b.y-a.y)),scale,world:canvasViewPoint((a.x+b.x)/2,(a.y+b.y)/2)};
      for(const pointer of canvasTouches.keys())stage.setPointerCapture(pointer);
      stage.classList.add('panning');
    }
    if(canvasPinch){event.preventDefault();event.stopImmediatePropagation();stage.setPointerCapture(event.pointerId);return;}
  }
  const touch=canvasTouchPans(event);
  if(!(touch||event.button===1||(event.button===0&&canvasSpace))||canvasViewBusy())return;
  event.preventDefault();event.stopImmediatePropagation();closeCanvasMenu();stage.focus({preventScroll:true});
  if(!touch)holdCanvasView();
  const id=touch?event.target.closest('.item,.selection-overlay')?.dataset.id:null;
  const hit=touch&&editing?state.items.find(entry=>entry.id===id&&!entry.hidden&&!isPagePicture(entry)):null;
  canvasPan={pointer:event.pointerId,x:event.clientX,y:event.clientY,left:canvasView.x,top:canvasView.y,touch,hitId:hit?.id,moved:false};
  stage.classList.add('panning');stage.setPointerCapture(event.pointerId);
},true);
stage.addEventListener('pointermove',event=>{
  if(canvasTouches.has(event.pointerId))canvasTouches.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(canvasPinch){
    event.preventDefault();event.stopImmediatePropagation();
    if(canvasTouches.size===2){
      const [a,b]=[...canvasTouches.values()],rect=stage.getBoundingClientRect();
      setCanvasZoom(canvasPinch.scale*Math.hypot(b.x-a.x,b.y-a.y)/canvasPinch.distance);
      canvasView.x=(a.x+b.x)/2-rect.left-canvasPinch.world.x*scale;canvasView.y=(a.y+b.y)/2-rect.top-canvasPinch.world.y*scale;drawCanvasView();
    }
    return;
  }
  if(canvasPan?.pointer!==event.pointerId)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(canvasPan.touch&&!canvasPan.moved){
    if(Math.hypot(event.clientX-canvasPan.x,event.clientY-canvasPan.y)<6)return;
    holdCanvasView();canvasPan.moved=true;
  }
  canvasView.x=canvasPan.left+event.clientX-canvasPan.x;canvasView.y=canvasPan.top+event.clientY-canvasPan.y;drawCanvasView();
},true);
for(const type of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(type,event=>{
  if(type!=='lostpointercapture')stopCanvasTouch(event);
  if(canvasPan?.pointer===event.pointerId){
    event.preventDefault();event.stopImmediatePropagation();
    if(type==='pointerup'&&canvasPan.touch&&!canvasPan.moved&&editing){
      selected=new Set(canvasPan.hitId?[canvasPan.hitId]:[]);regionSelection=null;refreshSelection();
    }
    endCanvasPan(event);
  }
},true);
stage.addEventListener('wheel',event=>{
  event.preventDefault();if(canvasViewBusy())return;
  const unit=event.deltaMode===1?16:event.deltaMode===2?stage.clientHeight:1;
  if(event.ctrlKey||event.metaKey){
    const speed=event.ctrlKey&&event.deltaMode===0?.01:.001;
    const delta=clamp(event.deltaY*unit*speed,-.05,.05);
    setCanvasZoom(scale*Math.exp(-delta),{x:event.clientX,y:event.clientY});
  }
  else{holdCanvasView();canvasView.x-=(event.shiftKey?event.deltaY:event.deltaX)*unit;canvasView.y-=(event.shiftKey?event.deltaX:event.deltaY)*unit;drawCanvasView();}
},{passive:false});
document.addEventListener('keydown',event=>{
  if(canvasTextTarget(event.target)||pictureChoice.open||$('icon-picker')?.open||$('editor-tools')?.open)return;
  if(event.code==='Space'){event.preventDefault();event.stopImmediatePropagation();canvasSpace=true;stage.classList.add('pan-ready');return;}
  if(canvasViewBusy())return;
  if((event.metaKey||event.ctrlKey)&&['+','=','-','0','1'].includes(event.key)){
    event.preventDefault();event.stopImmediatePropagation();
    if(event.key==='0'){resetCanvasView();fit();}
    else setCanvasZoom(event.key==='1'?1:scale*(event.key==='-'?1/1.2:1.2));
  }
  if(event.key==='Escape'&&canvasPan){event.preventDefault();event.stopImmediatePropagation();endCanvasPan({pointerId:canvasPan.pointer});}
},true);
function releaseCanvasSpace(){canvasSpace=false;stage.classList.remove('pan-ready');}
document.addEventListener('keyup',event=>{if(event.code==='Space')releaseCanvasSpace();});
window.addEventListener('blur',()=>{releaseCanvasSpace();if(canvasPan)endCanvasPan({pointerId:canvasPan.pointer});});
$('zoom').onchange=()=>{if(canvasViewBusy())return;canvasView.mode=null;fit();};
$('zoom-in').onclick=()=>{if(!canvasViewBusy())setCanvasZoom(scale*1.2);};
$('zoom-out').onclick=()=>{if(!canvasViewBusy())setCanvasZoom(scale/1.2);};
// END CANVAS VIEW
