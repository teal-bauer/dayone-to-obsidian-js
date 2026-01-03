# Day One to Obsidian Converter

A browser-based tool to convert Day One journal exports to Obsidian-compatible Markdown. All processing happens locally in your browser - your data never leaves your device.

## Features

- Drag-and-drop ZIP upload
- Preserves all metadata in YAML frontmatter
- Converts `dayone-moment://` image references to Obsidian `![[filename]]` syntax
- Unescapes Day One's markdown escaping
- Handles duplicate filenames
- Outputs `entries/` and `attachments/` folders
- Skips duplicate entries (optional)

## Usage

### Quick Start (No Installation)

1. Export your journal from Day One (JSON format, include media)
2. Open `index.html` in your browser
3. Drag and drop your export ZIP file
4. Click "Download Converted ZIP"
5. Extract to your Obsidian vault

### With Local Server

```bash
npm install
npm start
```

Then open http://localhost:3000 in your browser.

## Output Structure

```
dayone-obsidian-export.zip
├── entries/
│   ├── 2024-01-15 Morning thoughts.md
│   ├── 2024-01-15 Evening reflection.md
│   └── ...
└── attachments/
    ├── abc123def456.jpeg
    └── ...
```

## Frontmatter Fields

Each converted entry includes YAML frontmatter with:

- `uuid` - Day One entry identifier
- `created` - Creation date (ISO 8601)
- `modified` - Last modified date
- `timezone` - Entry timezone
- `starred` - Star status
- `pinned` - Pin status
- `tags` - Obsidian-compatible tags
- `location` - Place name, coordinates, etc.
- `weather` - Temperature, conditions, moon phase
- `activity` - Step count, activity type
- `device` - Device name, model, OS
- `photos` - Photo metadata with file references
- `editing_time_seconds` - Time spent editing

## Day One Export Instructions

1. Open Day One
2. Go to File > Export > JSON
3. Select your journal(s)
4. Check "Include media in export"
5. Export as ZIP

## Browser Compatibility

Works in all modern browsers (Chrome, Firefox, Safari, Edge). Requires JavaScript enabled.

## Libraries

- [JSZip](https://stuk.github.io/jszip/) - ZIP file handling
- [js-yaml](https://github.com/nodeca/js-yaml) - YAML generation

## License

MIT
