# Publish with Caddy

The existing VPS setup can serve this site through Cloudflare Tunnel and Caddy.
Static pages use Caddy. Space saves need Node.js 24 or later, the `ws` package,
and one SQLite file. The save service listens only on `127.0.0.1:3000`.
Caddy sends `/api/*` and `/ws` to it, including WebSocket connections.

## Start the save service

Keep the checkout in `/opt/uidesigneditor`, or change both paths in
`uidesigneditor.service` to match its location. Use a folder outside `/home`
that the service can read. Check the Node path in `ExecStart` too.

Run `npm ci` in the checkout, then install the service:

```sh
sudo install -m 644 deploy/uidesigneditor.service /etc/systemd/system/uidesigneditor.service
sudo systemctl daemon-reload
sudo systemctl enable --now uidesigneditor
```

The service creates `/var/lib/uidesigneditor/spaces.sqlite`. Keep that folder
across releases. Back up this database along with its SQLite write-ahead log,
or stop the service before copying the database file. Never put it in `dist/`
or `/srv/uidesigneditor/`.

## Prepare the files

Run on the VPS from this project folder:

```sh
./redeploy.sh
```

The script pulls the latest code, installs packages, builds the public files, runs the checks, then
copies `dist/` to `/srv/uidesigneditor/`. It stops if the pull fails or needs a
merge. It replaces files there to match the build. Caddy serves that folder.
It restarts the save service when that service is running.

## Add the site to Caddy

Add the site blocks from [Caddyfile](Caddyfile) to the Caddyfile in the VPS notes
repo. Keep its existing global block, local bind address and DNS settings.

The blocks serve `uidesigneditor.com` and redirect `www` to it. They turn on
compression, let browsers check for new files, and return a real 404 status for
a missing page. They send Space requests to the save service and keep its
database outside the public site.

Use the VPS repo's existing commands to check, install and reload that Caddyfile:

```sh
sudo sh -c 'set -a; . /etc/caddy/cloudflare.env; exec /usr/bin/caddy validate --config "$1" --adapter caddyfile' sh "$PWD/Caddyfile" &&
sudo install -m 644 Caddyfile /etc/caddy/Caddyfile &&
sudo systemctl reload caddy
```

Run those commands from the VPS notes repo, after merging the site blocks.
The local setup file does not replace the VPS's whole Caddyfile.

## Set up the domain

Use the VPS's existing Cloudflare tunnel for both `uidesigneditor.com` and
`www.uidesigneditor.com`. Each route should use `https://127.0.0.1:443`, with
Origin Server Name set to that route's hostname and TLS checks on. Confirm both
DNS records point to that tunnel, and keep Always Use HTTPS on.

Caddy's existing Cloudflare token also needs DNS edit and zone read access to
the `uidesigneditor.com` zone. Keep the token in `/etc/caddy/cloudflare.env`.
There is no need to print it, put it in this repo or open another port.

## Check the public site

```sh
curl -I https://uidesigneditor.com/
curl -I https://www.uidesigneditor.com/
curl -I https://uidesigneditor.com/a-page-that-does-not-exist
curl -I -H 'Accept-Encoding: gzip' https://uidesigneditor.com/
curl --fail https://uidesigneditor.com/robots.txt
curl --fail https://uidesigneditor.com/sitemap.xml
curl --fail https://uidesigneditor.com/llms.txt
```

Expect 200 for the main page, 301 for `www`, 404 for the missing page, and
`Content-Encoding: gzip` for the editor when the client accepts gzip. Check the editor, About and
the Library sample in a browser. The social picture at
`/assets/social-card.jpg` must also load without a login or bot challenge.

Add the site to Google Search Console, submit `/sitemap.xml`, and inspect the
editor and About. Check the JSON-LD with Google's Rich Results Test or the
Schema.org validator. The app data has no made-up ratings or reviews; it does
not promise a rich result. Check a shared link for its title, text and picture.

The main editor and About can appear in search. The Library sample uses
`noindex,follow`. The sitemap lists only the main editor and About.

`llms.txt` holds the text from Info and About in one file. It contains no user
projects. It helps tools read the site; it does not guarantee search rank.

## User work

Local drafts and pictures stay in each browser. Creating a Space copies those
projects to the save service. Open the same secret Space link in each browser
to share work. Anyone with that link can read and edit every project in it.
Keep these links out of public logs and shared screenshots.

A Space on localhost and one on the public site use different databases.
Use Copy HTML and import the file at the other site to move work between them.
Publishing the site files alone does not move local drafts or Space data.

Check two browsers with the same Space link: create a project, edit it, and
check that the other page updates. Disconnect one page, edit in the other,
then reconnect. A page with unsaved work must offer reload or save as a copy.

Keep one public address. Redirect `www` to the main domain before people start
saving work, since each address has its own browser store. Keep regular copies
of the shipped site files; users should keep HTML copies of their own projects.
