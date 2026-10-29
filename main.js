'use strict';

const { Plugin, PluginSettingTab, Setting, Notice, debounce } = require('obsidian');
let ViewPlugin = null;
try {
  ({ ViewPlugin } = require('@codemirror/view'));
} catch (e) {
  ViewPlugin = null;
}

const CDN_URL = 'https://cdn.jsdelivr.net/npm/pele@1.12.0/dist/pele.global.js';
const VENDORED = 'vendor/pele.global.js';

let peleLib = null;
let peleSource = '';

const DEFAULT_SETTINGS = {
  takeOverMermaid: true,
  fontSize: 13,
  autoDirection: true,
  zoom: true,
  palette: 'auto', // auto | onepage | default
};

// Obsidian 1.15 起官方内置 Pele，本插件的接管会与它重复，默认让位
const NATIVE_PELE_FROM = '1.15.0';

function compareVersion(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function hasNativePele(app) {
  return compareVersion(app.version || '0.0.0', NATIVE_PELE_FROM) >= 0;
}

const HORIZONTAL_RE = /^\s*(?:flowchart|graph)\s+(LR|RL)\b/m;

function isHorizontal(text) {
  return HORIZONTAL_RE.test(text);
}

function flipDirection(text) {
  return text.replace(HORIZONTAL_RE, (line) => line.replace(/LR|RL/, 'TB'));
}

function showError(el, source, message) {
  el.empty();
  el.addClass('pele-render', 'pele-render-error');
  const tip = el.createDiv({ cls: 'pele-render-error-tip' });
  tip.setText(message);
  const pre = el.createEl('pre');
  pre.createEl('code').setText(source);
}

async function loadPele(plugin) {
  if (peleLib) return peleLib;
  const dir = plugin.manifest.dir || `${plugin.app.vault.configDir}/plugins/${plugin.manifest.id}`;

  let code = '';
  try {
    code = await plugin.app.vault.adapter.read(`${dir}/${VENDORED}`);
  } catch (e) {
    code = '';
  }

  if (code) {
    // 先直接求值，桌面端通常可用
    try {
      peleLib = new Function(`${code}\n;return pele;`)();
      peleSource = '本地包';
      return peleLib;
    } catch (e) {
      // 求值被拦时改用脚本标签
    }
    try {
      await loadByScript(code);
      peleLib = window.pele;
      peleSource = '本地包';
      return peleLib;
    } catch (e) {
      // 落到 CDN
    }
  }
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = CDN_URL;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('CDN 加载失败'));
    document.head.appendChild(s);
  });
  peleLib = window.pele;
  if (!peleLib) throw new Error('Pele 未挂到全局对象');
  peleSource = 'CDN';
  return peleLib;
}

function loadByScript(code) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([code], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    s.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('脚本注入失败'));
    };
    document.head.appendChild(s);
  });
}

async function renderInto(plugin, source, el) {
  const text = source.trim();
  if (!text) {
    el.empty();
    return;
  }
  let lib;
  try {
    lib = await loadPele(plugin);
  } catch (e) {
    showError(el, source, `加载 Pele 失败：${e.message}。可在插件设置里点「下载本地包」后重试。`);
    return;
  }

  let ok = true;
  try {
    ok = lib.supports(text);
  } catch (e) {
    ok = true;
  }
  if (!ok) {
    showError(el, source, 'Pele 不支持这个图类型，先按源码显示。');
    return;
  }

  el.empty();
  el.addClass('pele-render');
  el.removeClass('pele-render-error');
  plugin.applyPaletteClass(el);
  plugin.sources.set(el, text);

  const width = Math.max(320, Math.round(el.getBoundingClientRect().width || el.clientWidth || 640));
  const autoSize = Math.round(Number.parseFloat(getComputedStyle(el).fontSize) || 16);
  const options = {
    responsive: true,
    maxWidth: width,
    fontSize: plugin.settings.fontSize || autoSize,
    autoDirection: !!plugin.settings.autoDirection,
    zoom: false,
  };
  try {
    let mounted = lib.mount(el, text, options);
    // 横向图超出容器时，换成竖排再比一次，取窄的那个
    if (plugin.settings.autoDirection && isHorizontal(text) && mounted.result && mounted.result.width > width) {
      const wide = mounted.result.width;
      const flipped = flipDirection(text);
      try {
        mounted.destroy();
      } catch (e) {
        /* 忽略 */
      }
      const alt = lib.mount(el, flipped, options);
      if (alt.result && alt.result.width < wide) {
        mounted = alt;
      } else {
        try {
          alt.destroy();
        } catch (e) {
          /* 忽略 */
        }
        el.empty();
        mounted = lib.mount(el, text, options);
      }
    }
    plugin.trackMounted(el, mounted);
    if (plugin.settings.zoom) plugin.trackZoom(el, attachZoom(plugin, el));
  } catch (e) {
    showError(el, source, e && e.message ? e.message : String(e));
  }
}

