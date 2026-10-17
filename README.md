# UI Design Editor

A visual editor for moving, resizing, copying, and removing items in a screen draft.

## Run

Run `npm start` in this folder, then open http://localhost:3000/.

This needs Node.js and Python 3. There are no packages to install.
If another project uses port 3000, stop its server first.

## Drafts

- Player: http://localhost:3000/drafts/dark-player-layout/
- Library: http://localhost:3000/drafts/dark-library-layout/
- Chapters: http://localhost:3000/drafts/dark-chapter-layout/

The player opens by default. Use the links above each canvas to switch drafts.
A narrow window shows the canvas with Edit, Items, Add, and Copy HTML beside it.

Drafts save in your browser. Copy layout exports the item data. Copy HTML and
Save HTML keep the whole editor with the current draft. Screenshot saves the canvas as an image.

Drop pictures anywhere in the editor, then choose **Add to page?** or
**Open as new page?**. Add keeps the current design and fits the pictures inside
it. New page opens the picture at its own size; undo brings back the prior page.
When you drop several pictures as a new page, they appear one below another.
Cancel or Escape leaves the page as it was. PNG, JPG, WebP, GIF, AVIF, BMP, HEIC,
and HEIF work. A drop with several pictures adds them in one undo step. Pictures stay
in saved drafts and HTML copies. HEIC files open in the browser, with no upload
to another service.

On a picture page, drag to draw a box. Drag inside the box to move that part as
a new item. Cut, copy and paste work with Cmd/Ctrl+X, C and V, or a right-click.
Moving or cutting fills the old spot from the colors around it. Solid colors
and simple gradients work best; the fill cannot rebuild details in a photo.
You can move or resize the new item, and undo restores the whole picture.

On an HTML page, draw a box around items, then drag inside it to move them.
The items keep their text and settings. Cut and paste work the same way.
You can drop an HTML file saved by this editor and choose to add its items or
open it as a new page.

The draft addresses and saved draft names match the original project, so saved
changes remain available when you use the same browser at localhost:3000.

## Check

Run `npm test`.

## Files

Each editor is a single HTML file with its fonts, icons, and other needed files
included. It runs on its own, with no app server or account needed.

These files came from `documentplayer-mono` at commit `8a6ddb3` on 17 October 2026.
The links between drafts now work within this folder. The original files remain
in that project. Source notes and licenses for the included fonts, icons, and
screenshot tool remain in the HTML files.

The shared picture and selection code is in `editor/`. Run `npm run sync-images`
after changing it. The included HEIC reader and its license are in `editor/vendor/`.
