# Publish with Caddy

The existing VPS setup can serve this site through Cloudflare Tunnel and Caddy.
It needs no Python or Node server, extra app port, database, or project upload path.
Node is used only to prepare the files and run checks.

## Prepare the files

Run from this project folder:

```sh
npm run build
npm test
```

The build writes only public files to `dist/`. It includes the editor, About,
the Library sample, pictures, search files and gzip copies. It leaves out Git files,
tests, notes, source scripts and this setup folder. Caddy can serve the gzip
copies without compressing each request again.

To publish from a checkout on the VPS:

```sh
sudo install -d -m 755 /srv/uidesigneditor
sudo rsync -a --delete --chmod=D755,F644 dist/ /srv/uidesigneditor/
```

The last command replaces files only inside `/srv/uidesigneditor/` with the
contents of `dist/`. Point Caddy at that folder, not the project checkout.

## Add the site to Caddy

Add the site blocks from [Caddyfile](Caddyfile) to the Caddyfile in the VPS notes
repo. Keep its existing global block, local bind address and DNS settings.

The blocks serve `uidesigneditor.com` and redirect `www` to it. They turn on
compression, let browsers check for new files, and return a real 404 status for
a missing page. They do not add directory listings or a project save service.

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

Drafts and pictures stay in each user's browser. Publishing these files neither
uploads those drafts nor moves them between addresses. A draft at localhost
will not appear at `https://uidesigneditor.com`; use Copy HTML and open that file
at the new address to move it.

Keep one public address. Redirect `www` to the main domain before people start
saving work, since each address has its own browser store. Keep regular copies
of the shipped site files; users should keep HTML copies of their own projects.
