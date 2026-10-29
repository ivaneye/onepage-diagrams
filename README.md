# OnePage Diagrams

Render Mermaid diagrams in Obsidian with [Pele](https://pele.run), styled to match the [OnePage](https://github.com/ivaneye/OnePage) theme.

English | [中文](README_CN.md)

> **This is a stopgap.** Obsidian 1.15 ships Pele natively. Once it lands, this plugin stops taking over `mermaid` blocks and you can uninstall it; the palette will move into the OnePage theme. The plugin is not submitted to the community store — install from GitHub only.

## What it fixes

Obsidian's built-in Mermaid rendering has three problems:

**Slow.** Every diagram runs the full Mermaid parser and layout engine. A note with five or six diagrams scrolls noticeably worse than one with none.

**Unreadable in narrow panes.** A horizontal flowchart squeezed into a sidebar or a narrow split collapses into a strip of unreadable text.

**Off-palette.** The default Mermaid theme is cool blue-grey, which looks pasted on inside warm themes like OnePage.

Pele renders to clean SVG and is much faster. This plugin adds three things on top: automatic vertical re-flow when the pane is too narrow, zoom controls in the corner, and a palette wired to theme variables.

## Install

Not in the community store. Two options:

**1. Download the packaged folder (recommended)**

1. Grab `onepage-diagrams-x.y.z.zip` from [Releases](https://github.com/ivaneye/onepage-diagrams/releases)
2. Unzip it to get an `onepage-diagrams` folder
3. Move that folder into `<your vault>/.obsidian/plugins/`
4. Restart Obsidian, then enable **OnePage Diagrams** under Settings → Community plugins

**2. BRAT**

With [BRAT](https://github.com/TfTHacker/obsidian42-brat) installed, add `ivaneye/onepage-diagrams` as a beta plugin.

## Usage

Once enabled, existing ```` ```mermaid ```` blocks render through Pele. No source changes needed.

To keep old diagrams on the built-in renderer, turn off "Take over mermaid code blocks" in settings and write new diagrams as ```` ```pele ````:

````markdown
```pele
flowchart TB
    A["Start"] --> B["Middle"]
```
````

Both fences use the same Mermaid syntax.

## Settings

| Setting | Description |
| --- | --- |
| Take over mermaid blocks | Off = only `pele` fences render through Pele |
| Font size | 0 follows the theme; try 14–15 for dense diagrams |
| Auto vertical re-flow | Flips `LR` to `TB` when the pane is narrower than the diagram |
| Diagram palette | Auto (applies OnePage palette when that theme is active) / Force OnePage / Pele default |
| Enable zoom | Adds `+ / − / ⤢` in the corner; Ctrl or Cmd + wheel zooms |
| Local bundle | Saves Pele into the plugin folder for offline use |

Toggling "Take over" requires running the **Reload plugin** command. Other settings re-render immediately.

## How the palette works

Every color comes from theme variables; nothing is hard-coded:

| Element | Variable |
| --- | --- |
| Page and node fill | `--background-primary` |
| Container (subgraph) fill | `--background-secondary` mixed 60% with the page color |
| Container border | `--text-muted` at 26% |
| Node border | `--text-muted` at 30% |
| Node text | `--text-muted` blended with `--text-normal` |
| Container title | `--text-normal`, 13px, 500 |
| Highlighted node, main path, sequence critical block | `--text-accent` |

Change the accent color or switch light/dark and the diagrams follow.

To tag a node, add `:::key` in the source:

```pele
flowchart LR
    A["Plain node"] --> B["Blocker: sales approval"]:::key
```

In sequence diagrams, wrap the steps that must succeed in a `critical` block; the frame gets a 6% accent wash:

```pele
sequenceDiagram
    Agent->>MCP: initiateProjectApproval
    critical Key: validate state before starting
        MCP->>MCP: server-side state check
    end
```

## Supported

- `flowchart` / `graph`: eight node shapes, subgraphs, nested subgraphs
- Edges: `-->` `==>` `-.->` `---` `<-->`, with labels
- Sequence, Gantt, pie, state diagrams — anything Pele supports
- `critical … option … end` blocks in sequence diagrams, drawn in the accent color
- `classDef`, `curve` (`step` gives right-angled connectors)

Not supported:

| Item | Note |
| --- | --- |
| `themeVariables` | Pele ignores it; colors go through CSS variables |
| `direction` inside a subgraph | Works: `direction LR` lays the contents out horizontally |
| `<small>` and similar HTML | Line breaks, bold, italic only |
| `style fill` on a subgraph | Container color is global |

## Uninstall and migrate

After Obsidian 1.15:

1. Settings → Community plugins → disable and uninstall this plugin
2. Diagrams fall back to the built-in Pele renderer; syntax is unchanged
3. A later OnePage theme release carries the same palette

The plugin detects Obsidian ≥ 1.15 and stops taking over automatically, so it never double-renders against the native engine.

## Development

No build step — `main.js` is the source:

```
main.js       plugin entry
styles.css    palette and structural CSS
manifest.json plugin manifest
versions.json version map for BRAT
```

Reload the plugin after editing. `./build-zip.sh` produces a versioned zip that unzips straight into `.obsidian/plugins/`.

## License

MIT. The rendering engine, [Pele](https://github.com/obsidianmd/pele), is MIT as well, by kepano.
