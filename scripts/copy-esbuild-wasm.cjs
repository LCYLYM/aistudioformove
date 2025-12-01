// Copy esbuild-wasm's WASM binary into public/ so it can be served at /esbuild.wasm
const fs = require('fs');
const path = require('path');

function main() {
  try {
    const src = require.resolve('esbuild-wasm/esbuild.wasm');
    const publicDir = path.join(__dirname, '..', 'public');
    const dest = path.join(publicDir, 'esbuild.wasm');

    if (!fs.existsSync(publicDir)) {
      fs.mkdirSync(publicDir, { recursive: true });
    }

    fs.copyFileSync(src, dest);
    console.log('[copy-esbuild-wasm] Copied', src, '->', dest);
  } catch (err) {
    console.warn('[copy-esbuild-wasm] Failed to copy esbuild.wasm:', err && err.message);
  }
}

main();
