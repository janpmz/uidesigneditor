# uidesigneditor.com

A visual editor for moving, resizing, copying, and removing items in a screen draft.

## Run

Run `npm start` in this folder, then open http://localhost:3000/.

This needs Node.js and Python 3. There are no packages to install.
If another project uses port 3000, stop its server first.

The main address opens the editor with **Info** selected in the right sidebar.
Select an item to show **Edit**, or switch tabs yourself.
The [About page](guide/index.html) explains the editor and where drafts stay.

## Publish

Use Caddy to serve the static files in production. Run `npm run build` to prepare
`dist/`, then follow [the Caddy setup](deploy/README.md). Publish only `dist/`.
Python is for local use. The public site needs no app process or server project store.

The editor and About page have search titles, descriptions, canonical addresses,
JSON-LD and share pictures. `robots.txt`, `sitemap.xml` and `llms.txt`
help crawlers read them. The Library sample stays out of search.
Edit `site/` and `scripts/sync-site.mjs`, then run `npm run sync-site` to update
the public pages, search files and editor metadata.

## Drafts

- Player: http://localhost:3000/
- Library: http://localhost:3000/drafts/dark-library-layout/

The editor opens with the player draft. **Sample** at the bottom of the left
sidebar links to Library. Click the site name to return to the main editor.
A narrow window shows the canvas with Edit, Items, Add, and Copy HTML beside it.

Drafts save in your browser. Copy layout exports the item data. Copy HTML
copies the whole editor with the current draft. Screenshot saves the canvas as an image.

Move, resize, paste, and add items anywhere around the page. The page edge stays
visible while you edit. New text, shapes, and icons appear in the middle of your
view. Drop pictures or saved HTML items where you want them, even outside the page.
Saved drafts and HTML copies keep those items. Screenshots keep the page size.

Use **Rectangle** in Add for a red border with no fill, so the screen stays visible
inside the box. Click and drag inside a rectangle to move it in one step. Pull any
side or corner to change its width or height. Boxes, buttons, Box / div, and text
boxes work the same way. Text, icons, borders, and corners keep their size as you
resize the box. Change the border color or width in Edit. Use **Arrow** for a red
arrow, then drag either dot to set its length and direction. Edit also has color
and line width controls.

Right-click an item on the canvas or in **Items** to choose **Bring to front 1 step**
or **Bring to back 1 step**. Both actions also appear under **Arrange** in the right
sidebar. Each click moves the selected items by one place. A group keeps its order,
and Undo restores the prior order.

Scroll to pan, or hold Space and drag. A middle-button drag also pans. Hold
Cmd/Ctrl while scrolling to zoom at the pointer, or pinch with two fingers.
Use + and − or choose a zoom from the list between them. Choose **Fit page** to return to
the page, or **Fit all** to see the page and all your items. Cmd/Ctrl+0 fits the
page; Cmd/Ctrl+1 shows 100%.

Paste or drop pictures in the editor, then choose **Add to page?** or
**Open as new page?**. Add keeps the current design and fits the pictures inside
it. New page opens the picture at its own size; undo brings back the prior page.
When you drop several pictures as a new page, they appear one below another.
The size list keeps **Page** with the picture's size, so you can choose a phone
size and switch back. Saved drafts and HTML copies keep that choice too.
Cancel or Escape leaves the page as it was. PNG, JPG, WebP, GIF, AVIF, BMP, HEIC,
and HEIF work. A drop with several pictures adds them in one undo step. Pictures stay
in saved drafts and HTML copies. HEIC files open in the browser, with no upload
to another service.

On a picture page, drag to draw a box. Drag inside the box to move that part as
a new item. Cut, copy and paste work with Cmd/Ctrl+X, C and V, or a right-click.
Moving or cutting fills the old spot from the colors around it. Solid colors
and simple gradients work best; the fill cannot rebuild details in a photo.
You can move or resize the new item, and undo restores the whole picture.
Right-click a piece and choose **No item** to merge it into the background at
its current spot and size. Undo brings back the separate item.

An image added to an existing page stays one item. Select it and choose **Edit
image** in its settings or right-click menu. It opens on its own, with the same
tools as a picture page. Choose **Done** to save it back in place, or **Cancel**
to leave it as it was. Undo on the page brings back the image before your edits.
Saved drafts and HTML copies keep the parts so you can edit them again.

On an HTML page, draw a box to select each item it touches, even at an edge or
corner. Drag inside the box to move the selected items.
The items keep their text and settings. Cut and paste work the same way.
You can drop an HTML file saved by this editor and choose to add its items or
open it as a new page.

Right-click text, an icon, or a button and choose **Fit box to content** to cut
empty space from its box. The text and icons keep their size and place. Wrapped
text keeps its line breaks, and buttons keep their padding and border. Pictures
and plain shapes keep their boxes. A fit uses one Undo step, even for several items.

The main editor and Library keep their saved draft names, so saved changes
remain available in the same browser at localhost:3000.

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
