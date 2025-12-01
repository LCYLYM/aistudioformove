import React, { ReactNode, useEffect, useRef, useState } from 'react';
import { loadZipAndCompile } from './runtime/zipRunner';
import { getStoredGeminiConfig, setStoredGeminiConfig } from './runtime/geminiConfig';
import { deleteZipFromHistory, listZipHistory, loadZipBlob, saveZipToHistory, type ZipMeta } from './runtime/zipHistory';

interface CassetteBoxProps {
  title: string;
  headerRight?: ReactNode;
  className?: string;
  children: ReactNode;
}

const CassetteBox: React.FC<CassetteBoxProps> = ({ title, headerRight, className = '', children }) => (
  <div className={`flex flex-col border border-[#ffb000] bg-[#1a1a1a] shadow-[0_0_10px_rgba(255,176,0,0.1)] ${className}`}>
    <div className="flex justify-between items-center bg-[#ffb000] text-black px-2 py-1 uppercase text-xs font-bold tracking-wider flex-shrink-0">
      <span>{title}</span>
      {headerRight && <span className="text-[10px]">{headerRight}</span>}
    </div>
    <div className="flex-1 p-3 overflow-hidden relative min-h-0 flex flex-col">
      {children}
      <div className="absolute bottom-0 right-0 w-2 h-2 border-r-2 border-b-2 border-[#ffb000] mb-1 mr-1 opacity-50 pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-2 h-2 border-l-2 border-b-2 border-[#ffb000] mb-1 ml-1 opacity-50 pointer-events-none" />
    </div>
  </div>
);

