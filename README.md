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
