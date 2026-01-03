/**
 * Day One to Obsidian Converter
 * Converts Day One journal export ZIP files to Obsidian-compatible Markdown
 */

const WEATHER_CODES = {
  'clear': 'Clear',
  'clear-day': 'Clear',
  'clear-night': 'Clear Night',
  'cloudy': 'Cloudy',
  'cloudy-night': 'Cloudy Night',
  'partly-cloudy': 'Partly Cloudy',
  'partly-cloudy-day': 'Partly Cloudy',
  'partly-cloudy-night': 'Partly Cloudy Night',
  'rain': 'Rain',
  'snow': 'Snow',
  'sleet': 'Sleet',
  'wind': 'Windy',
  'fog': 'Fog',
  'hail': 'Hail',
  'thunderstorm': 'Thunderstorm'
};

const MOON_PHASES = {
  'new': 'New Moon',
  'waxing-crescent': 'Waxing Crescent',
  'first-quarter': 'First Quarter',
  'waxing-gibbous': 'Waxing Gibbous',
  'full': 'Full Moon',
  'waning-gibbous': 'Waning Gibbous',
  'last-quarter': 'Last Quarter',
  'waning-crescent': 'Waning Crescent'
};

export class DayOneToObsidian {
  constructor(options = {}) {
    this.allowDuplicates = options.allowDuplicates || false;
    this.photoMap = new Map(); // identifier -> md5 mapping
    this.usedFilenames = new Set();
    this.seenEntries = new Map(); // uuid -> content_hash mapping
    this.skippedDuplicates = 0;
    this.onProgress = options.onProgress || (() => {});
  }

  /**
   * Convert a Day One ZIP file to Obsidian format
   * @param {File|Blob|ArrayBuffer} zipFile - The Day One export ZIP
   * @returns {Promise<Blob>} - The converted ZIP as a Blob
   */
  async convert(zipFile) {
    const JSZip = window.JSZip;
    const jsYaml = window.jsyaml;

    if (!JSZip) throw new Error('JSZip library not loaded');
    if (!jsYaml) throw new Error('js-yaml library not loaded');

    this.onProgress({ stage: 'reading', message: 'Reading ZIP file...' });

    const inputZip = await JSZip.loadAsync(zipFile);
    const outputZip = new JSZip();

    // Find the journal JSON file
    const jsonFiles = Object.keys(inputZip.files).filter(name => name.endsWith('.json'));
    if (jsonFiles.length === 0) {
      throw new Error('No JSON file found in ZIP');
    }

    this.onProgress({ stage: 'parsing', message: 'Parsing journal data...' });

    const journalContent = await inputZip.file(jsonFiles[0]).async('string');
    const journalData = JSON.parse(journalContent);
    const entries = journalData.entries || [];

    // Extract all media (photos, videos, audio, pdfs) to attachments folder
    this.onProgress({ stage: 'media', message: 'Processing attachments...' });

    const mediaFolders = ['photos', 'videos', 'audios', 'pdfs'];
    const mediaFiles = Object.keys(inputZip.files).filter(name => {
      if (inputZip.files[name].dir) return false;
      return mediaFolders.some(folder =>
        name.includes(`/${folder}/`) || name.startsWith(`${folder}/`)
      );
    });

    for (const mediaPath of mediaFiles) {
      const filename = mediaPath.split('/').pop();
      const mediaData = await inputZip.file(mediaPath).async('arraybuffer');
      outputZip.file(`attachments/${filename}`, mediaData);
    }

    // Convert entries
    this.onProgress({ stage: 'converting', message: `Converting ${entries.length} entries...` });

    let converted = 0;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];

      if (this.shouldSkipDuplicate(entry)) {
        this.skippedDuplicates++;
        continue;
      }

      const { filename, content } = this.convertEntry(entry);
      outputZip.file(`entries/${filename}`, content);
      converted++;

      if (!this.allowDuplicates) {
        this.recordEntry(entry);
      }

