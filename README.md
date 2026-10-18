# uidesigneditor.com

Free UI mockup tool. Work stays in your browser. Use **Copy HTML** to keep a file.

Needs Node.js and Python 3.

Run `npm start`, then open [localhost:3000](http://localhost:3000/).

- Check: `npm test`
- Build: `npm run build`
- Code: [GitHub](https://github.com/janpmz/uidesigneditor).
- Publish on the VPS: `./redeploy.sh`. [Setup](deploy/README.md).

The `shadcnd` branch uses [shadcn/ui](https://ui.shadcn.com/)'s dark styles, fitted to the editor's plain HTML controls. Edit `editor/shadcn.css`, then run `npm run build`. The build keeps the styles in each page, so **Copy HTML** works on its own.
