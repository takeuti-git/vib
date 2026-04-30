# VIB - Vim In Browser
[日本語 | Japanese](README.ja.md)

A browser extension that provides a Vim-like editor inside web pages.

**Supported browsers**
- Chrome
- Firefox

## Demo
<img width="400" alt="demo gif" src="https://github.com/user-attachments/assets/b4185dcb-3282-46f9-ba49-1cb6ea895300" />

## Features

- Modal editing (Normal / Insert / Visual)
- Vim-like motions and operators
- Dot-repeat
- Macro recording
- Link `<input>` / `<textarea>` elements to the editor

## Usage

| Key     | Action                             |
|---------|------------------------------------|
| `Alt+v` | Link focused element to the editor |
| `Alt+q` | Toggle editor visibility           |

## Installation

```bash
git clone https://github.com/takeuti-git/vib.git
cd vib
npm install
npm run build:chrome  # or build:firefox
```

**Load**
- Chrome: `chrome://extensions/` → Enable Developer Mode → Load unpacked → `dist/`
- Firefox: `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → `dist/manifest.json`