      if (i % 10 === 0) {
        this.onProgress({
          stage: 'converting',
          message: `Converting entries... (${i + 1}/${entries.length})`,
          progress: (i + 1) / entries.length
        });
      }
    }

    this.onProgress({
      stage: 'complete',
      message: `Converted ${converted} entries${this.skippedDuplicates > 0 ? `, skipped ${this.skippedDuplicates} duplicates` : ''}`,
      progress: 1
    });

    // Generate the output ZIP
    this.onProgress({ stage: 'zipping', message: 'Creating output ZIP...' });

    const blob = await outputZip.generateAsync({
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 }
    });

    return blob;
  }

  shouldSkipDuplicate(entry) {
    if (this.allowDuplicates) return false;
    if (!entry.uuid) return false;

    const uuid = entry.uuid;
    const content = entry.text || '';
    const contentHash = this.hashString(content);

    if (this.seenEntries.has(uuid)) {
      return this.seenEntries.get(uuid) === contentHash;
    }

    return false;
  }

  recordEntry(entry) {
    if (!entry.uuid) return;

    const uuid = entry.uuid;
    const content = entry.text || '';
    const contentHash = this.hashString(content);

    this.seenEntries.set(uuid, contentHash);
  }

  hashString(str) {
    // Simple hash function for deduplication
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(16);
  }

  convertEntry(entry) {
    // Build photo identifier to md5 map
    this.buildPhotoMap(entry);

    // Generate frontmatter
    const frontmatter = this.buildFrontmatter(entry);

    // Convert content
    const content = this.convertContent(entry);

    // Generate filename
    const filename = this.generateFilename(entry);

    return {
      filename,
      content: `${frontmatter}${content}`
    };
  }

  buildPhotoMap(entry) {
    // Build identifier -> md5 map for photos
    if (entry.photos) {
      for (const photo of entry.photos) {
        this.photoMap.set(photo.identifier, { md5: photo.md5, type: photo.type || 'jpeg' });
      }
    }
    // Also handle videos
    if (entry.videos) {
      for (const video of entry.videos) {
        this.photoMap.set(video.identifier, { md5: video.md5, type: video.type || 'mov' });
      }
    }
    // And audio
    if (entry.audios) {
      for (const audio of entry.audios) {
        this.photoMap.set(audio.identifier, { md5: audio.md5, type: audio.type || 'm4a' });
      }
    }
    // And PDFs
    if (entry.pdfAttachments) {
      for (const pdf of entry.pdfAttachments) {
        this.photoMap.set(pdf.identifier, { md5: pdf.md5, type: 'pdf' });
      }
    }
  }

  buildFrontmatter(entry) {
    const fm = {};

    // Core metadata
    if (entry.uuid) fm.uuid = entry.uuid;
    if (entry.creationDate) fm.created = entry.creationDate;
    if (entry.modifiedDate) fm.modified = entry.modifiedDate;
    if (entry.timeZone) fm.timezone = entry.timeZone;

    // Status flags
    if (entry.starred) fm.starred = entry.starred;
    if (entry.isPinned) fm.pinned = entry.isPinned;
    if (entry.isAllDay) fm.all_day = entry.isAllDay;

    // Tags (Obsidian format)
    if (entry.tags && entry.tags.length > 0) {
      fm.tags = entry.tags.map(t => this.sanitizeTag(t));
    }

    // Location
    if (entry.location) {
      const loc = entry.location;
      const location = {};
      if (loc.placeName) location.name = loc.placeName;
      if (loc.localityName) location.locality = loc.localityName;
      if (loc.administrativeArea) location.region = loc.administrativeArea;
      if (loc.country) location.country = loc.country;
      if (loc.latitude) location.latitude = loc.latitude;
      if (loc.longitude) location.longitude = loc.longitude;
      if (Object.keys(location).length > 0) fm.location = location;
    }

    // Weather
    if (entry.weather) {
      const w = entry.weather;
      const weather = {};
      if (w.conditionsDescription) weather.conditions = w.conditionsDescription;
      if (w.temperatureCelsius) weather.temperature_c = w.temperatureCelsius;
      if (w.relativeHumidity && w.relativeHumidity > 0) weather.humidity = w.relativeHumidity;
      if (w.pressureMB) weather.pressure_mb = w.pressureMB;
      if (w.windSpeedKPH) weather.wind_speed_kph = w.windSpeedKPH;
      if (w.windBearing) weather.wind_bearing = w.windBearing;
      if (w.visibilityKM && w.visibilityKM > 0) weather.visibility_km = w.visibilityKM;
      if (w.moonPhaseCode && MOON_PHASES[w.moonPhaseCode]) {
        weather.moon_phase = MOON_PHASES[w.moonPhaseCode];
      }
      if (Object.keys(weather).length > 0) fm.weather = weather;
    }

    // Activity
    if (entry.userActivity) {
      const activity = entry.userActivity;
      const activityData = {};
      if (activity.activityName) activityData.type = activity.activityName;
      if (activity.stepCount) activityData.steps = activity.stepCount;
      if (Object.keys(activityData).length > 0) fm.activity = activityData;
    }

    // Device info
    if (entry.creationDevice || entry.creationDeviceType) {
      const device = {};
      if (entry.creationDevice) device.name = entry.creationDevice;
      if (entry.creationDeviceType) device.type = entry.creationDeviceType;
      if (entry.creationDeviceModel) device.model = entry.creationDeviceModel;
      if (entry.creationOSName) device.os = entry.creationOSName;
      if (entry.creationOSVersion) device.os_version = entry.creationOSVersion;
      if (Object.keys(device).length > 0) fm.device = device;
    }

    // Photo metadata
    if (entry.photos && entry.photos.length > 0) {
      fm.photos = entry.photos.map(photo => {
        const photoMeta = {
          file: `${photo.md5}.${photo.type || 'jpeg'}`,
          identifier: photo.identifier
        };
        const camera = [photo.cameraMake, photo.cameraModel].filter(Boolean).join(' ').trim();
        if (camera) photoMeta.camera = camera;
        if (photo.lensModel) photoMeta.lens = photo.lensModel;
        if (photo.date) photoMeta.date = photo.date;
        if (photo.width && photo.height) {
          photoMeta.dimensions = `${photo.width}x${photo.height}`;
        }
        return photoMeta;
      });
    }

    // Editing time
    if (entry.editingTime && entry.editingTime > 0) {
      fm.editing_time_seconds = Math.round(entry.editingTime);
    }

    const yamlContent = window.jsyaml.dump(fm, {
      lineWidth: -1,
      quotingType: '"',
      forceQuotes: false
    });

    return `---\n${yamlContent}---\n\n`;
  }

  convertContent(entry) {
    let text = entry.text || '';

    // Remove escaped backslashes from Day One's markdown
    text = this.unescapeDayoneMarkdown(text);

    // Convert Day One image references to Obsidian format
    text = this.convertImageReferences(text);

    // Clean up any zero-width spaces that Day One inserts
    text = text.replace(/\u200B/g, '');

    return text;
  }

  unescapeDayoneMarkdown(text) {
    // Day One escapes periods, hyphens, parentheses, etc.
    // We need to unescape them for standard markdown
    return text
      .replace(/\\\./g, '.')
      .replace(/\\-/g, '-')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\[/g, '[')
      .replace(/\\\]/g, ']')
      .replace(/\\#/g, '#')
      .replace(/\\>/g, '>')
      .replace(/\\_/g, '_')
      .replace(/\\\*/g, '*')
      .replace(/\\`/g, '`')
      .replace(/\\~/g, '~')
      .replace(/\\!/g, '!');
  }

  convertImageReferences(text) {
    // Convert dayone-moment://IDENTIFIER to Obsidian ![[filename]]
    return text.replace(/!\[\]\(dayone-moment:\/\/([A-F0-9]+)\)/g, (match, identifier) => {
      const media = this.photoMap.get(identifier);
      if (media) {
        return `![[${media.md5}.${media.type}]]`;
      } else {
        return `<!-- Missing media: ${identifier} -->`;
      }
    });
  }

  generateFilename(entry) {
    const date = new Date(entry.creationDate);
    const dateStr = date.toISOString().split('T')[0];

    // Try to extract title from first heading or first line
    const title = this.extractTitle(entry.text);

    let baseFilename;
    if (title && title.length > 0) {
      // Sanitize title for filename
      const safeTitle = title
        .replace(/[\/\\:*?"<>|]/g, '-')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 50);
      baseFilename = `${dateStr} ${safeTitle}`;
    } else {
      // Use UUID if no title
      baseFilename = `${dateStr} ${entry.uuid.slice(0, 8)}`;
    }

    // Handle duplicate filenames by appending UUID fragment
    let filename = `${baseFilename}.md`;
    if (this.usedFilenames.has(filename)) {
      filename = `${baseFilename} (${entry.uuid.slice(0, 8)}).md`;
    }

    this.usedFilenames.add(filename);
    return filename;
  }

  extractTitle(text) {
    if (!text) return null;

    // Look for first heading
    const headingMatch = text.match(/^#\s+(.+?)(?:\n|\\n|$)/m);
    if (headingMatch) {
      return this.unescapeDayoneMarkdown(headingMatch[1]).trim();
    }

    // Otherwise use first non-empty line
    const lines = text.split('\n');
    const firstLine = lines.find(l => l.trim().length > 0);
    if (!firstLine) return null;

    // Remove image references and clean up
    let title = firstLine
      .replace(/!\[\]\(dayone-moment:\/\/[^)]+\)/g, '')
      .replace(/^#+\s*/, '')
      .trim();

    if (title.length === 0) return null;

    return this.unescapeDayoneMarkdown(title).slice(0, 50);
  }

  sanitizeTag(tag) {
    // Convert tag to Obsidian-friendly format
    return tag
      .replace(/\s+/g, '-')
      .replace(/[^\w\-]/g, '')
      .toLowerCase();
  }
}

// Export for use as ES module
export default DayOneToObsidian;
