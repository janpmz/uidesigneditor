function sizePreview(){
  const viewport=window.visualViewport;
  const mobile=compactViewport.matches;
  const textFocus=Boolean(document.activeElement?.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])'));
  const visual=viewport&&Number.isFinite(viewport.width)&&viewport.width>0&&viewport.width<=document.documentElement.clientWidth+1&&Number.isFinite(viewport.height)&&viewport.height>0;
  if(mobile&&!(visual&&(viewport.scale>1||textFocus))){
    for(const name of ['width','height','left','top'])document.documentElement.style.removeProperty('--preview-'+name);
  }else{
    const values={width:viewport?.width??window.innerWidth,height:viewport?.height??window.innerHeight,left:viewport?.offsetLeft??0,top:viewport?.offsetTop??0};
    for(const [name,value] of Object.entries(values))document.documentElement.style.setProperty('--preview-'+name,value+'px');
  }
  fit();
}
function refreshMobilePreview(){
  if(!compactViewport.matches)return;
  sizePreview();
  requestAnimationFrame(()=>{if(compactViewport.matches)sizePreview();});
}
for(const type of ['load','pageshow','orientationchange'])window.addEventListener(type,refreshMobilePreview);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')refreshMobilePreview();});
for(const type of ['focusin','focusout'])document.addEventListener(type,refreshMobilePreview);
