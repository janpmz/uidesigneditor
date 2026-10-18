# uidesigneditor.com

Free UI design tool. Edit projects in your browser or share them through a Space. Use **Copy HTML** to keep a file.

Needs Node.js 24 or later. Run `npm ci` once.

Run `npm start`, then open [localhost:3000](http://localhost:3000/).

The main editor creates a Space on the first visit and copies any existing local projects into it. It remembers the Space in this browser and reopens it when you return to the plain site address. Opening a Space link switches to that Space and remembers it after it loads. Use **Copy Space link** to open it in another browser, including Codex. Anyone with the link can read and edit its projects. Keep the link: clearing browser data removes the remembered Space, but the server keeps its saved projects. HTML exports work on their own and stay local.

Space saves live in `data/spaces.sqlite`, outside the public files. Pictures are PNG files at `data/pictures/<spaceId>/<projectId>/<pictureId>.png`; SQLite keeps their IDs and file names. `DATA_DIR`, `PUBLIC_DIR` and `PORT` set the data folder, site folder and port. Keep the whole data folder across builds and server restarts, and copy it when making backups.

The server keeps `spaceId → clientId → connection` in memory. Each connection gets a new ID. JSON messages use `{ type, payload }`: clients send `join_space`, the server replies `connected`, then sends `project_changed` after each saved change. Pages fetch the changed project over HTTP. Pictures stay separate and each page keeps loaded pictures for later edits. A version check rejects old saves; the page offers reload or save as a copy. Reconnects check the saved project list again. Each page keeps its Undo steps.

- Check: `npm test`
- Build: `npm run build`
- Code: [GitHub](https://github.com/janpmz/uidesigneditor).
- Publish on the VPS: `./redeploy.sh`. Start or restart its PM2 server: `./startServer.sh`. [Setup](deploy/README.md).

The editor uses [shadcn/ui](https://ui.shadcn.com/)'s dark styles, fitted to its plain HTML controls. Edit `editor/shadcn.css`, then run `npm run build`. The build keeps the styles in each page, so **Copy HTML** works on its own.

The editor offers [WebMCP site tools](https://learn.chatgpt.com/docs/webmcp) in a supported Codex browser. Open **Info**, copy the prompt, and add your design request in Codex. The short prompt links to [the full instructions](instructions.txt) and includes the current Space link. The page must stay open. Users need no local helper or Node.js install.

The tools read and edit designs, create, switch and rename projects, move items forward or backward, fit boxes to their contents, import pictures and saved HTML, move or erase parts of a picture, merge moved pieces into the background, undo edits, and export JSON, HTML or PNG. Each tool sends its description and field help to Codex. Start with `read_design` for the current design and a short usage guide. Each edit uses the project id and revision from the last tool result, so it stops if the user changes the design or project name first. Canvas edits use the normal save and Undo code. Project names sit outside canvas Undo; rename again to change one back. For saved HTML imports, send a small HTML document with just its `initial-layout` JSON script. Local projects stay in the browser. Space projects save to the server; site tools wait for the save before reporting success.

`erase_image_region` uses the canvas Delete action: it fills page background pictures from nearby colors, clears added pictures to transparent, and hides an added picture when the box covers it all. `merge_image_items` uses the canvas **No item** action: it combines the chosen moved pieces and all page background pictures into one background picture. Other items stay separate. Both tools add one Undo step.

Edit `editor/webmcp.js`, then run `npm run build`. The build puts the tools in every editor page and HTML export. Browsers without site tools keep the normal editor.