// 自己管缩放：直接改 svg 的 viewBox，不依赖 Pele 的内部交互
function attachZoom(plugin, el) {
  const svg = el.querySelector('svg');
  if (!svg) return null;
  const raw = (svg.getAttribute('viewBox') || '').trim().split(/\s+/).map(Number);
  if (raw.length !== 4 || raw.some((n) => !Number.isFinite(n))) return null;

  const base = { x: raw[0], y: raw[1], w: raw[2], h: raw[3] };
  const view = { ...base };
  const MIN_RATIO = 0.22; // 最多放大到原尺寸的近 5 倍

  const paint = () => svg.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);

  const toViewBox = (evt) => {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return {
      x: view.x + ((evt.clientX - rect.left) / rect.width) * view.w,
      y: view.y + ((evt.clientY - rect.top) / rect.height) * view.h,
    };
  };

  const zoomAt = (factor, point) => {
    const nextW = Math.min(base.w, Math.max(base.w * MIN_RATIO, view.w / factor));
    const k = nextW / view.w;
    const anchor = point || { x: view.x + view.w / 2, y: view.y + view.h / 2 };
    view.x = anchor.x - (anchor.x - view.x) * k;
    view.y = anchor.y - (anchor.y - view.y) * k;
    view.w = nextW;
    view.h = view.h * k;
    paint();
  };

  const reset = () => {
    Object.assign(view, base);
    paint();
  };

  const box = document.createElement('div');
  box.className = 'pele-zoombox';
  const mk = (label, title, fn) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = label;
    btn.title = title;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    });
    box.appendChild(btn);
    return btn;
  };
  mk('+', '放大', () => zoomAt(1.25));
  mk('−', '缩小', () => zoomAt(1 / 1.25));
  mk('⤢', '还原', reset);
  el.appendChild(box);

  let dragging = false;
  let last = null;
  const onDown = (e) => {
    if (e.button !== 0) return;
    dragging = true;
    last = { x: e.clientX, y: e.clientY };
    svg.style.cursor = 'grabbing';
  };
  const onMove = (e) => {
    if (!dragging || !last) return;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return;
    const dx = ((e.clientX - last.x) / rect.width) * view.w;
    const dy = ((e.clientY - last.y) / rect.height) * view.h;
    last = { x: e.clientX, y: e.clientY };
    view.x -= dx;
    view.y -= dy;
    paint();
    e.preventDefault();
  };
  const onUp = () => {
    dragging = false;
    last = null;
    svg.style.cursor = '';
  };
  const onWheel = (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const point = toViewBox(e);
    if (!point) return;
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.12 : 1 / 1.12, point);
  };

  svg.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
  svg.addEventListener('wheel', onWheel, { passive: false });

  return {
    destroy() {
      svg.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      svg.removeEventListener('wheel', onWheel);
      box.remove();
    },
  };
}

