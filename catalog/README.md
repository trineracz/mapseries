# Mapseries

* Web application for cataloguing mapseries
* Able to automatically fill map sheet metadata and copy it to clipboard for another cataloguing software, e.g. Aleph.

## Add new map series
Read [manual](client/src/doc/navod.docx). Or briefly:

1. Prepare ShapeFile with map sheets.
  - Each map sheet should be one polygon.
  - Table must have at least SHEET and TITLE columns.
      SHEET contains unique ID of the sheet within map series.
      TITLE contains sheet title
  - Table might have another attributes, that can be used for filling the
      template.
2. Add the ShapeFile as a new layer to GeoServer running at
    http://mapseries.georeferencer.org/geoserver
  Use mapseries workspace.
3. Create template file in /templates direcory. Find an inspiration in the
    existing ah-ms3-200.txt template.
4. Add map series metadata to the config.js. Specify at least
    - title: map series title
    - layer: name of the GeoServer layer
    - template: template file created in step 3
5. Get beer

## Development
The catalog is a static frontend built with [Vite](https://vite.dev/) (Node 22).
The Docker image of `index-boot` builds it and serves it at `/catalog`.

```
npm ci
npx vite build        # -> dist/ (index.html, main.js, main.css, fonts, img, texts)
```

* Entry: `src/js/entry.js` (jQuery globals, styles, `main.coffee`).
* `src/js/closure/closure-lite.js` replaces the Google Closure Library the
  template dialog was written against (same DOM, CSS classes and behaviour).
* `parity/` checks that a build behaves and looks exactly like a reference
  build (clipboard output for every series, DOM and screenshots) — see
  `parity/parity.sh`.
