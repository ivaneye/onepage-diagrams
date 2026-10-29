# OnePage Diagrams

[English](README.md) | 中文

把 Obsidian 里的 Mermaid 图换成 [Pele](https://pele.run) 渲染，并套一层与 [OnePage](https://github.com/ivaneye/OnePage) 主题相配的配色。

> **这是临时方案。** Obsidian 1.15 起官方内置 Pele 渲染，届时本插件不再接管 mermaid 代码块，可以直接卸载；配色会在 OnePage 主题的后续版本里接管。插件本身不上架社区插件市场，只从 GitHub 下载安装。

## 解决什么

Obsidian 自带的 Mermaid 渲染有三个问题：

**慢。** 每张图都要跑完整的 mermaid 解析与布局，一页里有五六张图时，滚动会明显卡。

**窄栏下缩得看不清。** 横向流程图在侧栏或窄分屏里会被压成一条，字小到无法读。

**配色跟主题不搭。** 默认的 Mermaid 主题是冷灰蓝，放在暖白纸张这类主题里像贴上去的一层。

换成 Pele 之后，渲染快很多，图是干净的 SVG；插件再补三件事：图太宽时自动改竖排、右下角给缩放按钮、把配色接到主题变量上。

## 安装

本插件不上架社区市场，两种装法：

**一、下载目录包（推荐）**

1. 到 [Releases](https://github.com/ivaneye/onepage-diagrams/releases) 下载 `onepage-diagrams-x.y.z.zip`
2. 解压后得到 `onepage-diagrams` 文件夹
3. 整个文件夹放进 `<你的仓库>/.obsidian/plugins/`
4. 重启 Obsidian，在「设置 → 第三方插件」里启用 **OnePage Diagrams**

**二、用 BRAT**

装了 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 的话，添加仓库 `ivaneye/onepage-diagrams` 即可。

## 用法

启用后，笔记里原有的 ```` ```mermaid ```` 代码块自动改用 Pele 渲染，源码一行不用改。

想只让新图走 Pele、老图不动，把设置里的「接管 mermaid 代码块」关掉，然后用 ```` ```pele ```` 写新图：

````markdown
```pele
flowchart TB
    A["起点"] --> B["中间"]
```
````

两种写法的语法完全一样，都是 Mermaid 语法。

## 设置

| 项 | 说明 |
| --- | --- |
| 接管 mermaid 代码块 | 关掉后只渲染 `pele` 代码块 |
| 字号 | 0 跟随主题，整图偏小时填 14 或 15 |
| 窄栏自动转竖向 | 容器比图窄时把 `LR` 改成 `TB` |
| 图表配色 | 自动（OnePage 主题时套用）/ 强制 OnePage 配色 / Pele 默认 |
| 允许缩放 | 右下角加 `+ / − / ⤢`，Ctrl 或 Cmd 加滚轮缩放 |
| 本地包 | 把 Pele 存到插件目录，离线可用 |

切换「接管」之后要执行命令面板里的「重载插件」才生效，其余设置即时重绘。

## 配色是怎么来的

所有颜色都取主题变量，不写死色值：

| 图里的位置 | 取的变量 |
| --- | --- |
| 页面底、元素底 | `--background-primary` |
| 层带底 | `--background-secondary` 兑六成页面色 |
| 层带外框 | `--text-muted` 26% |
| 元素描边 | `--text-muted` 30% |
| 元素文字 | `--text-muted` 与 `--text-normal` 混色 |
| 层带标题 | `--text-normal`，13px，500 |
| 重点节点与主链路 | `--text-accent` |

所以改主题的强调色、切明暗，图会跟着变。

想给某个节点加标签样式，在源码里写 `:::key`：

```pele
flowchart LR
    A["普通节点"] --> B["卡点：销售审批"]:::key
```

## 支持的写法

- 流程图 `flowchart` / `graph`，八种节点形状、子图、子图嵌套
- 连线：`-->` `==>` `-.->` `---` `<-->`，都支持标签
- 时序图、甘特图、饼图、状态图等 Pele 支持的图类型
- `classDef`、`curve`（`step` 是直角折线）

不支持：

| 项 | 说明 |
| --- | --- |
| `themeVariables` | Pele 不读，颜色走 CSS 变量 |
| 子图内 `direction` | 子图内部由 Pele 自己排 |
| `<small>` 一类 HTML | 只认换行、粗体、斜体 |
| 子图 `style fill` | 层带颜色只能整体换 |

## 卸载与迁移

Obsidian 1.15 之后：

1. 设置 → 第三方插件 → 停用并卸载本插件
2. 图会自动交给官方 Pele 渲染，语法不用改
3. 新版 OnePage 主题会带上同一套配色

插件检测到 Obsidian 版本 ≥ 1.15 时会自动停止接管，避免和官方渲染重复。

## 开发

没有构建步骤，`main.js` 就是源码：

```
main.js       插件主体
styles.css    配色与结构样式
manifest.json 插件清单
versions.json 版本对照，给 BRAT 用
```

改完直接重载插件即可。打包用 `./build-zip.sh`，产物是与插件同名的 zip，解压即用。

## 许可

MIT。渲染引擎 [Pele](https://github.com/obsidianmd/pele) 同样是 MIT，作者 kepano。