export const App: React.FC = () => {
  const [htmlUrl, setHtmlUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState(getStoredGeminiConfig());
  const [selectedZipName, setSelectedZipName] = useState<string | null>(null);
  const [history, setHistory] = useState<ZipMeta[]>([]);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    if (PACKAGE_MODE) return;
    // 组件加载时读取历史 ZIP 列表（仅普通 Host 模式）
    listZipHistory().then(setHistory).catch(() => {});
  }, []);

  const handleConfigChange = (field: 'baseurl' | 'key', value: string) => {
    const next = { ...config, [field]: value };
    setConfig(next);
    setStoredGeminiConfig(next);
  };

  const runZipBlob = async (blob: Blob, nameHint?: string) => {
    setLoading(true);
    setError(null);
    try {
      const html = await loadZipAndCompile(blob, config);
      const blobHtml = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blobHtml);
      setHtmlUrl(url);
      if (nameHint) setSelectedZipName(nameHint);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || String(err));
      setHtmlUrl(null);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedZipName(file.name);

    // 保存到历史并运行
    try {
      const meta = await saveZipToHistory(file);
      setHistory((prev) => {
        const others = prev.filter((h) => h.id !== meta.id);
        return [meta, ...others];
      });
    } catch {
      // IndexedDB 失败不影响运行
    }

    await runZipBlob(file, file.name);
  };

  const statusText = loading
    ? '正在编译并启动应用...'
    : htmlUrl
      ? '应用已加载，可以在右侧窗口中交互。'
      : '等待选择 AI Studio 导出的 zip 文件。';

  const handleHistoryLoad = async (item: ZipMeta) => {
    try {
      const blob = await loadZipBlob(item.id);
      if (!blob) {
        setError('找不到对应的 ZIP 数据，请重新上传。');
        return;
      }
      await runZipBlob(blob, item.name);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || String(err));
    }
  };

  const handleHistoryDelete = async (item: ZipMeta) => {
    try {
      await deleteZipFromHistory(item.id);
      setHistory((prev) => prev.filter((h) => h.id !== item.id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleEnterFullscreen = () => {
    const el = iframeRef.current as any;
    if (!el) return;
    const requestFull =
      el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.mozRequestFullScreen ||
      el.msRequestFullscreen;
    if (requestFull) requestFull.call(el);
  };

  // Package 模式：全屏只展示运行预览，自动加载内置 ZIP
  useEffect(() => {
    if (!PACKAGE_MODE) return;

    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(EMBED_ZIP_URL);
        if (!res.ok) throw new Error(`无法加载内置 ZIP：${res.status} ${res.statusText}`);
        const buf = await res.arrayBuffer();
        const blob = new Blob([buf], { type: 'application/zip' });
        await runZipBlob(blob, 'embedded-app.zip');
      } catch (err: any) {
        if (cancelled) return;
        console.error(err);
        setError(err?.message || String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (PACKAGE_MODE) {
    return (
      <div className="h-screen w-screen bg-black text-[#ffb000] flex flex-col">
        <div className="flex-1 min-h-0">
          {htmlUrl ? (
            <iframe
              ref={iframeRef}
              src={htmlUrl}
              className="w-full h-full border-0 bg-black"
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-xs text-[#ffb000]/70 gap-2">
              {loading ? (
                <>
                  <div className="text-3xl animate-pulse">⌛</div>
                  <div>正在加载内置应用...</div>
                </>
              ) : error ? (
                <>
                  <div className="text-red-400 mb-1">加载失败</div>
                  <pre className="text-[11px] max-w-[80vw] max-h-[50vh] overflow-auto whitespace-pre-wrap break-words text-red-300 border border-red-500/40 px-2 py-1 bg-black/60">{error}</pre>
                </>
              ) : (
                <>
                  <div className="text-3xl">…</div>
                  <div>正在等待内置应用加载</div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-[#111] text-[#ffb000] flex flex-col p-2 box-border font-['JetBrains_Mono',monospace] relative">
      {/* 头部 */}
      <header className="flex justify-between items-center mb-2 border-b border-[#ffb000] pb-2 px-1 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-[#ffb000] text-black px-2 py-0.5 font-bold text-lg">HOST</div>
          <h1 className="text-xl font-bold tracking-widest amber-glow">AISTUDIO FOR MOVE</h1>
        </div>
        <div className="flex gap-4 text-xs font-mono">
          <div className="border border-[#ffb000]/50 px-3 py-1 flex items-center gap-2">
            <span className="w-2 h-2 bg-[#ffb000] animate-pulse" />
            <span>RUNTIME COMPILER ONLINE</span>
          </div>
          <div className="bg-[#ffb000] text-black px-3 py-1 font-bold">ZIP → RUNTIME</div>
        </div>
      </header>

      {/* 主布局 */}
      <div className="flex-1 grid grid-cols-12 gap-3 min-h-0 mb-2">
        {/* 左侧：配置 + 载入 */}
        <div className="col-span-4 flex flex-col gap-3 min-h-0">
          <CassetteBox title="Gemini 配置" className="flex-[3] min-h-0">
            <div className="space-y-3 text-xs">
              <div>
                <div className="mb-1 uppercase tracking-widest text-[10px] text-[#ffb000]/60">BASEURL（接口地址）</div>
                <input
                  className="w-full bg-black border border-[#ffb000]/60 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-[#ffb000]"
                  value={config.baseurl}
                  onChange={e => handleConfigChange('baseurl', e.target.value)}
                />
              </div>
              <div>
                <div className="mb-1 uppercase tracking-widest text-[10px] text-[#ffb000]/60">API KEY（密钥）</div>
                <input
                  className="w-full bg-black border border-[#ffb000]/60 px-2 py-1 text-[11px] focus:outline-none focus:ring-1 focus:ring-[#ffb000]"
                  type="password"
                  value={config.key}
                  onChange={e => handleConfigChange('key', e.target.value)}
                  placeholder="在此粘贴 Gemini API Key"
                />
              </div>
              <p className="text-[10px] text-[#ffb000]/60 leading-relaxed">
                Host 会把上述配置注入为 <code className="bg-black/40 px-1">window.GEMINI_CONFIG</code> 以及
                <code className="bg-black/40 px-1">process.env.API_KEY / API_BASE_URL</code>，让 AI Studio 应用保持原有写法。
              </p>
            </div>
          </CassetteBox>

          <CassetteBox
            title="ZIP 文件管理"
            className="flex-[2] min-h-0"
            headerRight={selectedZipName ? selectedZipName : '未选择'}
          >
            <div className="flex flex-col gap-3 text-xs">
              <label className="flex flex-col gap-1">
                <span className="uppercase tracking-widest text-[10px] text-[#ffb000]/60">选择并导入 ZIP</span>
                <input
                  type="file"
                  accept=".zip"
                  onChange={handleFileChange}
                  className="file:mr-3 file:px-3 file:py-1 file:border-0 file:text-xs file:font-mono file:bg-[#ffb000] file:text-black file:cursor-pointer bg-black border border-dashed border-[#ffb000]/60 px-2 py-1 text-[11px] cursor-pointer hover:border-[#ffb000]"
                />
              </label>
              <div className="text-[10px] text-[#ffb000]/70 leading-relaxed space-y-1">
                <p>
                  支持从 Google AI Studio 导出的前端 zip：内部包含 <code className="bg-black/40 px-1">index.html</code>、
                  <code className="bg-black/40 px-1">index.tsx</code> 以及 importmap 配置。
                </p>
                <p className="mt-1">导入后会自动保存到本地历史列表，下次可以直接点击加载，无需重新选择文件。</p>
              </div>
            </div>
          </CassetteBox>
        </div>

        {/* 右侧：历史 + 预览 + 状态 */}
        <div className="col-span-8 flex flex-col gap-3 min-h-0">
          <CassetteBox title="历史 ZIP 列表" className="flex-[2] min-h-0">
            <div className="text-[11px] space-y-1 max-h-32 overflow-auto">
              {history.length === 0 ? (
                <div className="text-[#ffb000]/50">暂无历史记录，先在左侧导入一个 ZIP 文件。</div>
              ) : (
                <table className="w-full text-left text-[10px] border-collapse">
                  <thead className="text-[#ffb000]/60 border-b border-[#ffb000]/30">
                    <tr>
                      <th className="py-1 pr-2">名称</th>
                      <th className="py-1 pr-2">大小</th>
                      <th className="py-1 pr-2">时间</th>
                      <th className="py-1 pr-2 text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((item) => (
                      <tr key={item.id} className="border-b border-[#ffb000]/10 hover:bg-[#ffb000]/5">
                        <td className="py-1 pr-2 truncate max-w-[160px]" title={item.name}>{item.name}</td>
                        <td className="py-1 pr-2 whitespace-nowrap">{(item.size / 1024).toFixed(1)} KB</td>
                        <td className="py-1 pr-2 whitespace-nowrap">
                          {new Date(item.createdAt).toLocaleString('zh-CN', { hour12: false })}
                        </td>
                        <td className="py-1 pr-2 text-right space-x-1 whitespace-nowrap">
                          <button
                            className="px-2 py-0.5 border border-[#ffb000]/60 hover:bg-[#ffb000] hover:text-black"
                            onClick={() => handleHistoryLoad(item)}
                          >
                            加载
                          </button>
                          <button
                            className="px-2 py-0.5 border border-red-500/60 text-red-300 hover:bg-red-500 hover:text-black"
                            onClick={() => handleHistoryDelete(item)}
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </CassetteBox>
          <CassetteBox
            title="运行预览"
            className="flex-[4] min-h-0"
            headerRight={htmlUrl ? (
              <button
                className="px-2 py-0.5 text-[10px] border border-black/40 hover:bg-black/10"
                onClick={handleEnterFullscreen}
                disabled={!htmlUrl}
              >
                全屏
              </button>
            ) : '空闲'}
          >
            <div className="flex-1 min-h-0 border border-[#ffb000]/30 bg-[#050505] flex items-stretch justify-center">
              {htmlUrl ? (
                <iframe
                  ref={iframeRef}
                  src={htmlUrl}
                  className="w-full h-full border-0 bg-black"
                />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-[#ffb000]/40 gap-2 text-xs">
                  <div className="text-4xl">▞▞▞</div>
                  <div>当前没有运行中的应用</div>
                  <div className="text-[10px]">请在左侧导入或从历史列表中选择一个 ZIP 启动</div>
                </div>
              )}
            </div>
          </CassetteBox>

          <CassetteBox title="引擎状态" className="flex-[2] min-h-0">
            <div className="text-[11px] space-y-1 font-mono">
              <div className="flex justify-between">
                <span className="text-[#ffb000]/80">运行引擎</span>
                <span className="text-[#ffb000]">{loading ? '编译中' : htmlUrl ? '在线' : '空闲'}</span>
              </div>
              <div className="text-[#ffb000]/70">{statusText}</div>
              {error && (
                <div className="mt-2 text-xs text-red-400 max-h-24 overflow-auto border-t border-red-500/40 pt-1">
                  <div className="text-[10px] uppercase mb-1">LAST ERROR（最近一次错误）</div>
                  <pre className="whitespace-pre-wrap break-words text-[11px] leading-snug">{error}</pre>
                </div>
              )}
            </div>
          </CassetteBox>
        </div>
      </div>

      {/* 底部 */}
      <footer className="text-[10px] flex justify-between uppercase border-t border-[#ffb000]/40 pt-1 opacity-80 font-mono flex-shrink-0">
        <div className="flex gap-4">
          <span>ESBUILD-WASM: 已加载</span>
          <span>IMPORTMAP: 已启用</span>
          <span>ZIP-RUNNER: 就绪</span>
        </div>
        <div>SESSION HOST :: AISTUDIO-FOR-MOVE</div>
      </footer>
    </div>
  );
};
