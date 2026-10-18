// Page tools use the same design data, save code and Undo steps as the editor.
(() => {
  'use strict';
  if (typeof window !== 'undefined' && window.self !== window.top) return;
  const context = typeof document.modelContext?.registerTool === 'function' ? document.modelContext
    : typeof navigator.modelContext?.registerTool === 'function' ? navigator.modelContext : null;
  const status = document.getElementById('codex-tools-status');
  if (!context) {
    if (status) status.textContent = 'Paste this into Codex, Claude, etc:';
    return;
  }

  const number = (minimum = -16000, maximum = 16000) => ({ type: 'number', minimum, maximum });
  const text = maxLength => ({ type: 'string', maxLength });
  const object = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
  const array = (items, minItems = 0) => ({ type: 'array', items, minItems, maxItems: 5000 });
  const described = (schema, description) => ({ ...schema, description });
  const kinds = ['label', 'icon', 'shape', 'reading', 'tab', 'button', 'textbox', 'image', 'video'];
  const point = object({ x: described(number(0, 1), 'Horizontal position within the item, from 0 at the left to 1 at the right.'), y: described(number(0, 1), 'Vertical position within the item, from 0 at the top to 1 at the bottom.') }, ['x', 'y']);
  const look = {
    name: text(200), x: number(), y: number(), w: number(.1), h: number(.1),
    text: text(100000), fontSize: number(1, 1024), iconSize: number(1, 2048), icon: text(100),
    color: text(128), background: text(128), borderColor: text(128), borderWidth: number(0, 1000),
    radius: number(0), opacity: number(0, 1), align: { enum: ['left', 'center', 'right'] },
    fontWeight: number(100, 900), lineHeight: number(.1, 10), fontFamily: { enum: ['sans', 'serif'] },
    wrap: { type: 'boolean' }, hidden: { type: 'boolean' }, iconOffsetX: number(),
    highlightWord: text(10000), highlightColor: text(128), contentScale: number(.001, 1000),
    shape: { enum: ['rectangle', 'arrow'] }, strokeWidth: number(.5, 1000), arrowStart: point, arrowEnd: point,
    src: { ...text(40000000), pattern: '^data:(image/(png|gif)|video/mp4);base64,[A-Za-z0-9+/=]+$' },
    imageBase: { type: 'boolean' }, pictureFragment: { type: 'boolean' },
  };
  const lookHelp = {
    name: 'Name shown in the item list.', x: 'Left edge in canvas pixels; 0 is the left edge of the page.', y: 'Top edge in canvas pixels; 0 is the top of the page.',
    w: 'Box width in canvas pixels.', h: 'Box height in canvas pixels.', text: 'Text shown by this item.',
    fontSize: 'Text size in pixels.', iconSize: 'Icon size in pixels.', icon: 'Icon name from read_design with iconSearch; use an empty string to clear it.',
    color: 'Text or icon color, such as #ffffff.', background: 'Fill color, such as #000000 or transparent.', borderColor: 'Border color.', borderWidth: 'Border width in pixels; 0 hides it.',
    radius: 'Corner radius in pixels.', opacity: 'Opacity from 0 (clear) to 1 (solid).', align: 'Text alignment within the box.',
    fontWeight: 'Text weight from 100 to 900; 400 is normal and 700 is bold.', lineHeight: 'Line height as a multiple of text size.', fontFamily: 'Text face: sans or serif.',
    wrap: 'Whether text may wrap onto more than one line.', hidden: 'Hide this item without removing it.', iconOffsetX: 'Horizontal icon offset in pixels.',
    highlightWord: 'Word or text to highlight in a reading item.', highlightColor: 'Fill color behind the highlighted text.', contentScale: 'Scale the contents inside the box; 1 keeps their size.',
    shape: 'Shape type for a shape item; omit for a plain box.', strokeWidth: 'Arrow line width in pixels.', arrowStart: 'Arrow start within the item box, with each value from 0 to 1.', arrowEnd: 'Arrow end within the item box, with each value from 0 to 1.',
    src: 'Full PNG, GIF, or MP4 data URL. Required for image and video items. MP4 videos loop with sound off. Use import_image for other picture types. Replacing src clears saved inner image edits.',
    imageBase: 'Marks a picture as the page background; keep the value returned by read_design.', pictureFragment: 'Marks a piece moved from a picture; keep the value returned by read_design.',
  };
  for (const [key, description] of Object.entries(lookHelp)) look[key] = described(look[key], description);
  const itemId = described({ ...text(200), minLength: 1 }, 'Existing item id from read_design.');
  const itemIds = described(array(itemId, 1), 'One or more distinct item ids from read_design. The current canvas selection does not affect which items this tool changes.');
  const entrySchema = object({ ...look, id: described({ ...text(200), minLength: 1 }, 'Unique item id. Omit when adding an item to let the editor assign one.'), kind: described({ enum: kinds }, 'Item type. Use shape with shape rectangle or arrow for shapes, and label for plain text.') }, ['kind', 'x', 'y', 'w', 'h']);
  const canvasSchema = described(object({ width: described(number(1), 'Page width in pixels, up to 16,000.'), height: described(number(1), 'Page height in pixels, up to 16,000.'), background: described(text(128), 'Page fill color, such as #ffffff or transparent.') }, ['width', 'height', 'background']), 'Page size and color. Supply all three fields. Width times height must be at most 24 million pixels.');
  const target = {
    projectId: described({ ...text(200), minLength: 1 }, 'Open project id from the latest tool result. Use select_project first to edit another project.'),
    revision: described({ ...text(100), minLength: 1 }, 'Revision from the latest tool result. Call read_design again if the page changed; never reuse an old revision after an edit.'),
  };
  const projectName = described({ ...text(200), minLength: 1 }, 'Project name from 1 to 200 characters; must contain some text.');
  const imageRegionBox = described(object({ x: described(number(0), 'Source left edge in canvas pixels.'), y: described(number(0), 'Source top edge in canvas pixels.'), w: described(number(1), 'Source width in canvas pixels.'), h: described(number(1), 'Source height in canvas pixels.') }, ['x', 'y', 'w', 'h']), 'Picture area to change. Keep all four edges inside the canvas.');
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
    if (values.kind === 'image' && (!safePictureSource(values.src) || !storedPictureSize(values.src))) throw new Error('Images need an embedded PNG or GIF under 24 million pixels.');
    if (values.kind === 'video' && !safeVideoSource(values.src)) throw new Error('Videos need an MP4 under 30 MB.');
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
  function serializedProject() {
    const name = typeof localProjects !== 'undefined' ? localProjects.find(project => project.id === projectId())?.name : 'Current page';
    return JSON.stringify({ name, design: state });
  }
  async function revision(serialized) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(serialized));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function checkTarget(args) {
    idle();
    const current = state, id = projectId(), serialized = serializedProject();
    const currentRevision = await revision(serialized);
    idle();
    if (state !== current || projectId() !== id || serializedProject() !== serialized || args.projectId !== id || args.revision !== currentRevision) {
      throw new Error('The design changed. Call read_design and use its projectId and revision before trying again.');
    }
  }
  async function snapshot(includeImages = false) {
    const id = projectId(), serialized = serializedProject(), design = JSON.parse(serialized).design;
    const projects = typeof localProjects !== 'undefined' ? localProjects.map(({ id, name }) => ({ id, name })) : [{ id, name: 'Current page' }];
    if (!includeImages) for (const entry of design.items) if (entry.kind === 'image' || entry.kind === 'video') {
      delete entry.src; delete entry.imageContents; entry.imageDataOmitted = true;
    }
    return { projectId: id, revision: await revision(serialized), projects, design, selectedIds: [...selected] };
  }
  function commit(layout, ids = []) {
    change(() => { state = layout; selected = new Set(ids); clearCanvasRegion(); closeCanvasMenu(); closeItemMenu(); });
  }
  function requestedItems(ids) {
    if (new Set(ids).size !== ids.length) throw new Error('Use each item id once.');
    return ids.map(id => {
      const entry = state.items.find(entry => entry.id === id);
      if (!entry) throw new Error('No item has id ' + id + '.');
      return entry;
    });
  }
  async function imageRegionPlan(args) {
    if (args.box.x + args.box.w > state.canvas.width || args.box.y + args.box.h > state.canvas.height) throw new Error('Keep the selected box inside the page.');
    const region = rememberRegion(args.box);
    if (!region?.sources.length) throw new Error('The selected box contains no picture.');
    const plan = await makeRegionPlan(region);
    await checkTarget(args);
    return plan;
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
      description: 'Start here when you first connect to UI Design Editor. Full AI instructions: https://uidesigneditor.com/instructions.txt. Read the open design, project list, selected item ids, revision and a short usage guide. Item positions and sizes use canvas pixels. Use the latest returned projectId and revision for each edit. Image data is omitted by default. This reads saved design data, not a screenshot; use export_design with PNG to check the look.',
      inputSchema: object({ includeImages: described({ type: 'boolean' }, 'Default false. Set true to include full PNG, GIF, and MP4 data URLs and saved inner image contents; results can be large.'), iconSearch: described(text(100), 'Find up to 80 icon names containing this text, such as play. An empty string lists the first 80 names.') }),
      readOnly: true,
      async run(args) {
        const result = await snapshot(args.includeImages);
        result.help = {
          instructionsUrl: 'https://uidesigneditor.com/instructions.txt',
          workflow: [
            'If the user sends only a project or Space link, read the project, then ask what they want to do before making changes. Keep the full #space and &project values when opening the link.',
            'Start with read_design. Create a new named project with create_design unless the user asks to edit an existing one. Use select_project to open an id from projects.',
            'Use the projectId and revision from the latest tool result for each edit or export. If the design changed, call read_design before retrying.',
            'Changes save as you work. Canvas edits use the normal Undo history. Project names sit outside that history; rename again to change a name back.',
            'Check design data with read_design and the look with export_design using format png and delivery inline. Export HTML to keep an editable file.',
          ],
          coordinates: 'Use canvas pixels from the page top-left. x and y are the left and top edges; w and h are box sizes. Zoom does not change these values. Arrow endpoints use values from 0 to 1 within their box.',
          itemKinds: kinds,
          itemOrder: 'Items run from back to front. New items go on top. Use arrange_items to move existing items forward or backward one step.',
          itemActions: 'Use edit_design to add, move, resize, restyle, hide or remove items. To copy an item, add its fields with a new or omitted id. Use fit_items_to_content for boxes with text or icons. These tools use explicit item ids, so no selection or clipboard step is needed.',
          images: 'Pass picture data to import_image as a full image data URL; it does not fetch links or file paths. move_image_region and erase_image_region use a source box in canvas pixels. Moving also needs a destination top-left. Erasing fills page background pictures from nearby colors and clears added pictures. Use merge_image_items with moved picture piece ids to make them part of the page background again. Each action supports Undo. Finish any open Edit image session before using site tools.',
          sharing: 'To share projects across browsers, open the same Space link, keeping its #space part. Saved HTML files hold their own copy.',
          limits: { maxItems: 5000, maxCanvasSide: 16000, maxCanvasPixels: 24000000 },
        };
        if (args.iconSearch !== undefined) result.icons = Object.keys(ICONS).filter(name => name.includes(args.iconSearch.toLowerCase())).slice(0, 80);
        return result;
      },
    },
    {
      name: 'edit_design',
      description: 'Add, move, resize, restyle, hide or remove items, or set the page size and color, in one Undo step. Supply only the changes you need; other fields stay as they are. New items go on top in the order supplied. To copy an item, add its fields with a new or omitted id. Canvas size changes do not scale items unless you also update their boxes. Use arrange_items for item order and fit_items_to_content for a tight box. Read the latest projectId and revision first. Returns the design, latest revision and addedIds.',
      inputSchema: object({ ...target,
        addItems: described(array(entrySchema), 'New items to add on top. Each needs kind, x, y, w and h; the editor fills omitted style fields.'),
        updates: described(array(object({ id: itemId, changes: described(object(look), 'Only the fields to change on this item. Item id and kind stay fixed.') }, ['id', 'changes'])), 'Changes to existing items; use each id once.'),
        removeIds: described(array(itemId), 'Existing items to remove. Do not also update these ids in the same call.'), canvas: canvasSchema,
      }, ['projectId', 'revision']),
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
      description: 'Create and open a full design as a new named project, keeping existing projects. Prefer this for new work unless the user asks to edit an existing project. Supply the whole canvas and items ordered from back to front; an empty items list creates a blank page. Items stay separate and editable. Standalone drafts without Projects replace their page in one Undo step. Read the current projectId and revision first. Returns the new open project, design and revision.',
      inputSchema: object({ ...target, name: projectName, canvas: canvasSchema, items: described(array(entrySchema), 'Whole design, ordered from back to front. Use an empty list for a blank page.') }, ['projectId', 'revision', 'name', 'canvas', 'items']),
      async run(args) {
        if (!args.name.trim()) throw new Error('Use a project name with some text.');
        const layout = normalizeLayout(args.canvas, args.items);
        await checkTarget(args);
        openLayout(layout, args.name);
        return snapshot();
      },
    },
    {
      name: 'select_project',
      description: 'Open an existing project using an id from the projects list returned by read_design. Each project keeps its work and Undo history. This tool needs only the destination projectId, not a revision. Returns the newly open design and its revision for later edits. Available only on pages with Projects.',
      inputSchema: object({ projectId: described({ ...text(200), minLength: 1 }, 'Destination project id from the projects list returned by read_design.') }, ['projectId']),
      async run(args) {
        if (typeof switchProject !== 'function') throw new Error('This standalone page has no other projects.');
        if (!localProjects.some(project => project.id === args.projectId)) throw new Error('Unknown project id.');
        await switchProject(args.projectId);
        return snapshot();
      },
    },
    {
      name: 'arrange_items',
      description: 'Move the given visible items forward or backward one step in the canvas item order, in one Undo step. Forward puts them above the next item; backward puts them below the previous item. The chosen items keep their order within the set, and page background pictures stay fixed. Uses itemIds, not the current selection. Read the latest projectId and revision first. Returns the design, revision and changed (false if already at the edge).',
      inputSchema: object({ ...target, itemIds, direction: described({ enum: ['forward', 'backward'] }, 'Move one step toward the front or back. Repeat with the returned revision for more steps.') }, ['projectId', 'revision', 'itemIds', 'direction']),
      async run(args) {
        await checkTarget(args);
        const entries = requestedItems(args.itemIds), ordered = orderedCanvasItems(entries, args.direction === 'forward' ? 'front' : 'back');
        if (ordered) { const layout = copy(state); layout.items = copy(ordered); commit(layout, [...selected]); }
        return { ...await snapshot(), changed: Boolean(ordered) };
      },
    },
    {
      name: 'fit_items_to_content',
      description: 'Fit the given boxes to their text or icons using the same measurements as the canvas Fit box to content action, in one Undo step. Keeps text, styles, text position and existing line breaks. Supports label, icon, reading, tab, button and textbox items. Hidden items, shapes, pictures and empty boxes stay as they are. Uses itemIds, not the current selection. Read the latest projectId and revision first. Returns fittedIds for changed boxes and unchangedIds for all other requested items.',
      inputSchema: object({ ...target, itemIds }, ['projectId', 'revision', 'itemIds']),
      async run(args) {
        await checkTarget(args);
        requestedItems(args.itemIds);
        await document.fonts?.ready;
        await checkTarget(args);
        const plans = contentFitPlans(requestedItems(args.itemIds)), fittedIds = plans.map(({ entry }) => entry.id);
        if (plans.length) {
          const layout = copy(state);
          for (const { entry, box } of plans) Object.assign(layout.items.find(item => item.id === entry.id), box);
          commit(layout, [...selected]);
        }
        return { ...await snapshot(), fittedIds, unchangedIds: args.itemIds.filter(id => !fittedIds.includes(id)) };
      },
    },
    {
      name: 'rename_project',
      description: 'Rename the open project and save its name. To rename another project, call select_project first. Keeps its design, id and Undo history. The name sits outside canvas Undo; call rename_project again to change it back. Available only on pages with Projects. Read the latest projectId and revision first. Returns the project list and latest revision. There is no project deletion tool.',
      inputSchema: object({ ...target, name: projectName }, ['projectId', 'revision', 'name']),
      async run(args) {
        await checkTarget(args);
        if (typeof renameProject !== 'function') throw new Error('This standalone page has no Projects list to rename.');
        renameProject(args.name);
        return snapshot();
      },
    },
    {
      name: 'import_image',
      description: 'Open a screenshot or picture from full base64 image data. mode new opens a project at the picture size; mode add fits it inside the current page, centered at x/y or the view center. Supports PNG, JPG, WebP, GIF, AVIF, BMP and HEIC. GIFs keep playing and support moving and resizing the whole item; area edits skip GIFs. This keeps the picture as an image item; it does not turn its text into editable text. Use edit_design to add separate items over it, or move_image_region to move part of a still picture. No links or file paths are fetched. Read the latest projectId and revision first. Returns the design, revision and addedIds.',
      inputSchema: object({ ...target, name: described({ ...text(200), minLength: 1 }, 'Picture file name; also names the new project in mode new.'),
        dataUrl: described({ ...text(40000000), pattern: '^data:image/(png|jpeg|webp|gif|avif|bmp|heic|heif);base64,[A-Za-z0-9+/=]+$' }, 'Full image data URL including its type and base64 bytes. Example start: data:image/png;base64,. Maximum 40 million characters.'),
        mode: described({ enum: ['add', 'new'] }, 'add places the picture on this page; new opens it in a new project at its own size.'),
        x: described(number(), 'Desired picture center x in canvas pixels for mode add; defaults to the view center.'),
        y: described(number(), 'Desired picture center y in canvas pixels for mode add; defaults to the view center.'),
      }, ['projectId', 'revision', 'name', 'dataUrl', 'mode']),
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
      description: 'Import a design saved as HTML by this editor, without running its scripts. Extract its initial-layout JSON and send a small HTML document containing only that application/json script; other markup is ignored. Imports that one design, not the whole saved project list. mode new opens a project; mode add adds its items at the view center. Other HTML needs rebuilding as items with create_design or edit_design. Read the latest projectId and revision first. Returns the design and latest revision.',
      inputSchema: object({ ...target, name: described({ ...text(200), minLength: 1 }, 'Saved HTML file name; also names the new project in mode new.'),
        html: described(text(60000000), 'HTML text containing a script with type application/json and id initial-layout whose text is the saved design JSON. Include only that script to keep the call small.'),
        mode: described({ enum: ['add', 'new'] }, 'new opens the saved design in a new project; add places its items in the current project.'),
      }, ['projectId', 'revision', 'name', 'html', 'mode']),
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
      description: 'Move a rectangular part of the visible pictures on the canvas in one Undo step. Fills the old spot from nearby picture colors, then adds the moved part as a separate image item. This can change several pictures under the source box; text and other item types stay as they are. Both the source box and destination use canvas pixels, even for a scaled picture. The source box must stay inside the page and contain a visible picture. Read the latest projectId and revision first. Returns the design, revision and addedIds.',
      inputSchema: object({ ...target,
        box: imageRegionBox,
        x: described(number(), 'Destination left edge in canvas pixels, not an offset or picture center.'), y: described(number(), 'Destination top edge in canvas pixels, not an offset or picture center.'),
      }, ['projectId', 'revision', 'box', 'x', 'y']),
      async run(args) {
        await checkTarget(args);
        if (state.items.length >= 5000) throw new Error('Use at most 5,000 items.');
        const plan = await imageRegionPlan(args);
        const entry = { ...copy(plan.entry), x: args.x, y: args.y };
        change(() => { applyRegionPatches(plan); state.items.push(entry); selected = new Set([entry.id]); clearCanvasRegion(); });
        return { ...await snapshot(), addedIds: [entry.id] };
      },
    },
    {
      name: 'erase_image_region',
      description: 'Erase a rectangular area of the visible pictures on the canvas in one Undo step, using the same action as Delete on a picture area. Fills page background pictures from nearby colors; clears the area to transparent on added pictures and hides an added picture if the whole picture fits inside the box. All visible pictures under the box can change. Text, shapes and other item types stay as they are. Uses a box in canvas pixels and requires a visible picture inside it. Read the latest projectId and revision first. Returns the design, revision and erasedIds for changed picture items. Creates no new image item.',
      inputSchema: object({ ...target, box: imageRegionBox }, ['projectId', 'revision', 'box']),
      async run(args) {
        await checkTarget(args);
        const plan = await imageRegionPlan(args);
        change(() => {
          applyRegionPatches(plan);
          selected = new Set([...selected].filter(id => state.items.some(entry => entry.id === id && !entry.hidden)));
          clearCanvasRegion(); closeCanvasMenu(); closeItemMenu();
        });
        return { ...await snapshot(), erasedIds: plan.patches.map(patch => patch.id) };
      },
    },
    {
      name: 'merge_image_items',
      description: 'Merge chosen moved picture pieces into the page background in one Undo step, using the canvas No item action. Use itemIds of visible image items marked pictureFragment by move_image_region or the canvas picture tools. Requires at least one visible page background picture. Combines all page background pictures and the chosen pieces into one picture, and removes the chosen pieces as separate items. Other items stay separate above the background. Clips pieces at the page edges. Uses itemIds, regardless of the current selection. Read the latest projectId and revision first. Returns the design, revision, mergedIds and backgroundId. Undo restores the separate pieces and backgrounds.',
      inputSchema: object({ ...target, itemIds }, ['projectId', 'revision', 'itemIds']),
      async run(args) {
        await checkTarget(args);
        const selection = backgroundMergeForItems(requestedItems(args.itemIds));
        if (!selection) throw new Error('Choose visible moved picture pieces and keep a visible page background picture.');
        const plan = await makeBackgroundMergePlan(selection);
        await checkTarget(args);
        change(() => {
          applyBackgroundMerge(plan);
          selected = new Set([...selected].filter(id => state.items.some(entry => entry.id === id && !entry.hidden)));
          clearCanvasRegion(); closeCanvasMenu(); closeItemMenu();
        });
        return { ...await snapshot(), mergedIds: args.itemIds, backgroundId: plan.background.id };
      },
    },
    {
      name: 'undo_design',
      description: 'Undo or redo one canvas edit in the open project using the same history as the user. A tool edit with several changes counts as one step. This can also undo a user edit, so read the design first. Project names sit outside this history. Returns an error when no step exists. Read the latest projectId and revision first. Returns the restored design and latest revision.',
      inputSchema: object({ ...target, direction: described({ enum: ['undo', 'redo'] }, 'undo restores the previous canvas state; redo reapplies the last undone step.') }, ['projectId', 'revision', 'direction']),
      async run(args) {
        await checkTarget(args);
        if (!(args.direction === 'undo' ? undoHistory : future).length) throw new Error('There is no edit to ' + args.direction + '.');
        clearCanvasRegion(); $(args.direction).onclick();
        return snapshot();
      },
    },
    {
      name: 'export_design',
      description: 'Read or save the current design as JSON, editable HTML, or a PNG picture without changing it. Use format png and delivery inline to check how the design looks. JSON holds the open design, including pictures; HTML includes the editor and its projects and can be large. delivery download starts a browser download; inline returns content as text (PNG as a data URL). Returns filename and mimeType, plus content for inline or bytes and downloaded for a download. Uses no clipboard. Read the latest projectId and revision first.',
      inputSchema: object({ ...target,
        format: described({ enum: ['json', 'html', 'png'] }, 'json for design data, html for a file the user can edit later, png for a picture of the canvas.'),
        delivery: described({ enum: ['download', 'inline'] }, 'inline returns the file contents to Codex; download saves a file through the browser.'),
      }, ['projectId', 'revision', 'format', 'delivery']),
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
      if (status) status.textContent = 'Paste this into Codex, Claude, etc:';
    } catch {
      for (const name of registered) try { await context.unregisterTool?.(name); } catch {}
      if (status) status.textContent = 'Site tools could not start. Reload this page to try again.';
    }
  }
  void register();
})();
