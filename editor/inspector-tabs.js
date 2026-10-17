let inspectorTab='info',inspectorSelection=null;
const inspectorTabButtons=[...document.querySelectorAll('[data-inspector-tab]')];
function inspectorSelectionKey(){return JSON.stringify([...selected].sort())+Boolean(regionSelection);}
function syncInspectorTabs(){
  const signature=inspectorSelectionKey();
  if(signature!==inspectorSelection){
    inspectorSelection=signature;
    if(selected.size||regionSelection)inspectorTab='edit';
  }
  for(const button of inspectorTabButtons){
    const active=button.dataset.inspectorTab===inspectorTab;
    button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;
  }
  $('inspector').hidden=inspectorTab!=='edit';
  $('inspector-info').hidden=inspectorTab!=='info';
  const quick=$('quick-edit');if(quick)quick.textContent=inspectorTab==='info'?'Info':'Edit';
  if($('tools-tab-edit')?.getAttribute('aria-selected')==='true')$('editor-tools-title').textContent=inspectorTab==='info'?'Info':'Edit';
}
function showInspectorTab(name,focus=false){
  inspectorTab=name;inspectorSelection=inspectorSelectionKey();syncInspectorTabs();
  if(focus)inspectorTabButtons.find(button=>button.dataset.inspectorTab===name)?.focus({preventScroll:true});
}
for(const button of inspectorTabButtons){
  button.onclick=()=>showInspectorTab(button.dataset.inspectorTab);
  button.onkeydown=event=>{
    const names=['edit','info'],index=names.indexOf(button.dataset.inspectorTab);
    const next={ArrowRight:(index+1)%2,ArrowLeft:(index+1)%2,Home:0,End:1}[event.key];
    if(next!==undefined){event.preventDefault();showInspectorTab(names[next],true);}
  };
}
document.addEventListener('pointerdown',event=>{
  if(event.button===0&&stage.contains(event.target)&&event.target.closest('.item,.selection-overlay,.group-grip,.resize-handle'))showInspectorTab('edit');
},true);
syncInspectorTabs();
