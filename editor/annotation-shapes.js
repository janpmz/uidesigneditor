// BEGIN ANNOTATION SHAPES
function isArrowShape(entry){return entry?.kind==='shape'&&entry.shape==='arrow';}
function isRectangleShape(entry){
  return ['shape','button','textbox'].includes(entry?.kind)&&!isArrowShape(entry);
}
function isTextBox(entry){return ['label','reading'].includes(entry?.kind);}
function hasSideResizeHandles(entry){return isRectangleShape(entry)||isTextBox(entry)||['icon','image','tab'].includes(entry?.kind);}
function renderRectangleHandles(overlay,entry){
  overlay.classList.add('rectangle-selection');
  sizeRectangleHandles(overlay);
  const names={n:'top',e:'right',s:'bottom',w:'left'};
  for(const side of ['n','e','s','w']){
    const edge=document.createElement('span');edge.className='rectangle-edge edge-'+side;edge.dataset.rectangleResize=side;
    edge.setAttribute('aria-hidden','true');overlay.append(edge);
  }
  for(const side of ['n','e','s','w']){
    const handle=document.createElement('span');handle.className='rectangle-handle handle-'+side;handle.dataset.rectangleResize=side;
    handle.setAttribute('aria-label','Resize '+(entry?.name||'item')+' '+names[side]);handle.title='Drag to resize '+names[side];overlay.append(handle);
  }
  const handle=document.createElement('span');handle.className='resize-handle';handle.dataset.resize='true';
  handle.setAttribute('aria-label','Scale '+(entry?.name||'item'));handle.title='Scale item and contents';overlay.append(handle);
}
function sizeRectangleHandles(overlay=$('phone').querySelector('.rectangle-selection')){
  if(!overlay)return;
  const zoom=typeof scale==='number'&&scale>0?scale:1;
  const shortest=Math.min(parseFloat(overlay.style.width)||Infinity,parseFloat(overlay.style.height)||Infinity);
  const hit=Math.min(20,Math.max(4,shortest*zoom/3));
  overlay.style.setProperty('--rectangle-grip',10/zoom+'px');
  overlay.style.setProperty('--rectangle-hit',hit/zoom+'px');
}
function resizeRectangleFromHandle(entry,start,side,dx,dy){
  const minimum=Math.max(4,(start.borderWidth||0)*2+1);
  let left=start.x,top=start.y,right=start.x+start.w,bottom=start.y+start.h;
  if(side.includes('w'))left=Math.min(start.x+dx,right-minimum);
  if(side.includes('e'))right=Math.max(right+dx,left+minimum);
  if(side.includes('n'))top=Math.min(start.y+dy,bottom-minimum);
  if(side.includes('s'))bottom=Math.max(bottom+dy,top+minimum);
  Object.assign(entry,{x:round(left),y:round(top),w:round(right-left),h:round(bottom-top)});
}
function arrowPoints(entry){
  const width=Math.max(.5,Number(entry.strokeWidth)||4),padding=Math.min(width*3,entry.w/2,entry.h/2);
  const point=value=>({x:padding+(entry.w-padding*2)*value.x,y:padding+(entry.h-padding*2)*value.y});
  return {start:point(entry.arrowStart||{x:0,y:.5}),end:point(entry.arrowEnd||{x:1,y:.5}),width};
}
function arrowPath(entry){
  const {start,end,width}=arrowPoints(entry),dx=end.x-start.x,dy=end.y-start.y,length=Math.hypot(dx,dy);
  if(length<.01)return '';
  const ux=dx/length,uy=dy/length,head=Math.min(width*3,length*.45),half=head*.55;
  const x=end.x-ux*head,y=end.y-uy*head;
  return `M ${start.x} ${start.y} L ${end.x} ${end.y} M ${x-uy*half} ${y+ux*half} L ${end.x} ${end.y} L ${x+uy*half} ${y-ux*half}`;
}
function styleArrowShape(node,entry){
  if(!isArrowShape(entry))return;
  node.style.background='transparent';node.style.border='0';
  const svg=node.querySelector('.annotation-arrow');if(!svg)return;
  svg.setAttribute('viewBox',`0 0 ${entry.w} ${entry.h}`);
  svg.setAttribute('width',entry.w);svg.setAttribute('height',entry.h);
  const path=svg.querySelector('path');path.setAttribute('d',arrowPath(entry));
  path.setAttribute('stroke',entry.color);path.setAttribute('stroke-width',arrowPoints(entry).width);
}
function renderArrowShape(content,entry){
  content.classList.add('arrow-content');
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');
  svg.classList.add('annotation-arrow');svg.setAttribute('aria-hidden','true');svg.setAttribute('focusable','false');
  path.setAttribute('fill','none');path.setAttribute('stroke-linecap','round');path.setAttribute('stroke-linejoin','round');
  svg.append(path);content.append(svg);styleArrowShape(content,entry);
}
function renderArrowHandles(overlay,entry){
  const points=arrowPoints(entry);
  for(const end of ['start','end']){
    const handle=document.createElement('span');handle.className='arrow-handle';handle.dataset.arrowEnd=end;
    handle.setAttribute('aria-label','Move arrow '+end);handle.title='Drag to move arrow '+end;
    Object.assign(handle.style,{left:points[end].x+'px',top:points[end].y+'px'});overlay.append(handle);
  }
}
function moveArrowEnd(entry,start,end,point){
  const points=arrowPoints(start),fixed=points[end==='start'?'end':'start'];
  const a=end==='start'?point:{x:start.x+fixed.x,y:start.y+fixed.y};
  const b=end==='end'?point:{x:start.x+fixed.x,y:start.y+fixed.y};
  if(Math.hypot(b.x-a.x,b.y-a.y)<points.width*2)return;
  const padding=points.width*3;
  entry.x=round(Math.min(a.x,b.x)-padding);entry.y=round(Math.min(a.y,b.y)-padding);
  entry.w=round(Math.abs(b.x-a.x)+padding*2);entry.h=round(Math.abs(b.y-a.y)+padding*2);
  const ratio=(a,b)=>a===b?.5:a<b?0:1;
  entry.arrowStart={x:ratio(a.x,b.x),y:ratio(a.y,b.y)};
  entry.arrowEnd={x:ratio(b.x,a.x),y:ratio(b.y,a.y)};
}
function renderArrowInspector(pane,entry){
  const look=section('Arrow'),fields=document.createElement('div');fields.className='fields';
  fields.append(field('Color','color',entry.color,'color'),field('Line width','strokeWidth',entry.strokeWidth||4),field('Opacity','opacity',entry.opacity));
  const note=document.createElement('p');note.className='note';note.textContent='Drag either dot to change the arrow’s length and direction.';
  look.append(fields,note);pane.append(look);
}
// BEGIN ANNOTATION ADD
const ANNOTATION_ITEMS={
  rectangle:{name:'New rectangle',kind:'shape',shape:'rectangle',w:180,h:100,background:'transparent',borderColor:'#ef4444',borderWidth:3},
  arrow:{name:'New arrow',kind:'shape',shape:'arrow',w:180,h:40,color:'#ef4444',strokeWidth:4},
};
function finishAddingCanvasItem(){
  if(typeof compactViewport!=='undefined'&&compactViewport.matches&&$('editor-tools')?.open){
    if(isRectangleShape(state.items.at(-1)))$('editor-tools').close();else openToolPanel('edit');
  }
}
function addAnnotationShape(type){
  change(()=>{
    const {name,kind,w,h,...look}=ANNOTATION_ITEMS[type],center=canvasViewCenter();
    const entry=item('item-'+crypto.randomUUID(),name,kind,round(center.x-w/2),round(center.y-h/2),w,h,look);
    state.items.push(entry);selected=new Set([entry.id]);
  });
  finishAddingCanvasItem();
}
for(const type of Object.keys(ANNOTATION_ITEMS))$('add-'+type).onclick=()=>addAnnotationShape(type);
// END ANNOTATION ADD
// END ANNOTATION SHAPES
