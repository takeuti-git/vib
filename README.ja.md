# VIB – Vim In Browser
[English](README.md) | 日本語

ウェブページ上にVimライクなエディタを提供するブラウザ拡張機能。

**対応ブラウザ:**
- Chrome
- Firefox

## デモ
<img width="400" alt="demo gif ja" src="https://github.com/user-attachments/assets/560fe6dd-9638-440c-b18f-1ec919502dcf" />

## 機能

- モーダル編集 (Normal / Insert / Visual)
- Vimライクなモーションとオペレータ
- ドットリピート
- マクロ記録
- `<input>` / `<textarea>` 要素をエディタにリンク
- 日本語入力に対応

## 使い方

| キー    | 動作                                 |
|---------|--------------------------------------|
| `Alt+v` | フォーカス中の要素をエディタにリンク |
| `Alt+q` | エディタの表示・非表示を切り替え     |

## インストール

```bash
git clone https://github.com/takeuti-git/vib.git
cd vib
npm install
npm run build:chrome  # または build:firefox
```

**拡張機能の読み込み**

- Chrome: `chrome://extensions/` → デベロッパーモードを有効化 → パッケージ化されていない拡張機能を読み込む → `dist/`
- Firefox: `about:debugging#/runtime/this-firefox` → 一時的なアドオンを読み込む → `dist/manifest.json`
