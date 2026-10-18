import { readFile, writeFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const code = await readFile(new URL('editor/image-drop.js', root), 'utf8');
const selection = (await Promise.all(['annotation-shapes.js', 'pixel-tools.js', 'fit-content.js', 'canvas-selection.js', 'image-edit.js'].map(name => readFile(new URL(`editor/${name}`, root), 'utf8')))).join('\n');
const dialog = await readFile(new URL('editor/image-drop-dialog.html', root), 'utf8');
const menu = await readFile(new URL('editor/canvas-edit-menu.html', root), 'utf8');
const imageEditBar = await readFile(new URL('editor/image-edit-bar.html', root), 'utf8');
const selectTools = (await readFile(new URL('editor/select-tools.html', root), 'utf8')).trimEnd();
const inspectorMarkup = (await readFile(new URL('editor/inspector-tabs.html', root), 'utf8')).trimEnd();
const inspectorCode = (await readFile(new URL('editor/inspector-tabs.js', root), 'utf8')).trimEnd();
const webmcpCode = (await readFile(new URL('editor/webmcp.js', root), 'utf8')).trimEnd();
const webmcp = '<!-- BEGIN WEBMCP -->\n<script data-editor-webmcp>\n' + webmcpCode.replace(/<\/script/gi, '<\\/script') + '\n</script>\n<!-- END WEBMCP -->';
const styles = (await Promise.all(['image-drop.css', 'canvas-view.css', 'sidebar-tabs.css', 'inspector-tabs.css', 'annotation-shapes.css'].map(name => readFile(new URL(`editor/${name}`, root), 'utf8')))).join('\n');
const view = await readFile(new URL('editor/canvas-view.js', root), 'utf8');
const viewTools = (await readFile(new URL('editor/canvas-view-tools.html', root), 'utf8')).trimEnd();
const sizeDialog = (await readFile(new URL('editor/canvas-size-dialog.html', root), 'utf8')).trimEnd();
const reader = await readFile(new URL('editor/vendor/heic-to-1.6.6.js', root), 'utf8');
const license = await readFile(new URL('editor/vendor/heic-to.LICENSE.txt', root), 'utf8');
const pictureStyles = '<style data-picture-drop>\n' + styles + '\n</style>\n';
const shadcnStyles = '<style data-shadcn-ui>\n' + (await readFile(new URL('editor/shadcn.css', root), 'utf8')).trimEnd() + '\n</style>\n';
const shadcnLicense = '<script type="text/plain" data-license="shadcn-ui">\n' + (await readFile(new URL('editor/vendor/shadcn-ui.LICENSE.txt', root), 'utf8')).trimEnd() + '\n</script>\n';
const support = '<!-- BEGIN HEIC READER -->\n' +
  '<script data-vendor="heic-to" data-version="1.6.6">\n' + reader.replace(/<\/script/gi, '<\\/script') + '\n</script>\n' +
  '<script type="text/plain" data-license="heic-to">\nSource: https://registry.npmjs.org/heic-to/-/heic-to-1.6.6.tgz\n' + license + '\n</script>\n' +
  '<!-- END HEIC READER -->';
const editorFiles = ['index.html', ...(await readdir(new URL('drafts/', root), { withFileTypes: true }))
  .filter(entry => entry.isDirectory()).map(entry => `drafts/${entry.name}/index.html`)];
for (const file of editorFiles) {
  const path = new URL(file, root);
  let html = await readFile(path, 'utf8');
  if (!html.includes('// BEGIN PICTURE DROP\n')) continue;
  html = html.replace('<h1>uidesigneditor.com</h1>', '<h1><a href="/" style="color:inherit;text-decoration:none">uidesigneditor.com</a></h1>');
  if (!html.includes('id="add-rectangle"')) html = html.replace(/(<button id="add-box">[^<]*<\/button>)/, '$1\n          <button id="add-rectangle">Rectangle</button><button id="add-arrow">Arrow</button>');
  const selectToolsBlock = '<!-- BEGIN SELECT TOOLS -->\n' + selectTools + '\n<!-- END SELECT TOOLS -->';
  if (html.includes('<!-- BEGIN SELECT TOOLS -->')) html = html.replace(/<!-- BEGIN SELECT TOOLS -->[\s\S]*?<!-- END SELECT TOOLS -->/, () => selectToolsBlock);
  else html = html.replace(/(<div class="add-catalog" id="editor-add">[\s\S]*?<div class="add-grid">[\s\S]*?<\/div>)/, (_, catalog) => catalog + '\n' + selectToolsBlock);
  html = html.replace("['fontSize','iconSize','radius','borderWidth','iconOffsetX']", "['fontSize','iconSize','radius','borderWidth','iconOffsetX','strokeWidth']");
  if (!html.includes('styleArrowShape(el,item);')) html = html.replace("  if(item.kind==='reading'){el.style.fontFamily=", "  styleArrowShape(el,item);\n  if(item.kind==='reading'){el.style.fontFamily=");
  if (!html.includes('renderArrowShape(content,item);')) html = html.replace("if(item.kind==='image'){renderPicture(content,item);}", "if(isArrowShape(item)){renderArrowShape(content,item);} else if(item.kind==='image'){renderPicture(content,item);}");
  if (!html.includes('renderArrowHandles(overlay,items[0]);')) html = html.replace("    const handle=document.createElement('span');handle.className='resize-handle';", "    if(isArrowShape(items[0]))renderArrowHandles(overlay,items[0]);\n    else {\n    const handle=document.createElement('span');handle.className='resize-handle';").replace("overlay.append(handle);\n  } else {", "overlay.append(handle);\n    }\n  } else {");
  html = html.replace(/    else if\(isRectangleShape\(items\[0\]\)\)renderRectangleHandles\(overlay(?:,items\[0\])?\);\n/g, '');
  html = html.replace(/    else if\(isTextBox\(items\[0\]\)\)render(?:TextBox|Rectangle)Handles\(overlay,items\[0\]\);\n/g, '');
  if (!html.includes('else if(hasSideResizeHandles(items[0]))')) html = html.replace('if(isArrowShape(items[0]))renderArrowHandles(overlay,items[0]);', 'if(isArrowShape(items[0]))renderArrowHandles(overlay,items[0]);\n    else if(hasSideResizeHandles(items[0]))renderRectangleHandles(overlay,items[0]);');
  html = html.replace("});if(compactViewport.matches&&$('editor-tools').open)openToolPanel('edit');}", '});finishAddingCanvasItem();}');
  if (!html.includes("el.classList.toggle('rectangle-shape'")) html = html.replace('styleArrowShape(el,item);', "styleArrowShape(el,item);el.classList.toggle('rectangle-shape',isRectangleShape(item));");
  if (!html.includes('renderArrowInspector(pane,item);')) html = html.replace("    const look=section('Shape');", "    if(isArrowShape(item))renderArrowInspector(pane,item);else {\n    const look=section('Shape');").replace("look.append(lookFields);pane.append(look);", "look.append(lookFields);pane.append(look);\n    }");
  if (!html.includes("if(key==='strokeWidth')")) html = html.replace("if(['radius','borderWidth'].includes(key))value=Math.max(0,value);", "if(key==='strokeWidth')value=Math.max(.5,value);if(['radius','borderWidth'].includes(key))value=Math.max(0,value);");
  const inspectorBlock = '<!-- BEGIN INSPECTOR TABS -->\n' + inspectorMarkup + '\n<!-- END INSPECTOR TABS -->';
  if (html.includes('<!-- BEGIN INSPECTOR TABS -->')) html = html.replace(/<!-- BEGIN INSPECTOR TABS -->[\s\S]*?<!-- END INSPECTOR TABS -->/, inspectorBlock);
  else html = html.replace('<aside class="sidebar inspector" id="inspector" aria-label="Item settings"></aside>', inspectorBlock);
  const inspectorScript = '// BEGIN INSPECTOR TABS\n' + inspectorCode + '\n// END INSPECTOR TABS';
  if (html.includes('// BEGIN INSPECTOR TABS\n')) html = html.replace(/\/\/ BEGIN INSPECTOR TABS\n[\s\S]*?\/\/ END INSPECTOR TABS/, inspectorScript);
  else html = html.replace('// END CANVAS EDITOR\n', '// END CANVAS EDITOR\n' + inspectorScript + '\n');
  if (!html.includes('function renderInspector() {\n  syncInspectorTabs();')) html = html.replace('function renderInspector() {', 'function renderInspector() {\n  syncInspectorTabs();');
  html = html.replace("['inspector','home-inspector','tools-edit']", "['editor-inspector','home-inspector','tools-edit']");
  html = html.replace("function select(id,add=false) {if(add)", "function select(id,add=false) {showInspectorTab('edit');if(add)");
  html = html.replace("showToolPanel(name);\n  if(name==='edit'&&current())", "showToolPanel(name);syncInspectorTabs();\n  if(name==='edit'&&inspectorTab==='edit'&&current())");
  html = html.replace("textContent={edit:'Edit',items:", "textContent={edit:inspectorTab==='info'?'Info':'Edit',items:");
  html = html.replaceAll('href="../dark-player-layout/"', 'href="/"');
  const viewStart = html.indexOf('// BEGIN CANVAS VIEW\n');
  if (viewStart < 0) html = html.replace('// BEGIN CANVAS EDITOR\n', view.trimEnd() + '\n// BEGIN CANVAS EDITOR\n');
  else {
    const viewEnd = html.indexOf('// END CANVAS VIEW', viewStart);
    if (viewEnd < 0) throw new Error('Missing canvas view end mark.');
    html = html.slice(0, viewStart) + view.trimEnd() + html.slice(viewEnd + '// END CANVAS VIEW'.length);
  }
  const toolsBlock = '<!-- BEGIN CANVAS VIEW TOOLS -->\n' + viewTools + '\n<!-- END CANVAS VIEW TOOLS -->';
  const toolsStart = html.indexOf('<!-- BEGIN CANVAS VIEW TOOLS -->');
  if (toolsStart < 0) html = html.replace(/(<button id="redo"[^>]*>Redo<\/button>)/, '$1\n    ' + toolsBlock);
  else {
    const toolsEnd = html.indexOf('<!-- END CANVAS VIEW TOOLS -->', toolsStart);
    if (toolsEnd < 0) throw new Error('Missing canvas view tools end mark.');
    html = html.slice(0, toolsStart) + toolsBlock + html.slice(toolsEnd + '<!-- END CANVAS VIEW TOOLS -->'.length);
  }
  const sizeDialogBlock = '<!-- BEGIN CANVAS SIZE DIALOG -->\n' + sizeDialog + '\n<!-- END CANVAS SIZE DIALOG -->';
  if (html.includes('<!-- BEGIN CANVAS SIZE DIALOG -->')) html = html.replace(/<!-- BEGIN CANVAS SIZE DIALOG -->[\s\S]*?<!-- END CANVAS SIZE DIALOG -->/, () => sizeDialogBlock);
  else html = html.replace('<!-- BEGIN PICTURE CHOICE -->', () => sizeDialogBlock + '\n<!-- BEGIN PICTURE CHOICE -->');
  const imageEditStart = html.indexOf('<!-- BEGIN IMAGE EDIT BAR -->');
  const imageEditBlock = '<!-- BEGIN IMAGE EDIT BAR -->\n' + imageEditBar.trimEnd() + '\n<!-- END IMAGE EDIT BAR -->';
  if (imageEditStart < 0) {
    html = html.replace('<div class="stage"', imageEditBlock + '\n    <div class="stage"');
  }
  else {
    const imageEditEnd = html.indexOf('<!-- END IMAGE EDIT BAR -->', imageEditStart);
    if (imageEditEnd < 0) throw new Error('Missing image edit bar end mark.');
    html = html.slice(0, imageEditStart) + imageEditBlock + html.slice(imageEditEnd + '<!-- END IMAGE EDIT BAR -->'.length);
  }
  if (!html.includes('if(imageEditSession){')) html = html.replace('function save() {', "function save() { if(imageEditSession){$('undo').disabled=!history.length;$('redo').disabled=!future.length;return;}");
  if (!html.includes('renderImageEditStatus();')) html = html.replace('function renderInspector() {', 'function renderInspector() {\n  renderImageEditStatus();');
  if (!html.includes('renderImageEditAction(heading,item);')) html = html.replace("heading.append(field('Name','name',item.name,'text',true));", "heading.append(field('Name','name',item.name,'text',true));renderImageEditAction(heading,item);");
  if (!html.includes('row.dataset.id=item.id;')) html = html.replace("const row=document.createElement('div');row.className='layer'", "const row=document.createElement('div');row.dataset.id=item.id;row.className='layer'");
  if (!html.includes('renderOrderActions(buttons);')) html = html.replace("buttons.className='action-grid';[[", "buttons.className='action-grid';renderOrderActions(buttons);[[");
  html = html.replace("['Forward',()=>reorder(1)],['Backward',()=>reorder(-1)],", '');
  html = html.replace(/^function reorder\(direction\)\{[^\n]*\}\n/m, '');
  if (!html.includes('renderOrderActions(actions);')) html = html.replace("actions.className='action-grid';actions.style.marginTop='12px';", "actions.className='action-grid';actions.style.marginTop='12px';renderOrderActions(actions);");
  html = html.replace("note.textContent='Changes save in this browser.", "note.textContent=imageEditSession?'Choose Done to save the image and return to the page. Cancel discards these edits.':'Changes save in this browser.");
  if (!html.includes('Changes save to this Space.')) html = html.replace("':'Changes save in this browser.", "':typeof onlineSpaceId!=='undefined'&&onlineSpaceId?'Changes save to this Space. Open its link in another browser to share work.':'Changes save in this browser.");
  html = html.replace(/<!-- BEGIN HEIC READER -->[\s\S]*?<!-- END HEIC READER -->\n?/, '');
  html = html.replace(/<!-- BEGIN WEBMCP -->[\s\S]*?<!-- END WEBMCP -->\n?/g, '');
  if (html.includes('<style data-picture-drop>')) html = html.replace(/<style data-picture-drop>[\s\S]*?<\/style>\n?/, pictureStyles);
  else html = html.replace('</head>', pictureStyles + '</head>');
  // Embed the shared styles so Copy HTML also works without a server.
  html = html.replace(/<style data-shadcn-ui>[\s\S]*?<\/style>\n?/g, '');
  html = html.replace(/<script type="text\/plain" data-license="shadcn-ui">[\s\S]*?<\/script>\n?/g, '');
  html = html.replace('</head>', () => shadcnStyles + shadcnLicense + '</head>');
  // Keep dollar signs in the reader unchanged when adding it after the editor.
  html = html.replace('</body>', () => webmcp + '\n' + support + '\n</body>');
  const begin = html.indexOf('// BEGIN PICTURE DROP\n'), end = html.indexOf('// END PICTURE DROP', begin);
  if (begin < 0 || end < 0) throw new Error('Missing picture drop marks.');
  html = html.slice(0, begin) + '// BEGIN PICTURE DROP\n' + code.trimEnd() + '\n' + html.slice(end);
  const selectionStart = html.indexOf('// BEGIN CANVAS EDITOR\n');
  const selectionBlock = '// BEGIN CANVAS EDITOR\n' + selection.trimEnd() + '\n// END CANVAS EDITOR';
  if (selectionStart < 0) html = html.replace('// END PICTURE DROP\n', '// END PICTURE DROP\n' + selectionBlock + '\n');
  else {
    const selectionEnd = html.indexOf('// END CANVAS EDITOR', selectionStart);
    if (selectionEnd < 0) throw new Error('Missing canvas editor end mark.');
    html = html.slice(0, selectionStart) + selectionBlock + html.slice(selectionEnd + '// END CANVAS EDITOR'.length);
  }
  const choice = '<!-- BEGIN PICTURE CHOICE -->\n' + dialog.trimEnd() + '\n' + menu.trimEnd() + '\n<!-- END PICTURE CHOICE -->';
  const choiceStart = html.indexOf('<!-- BEGIN PICTURE CHOICE -->');
  if (choiceStart < 0) html = html.replace('<script type="application/json" id="initial-layout">', choice + '\n<script type="application/json" id="initial-layout">');
  else {
    const choiceEnd = html.indexOf('<!-- END PICTURE CHOICE -->', choiceStart);
    if (choiceEnd < 0) throw new Error('Missing picture choice end mark.');
    html = html.slice(0, choiceStart) + choice + html.slice(choiceEnd + '<!-- END PICTURE CHOICE -->'.length);
  }
  if (!html.includes("phone.classList.toggle('picture-page'")) html = html.replace("phone.classList.toggle('editing',editing);", "phone.classList.toggle('editing',editing);phone.classList.toggle('picture-page',Boolean(state.canvas.picturePage));");
  if (!html.includes("phone.classList.toggle('free-page'")) html = html.replace("phone.classList.toggle('picture-page',Boolean(state.canvas.picturePage));", "phone.classList.toggle('picture-page',Boolean(state.canvas.picturePage));phone.classList.toggle('free-page',!isPhoneCanvas(state.canvas));");
  html = html.replace('Math.max(.2,Math.min(1,', 'Math.max(state.canvas.picturePage ? .01 : .2,Math.min(1,');
  html = html.replace(/const canvas=section\((?:'Phone'|state\.canvas\.picturePage\?'Page':'Phone')\);/, "const canvas=section('Canvas');");
  html = html.replace("preset.setAttribute('aria-label','Phone size');", "preset.setAttribute('aria-label',state.canvas.picturePage?'Page size':'Phone size');");
  html = html.replace(/\[\['393,852','iPhone 16[^\n]*\n\s*preset\.onchange=[^\n]*canvas\.append\(preset\);/, 'renderPageSizePicker(preset);canvas.append(preset);');
  if (!html.includes('cleanPictureExport(doc);')) html = html.replace('const doc=document.documentElement.cloneNode(true);', 'const doc=document.documentElement.cloneNode(true);cleanPictureExport(doc);');
  html = html.replace('function renderSelection() {', 'function renderNativeSelection() {');
  if (!html.includes("el.classList.toggle('page-image'")) html = html.replace('styleItem(el,item);', "styleItem(el,item);el.classList.toggle('page-image',isPagePicture(item));");
  html = html.replace("empty.textContent='Drag across", "empty.textContent=regionSelection?'Drag inside the selection to move it. Cut, copy and paste work with the usual keys or a right-click.':'Drag across");
  const selectionHelp='Draw a box to select items it touches. Drag inside to move them. Shift-click to add or remove an item.';
  for (const message of [
    'Drag across empty space. The box selects every item it touches. Drag any selected item to move them together. Shift-click to add or remove items.',
    'Drag across empty space to select items. Drag any selected item to move them together. Shift-click to add or remove items.',
    'Draw a box around items, then drag inside it to move them. Shift-click to add or remove an item.',
  ]) html = html.replaceAll(message, selectionHelp);
  const pictureHelp='Draw a box to select part of the image. Drag inside the box to move it.';
  html = html.replaceAll('Click the main image to resize it. Drag to select part of the image.', pictureHelp);
  if (!html.includes("state.canvas.picturePage?'" + pictureHelp + "'")) html = html.replace("':'" + selectionHelp + "'", "':state.canvas.picturePage?'" + pictureHelp + "':'" + selectionHelp + "'");
  html = html.replaceAll('Drag any selected item or the count above the box to move them together.', 'Drag inside the box to move the selected items.');
  html = html.replaceAll('Drag empty space to select · drag items to move · Shift-click to add · Delete to remove', 'Drag to select · drag the selection to move · ⌘X / ⌘V to cut and paste');
  html = html.replaceAll('Drag empty space: select a box.', 'Drag: draw a box. Drag inside: move.');
  html = html.replaceAll('⌘C / ⌘V: copy and paste items.', '⌘X / ⌘C / ⌘V: cut, copy and paste.');
  html = html.replace("element.classList?.contains('selection-overlay')||element.classList?.contains('guide')", "element.classList?.contains('selection-overlay')||element.classList?.contains('pixel-selection')||element.classList?.contains('guide')");
  await writeFile(path, html);
}
