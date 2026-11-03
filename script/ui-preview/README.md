# Isolated UI preview

Loads the built renderer with simulated data and a temporary profile; makes no real HDC/device calls. The native title explicitly identifies simulated data. This is a layout/interaction fixture, not device or packaging acceptance.

After `npm run build:renderer`, from the repository root:

```sh
UI_LANGUAGE=en-US UI_THEME=dark UI_WIDTH=960 UI_HEIGHT=640 UI_PAGE=shell node_modules/.bin/electron script/ui-preview/main.cjs
```

Options: `UI_LANGUAGE` (`en-US`/`zh-CN`), `UI_THEME` (`light`/`dark`), window width/height, `UI_PAGE` (main panel ID), `UI_WINDOW` (`about`/`terminal`/`process`), `UI_EMPTY=1` (no devices), `UI_ERROR=1` (read failures), `UI_ZERO=1` (no apps), `UI_MANY=1` (100 apps), `UI_LONG_PROCESS=1` (a long simulated process title). Set only needed flags; any nonempty flag enables it.

The Electron native theme and renderer theme stay synchronized at startup and when changing settings. The fixture must preserve this bridge: renderer-only styling leaves macOS title bars in the system theme and produces misleading screenshots.

The screenshot asset is generated colored geometry, not device content. Clipboard/download actions use the real browser APIs; avoid them when only inspecting layout. Closing this process does not close a production app or alter its settings. During simultaneous user interaction, use a distinct copied Electron bundle identifier so automation cannot confuse verification and user windows.
