// Page tools use the same design data, save code and Undo steps as the editor.
(() => {
  'use strict';
  if (typeof window !== 'undefined' && window.self !== window.top) return;
  const context = typeof document.modelContext?.registerTool === 'function' ? document.modelContext
    : typeof navigator.modelContext?.registerTool === 'function' ? navigator.modelContext : null;
  const status = document.getElementById('codex-tools-status');
  if (!context) {
    if (status) status.textContent = 'Site tools need a supported Codex browser.';
    return;
  }

  const number = (minimum = -16000, maximum = 16000) => ({ type: 'number', minimum, maximum });
  const text = maxLength => ({ type: 'string', maxLength });
  const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
  const array = (items, minItems = 0) => ({ type: 'array', items, minItems, maxItems: 5000 });
  const kinds = ['label', 'icon', 'shape', 'reading', 'tab', 'button', 'textbox', 'image'];
  const point = object({ x: number(0, 1), y: number(0, 1) }, ['x', 'y']);
  const look = {
    name: text(200), x: number(), y: number(), w: number(.1), h: number(.1),
    text: text(100000), fontSize: number(1, 1024), iconSize: number(1, 2048), icon: text(100),
    color: text(128), background: text(128), borderColor: text(128), borderWidth: number(0, 1000),
    radius: number(0), opacity: number(0, 1), align: { enum: ['left', 'center', 'right'] },
    fontWeight: number(100, 900), lineHeight: number(.1, 10), fontFamily: { enum: ['sans', 'serif'] },
    wrap: { type: 'boolean' }, hidden: { type: 'boolean' }, iconOffsetX: number(),
    highlightWord: text(10000), highlightColor: text(128), contentScale: number(.001, 1000),
    shape: { enum: ['rectangle', 'arrow'] }, strokeWidth: number(.5, 1000), arrowStart: point, arrowEnd: point,
    src: { ...text(40000000), pattern: '^data:image/png;base64,[A-Za-z0-9+/=]+$' },
    imageBase: { type: 'boolean' }, pictureFragment: { type: 'boolean' },
  };
  const entrySchema = object({ ...look, id: { ...text(200), minLength: 1 }, kind: { enum: kinds } }, ['kind', 'x', 'y', 'w', 'h']);
  const canvasSchema = object({ width: number(1), height: number(1), background: text(128) }, ['width', 'height', 'background']);
  const target = { projectId: { ...text(200), minLength: 1 }, revision: { ...text(100), minLength: 1 } };
  let busy = false;

  function validate(value, schema, path = 'Input') {
    if (schema.enum && !schema.enum.includes(value)) throw new Error(path + ' has an unknown value.');
    if (schema.type === 'object') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(path + ' must be an object.');
      for (const key of schema.required) if (!Object.hasOwn(value, key)) throw new Error(path + '.' + key + ' is required.');
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(schema.properties, key)) throw new Error(path + '.' + key + ' is not supported.');
        validate(value[key], schema.properties[key], path + '.' + key);
      }
    } else if (schema.type === 'array') {
      if (!Array.isArray(value) || value.length < schema.minItems || value.length > schema.maxItems) throw new Error(path + ' has too few or too many items.');
      value.forEach((entry, index) => validate(entry, schema.items, path + '[' + index + ']'));
    } else if (schema.type === 'number') {
      if (!Number.isFinite(value) || value < schema.minimum || value > schema.maximum) throw new Error(path + ' is outside its size limits.');
    } else if (schema.type === 'string') {
      if (typeof value !== 'string' || value.length > schema.maxLength || value.length < (schema.minLength || 0) || (schema.pattern && !new RegExp(schema.pattern).test(value))) throw new Error(path + ' must contain valid text.');
    } else if (schema.type === 'boolean' && typeof value !== 'boolean') throw new Error(path + ' must be true or false.');
  }
  function checkColors(values) {
    for (const key of ['color', 'background', 'borderColor', 'highlightColor']) {
      if (values[key] !== undefined && !CSS.supports('color', values[key])) throw new Error(key + ' must be a color.');
    }
  }
  function normalizeItem(values) {
    validate(values, entrySchema, 'Item');
    checkColors(values);
    if (values.icon && !Object.hasOwn(ICONS, values.icon)) throw new Error('Unknown icon. Use read_design with iconSearch to find a name.');
    if (values.kind === 'image' && (!safePictureSource(values.src) || !storedPictureSize(values.src))) throw new Error('Images need an embedded PNG under 24 million pixels.');
    const { id = 'item-' + crypto.randomUUID(), name = 'New ' + values.kind, kind, x, y, w, h, ...extra } = values;
    return item(id, name, kind, x, y, w, h, extra);
  }
  function normalizeLayout(canvas, items) {
    validate(canvas, canvasSchema, 'Canvas');
    checkColors(canvas);
    if (canvas.width * canvas.height > 24000000) throw new Error('Use a page under 24 million pixels.');
    validate(items, array(entrySchema), 'Items');
    const entries = items.map(normalizeItem);
    if (new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('Each item needs a unique id.');
    return { version: 1, canvas: copy(canvas), items: entries };
  }
  function savedLayout(source, depth = 0) {
    if (depth > 6 || !validEditorPage(source)) throw new Error('Use HTML saved by this editor.');
    const canvas = { width: source.canvas.width, height: source.canvas.height, background: source.canvas.background };
    const entries = source.items.map(entry => Object.fromEntries(Object.entries(entry).filter(([key]) => Object.hasOwn(entrySchema.properties, key))));
    const layout = normalizeLayout(canvas, entries);
    if (source.canvas.picturePage === true) layout.canvas.picturePage = true;
    if (source.canvas.picturePageSize && validPicturePageSize(source.canvas.picturePageSize)) layout.canvas.picturePageSize = copy(source.canvas.picturePageSize);
    source.items.forEach((entry, index) => { if (entry.imageContents) layout.items[index].imageContents = savedLayout(entry.imageContents, depth + 1); });
    return layout;
  }
  function idle() {
    if (!editing || drag || fieldEdit || canvasGesture || canvasEditBusy || canvasPan || canvasPinch || canvasViewBusy()
      || pictureDropBusy || imageEditSession || (typeof projectSwitchBusy !== 'undefined' && projectSwitchBusy)
      || ['picture-drop-choice', 'icon-picker', 'project-delete-dialog', 'canvas-size-dialog'].some(id => $(id)?.open)) {
      throw new Error('Finish the current edit or close the open choice, then try again.');
    }
  }
  function projectId() { return typeof activeProject === 'string' ? activeProject : 'current'; }
  async function revision(serialized) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function checkTarget(args) {
    idle();
    const current = state, id = projectId(), serialized = JSON.stringify(state);
    const currentRevision = await revision(serialized);
    idle();
    if (state !== current || projectId() !== id || JSON.stringify(state) !== serialized || args.projectId !== id || args.revision !== currentRevision) {
      throw new Error('The design changed. Call read_design and use its projectId and revision before trying again.');
    }
  }
  async function snapshot(includeImages = false) {
    const id = projectId(), serialized = JSON.stringify(state), design = JSON.parse(serialized);
    const projects = typeof localProjects !== 'undefined' ? localProjects.map(({ id, name }) => ({ id, name })) : [{ id, name: 'Current page' }];
    if (!includeImages) for (const entry of design.items) if (entry.kind === 'image') {
      delete entry.src; delete entry.imageContents; entry.imageDataOmitted = true;
    }
    return { projectId: id, revision: await revision(serialized), projects, design, selectedIds: [...selected] };
  }
  function commit(layout, ids = []) {
    change(() => { state = layout; selected = new Set(ids); clearCanvasRegion(); closeCanvasMenu(); closeItemMenu(); });
  }
  function openLayout(layout, name) {
    if (typeof createProject === 'function') createProject(layout, name);
    else { commit(layout); resetCanvasView(); }
  }
  async function ready() {
    await picturesReady;
    if (typeof projectsReady !== 'undefined') await projectsReady;
    if (typeof spaceClient !== 'undefined') await spaceClient?.ready;
    idle();
  }

  const definitions = [
    {
      name: 'read_design',
      description: 'Read the open design, project list, selected items and revision. Image bytes are omitted unless includeImages is true. Use the returned projectId and revision for every edit. iconSearch finds up to 80 icon names.',
      inputSchema: object({ includeImages: { type: 'boolean' }, iconSearch: text(100) }),
      readOnly: true,
      async run(args) {
        const result = await snapshot(args.includeImages);
        if (args.iconSearch !== undefined) result.icons = Object.keys(ICONS).filter(name => name.includes(args.iconSearch.toLowerCase())).slice(0, 80);
        return result;
      },
    },
    {
      name: 'edit_design',
      description: 'Add, update or remove items, or set the page size and color, in one Undo step. Coordinates and sizes use design pixels. Updates keep fields that are not supplied. Item order is back to front. Read the latest projectId and revision first.',
      inputSchema: object({ ...target, addItems: array(entrySchema), updates: array(object({ id: { ...text(200), minLength: 1 }, changes: object(look) }, ['id', 'changes'])), removeIds: array(text(200)), canvas: canvasSchema }, ['projectId', 'revision']),
      async run(args) {
        await checkTarget(args);
        const layout = copy(state), remove = new Set(args.removeIds || []), updates = args.updates || [];
        if (remove.size !== (args.removeIds || []).length || new Set(updates.map(update => update.id)).size !== updates.length) throw new Error('Use each item id once.');
        for (const id of [...remove, ...updates.map(update => update.id)]) if (!layout.items.some(entry => entry.id === id)) throw new Error('No item has id ' + id + '.');
        if (updates.some(update => remove.has(update.id))) throw new Error('Do not update and remove the same item.');
        layout.items = layout.items.filter(entry => !remove.has(entry.id));
        for (const update of updates) {
          const entry = layout.items.find(entry => entry.id === update.id);
          const known = Object.fromEntries(Object.entries(entry).filter(([key]) => Object.hasOwn(entrySchema.properties, key)));
          Object.assign(entry, normalizeItem({ ...known, ...update.changes }));
          if (Object.hasOwn(update.changes, 'src')) delete entry.imageContents;
        }
        const added = (args.addItems || []).map(normalizeItem);
        layout.items.push(...added);
        if (layout.items.length > 5000 || new Set(layout.items.map(entry => entry.id)).size !== layout.items.length) throw new Error('Use at most 5,000 items with unique ids.');
        if (args.canvas) {
          checkColors(args.canvas);
          if (args.canvas.width * args.canvas.height > 24000000) throw new Error('Use a page under 24 million pixels.');
          layout.canvas = { ...layout.canvas, ...args.canvas };
          if (layout.canvas.width !== state.canvas.width || layout.canvas.height !== state.canvas.height) delete layout.canvas.picturePage;
        }
        if (JSON.stringify(layout) !== JSON.stringify(state)) commit(layout, added.length ? added.map(entry => entry.id) : [...selected].filter(id => !remove.has(id)));
        return { ...await snapshot(), addedIds: added.map(entry => entry.id) };
      },
    },
    {
      name: 'create_design',
      description: 'Create and open a full design as a new project, keeping the existing projects. Standalone drafts without Projects replace their page in one Undo step. Items remain separate and editable. Read the current projectId and revision first.',
      inputSchema: object({ ...target, name: { ...text(200), minLength: 1 }, canvas: canvasSchema, items: array(entrySchema) }, ['projectId', 'revision', 'name', 'canvas', 'items']),
      async run(args) {
        const layout = normalizeLayout(args.canvas, args.items);
        await checkTarget(args);
        openLayout(layout, args.name);
        return snapshot();
      },
    },
    {
      name: 'select_project',
      description: 'Open an existing project by an id from read_design. Keeps each project and its Undo steps. Does not delete projects.',
      inputSchema: object({ projectId: { ...text(200), minLength: 1 } }, ['projectId']),
      async run(args) {
        if (typeof switchProject !== 'function') throw new Error('This standalone page has no other projects.');
        if (!localProjects.some(project => project.id === args.projectId)) throw new Error('Unknown project id.');
        await switchProject(args.projectId);
        return snapshot();
      },
    },
    {
      name: 'import_image',
      description: 'Open a screenshot or picture from embedded base64 image data. mode new opens a project at the picture size; mode add places it on the current page. Supports PNG, JPG, WebP, GIF, AVIF, BMP and HEIC. No URLs or local file paths are fetched. Read the latest projectId and revision first.',
      inputSchema: object({ ...target, name: { ...text(200), minLength: 1 }, dataUrl: { ...text(40000000), pattern: '^data:image/(png|jpeg|webp|gif|avif|bmp|heic|heif);base64,[A-Za-z0-9+/=]+$' }, mode: { enum: ['add', 'new'] }, x: number(), y: number() }, ['projectId', 'revision', 'name', 'dataUrl', 'mode']),
      async run(args) {
        await checkTarget(args);
        const [header, base64] = args.dataUrl.split(','), bytes = Uint8Array.from(atob(base64), char => char.charCodeAt(0));
        const picture = await readPicture(new File([bytes], args.name, { type: header.slice(5, header.indexOf(';')) }));
        await checkTarget(args);
        if (args.mode === 'add' && state.items.length >= 5000) throw new Error('Use at most 5,000 items.');
        const center = canvasViewCenter(), plan = pictureDropPlan([picture], args.mode, state.canvas, { x: args.x ?? center.x, y: args.y ?? center.y });
        const box = plan.boxes[0], entry = item('item-' + crypto.randomUUID(), args.name, 'image', box.x, box.y, box.w, box.h, { src: picture.src, ...(plan.replace ? { imageBase: true } : {}) });
        if (plan.replace) openLayout({ version: 1, canvas: plan.canvas, items: [entry] }, args.name);
        else { const layout = copy(state); layout.items.push(entry); commit(layout, [entry.id]); }
        return { ...await snapshot(), addedIds: [entry.id] };
      },
    },
    {
      name: 'import_html',
      description: 'Read saved editor HTML without running its scripts. Send a small HTML document containing only its application/json script with id initial-layout; other markup is ignored. mode new opens a project; mode add adds its items. Rebuild other HTML as items first. Read the latest projectId and revision first.',
      inputSchema: object({ ...target, name: { ...text(200), minLength: 1 }, html: text(60000000), mode: { enum: ['add', 'new'] } }, ['projectId', 'revision', 'name', 'html', 'mode']),
      async run(args) {
        await checkTarget(args);
        const layout = savedLayout(await readEditorPage(new File([args.html], args.name, { type: 'text/html' })));
        if (layout.items.length > 5000 || new Set(layout.items.map(entry => entry.id)).size !== layout.items.length) throw new Error('Use at most 5,000 items with unique ids.');
        await checkTarget(args);
        if (args.mode === 'new') openLayout(layout, args.name);
        else {
          if (state.items.length + layout.items.length > 5000) throw new Error('Use at most 5,000 items.');
          change(() => { clearCanvasRegion(); addEditorPage(layout, canvasViewCenter()); });
        }
        return snapshot();
      },
    },
    {
      name: 'move_image_region',
      description: 'Move a rectangular part of a screenshot or picture. Fills its old spot using the editor image tools, then adds the moved part as an image item in one Undo step. The box must stay inside the page. Read the latest projectId and revision first.',
      inputSchema: object({ ...target, box: object({ x: number(0), y: number(0), w: number(1), h: number(1) }, ['x', 'y', 'w', 'h']), x: number(), y: number() }, ['projectId', 'revision', 'box', 'x', 'y']),
      async run(args) {
        await checkTarget(args);
        if (state.items.length >= 5000) throw new Error('Use at most 5,000 items.');
        if (args.box.x + args.box.w > state.canvas.width || args.box.y + args.box.h > state.canvas.height) throw new Error('Keep the selected box inside the page.');
        const region = rememberRegion(args.box);
        if (!region?.sources.length) throw new Error('The selected box contains no picture.');
        const plan = await makeRegionPlan(region);
        await checkTarget(args);
        const entry = { ...copy(plan.entry), x: args.x, y: args.y };
        change(() => { applyRegionPatches(plan); state.items.push(entry); selected = new Set([entry.id]); clearCanvasRegion(); });
        return { ...await snapshot(), addedIds: [entry.id] };
      },
    },
    {
      name: 'undo_design',
      description: 'Undo or redo one edit in the open project using its normal Undo history. Read the latest projectId and revision first.',
      inputSchema: object({ ...target, direction: { enum: ['undo', 'redo'] } }, ['projectId', 'revision', 'direction']),
      async run(args) {
        await checkTarget(args);
        if (!(args.direction === 'undo' ? history : future).length) throw new Error('There is no edit to ' + args.direction + '.');
        clearCanvasRegion(); $(args.direction).onclick();
        return snapshot();
      },
    },
    {
      name: 'export_design',
      description: 'Export the current design as JSON, editable HTML, or a PNG picture. delivery download saves a browser download; inline returns the contents (PNG as a data URL). HTML includes the editor and its projects and can be large. Does not use the clipboard.',
      inputSchema: object({ ...target, format: { enum: ['json', 'html', 'png'] }, delivery: { enum: ['download', 'inline'] } }, ['projectId', 'revision', 'format', 'delivery']),
      readOnly: true,
      async run(args) {
        await checkTarget(args);
        let content, mimeType;
        if (args.format === 'html') { content = exportHtml(); mimeType = 'text/html'; }
        else if (args.format === 'json') { content = JSON.stringify(state, null, 2); mimeType = 'application/json'; }
        else {
          await document.fonts.ready;
          await checkTarget(args);
          const width = state.canvas.width, height = state.canvas.height;
          const canvas = await html2canvas($('phone'), {
            width, height, scale: Math.min(3, Math.sqrt(24000000 / (width * height))), scrollX: 0, scrollY: 0, logging: false, backgroundColor: state.canvas.background,
            windowWidth: Math.max(document.documentElement.clientWidth, width), windowHeight: Math.max(document.documentElement.clientHeight, height),
            ignoreElements: element => ['selection-overlay', 'pixel-selection', 'guide'].some(name => element.classList?.contains(name)),
            onclone: cloned => {
              const phone = cloned.getElementById('phone'); phone.classList.remove('editing');
              Object.assign(phone.style, { position: 'fixed', left: '0', top: '0', width: width + 'px', height: height + 'px', transform: 'none', boxShadow: 'none', borderRadius: '0' });
              cloned.querySelectorAll('dialog').forEach(dialog => dialog.removeAttribute('open'));
            },
          });
          try { content = canvas.toDataURL('image/png'); } finally { canvas.width = canvas.height = 1; }
          await checkTarget(args);
          mimeType = 'image/png';
        }
        const filename = 'design.' + args.format;
        if (args.delivery === 'download') {
          const blob = args.format === 'png' ? new Blob([Uint8Array.from(atob(content.split(',')[1]), char => char.charCodeAt(0))], { type: mimeType }) : new Blob([content], { type: mimeType });
          downloadBlob(blob, filename);
          return { filename, mimeType, bytes: blob.size, downloaded: true };
        }
        return { filename, mimeType, content };
      },
    },
  ];

  async function register() {
    const registered = [];
    try {
      for (const definition of definitions) {
        await context.registerTool({
          name: definition.name, description: definition.description, inputSchema: definition.inputSchema,
          annotations: { readOnlyHint: Boolean(definition.readOnly) },
          execute: async (args = {}) => {
            if (busy) return { ok: false, error: 'Another site tool is still running. Try again when it finishes.' };
            busy = true;
            try {
              validate(args, definition.inputSchema); await ready();
              const result = await definition.run(args);
              if (!definition.readOnly && typeof spaceClient !== 'undefined') await spaceClient?.saved();
              return { ok: true, ...result };
            }
            catch (error) { return { ok: false, error: error.message || 'The edit could not finish.' }; }
            finally { busy = false; }
          },
        });
        registered.push(definition.name);
      }
      if (status) status.textContent = 'Codex tools ready';
    } catch {
      for (const name of registered) try { await context.unregisterTool?.(name); } catch {}
      if (status) status.textContent = 'Site tools could not start. Reload this page to try again.';
    }
  }
  void register();
})();
