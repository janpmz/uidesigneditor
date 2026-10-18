function renameItem(item,row,name) {
  const input=document.createElement('input');input.type='text';input.className='layer-rename';input.value=item.name;
  input.setAttribute('aria-label','Item name');input.setAttribute('autocomplete','off');
  let finished=false;
  const finish=(commit,focus=false)=>{
    if(finished||!input.isConnected)return;finished=true;
    const value=input.value.trim(),entry=state.items.find(entry=>entry.id===item.id);
    if(commit&&entry&&value&&value!==entry.name){
      remember();entry.name=value;save();renderPhone();name.textContent=value;
      row.querySelector('.layer-state').setAttribute('aria-label',(entry.hidden?'Restore ':'Hide ')+value);
    }
    input.replaceWith(name);
    if(focus)[...$('layers').children].find(node=>node.dataset.id===item.id)?.querySelector('.layer-name')?.focus({preventScroll:true});
  };
  input.onkeydown=event=>{
    event.stopPropagation();
    if(event.key==='Enter'||event.key==='Escape'){event.preventDefault();finish(event.key==='Enter',true);}
  };
  input.onblur=()=>finish(true);
  name.replaceWith(input);input.focus({preventScroll:true});input.select();
}
function renderLayers() {
  $('layers').replaceChildren();$('item-count').textContent=state.items.filter(item=>!item.hidden).length+' visible';
  [...state.items].reverse().forEach(item=>{
    const row=document.createElement('div');row.dataset.id=item.id;row.className='layer'+(selected.has(item.id)?' selected':'')+(item.hidden?' deleted':'');
    const name=document.createElement('button');name.className='layer-name';name.textContent=item.name;name.title='Double-click to rename';
    name.onclick=event=>{
      if(event.detail>1)return;
      showInspectorTab('edit');
      if(event.shiftKey){if(selected.has(item.id))selected.delete(item.id);else selected.add(item.id);}else selected=new Set([item.id]);
      renderPhone();renderInspector();
      for(const layer of $('layers').children)layer.classList.toggle('selected',selected.has(layer.dataset.id));
    };
    name.ondblclick=()=>renameItem(item,row,name);
    name.onkeydown=event=>{if(event.key==='F2'){event.preventDefault();renameItem(item,row,name);}};
    const toggle=document.createElement('button');toggle.className='layer-state';toggle.textContent=item.hidden?'Restore':'Hide';toggle.setAttribute('aria-label',(item.hidden?'Restore ':'Hide ')+item.name);toggle.onclick=()=>change(()=>{item.hidden=!item.hidden;});row.append(name,toggle);$('layers').append(row);
  });
}
function field(label,key,value,type='number',full=false) {
  const wrap=document.createElement('label');wrap.className='field'+(full?' full':'');
  const caption=document.createElement('span');caption.className='field-label';caption.textContent=label;wrap.append(caption);
  const input=document.createElement(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;input.dataset.field=key;input.value=value??'';
  if(type==='number'){input.step=['opacity','lineHeight'].includes(key)?'.05':'.5';if(['w','h','fontSize','iconSize'].includes(key))input.min='1';if(key==='opacity'){input.min='0';input.max='1';}}
  if(type==='color'){
    wrap.classList.add('color-field');const color=document.createElement('span');color.className='color-control';
    const value=document.createElement('span');value.className='color-value';value.textContent=input.value.toUpperCase();value.setAttribute('aria-hidden','true');
    input.oninput=()=>{value.textContent=input.value.toUpperCase();};color.append(input,value);wrap.append(color);
  }else wrap.append(input);
  return wrap;
}
function section(title){const el=document.createElement('section');el.className='section';const h=document.createElement('h2');h.textContent=title;el.append(h);return el;}
function textAlignment(item){
  const wrap=document.createElement('div');wrap.className='field';
  const label=document.createElement('span');label.className='field-label';label.textContent='Align';
  const buttons=document.createElement('div');buttons.className='align-buttons';buttons.setAttribute('role','group');buttons.setAttribute('aria-label','Text alignment');
  const paths={left:'M4 5h16M4 10h10M4 15h16M4 20h10',center:'M4 5h16M7 10h10M4 15h16M7 20h10',right:'M4 5h16M10 10h10M4 15h16M10 20h10'};
  for(const [value,path] of Object.entries(paths)){
    const button=document.createElement('button');button.title=button.ariaLabel=value[0].toUpperCase()+value.slice(1);
    button.setAttribute('aria-pressed',String((item.align||'left')===value));button.className=(item.align||'left')===value?'active':'';
    button.innerHTML='<svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="'+path+'"/></svg>';
    button.onclick=()=>change(()=>{item.align=value;});buttons.append(button);
  }
  wrap.append(label,buttons);return wrap;
}
function renderInspector() {
  syncInspectorTabs();
  renderImageEditStatus();
  const pane=$('inspector');pane.replaceChildren();const item=current(),items=selectedItems();
  renderPageSizePicker($('page-size'));
  const canvas=section('Canvas');
  canvas.append(field('Background','canvasBackground',state.canvas.background,'color'));
  pane.append(canvas);
  if(items.length>1){
    const group=section(items.length+' items selected'),bounds=boundsOf(items),fields=document.createElement('div');fields.className='fields';
    fields.append(field('X','groupX',round(bounds.x)),field('Y','groupY',round(bounds.y)));
    const note=document.createElement('p');note.className='note';note.style.marginTop='12px';note.textContent='Drag inside the box to move the selected items. Shift-click to add or remove an item.';group.append(note);
    pane.append(group);const arrange=section('Arrange'),actions=document.createElement('div');actions.className='action-grid';renderOrderActions(actions);
    [['Duplicate selected',duplicate],['Delete selected',deleteSelected]].forEach(([name,fn])=>{const button=document.createElement('button');button.textContent=name;button.onclick=fn;if(name==='Delete selected')button.className='danger';actions.append(button);});arrange.append(actions);pane.append(arrange);
    const position=section('Position & size');position.append(fields);pane.append(position);
  }
  else if(!item){const empty=document.createElement('div');empty.className='empty-state';empty.textContent=regionSelection?'Choose Make item to move or resize this part. You can also right-click and choose Make item.':state.canvas.picturePage?'Draw a box to select part of the image, then choose Make item. The box selects any items it touches.':'Draw a box to select items it touches. Drag inside to move them. Shift-click to add or remove an item.';pane.append(empty);}
  else {
    const heading=section(item.kind==='video'?'Video':item.kind==='image'?'Image':'Selected item');renderImageEditAction(heading,item);
    if(item.hidden){const note=document.createElement('p');note.className='note';note.textContent='This item is hidden. Choose Restore below to bring it back.';heading.append(note);}
    if(heading.children.length>1)pane.append(heading);
    if(!['shape','image','video'].includes(item.kind)){
      const text=section(item.kind==='icon'?'Icon':'Text');text.classList.add('text-section');const grid=document.createElement('div');grid.className='fields text-fields';
      if(item.kind==='icon'&&typeof openIconPicker==='function'){
        const iconLabel=document.createElement('div');iconLabel.className='field full';const caption=document.createElement('label');caption.textContent='Icon';iconLabel.append(caption);
        const picker=document.createElement('button');picker.className='icon-choice';picker.setAttribute('aria-label',item.icon?'Change icon':'Choose icon');
        if(item.icon)picker.append(icon(item.icon,22));const iconName=document.createElement('span');iconName.className='icon-choice-name';iconName.textContent=item.icon||'Choose an icon…';picker.append(iconName);
        picker.onclick=()=>openIconPicker(item.id);iconLabel.append(picker);
        grid.append(iconLabel);
      }
      if(item.kind!=='icon'){
        const content=field('Text','text',item.text,item.kind==='reading'||item.wrap?'textarea':'text',true);content.classList.add('text-content');
        const input=content.querySelector('input,textarea');if(input.tagName==='TEXTAREA')input.rows=3;grid.append(content);
      }
      if(item.kind==='reading'){
        const passages=document.createElement('select');passages.setAttribute('aria-label','Sample passage');passages.style.gridColumn='1/-1';const prompt=document.createElement('option');prompt.value='';prompt.textContent='Try a sample passage…';passages.append(prompt);Object.keys(PASSAGES).forEach(name=>{const option=document.createElement('option');option.value=name;option.textContent=name;passages.append(option);});passages.onchange=()=>{if(passages.value)change(()=>{item.text=PASSAGES[passages.value];});};grid.append(passages);
      }
      if(item.kind==='icon')grid.append(field('Icon size','iconSize',item.iconSize));
      if(item.kind!=='icon'){
        const fontLabel=document.createElement('label');fontLabel.className='field';fontLabel.append(document.createTextNode('Font'));const font=document.createElement('select');font.setAttribute('aria-label','Font');[['system','App font'],['serif','Player serif']].forEach(([value,text])=>{const option=document.createElement('option');option.value=value;option.textContent=text;font.append(option);});font.value=item.fontFamily||'system';font.onchange=()=>change(()=>{item.fontFamily=font.value;});fontLabel.append(font);grid.append(fontLabel);
        grid.append(field('Size','fontSize',item.fontSize),field('Weight','fontWeight',item.fontWeight||400),field('Line spacing','lineHeight',item.lineHeight||1.35));
      }
      grid.append(field('Color','color',item.color,'color'));
      if(item.kind!=='icon')grid.append(textAlignment(item));
      if(item.kind==='reading'){
        const highlight=field('Highlight word','highlightWord',item.highlightWord,'text');
        highlight.querySelector('input').placeholder='None';highlight.title='Leave blank to remove the highlight';
        grid.append(highlight,field('Highlight color','highlightColor',item.highlightColor,'color'));
      }
      text.append(grid);pane.append(text);
    }
    if(isArrowShape(item))renderArrowInspector(pane,item);else {
    const look=section('Shape');look.classList.add('shape-section');const lookFields=document.createElement('div');lookFields.className='fields';
    const fillRow=document.createElement('div');fillRow.className='fill-row full';fillRow.append(field('Fill','background',item.background==='transparent'?'#000000':item.background,'color'));
    const transparent=document.createElement('label');transparent.className='check-line';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.dataset.transparent='true';checkbox.checked=item.background==='transparent';checkbox.onchange=()=>change(()=>{item.background=checkbox.checked?'transparent':'#242424';});transparent.append(checkbox,document.createTextNode('No fill'));fillRow.append(transparent);
    lookFields.append(fillRow,field('Border width','borderWidth',item.borderWidth),field('Border color','borderColor',item.borderColor,'color'),field('Opacity','opacity',item.opacity),field('Corner radius','radius',item.radius));look.append(lookFields);pane.append(look);
    }
    const actions=section('Arrange');const buttons=document.createElement('div');buttons.className='action-grid';renderOrderActions(buttons);[['Duplicate',duplicate],[item.hidden?'Restore':'Delete',()=>change(()=>{item.hidden=!item.hidden;})]].forEach(([title,fn])=>{const button=document.createElement('button');button.textContent=title;button.onclick=fn;if(title==='Delete')button.className='danger';buttons.append(button);});actions.append(buttons);pane.append(actions);
    const position=section('Position & size');const fields=document.createElement('div');fields.className='fields';[['X','x',item.x],['Y','y',item.y],['Width','w',item.w],['Height','h',item.h]].forEach(args=>fields.append(field(...args)));position.append(fields);pane.append(position);
  }
}
