let canvasTextEdit=null,canvasTextClick=null;
function canEditItemText(entry){
  return entry&&!entry.hidden&&['label','reading','tab','button','textbox'].includes(entry.kind);
}
function finishCanvasTextEdit(commit=true,focus=false,redraw=true){
  const session=canvasTextEdit;if(!session)return;
  canvasTextEdit=null;
  const {node,entry}=session,value=node.innerText.replace(/\r\n?/g,'\n');
  if(fieldEdit?.node===node)fieldEdit=null;
  node.removeAttribute('contenteditable');node.removeAttribute('role');node.removeAttribute('aria-label');node.removeAttribute('aria-multiline');
  node.classList.remove('canvas-text-input');session.itemNode.classList.remove('text-editing');
  node.onblur=node.onkeydown=null;
  if(commit&&state===session.state&&state.items.includes(entry)&&!entry.hidden&&entry.text===session.before&&value!==(session.before??'')){
    remember();entry.text=value;save();
    const input=$('inspector').querySelector('[data-field="text"]');if(input)input.value=value;
  }
  if(redraw)renderPhone();
  if(focus)stage.focus({preventScroll:true});
}
function beginCanvasTextEdit(entry,itemNode){
  if(!editing||!canEditItemText(entry)||canvasGesture||canvasEditBusy||pictureDropBusy||pictureChoice.open)return;
  if(canvasTextEdit?.entry===entry)return;
  finishCanvasTextEdit(true,false,false);canvasTextClick=null;
  closeCanvasMenu();clearCanvasRegion();selected=new Set([entry.id]);refreshSelection();
  let node=itemNode.querySelector('.reading-lines')||itemNode.querySelector('.content > span:not(.ion)');
  if(!node){node=document.createElement('span');itemNode.querySelector('.content').append(node);}
  const multiline=entry.kind==='reading'||Boolean(entry.wrap);
  canvasTextEdit={entry,node,itemNode,state,before:entry.text};fieldEdit={node};
  node.textContent=entry.text??'';node.classList.add('canvas-text-input');itemNode.classList.add('text-editing');
  node.setAttribute('contenteditable','plaintext-only');node.setAttribute('role','textbox');
  node.setAttribute('aria-label','Edit text');node.setAttribute('aria-multiline',String(multiline));
  node.onblur=()=>finishCanvasTextEdit();
  node.onkeydown=event=>{
    event.stopPropagation();if(event.isComposing)return;
    if(event.key==='Escape'){event.preventDefault();finishCanvasTextEdit(false,true);}
    else if(event.key==='Enter'&&(event.metaKey||event.ctrlKey||!multiline&&!event.shiftKey)){
      event.preventDefault();finishCanvasTextEdit(true,true);
    }
  };
  node.focus({preventScroll:true});
  const range=document.createRange();range.selectNodeContents(node);
  const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
}
function tryCanvasTextEdit(event,entry){
  // Handles can cover small text items after the first click.
  const click=canvasTextClick;canvasTextClick=null;
  if(!click||rectangleSelectionArmed||click.state!==state||click.id!==entry?.id||event.timeStamp-click.time>500||event.timeStamp<click.time||Math.hypot(event.clientX-click.x,event.clientY-click.y)>4||event.shiftKey||event.ctrlKey||event.metaKey||event.altKey)return false;
  const itemNode=[...$('phone').querySelectorAll('.item')].find(node=>node.dataset.id===entry.id);
  if(!itemNode||!canEditItemText(entry))return false;
  beginCanvasTextEdit(entry,itemNode);return true;
}
function rememberCanvasTextClick(gesture,event){
  canvasTextClick=!gesture.moved&&gesture.textId?{id:gesture.textId,time:event.timeStamp,x:event.clientX,y:event.clientY,state}:null;
}
stage.addEventListener('dblclick',event=>{
  if(canvasTextEdit||canvasTextTarget(event.target)||event.button!==0||event.shiftKey||event.metaKey||event.ctrlKey||event.altKey||event.target.closest('.resize-handle,[data-rectangle-resize],[data-arrow-end]'))return;
  // Pointer capture sends clicks to the stage, so find the item at the click too.
  const itemNode=event.target.closest('.item')||document.elementFromPoint(event.clientX,event.clientY)?.closest('.item');
  if(!itemNode||!$('phone').contains(itemNode))return;
  const entry=state.items.find(entry=>entry.id===itemNode.dataset.id);
  if(!editing||!canEditItemText(entry))return;
  event.preventDefault();event.stopImmediatePropagation();beginCanvasTextEdit(entry,itemNode);
},true);
window.addEventListener('beforeunload',()=>finishCanvasTextEdit(true,false,false));
