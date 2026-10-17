// BEGIN PIXEL HELPERS
function clippedArea(box,canvas){
  const x=clamp(Math.floor(box.x),0,canvas.width),y=clamp(Math.floor(box.y),0,canvas.height);
  const right=clamp(Math.ceil(box.x+box.w),x,canvas.width),bottom=clamp(Math.ceil(box.y+box.h),y,canvas.height);
  return {x,y,w:right-x,h:bottom-y};
}
function boxesOverlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
function pointInArea(point,box){return point.x>=box.x&&point.x<=box.x+box.w&&point.y>=box.y&&point.y<=box.y+box.h;}
function sourcePixelArea(box,entry,width,height){
  const x=clamp(Math.round((box.x-entry.x)*width/entry.w),0,width);
  const y=clamp(Math.round((box.y-entry.y)*height/entry.h),0,height);
  const right=clamp(Math.round((box.x+box.w-entry.x)*width/entry.w),x,width);
  const bottom=clamp(Math.round((box.y+box.h-entry.y)*height/entry.h),y,height);
  return {x,y,w:right-x,h:bottom-y};
}
function itemIdsInSelection(items,box){
  return items.filter(entry=>!entry.hidden&&entry.x<=box.x+box.w+.01&&entry.x+entry.w>=box.x-.01&&entry.y<=box.y+box.h+.01&&entry.y+entry.h>=box.y-.01).map(entry=>entry.id);
}
function fillPixelArea(data,width,height,box,background=[0,0,0,255]){
  const samples=[],colors=new Map();
  const read=(x,y)=>x<0||y<0||x>=width||y>=height?null:Array.from(data.slice((y*width+x)*4,(y*width+x)*4+4));
  const sample=(x,y)=>{const color=read(x,y);if(!color)return;const key=color.map((v,i)=>v>>(i===3?4:3)).join(',');const group=colors.get(key)||[];group.push(color);colors.set(key,group);samples.push(color);};
  const step=Math.max(1,Math.ceil((box.w+box.h)/1000));
  for(let x=box.x;x<box.x+box.w;x+=step){sample(x,box.y-1);sample(x,box.y+box.h);}
  for(let y=box.y;y<box.y+box.h;y+=step){sample(box.x-1,y);sample(box.x+box.w,y);}
  const common=[...colors.values()].sort((a,b)=>b.length-a.length)[0];
  const flat=!samples.length?background:common.length/samples.length>=.6?common[0].map((_,channel)=>Math.round(common.reduce((sum,color)=>sum+color[channel],0)/common.length)):null;
  for(let y=box.y;y<box.y+box.h;y++)for(let x=box.x;x<box.x+box.w;x++){
    let color=flat;
    if(!color){
      const left=read(box.x-1,y),right=read(box.x+box.w,y),top=read(x,box.y-1),bottom=read(x,box.y+box.h);
      const tx=(x-box.x+1)/(box.w+1),ty=(y-box.y+1)/(box.h+1);
      const horizontal=left&&right?left.map((v,i)=>v*(1-tx)+right[i]*tx):left||right;
      const vertical=top&&bottom?top.map((v,i)=>v*(1-ty)+bottom[i]*ty):top||bottom;
      color=horizontal&&vertical?horizontal.map((v,i)=>(v+vertical[i])/2):horizontal||vertical||background;
    }
    const offset=(y*width+x)*4;for(let channel=0;channel<4;channel++)data[offset+channel]=Math.round(color[channel]);
  }
  return data;
}
// END PIXEL HELPERS
