# uidesigneditor.com

Free UI mockup tool. Work stays in your browser. Use **Copy HTML** to keep a file.

Needs Node.js and Python 3.

Run `npm start`, then open [localhost:3000](http://localhost:3000/).

- Check: `npm test`
- Build: `npm run build`
- Code: [GitHub](https://github.com/janpmz/uidesigneditor).
- Publish on the VPS: `./redeploy.sh`. [Setup](deploy/README.md).

The editor uses [shadcn/ui](https://ui.shadcn.com/)'s dark styles, fitted to its plain HTML controls. Edit `editor/shadcn.css`, then run `npm run build`. The build keeps the styles in each page, so **Copy HTML** works on its own.

The editor offers [WebMCP site tools](https://learn.chatgpt.com/docs/webmcp) in a supported Codex browser. Open **Info**, copy the prompt, and add your design request in Codex. The page must stay open. Users need no local helper or Node.js install.

The tools read and edit designs, create and switch projects, import pictures and saved HTML, move parts of a picture, undo edits, and export JSON, HTML or PNG. Each edit uses the project id and revision from the last tool result, so it stops if the user changes the design first. Edits use the normal save and Undo code. For saved HTML imports, send a small HTML document with just its `initial-layout` JSON script. The site sends no project data to its server; tools return the data the user asks Codex to read.

Edit `editor/webmcp.js`, then run `npm run build`. The build puts the tools in every editor page and HTML export. Browsers without site tools keep the normal editor.
