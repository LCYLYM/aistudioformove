import { unzipSync } from 'fflate';
import * as esbuild from 'esbuild-wasm';
import type { GeminiConfig } from './geminiConfig';

let esbuildInitialized = false;

async function ensureEsbuild() {
  if (esbuildInitialized) return;
  await esbuild.initialize({
    wasmURL: '/esbuild.wasm',
  });
  esbuildInitialized = true;
}

function decodeText(data: Uint8Array): string {
  return new TextDecoder().decode(data);
}

function findIndexHtml(files: Map<string, string>): string {
  for (const [name, content] of files) {
    if (name.toLowerCase().endsWith('index.html')) return name;
  }
  throw new Error('ZIP 中没有找到 index.html');
}

function extractEntryFromHtml(html: string): string {
  // Match: <script type="module" src="/index.tsx"></script>
  const match = html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"[^>]*><\/script>/i);
  if (!match) throw new Error('index.html 中没有找到入口 <script type="module" src="...">');
  let src = match[1];
  if (src.startsWith('/')) src = src.slice(1);
  return src;
}

export async function loadZipAndCompile(file: File | Blob, config: GeminiConfig): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const rawFiles = unzipSync(buf);

  const files = new Map<string, string>();
  for (const [name, data] of Object.entries(rawFiles)) {
    if (data instanceof Uint8Array) {
      files.set(name.replace(/^\/+/, ''), decodeText(data));
    }
  }

  const indexPath = findIndexHtml(files);
  const indexHtml = files.get(indexPath)!;
  const entry = extractEntryFromHtml(indexHtml);

  await ensureEsbuild();

  const ZIP_NS = 'zip-virtual';

  const result = await esbuild.build({
    entryPoints: [entry],
    bundle: true,
    format: 'esm',
    write: false,
    jsx: 'automatic',
    loader: {
      '.ts': 'ts',
      '.tsx': 'tsx',
    },
    plugins: [
      {
        name: 'zip-fs',
        setup(build) {
          // Resolve imports
          build.onResolve({ filter: /.*/ }, (args) => {
            const importPath = args.path;

            // Entry point (e.g. "index.tsx") must come from ZIP, not be external
            if (args.kind === 'entry-point') {
              const normalized = importPath.replace(/^\/+/, '');
              return { path: normalized, namespace: ZIP_NS };
            }

            // Bare specifiers like "react", "@google/genai" -> leave as external
            if (!importPath.startsWith('.') && !importPath.startsWith('/')) {
              return { path: importPath, external: true };
            }

            // Relative path inside ZIP (./App, ../utils/foo, /src/App.tsx, ...)
            const importer = args.importer || entry;
            const baseUrl = new URL(importer, 'file:///');
            const resolvedUrl = new URL(importPath, baseUrl);
            const normalized = resolvedUrl.pathname.replace(/^\/+/, '');
            return { path: normalized, namespace: ZIP_NS };
          });

          // Load file contents from in-memory map
          build.onLoad({ filter: /.*/, namespace: ZIP_NS }, async (args) => {
            let path = args.path.replace(/^\/+/, '');
            let content = files.get(path);

            // Support imports like "./App" by trying common TS/TSX suffixes
            if (content == null) {
              const candidates = [
                `${path}.tsx`,
                `${path}.ts`,
                path.replace(/$/, '.tsx'),
                path.replace(/$/, '.ts'),
              ];
              for (const cand of candidates) {
                const c = files.get(cand);
                if (c != null) {
                  path = cand;
                  content = c;
                  break;
                }
              }
            }

            if (content == null) {
              throw new Error(`在 ZIP 中找不到文件: ${path}`);
            }

            const ext = path.endsWith('.tsx') ? 'tsx' : path.endsWith('.ts') ? 'ts' : 'ts';
            return { contents: content, loader: ext as any };
          });
        },
      },
    ],
  });

  const compiled = result.outputFiles[0]?.text;
  if (!compiled) throw new Error('编译失败：没有输出');

  // 注入 GEMINI_CONFIG 和 process.env
  const injectConfig = `\n<script>\n  window.GEMINI_CONFIG = ${JSON.stringify(config)};\n  window.process = window.process || {};\n  window.process.env = Object.assign({}, window.process.env, {\n    API_KEY: ${JSON.stringify(config.key)},\n    API_BASE_URL: ${JSON.stringify(config.baseurl)}\n  });\n</script>\n`;

  const inlineModule = `\n<script type="module">\n${compiled}\n</script>\n`;

  let html = indexHtml;
  html = html.replace('</head>', `${injectConfig}</head>`);
  html = html.replace(/<script[^>]+type="module"[^>]+src="[^"]*index\.tsx"[^>]*><\/script>/i, inlineModule);

  return html;
}
