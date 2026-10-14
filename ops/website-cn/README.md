# Chinese static website Nginx locations

Render the static-site configuration from the approved website revision:

```sh
python3 scripts/prepare-cn-static-nginx.py apps/website /tmp/omindos-static-nginx
```

The output contains exact canonical routes for Chinese static pages, subtitle MIME
types, cache durations and response headers. Unversioned assets receive bounded
caching; HTML is revalidated on each request. HSTS applies only to the current
host, without `includeSubDomains` or preload.

After Chinese candidate acceptance, back up the active Nginx site file and both
managed snippets. Install the generated snippets under `/etc/nginx/snippets/`.
Replace only the existing exact `location = /` block with
`include /etc/nginx/snippets/omindos-static-site.conf;` in the HTTPS server.
Preserve every application proxy and the existing fallback `location /`.
Run `nginx -t` before reload; restore the configuration if validation fails.

Publish the reviewed release directory through the existing atomic `current`
symlink procedure. Verify public HTML and CSS hashes, subtitle Content-Type,
canonical redirects including query strings, media range requests and application
entry routes. Retain the previous release and Nginx backups for rollback.
