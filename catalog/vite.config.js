import fs from 'node:fs';
import path from 'node:path';
import CoffeeScript from 'coffeescript';
import { defineConfig } from 'vite';

const SRC_JS = path.resolve(__dirname, 'src/js');

// Compile *.coffee sources (the old build used coffee-loader).
function coffee() {
  return {
    name: 'coffee',
    transform(code, id) {
      if (!id.endsWith('.coffee')) return null;
      const out = CoffeeScript.compile(code, { bare: true, sourceMap: true, filename: id });
      return { code: out.js, map: out.v3SourceMap };
    },
  };
}

// Bare imports like 'ebus', 'languages' or 'model/series' resolve against
// src/js (the old webpack config had src/js in resolve.modules).
function srcModules() {
  const exts = ['.coffee', '.js'];
  return {
    name: 'src-modules',
    enforce: 'pre',
    resolveId(id) {
      if (id.startsWith('.') || id.startsWith('/') || id.startsWith('\0')) return null;
      for (const ext of exts) {
        const file = path.join(SRC_JS, id + ext);
        if (fs.existsSync(file)) return file;
      }
      return null;
    },
  };
}

// index.html is served as-is next to main.js / main.css (it loads them as
// classic scripts and calls main() inline), so it is copied, not processed.
function copyIndexHtml() {
  return {
    name: 'copy-index-html',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'index.html',
        source: fs.readFileSync(path.resolve(__dirname, 'src/index.html')) });
    },
  };
}

export default defineConfig({
  root: __dirname,
  // relative asset URLs (fonts in main.css): the app is served under /catalog/
  base: './',
  publicDir: 'static',
  plugins: [srcModules(), coffee(), copyIndexHtml()],
  resolve: {
    extensions: ['.coffee', '.js', '.json'],
    // Less imports written webpack-style: "~bootstrap/dist/..."
    alias: [{ find: /^~(.*)$/, replacement: '$1' }],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2015',
    cssCodeSplit: false,
    rollupOptions: {
      input: path.resolve(__dirname, 'src/js/entry.js'),
      output: {
        // a classic script: index.html calls main() right after loading it
        format: 'iife',
        entryFileNames: 'main.js',
        assetFileNames: (a) => (a.name && a.name.endsWith('.css') ? 'main.css' : '[name]-[hash][extname]'),
      },
    },
  },
});