function extractFenceSource(view, block) {
  try {
    const doc = view.state.doc;
    let lineNo = doc.lineAt(Math.max(0, Math.min(view.posAtDOM(block), doc.length))).number;
    while (lineNo > 1 && !/^\s*```/.test(doc.line(lineNo).text)) lineNo--;
    if (!/^\s*```/.test(doc.line(lineNo).text)) return null;
    const body = [];
    for (let n = lineNo + 1; n <= doc.lines; n++) {
      const text = doc.line(n).text;
      if (/^\s*```\s*$/.test(text)) break;
      body.push(text);
    }
    return body.join('\n').trim() || null;
  } catch (e) {
    return null;
  }
}

function buildLivePreview(plugin) {
  if (!ViewPlugin) return null;
  return ViewPlugin.fromClass(
    class {
      constructor(view) {
        this.view = view;
        this.timer = null;
        this.schedule();
      }

      update(update) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) this.schedule();
      }

      schedule() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.run(), 150);
      }

      async run() {
        if (!plugin.settings.takeOverMermaid) return;
        if (!(await plugin.ensureEngine())) return;
        const blocks = this.view.dom.querySelectorAll('.cm-preview-code-block.cm-lang-mermaid');
        blocks.forEach((block) => {
          const source = extractFenceSource(this.view, block);
          if (!source) return;
          const key = `${source.length}:${source.slice(0, 48)}`;
          if (block.dataset.peleSource === key) return;
          block.dataset.peleSource = key;
          const host = document.createElement('div');
          host.className = 'pele-render';
          block.replaceChildren(host);
          renderInto(plugin, source, host);
        });
      }

      destroy() {
        if (this.timer) clearTimeout(this.timer);
      }
    }
  );
}

module.exports = class OnePageDiagramsPlugin extends Plugin {
  async onload() {
    this.mounted = new Map();
    this.sources = new Map();
    this.zooms = new Map();
    await this.loadSettings();

    this.registerMarkdownCodeBlockProcessor('pele', (source, el) => {
      renderInto(this, source, el);
    });

    if (this.settings.takeOverMermaid && hasNativePele(this.app)) {
      this.settings.takeOverMermaid = false;
      await this.saveSettings();
      new Notice('Obsidian 已内置 Pele 渲染，本插件不再接管 mermaid 代码块。可以卸载本插件，见插件说明。', 12000);
    }

    if (this.settings.takeOverMermaid) {
      // 先确认 Pele 真的能用，再覆盖内置渲染器；不然会白屏
      const ready = await this.ensureEngine();
      if (ready) {
        // 优先级 -100：跑在 Obsidian 内置 mermaid 处理器之前，才盖得住
        this.registerMarkdownCodeBlockProcessor(
          'mermaid',
          (source, el) => {
            renderInto(this, source, el);
          },
          -100
        );
      } else {
        new Notice('Pele 没能加载，mermaid 代码块继续由 Obsidian 渲染。可在插件设置里点「下载本地包」后重载。');
      }
    }

    this.refreshAll = debounce(() => {
      for (const mounted of this.mounted.values()) {
        try {
          mounted.refresh();
        } catch (e) {
          /* 忽略单图失败 */
        }
      }
    }, 250, true);
    this.registerDomEvent(window, 'resize', () => this.refreshAll());

    // 缩放按钮的点击不要让 Obsidian 的代码块处理器抢走
    this.registerDomEvent(
      document,
      'pointerdown',
      (evt) => {
        const target = evt.target;
        if (target instanceof Element && target.closest('.pele-zoom')) evt.stopPropagation();
      },
      true
    );

    this.addCommand({
      id: 'reload-plugin',
      name: '重载插件（接管或放弃 mermaid 代码块后执行）',
      callback: async () => {
        const id = this.manifest.id;
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.app.plugins.disablePlugin(id);
        // eslint-disable-next-line @typescript-eslint/no-floating-promises
        this.app.plugins.enablePlugin(id);
      },
    });

    this.addCommand({
      id: 'clear-measure-cache',
      name: '清空文本度量缓存并重绘',
      callback: () => {
        try {
          if (peleLib && peleLib.forgetTextWidths) peleLib.forgetTextWidths();
        } catch (e) {
          /* 忽略 */
        }
        this.refreshAll();
      },
    });

    if (this.settings.takeOverMermaid) {
      const extension = buildLivePreview(this);
      if (extension) this.registerEditorExtension(extension);
    }

    this.addCommand({
      id: 'diagnose',
      name: '诊断：报告当前页面的渲染情况',
      callback: () => {
        const rendered = document.querySelectorAll('.pele-render').length;
        const zoom = document.querySelectorAll('.pele-zoom').length;
        const mermaidSvg = document.querySelectorAll('.mermaid svg').length;
        new Notice(`Pele 块 ${rendered} 个，缩放控件 ${zoom} 个，仍是 Mermaid 的 ${mermaidSvg} 个`, 8000);
      },
    });

    this.addSettingTab(new OnePageDiagramsSettingTab(this.app, this));
  }

  onunload() {
    for (const box of this.zooms.values()) {
      try {
        box.destroy();
      } catch (e) {
        /* 忽略 */
      }
    }
    this.zooms.clear();
    for (const mounted of this.mounted.values()) {
      try {
        mounted.destroy();
      } catch (e) {
        /* 忽略 */
      }
    }
    this.mounted.clear();
  }

  async ensureEngine(timeoutMs = 6000) {
    if (peleLib) return true;
    try {
      await Promise.race([
        loadPele(this),
        new Promise((_, reject) => setTimeout(() => reject(new Error('加载超时')), timeoutMs)),
      ]);
      return !!peleLib;
    } catch (e) {
      return false;
    }
  }

  rerenderAll() {
    for (const [el, mounted] of [...this.mounted.entries()]) {
      const source = this.sources.get(el);
      if (!source) continue;
      try {
        mounted.destroy();
      } catch (e) {
        /* 忽略 */
      }
      this.mounted.delete(el);
      this.trackZoom(el, null);
      renderInto(this, source, el);
    }
  }

  // auto 模式：当前主题名里含 OnePage 就套用，否则不套
  useOnepagePalette() {
    const mode = this.settings.palette;
    if (mode === 'onepage') return true;
    if (mode === 'default') return false;
    let theme = '';
    try {
      theme = (this.app.customCss && this.app.customCss.theme) || '';
    } catch (e) {
      theme = '';
    }
    return /onepage/i.test(theme);
  }

  applyPaletteClass(el) {
    if (this.useOnepagePalette()) el.addClass('pele-onepage');
    else el.removeClass('pele-onepage');
  }

  trackZoom(el, box) {
    const prev = this.zooms.get(el);
    if (prev) {
      try {
        prev.destroy();
      } catch (e) {
        /* 忽略 */
      }
    }
    if (box) this.zooms.set(el, box);
    else this.zooms.delete(el);
  }

  trackMounted(el, mounted) {
    const prev = this.mounted.get(el);
    if (prev) {
      try {
        prev.destroy();
      } catch (e) {
        /* 忽略 */
      }
    }
    this.mounted.set(el, mounted);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  peekEngine() {
    return { version: peleLib ? (window.pele && window.pele.version) || '' : '', source: peleSource };
  }
};

class OnePageDiagramsSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'OnePage Diagrams' });

    if (hasNativePele(this.app)) {
      const tip = containerEl.createEl('p', { cls: 'pele-status' });
      tip.setText(
        `当前 Obsidian ${this.app.version} 已内置 Pele 渲染，本插件不再接管 mermaid 代码块，可以卸载。`
      );
    }

    const status = containerEl.createEl('p', { cls: 'pele-status' });
    const info = this.plugin.peekEngine();
    status.setText(info.source ? `当前引擎来源：${info.source}` : '当前引擎来源：尚未加载（首次渲染时加载）');

    new Setting(containerEl)
      .setName('接管 mermaid 代码块')
      .setDesc('打开后，笔记里原有的 ```mermaid 代码块也改用 Pele 渲染，源码不用改。切换后需执行命令「重载插件」生效。Obsidian 1.15 起官方已内置 Pele，本项会自动关闭。')
      .addToggle((t) =>
        t.setValue(this.plugin.settings.takeOverMermaid).onChange(async (v) => {
          this.plugin.settings.takeOverMermaid = v;
          await this.plugin.saveSettings();
          new Notice('已保存。执行命令「重载插件」后生效。');
        })
      );

    new Setting(containerEl)
      .setName('字号')
      .setDesc('0 表示跟随主题自动。整图偏小时可设为 14 或 15。')
      .addText((t) =>
        t
          .setPlaceholder('0')
          .setValue(String(this.plugin.settings.fontSize || 0))
          .onChange(async (v) => {
            const n = Number.parseInt(v, 10);
            this.plugin.settings.fontSize = Number.isFinite(n) && n > 0 ? n : 0;
            await this.plugin.saveSettings();
            this.plugin.rerenderAll();
          })
      );

    new Setting(containerEl)
      .setName('窄栏自动转竖向')
      .setDesc('面板很窄时把横向流程图改成竖排，避免整体缩得看不清。')
      .addToggle((t) =>
        t.setValue(!!this.plugin.settings.autoDirection).onChange(async (v) => {
          this.plugin.settings.autoDirection = v;
          await this.plugin.saveSettings();
          this.plugin.rerenderAll();
        })
      );

    new Setting(containerEl)
      .setName('图表配色')
      .setDesc('自动：当前主题是 OnePage 时套用暖白纸张／暖棕冷锚配色，其它主题用 Pele 默认。')
      .addDropdown((d) =>
        d
          .addOption('auto', '自动（跟随主题）')
          .addOption('onepage', '强制 OnePage 配色')
          .addOption('default', 'Pele 默认')
          .setValue(this.plugin.settings.palette)
          .onChange(async (v) => {
            this.plugin.settings.palette = v;
            await this.plugin.saveSettings();
            this.plugin.rerenderAll();
          })
      );

    new Setting(containerEl)
      .setName('允许缩放')
      .setDesc('给图加缩放能力，适合节点多的图。')
      .addToggle((t) =>
        t.setValue(!!this.plugin.settings.zoom).onChange(async (v) => {
          this.plugin.settings.zoom = v;
          await this.plugin.saveSettings();
          this.plugin.rerenderAll();
        })
      );

    new Setting(containerEl)
      .setName('本地包')
      .setDesc('把 pele.global.js 存到插件目录，离线也能渲染。下载后重载插件生效。')
      .addButton((b) =>
        b.setButtonText('下载本地包').onClick(async () => {
          try {
            const res = await fetch(CDN_URL);
            if (!res.ok) throw new Error(String(res.status));
            const text = await res.text();
            const dir = this.plugin.manifest.dir || `${this.app.vault.configDir}/plugins/${this.plugin.manifest.id}`;
            await this.app.vault.adapter.write(`${dir}/${VENDORED}`, text);
            new Notice(`已保存到 ${VENDORED}，重载插件后使用本地包。`);
          } catch (e) {
            new Notice(`下载失败：${e.message}`);
          }
        })
      );
  }
}
