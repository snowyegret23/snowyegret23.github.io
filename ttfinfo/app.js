const MODULE_URLS = [
  "https://cdn.jsdelivr.net/npm/unicode-block@1.0.1/+esm",
  "https://esm.sh/unicode-block@1.0.1"
];

const UNICODE_NAME_MODULE_URLS = [
  "https://cdn.jsdelivr.net/npm/unicode-name@1.1.0/+esm",
  "https://esm.sh/unicode-name@1.1.0"
];

const FALLBACK_BLOCKS = [
  ["0000", "007F", "Basic Latin"],
  ["0080", "00FF", "Latin-1 Supplement"],
  ["0100", "017F", "Latin Extended-A"],
  ["0180", "024F", "Latin Extended-B"],
  ["0250", "02AF", "IPA Extensions"],
  ["0300", "036F", "Combining Diacritical Marks"],
  ["0370", "03FF", "Greek and Coptic"],
  ["0400", "04FF", "Cyrillic"],
  ["0590", "05FF", "Hebrew"],
  ["0600", "06FF", "Arabic"],
  ["0900", "097F", "Devanagari"],
  ["0E00", "0E7F", "Thai"],
  ["1100", "11FF", "Hangul Jamo"],
  ["2000", "206F", "General Punctuation"],
  ["2100", "214F", "Letterlike Symbols"],
  ["2190", "21FF", "Arrows"],
  ["2200", "22FF", "Mathematical Operators"],
  ["2460", "24FF", "Enclosed Alphanumerics"],
  ["2500", "257F", "Box Drawing"],
  ["2580", "259F", "Block Elements"],
  ["25A0", "25FF", "Geometric Shapes"],
  ["2600", "26FF", "Miscellaneous Symbols"],
  ["2700", "27BF", "Dingbats"],
  ["2800", "28FF", "Braille Patterns"],
  ["3000", "303F", "CJK Symbols and Punctuation"],
  ["3040", "309F", "Hiragana"],
  ["30A0", "30FF", "Katakana"],
  ["3130", "318F", "Hangul Compatibility Jamo"],
  ["3400", "4DBF", "CJK Unified Ideographs Extension A"],
  ["4E00", "9FFF", "CJK Unified Ideographs"],
  ["AC00", "D7AF", "Hangul Syllables"],
  ["E000", "F8FF", "Private Use Area"],
  ["F900", "FAFF", "CJK Compatibility Ideographs"],
  ["FF00", "FFEF", "Halfwidth and Fullwidth Forms"],
  ["10000", "1007F", "Linear B Syllabary"],
  ["1F300", "1F5FF", "Miscellaneous Symbols and Pictographs"],
  ["1F600", "1F64F", "Emoticons"],
  ["1F680", "1F6FF", "Transport and Map Symbols"],
  ["1F900", "1F9FF", "Supplemental Symbols and Pictographs"],
  ["20000", "2A6DF", "CJK Unified Ideographs Extension B"],
  ["2F800", "2FA1F", "CJK Compatibility Ideographs Supplement"],
  ["100000", "10FFFF", "Supplementary Private Use Area-B"]
].map(([start, end, name]) => ({
  name,
  start: parseInt(start, 16),
  end: parseInt(end, 16)
}));

const NO_BLOCK = "No Block";
const PAGE_SIZE = 256;
const INFINITE_STEP = 256;

const state = {
  blocks: [],
  analyzed: null,
  selected: null,
  page: 0,
  infCount: 0,
  lastRenderKey: "",
  cacheKey: "",
  cacheData: null,
  previewFace: null,
  previewUrl: "",
  previewFamily: "",
  unicodeNameFn: null,
  unicodeNameLoading: null,
  unicodeNameFailed: false,
  nameCache: new Map()
};

const $ = (id) => document.getElementById(id);

const ui = {
  drop: $("drop"),
  pick: $("pick"),
  file: $("file"),
  status: $("status"),
  mFile: $("mFile"),
  mFamily: $("mFamily"),
  mStyle: $("mStyle"),
  mGlyphs: $("mGlyphs"),
  mMappedGlyphs: $("mMappedGlyphs"),
  mUnmappedGlyphs: $("mUnmappedGlyphs"),
  mPoints: $("mPoints"),
  mBlocks: $("mBlocks"),
  sample: $("sample"),
  onlySupported: $("onlySupported"),
  search: $("search"),
  list: $("list"),
  bTitle: $("bTitle"),
  bRange: $("bRange"),
  vSupported: $("vSupported"),
  vTotal: $("vTotal"),
  vPercent: $("vPercent"),
  showSupported: $("showSupported"),
  showUnsupported: $("showUnsupported"),
  infiniteMode: $("infiniteMode"),
  showIsoName: $("showIsoName"),
  prev: $("prev"),
  next: $("next"),
  page: $("page"),
  glyphs: $("glyphs")
};

initApp();

async function initApp() {
  try {
    bindEvents();
    await initBlocks();
    renderAll();
  } catch (error) {
    bindEvents();
    state.blocks = FALLBACK_BLOCKS.slice().sort((a, b) => a.start - b.start);
    setStatus(
      `Initialization fallback active. ${error instanceof Error ? error.message : ""}`.trim(),
      "warn"
    );
    renderAll();
  }
}

function bindEvents() {
  window.addEventListener("beforeunload", cleanupPreviewFont);

  window.addEventListener("dragover", (event) => {
    event.preventDefault();
  });

  window.addEventListener("drop", (event) => {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      analyze(file);
    }
  });

  ui.pick.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    ui.file.click();
  });

  ui.drop.addEventListener("click", () => ui.file.click());
  ui.drop.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      ui.file.click();
    }
  });

  ui.drop.addEventListener("dragover", (event) => {
    event.preventDefault();
    ui.drop.classList.add("drag");
  });

  ui.drop.addEventListener("dragleave", () => ui.drop.classList.remove("drag"));
  ui.drop.addEventListener("drop", (event) => {
    event.preventDefault();
    ui.drop.classList.remove("drag");
    const file = event.dataTransfer?.files?.[0];
    if (file) analyze(file);
  });

  ui.file.addEventListener("change", () => {
    const file = ui.file.files?.[0];
    if (file) analyze(file);
  });

  ui.onlySupported.addEventListener("change", () => {
    resetViewport();
    fixSelection();
    renderList();
    renderDetail(true);
  });

  ui.search.addEventListener("input", () => {
    resetViewport();
    fixSelection();
    renderList();
    renderDetail(true);
  });

  ui.showSupported.addEventListener("change", () => {
    invalidateFilterCache();
    resetViewport();
    renderDetail(true);
  });

  ui.showUnsupported.addEventListener("change", () => {
    invalidateFilterCache();
    resetViewport();
    renderDetail(true);
  });

  ui.infiniteMode.addEventListener("change", () => {
    resetViewport();
    renderDetail(true);
  });

  ui.showIsoName.addEventListener("change", async () => {
    if (ui.showIsoName.checked) {
      setStatus("Loading Unicode character names...", "warn");
      await ensureUnicodeNameResolver();
    }
    renderDetail(true);
  });

  ui.prev.addEventListener("click", () => {
    if (ui.infiniteMode.checked) {
      return;
    }
    if (state.page > 0) {
      state.page -= 1;
      renderDetail();
    }
  });

  ui.next.addEventListener("click", () => {
    if (ui.infiniteMode.checked) {
      return;
    }
    state.page += 1;
    renderDetail();
  });

  ui.glyphs.addEventListener("scroll", () => {
    if (!ui.infiniteMode.checked) {
      return;
    }
    const nearBottom =
      ui.glyphs.scrollTop + ui.glyphs.clientHeight >= ui.glyphs.scrollHeight - 120;
    if (!nearBottom) {
      return;
    }
    appendInfiniteChunk();
  });

  window.addEventListener("scroll", () => {
    if (!ui.infiniteMode.checked) {
      return;
    }
    if (isGlyphContainerScrollable()) {
      return;
    }
    const nearBottom =
      window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 160;
    if (nearBottom) {
      appendInfiniteChunk();
    }
  });

  window.addEventListener("resize", () => {
    if (!ui.infiniteMode.checked) {
      return;
    }
    fillUntilScrollable();
  });
}

async function initBlocks() {
  const loaded = await loadBlocksFromModule();
  if (loaded.length > 200) {
    state.blocks = loaded;
    setStatus(`Catalog loaded (${fmt(loaded.length)} blocks).`, "ok");
  } else {
    state.blocks = FALLBACK_BLOCKS.slice().sort((a, b) => a.start - b.start);
    setStatus(`Fallback catalog active (${fmt(state.blocks.length)} blocks).`, "warn");
  }
}

async function loadBlocksFromModule() {
  for (const url of MODULE_URLS) {
    try {
      const mod = await import(url);
      if (
        typeof mod.listUnicodeBlocks !== "function" ||
        typeof mod.unicodeBlockInfo !== "function"
      ) {
        continue;
      }

      const names = Array.from(mod.listUnicodeBlocks())
        .map(String)
        .filter((name) => name && name !== "No_Block");

      const blocks = names
        .map((name) => {
          const info = mod.unicodeBlockInfo(name);
          if (!info || typeof info.first !== "number" || typeof info.last !== "number") {
            return null;
          }
          return { name: name.replace(/_/g, " "), start: info.first, end: info.last };
        })
        .filter(Boolean)
        .sort((a, b) => a.start - b.start);

      if (blocks.length) {
        return blocks;
      }
    } catch (_error) {
      continue;
    }
  }
  return [];
}

async function analyze(file) {
  if (!state.blocks.length) {
    return;
  }

  setStatus(`Parsing ${file.name}...`, "warn");
  let previewLoaded = false;
  try {
    const analyzed = await parseFont(file);
    previewLoaded = await loadPreviewFont(file, analyzed.names);
    state.analyzed = analyzed;
    state.selected = firstVisibleBlock(analyzed)?.name ?? null;
    invalidateFilterCache();
    resetViewport();
    setStatus(
      previewLoaded
        ? `Parsed ${file.name} (${fmt(analyzed.codePoints.length)} code points).`
        : `Parsed ${file.name} (${fmt(analyzed.codePoints.length)} code points). Preview font load failed.`,
      previewLoaded ? "ok" : "warn"
    );
  } catch (error) {
    cleanupPreviewFont();
    state.analyzed = null;
    state.selected = null;
    invalidateFilterCache();
    resetViewport();
    setStatus(
      `Failed to parse file. ${error instanceof Error ? error.message : ""}`.trim(),
      "err"
    );
  } finally {
    ui.file.value = "";
  }

  renderAll();
}

async function loadPreviewFont(file, names) {
  const familyBase = sanitizeFamilyName(names?.family || file.name || "ttfinfo-preview");
  const unique = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const family = `ttfinfo-${familyBase}-${unique}`;
  const url = URL.createObjectURL(file);
  const face = new FontFace(family, `url("${url}")`);

  try {
    await face.load();
    document.fonts.add(face);

    if (state.previewFace) {
      document.fonts.delete(state.previewFace);
    }
    if (state.previewUrl) {
      URL.revokeObjectURL(state.previewUrl);
    }

    state.previewFace = face;
    state.previewUrl = url;
    state.previewFamily = family;
    document.documentElement.style.setProperty("--glyph-font", `"${family}"`);
    return true;
  } catch (_error) {
    URL.revokeObjectURL(url);
    return false;
  }
}

function cleanupPreviewFont() {
  if (state.previewFace) {
    document.fonts.delete(state.previewFace);
  }
  if (state.previewUrl) {
    URL.revokeObjectURL(state.previewUrl);
  }
  state.previewFace = null;
  state.previewUrl = "";
  state.previewFamily = "";
  document.documentElement.style.setProperty("--glyph-font", `"Outfit"`);
}

async function parseFont(file) {
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const tables = parseDirectory(view);
  if (!tables.has("cmap")) {
    throw new Error("Missing cmap table.");
  }

  const names = parseNameTable(view, tables.get("name"));
  const glyphCount = parseMaxp(view, tables.get("maxp"));
  const cmapData = parseCmap(view, tables.get("cmap"));
  const codePoints = Array.from(cmapData.codePoints).sort((a, b) => a - b);
  const mappedGlyphCount = cmapData.mappedGlyphs.size;
  const unmappedGlyphCount = Math.max(0, glyphCount - mappedGlyphCount);

  return {
    fileName: file.name,
    names,
    glyphCount,
    mappedGlyphCount,
    unmappedGlyphCount,
    codePoints,
    coverage: classifyCodePoints(codePoints)
  };
}

function parseDirectory(view) {
  const signature = readTag(view, 0);
  if (signature === "ttcf") {
    assertRange(view, 0, 12, "TTC header");
    const count = view.getUint32(8, false);
    if (!count) {
      throw new Error("TTC has no faces.");
    }
    assertRange(view, 12, count * 4, "TTC offsets");
    const firstOffset = view.getUint32(12, false);
    return parseSfnt(view, firstOffset);
  }
  return parseSfnt(view, 0);
}

function parseSfnt(view, baseOffset) {
  assertRange(view, baseOffset, 12, "SFNT header");
  const numTables = view.getUint16(baseOffset + 4, false);
  const directoryOffset = baseOffset + 12;
  assertRange(view, directoryOffset, numTables * 16, "table directory");

  const tableMap = new Map();
  for (let index = 0; index < numTables; index += 1) {
    const entryOffset = directoryOffset + index * 16;
    const tag = readTag(view, entryOffset);
    const rawOffset = view.getUint32(entryOffset + 8, false);
    const length = view.getUint32(entryOffset + 12, false);

    let absoluteOffset = rawOffset;
    if (
      absoluteOffset + length > view.byteLength &&
      baseOffset + rawOffset + length <= view.byteLength
    ) {
      absoluteOffset = baseOffset + rawOffset;
    }

    if (absoluteOffset + length <= view.byteLength) {
      tableMap.set(tag, { offset: absoluteOffset, length });
    }
  }
  return tableMap;
}

function parseNameTable(view, nameTable) {
  const fallback = { family: "Unknown", style: "Unknown", full: "Unknown" };
  if (!nameTable) {
    return fallback;
  }

  const base = nameTable.offset;
  assertRange(view, base, 6, "name table");
  const count = view.getUint16(base + 2, false);
  const storageOffset = view.getUint16(base + 4, false);
  assertRange(view, base + 6, count * 12, "name records");

  const best = new Map();
  for (let index = 0; index < count; index += 1) {
    const recordOffset = base + 6 + index * 12;
    const platform = view.getUint16(recordOffset, false);
    const encoding = view.getUint16(recordOffset + 2, false);
    const language = view.getUint16(recordOffset + 4, false);
    const nameId = view.getUint16(recordOffset + 6, false);
    const length = view.getUint16(recordOffset + 8, false);
    const offset = view.getUint16(recordOffset + 10, false);

    if (![1, 2, 4].includes(nameId) || !length) {
      continue;
    }

    const stringOffset = base + storageOffset + offset;
    if (stringOffset + length > view.byteLength) {
      continue;
    }

    const raw = new Uint8Array(view.buffer, view.byteOffset + stringOffset, length);
    const text = decodeName(raw, platform).trim();
    if (!text) {
      continue;
    }

    let score = 0;
    if (platform === 3) score += 100;
    if (platform === 0) score += 80;
    if (platform === 1) score += 50;
    if (language === 0x0409) score += 20;
    if (encoding === 1 || encoding === 10) score += 5;

    const existing = best.get(nameId);
    if (!existing || score > existing.score) {
      best.set(nameId, { text, score });
    }
  }

  return {
    family: best.get(1)?.text ?? fallback.family,
    style: best.get(2)?.text ?? fallback.style,
    full: best.get(4)?.text ?? fallback.full
  };
}

function decodeName(bytes, platform) {
  if (platform === 0 || platform === 3) {
    if (bytes.length % 2 !== 0) {
      return "";
    }
    let out = "";
    for (let i = 0; i < bytes.length; i += 2) {
      const unit = (bytes[i] << 8) | bytes[i + 1];
      if (unit) {
        out += String.fromCharCode(unit);
      }
    }
    return out;
  }

  let out = "";
  for (const byte of bytes) {
    if (byte) {
      out += String.fromCharCode(byte);
    }
  }
  return out;
}

function parseMaxp(view, maxpTable) {
  if (!maxpTable) {
    return 0;
  }
  assertRange(view, maxpTable.offset, 6, "maxp table");
  return view.getUint16(maxpTable.offset + 4, false);
}

function parseCmap(view, cmapTable) {
  const codePoints = new Set();
  const mappedGlyphs = new Set();
  const base = cmapTable.offset;
  assertRange(view, base, 4, "cmap table");

  const numSubtables = view.getUint16(base + 2, false);
  assertRange(view, base + 4, numSubtables * 8, "cmap records");

  const seenOffsets = new Set();
  for (let index = 0; index < numSubtables; index += 1) {
    const recordOffset = base + 4 + index * 8;
    const subtableOffset = base + view.getUint32(recordOffset + 4, false);
    if (seenOffsets.has(subtableOffset) || subtableOffset + 2 > view.byteLength) {
      continue;
    }
    seenOffsets.add(subtableOffset);

    const format = view.getUint16(subtableOffset, false);
    if (format === 4) parseCmap4(view, subtableOffset, codePoints, mappedGlyphs);
    if (format === 12) parseCmap12(view, subtableOffset, codePoints, mappedGlyphs);
    if (format === 13) parseCmap13(view, subtableOffset, codePoints, mappedGlyphs);
  }

  return { codePoints, mappedGlyphs };
}

function parseCmap4(view, offset, codePoints, mappedGlyphs) {
  if (offset + 8 > view.byteLength) {
    return;
  }
  const length = view.getUint16(offset + 2, false);
  const end = offset + length;
  if (length < 24 || end > view.byteLength) {
    return;
  }

  const segCount = view.getUint16(offset + 6, false) / 2;
  const endCodeOffset = offset + 14;
  const startCodeOffset = endCodeOffset + segCount * 2 + 2;
  const idDeltaOffset = startCodeOffset + segCount * 2;
  const idRangeOffsetOffset = idDeltaOffset + segCount * 2;
  if (idRangeOffsetOffset + segCount * 2 > end) {
    return;
  }

  for (let segment = 0; segment < segCount; segment += 1) {
    const start = view.getUint16(startCodeOffset + segment * 2, false);
    const finish = view.getUint16(endCodeOffset + segment * 2, false);
    if (finish < start) {
      continue;
    }

    const delta = view.getInt16(idDeltaOffset + segment * 2, false);
    const rangeOffset = view.getUint16(idRangeOffsetOffset + segment * 2, false);

    for (let cp = start; cp <= finish; cp += 1) {
      if (cp >= 0xd800 && cp <= 0xdfff) {
        continue;
      }

      let glyph = 0;
      if (rangeOffset === 0) {
        glyph = (cp + delta) & 0xffff;
      } else {
        const address =
          idRangeOffsetOffset + segment * 2 + rangeOffset + (cp - start) * 2;
        if (address + 2 > end) {
          continue;
        }
        glyph = view.getUint16(address, false);
        if (glyph !== 0) {
          glyph = (glyph + delta) & 0xffff;
        }
      }

      if (glyph !== 0) {
        codePoints.add(cp);
        mappedGlyphs.add(glyph);
      }
    }
  }
}

function parseCmap12(view, offset, codePoints, mappedGlyphs) {
  if (offset + 16 > view.byteLength) {
    return;
  }
  const length = view.getUint32(offset + 4, false);
  const groups = view.getUint32(offset + 12, false);
  const end = offset + length;
  if (end > view.byteLength || offset + 16 + groups * 12 > end) {
    return;
  }

  for (let i = 0; i < groups; i += 1) {
    const groupOffset = offset + 16 + i * 12;
    const start = view.getUint32(groupOffset, false);
    const finish = Math.min(view.getUint32(groupOffset + 4, false), 0x10ffff);
    const startGlyph = view.getUint32(groupOffset + 8, false);
    if (finish < start || start > 0x10ffff) {
      continue;
    }
    for (let cp = start; cp <= finish; cp += 1) {
      const glyph = startGlyph + (cp - start);
      if (glyph !== 0) {
        codePoints.add(cp);
        mappedGlyphs.add(glyph);
      }
    }
  }
}

function parseCmap13(view, offset, codePoints, mappedGlyphs) {
  if (offset + 16 > view.byteLength) {
    return;
  }
  const length = view.getUint32(offset + 4, false);
  const groups = view.getUint32(offset + 12, false);
  const end = offset + length;
  if (end > view.byteLength || offset + 16 + groups * 12 > end) {
    return;
  }

  for (let i = 0; i < groups; i += 1) {
    const groupOffset = offset + 16 + i * 12;
    const start = view.getUint32(groupOffset, false);
    const finish = Math.min(view.getUint32(groupOffset + 4, false), 0x10ffff);
    const glyph = view.getUint32(groupOffset + 8, false);
    if (!glyph || finish < start || start > 0x10ffff) {
      continue;
    }
    for (let cp = start; cp <= finish; cp += 1) {
      codePoints.add(cp);
    }
    mappedGlyphs.add(glyph);
  }
}

function classifyCodePoints(points) {
  const map = new Map();
  for (const cp of points) {
    const block = findBlock(cp);
    if (block) {
      if (!map.has(block.name)) {
        map.set(block.name, {
          name: block.name,
          start: block.start,
          end: block.end,
          points: []
        });
      }
      map.get(block.name).points.push(cp);
    } else {
      if (!map.has(NO_BLOCK)) {
        map.set(NO_BLOCK, { name: NO_BLOCK, start: cp, end: cp, points: [] });
      }
      const entry = map.get(NO_BLOCK);
      entry.start = Math.min(entry.start, cp);
      entry.end = Math.max(entry.end, cp);
      entry.points.push(cp);
    }
  }
  return map;
}

function findBlock(codePoint) {
  let low = 0;
  let high = state.blocks.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const block = state.blocks[mid];
    if (codePoint < block.start) {
      high = mid - 1;
    } else if (codePoint > block.end) {
      low = mid + 1;
    } else {
      return block;
    }
  }
  return null;
}

function visibleBlocks(analyzed = state.analyzed) {
  if (!analyzed) {
    return [];
  }

  const coverage = analyzed?.coverage ?? new Map();
  const onlySupportedBlocks = ui.onlySupported.checked;
  const term = ui.search.value.trim().toLowerCase();

  const items = state.blocks.map((block) => ({
    name: block.name,
    start: block.start,
    end: block.end,
    count: coverage.get(block.name)?.points.length ?? 0
  }));

  if (coverage.has(NO_BLOCK)) {
    const extra = coverage.get(NO_BLOCK);
    items.push({
      name: NO_BLOCK,
      start: extra.start,
      end: extra.end,
      count: extra.points.length
    });
  }

  return items.filter((item) => {
    if (onlySupportedBlocks && item.count === 0) {
      return false;
    }
    if (!term) {
      return true;
    }
    const rangeText = `${hex(item.start)}-${hex(item.end)}`.toLowerCase();
    return item.name.toLowerCase().includes(term) || rangeText.includes(term);
  });
}

function firstVisibleBlock(analyzed = state.analyzed) {
  const items = visibleBlocks(analyzed);
  return items.find((item) => item.count > 0) ?? items[0] ?? null;
}

function fixSelection() {
  const items = visibleBlocks();
  if (!items.length) {
    state.selected = null;
    invalidateFilterCache();
    resetViewport();
    return;
  }
  if (!items.some((item) => item.name === state.selected)) {
    state.selected = items[0].name;
    invalidateFilterCache();
    resetViewport();
  }
}

function selectedBlock() {
  if (!state.analyzed || !state.selected) {
    return null;
  }
  const covered = state.analyzed.coverage.get(state.selected);
  if (covered) {
    return covered;
  }
  const fromCatalog = state.blocks.find((item) => item.name === state.selected);
  if (!fromCatalog) {
    return null;
  }
  return { name: fromCatalog.name, start: fromCatalog.start, end: fromCatalog.end, points: [] };
}

function getFilteredGlyphData(blockData) {
  const showSupported = ui.showSupported.checked;
  const showUnsupported = ui.showUnsupported.checked;
  const key = `${state.selected}|${showSupported ? 1 : 0}|${showUnsupported ? 1 : 0}`;

  if (state.cacheKey === key && state.cacheData) {
    return state.cacheData;
  }

  const supportedSet = new Set(blockData.points);
  let codes = [];

  if (showSupported && showUnsupported) {
    for (let cp = blockData.start; cp <= blockData.end; cp += 1) {
      codes.push(cp);
    }
  } else if (showSupported) {
    codes = blockData.points.slice();
  } else if (showUnsupported) {
    for (let cp = blockData.start; cp <= blockData.end; cp += 1) {
      if (!supportedSet.has(cp)) {
        codes.push(cp);
      }
    }
  }

  const result = { key, codes, supportedSet, showSupported, showUnsupported };
  state.cacheKey = key;
  state.cacheData = result;
  return result;
}

function invalidateFilterCache() {
  state.cacheKey = "";
  state.cacheData = null;
}

function resetViewport() {
  state.page = 0;
  state.infCount = 0;
  state.lastRenderKey = "";
}

function renderAll() {
  renderMeta();
  fixSelection();
  renderList();
  renderDetail(true);
}

function renderMeta() {
  if (!state.analyzed) {
    ui.mFile.textContent = "-";
    ui.mFamily.textContent = "-";
    ui.mStyle.textContent = "-";
    ui.mGlyphs.textContent = "-";
    ui.mMappedGlyphs.textContent = "-";
    ui.mUnmappedGlyphs.textContent = "-";
    ui.mPoints.textContent = "-";
    ui.mBlocks.textContent = "-";
    ui.sample.textContent = "-";
    return;
  }

  const analyzed = state.analyzed;
  ui.mFile.textContent = analyzed.fileName;
  ui.mFamily.textContent = analyzed.names.family || "Unknown";
  ui.mStyle.textContent = analyzed.names.style || "Unknown";
  ui.mGlyphs.textContent = fmt(analyzed.glyphCount);
  ui.mMappedGlyphs.textContent = fmt(analyzed.mappedGlyphCount ?? 0);
  ui.mUnmappedGlyphs.textContent = fmt(analyzed.unmappedGlyphCount ?? 0);
  ui.mPoints.textContent = fmt(analyzed.codePoints.length);
  ui.mBlocks.textContent = fmt(analyzed.coverage.size);
  ui.sample.textContent = sampleText(analyzed.codePoints);
}

function renderList() {
  ui.list.textContent = "";
  const items = visibleBlocks();

  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = state.analyzed
      ? "No blocks match current filter."
      : "Load a font to populate this list.";
    ui.list.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const item of items) {
    const size = item.end - item.start + 1;
    const button = document.createElement("button");
    button.type = "button";
    button.className = `item${item.name === state.selected ? " active" : ""}`;
    button.innerHTML = `<div class="i1"><span class="name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span><span class="pill">${fmt(item.count)} / ${fmt(size)}</span></div><div class="i2">${hex(item.start)} - ${hex(item.end)}</div>`;
    button.addEventListener("click", () => {
      state.selected = item.name;
      invalidateFilterCache();
      resetViewport();
      renderList();
      renderDetail(true);
    });
    fragment.append(button);
  }
  ui.list.append(fragment);
}

function renderDetail(forceReset = false) {
  ui.glyphs.textContent = "";

  if (!state.analyzed) {
    ui.bTitle.textContent = "No block selected";
    ui.bRange.textContent = "Upload a font to inspect coverage.";
    ui.vSupported.textContent = "0";
    ui.vTotal.textContent = "0";
    ui.vPercent.textContent = "0%";
    ui.page.textContent = "-";
    ui.prev.disabled = true;
    ui.next.disabled = true;
    appendEmpty("Drop a font file to render glyph coverage.");
    return;
  }

  const blockData = selectedBlock();
  if (!blockData) {
    ui.bTitle.textContent = "No block selected";
    ui.bRange.textContent = "No block is available for current filter.";
    ui.vSupported.textContent = "0";
    ui.vTotal.textContent = "0";
    ui.vPercent.textContent = "0%";
    ui.page.textContent = "-";
    ui.prev.disabled = true;
    ui.next.disabled = true;
    appendEmpty("No selected block.");
    return;
  }

  const totalBlock = blockData.end - blockData.start + 1;
  const supported = blockData.points.length;
  const percent = totalBlock ? ((supported / totalBlock) * 100).toFixed(2) : "0.00";
  ui.bTitle.textContent = blockData.name;
  ui.bRange.textContent = `${hex(blockData.start)} - ${hex(blockData.end)}`;
  ui.vSupported.textContent = fmt(supported);
  ui.vTotal.textContent = fmt(totalBlock);
  ui.vPercent.textContent = `${percent}%`;

  const filtered = getFilteredGlyphData(blockData);
  if (!filtered.showSupported && !filtered.showUnsupported) {
    ui.page.textContent = "-";
    ui.prev.disabled = true;
    ui.next.disabled = true;
    appendEmpty("Enable SHOW SUPPORTED or SHOW UNSUPPORTED.");
    return;
  }

  if (ui.infiniteMode.checked) {
    renderInfiniteMode(filtered, forceReset);
    return;
  }

  renderPageMode(filtered);
}

function renderPageMode(filtered) {
  const total = filtered.codes.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  state.page = Math.max(0, Math.min(state.page, pages - 1));
  state.lastRenderKey = `${filtered.key}|page|${state.page}`;

  ui.page.textContent = `${state.page + 1} / ${pages}`;
  ui.prev.disabled = state.page === 0;
  ui.next.disabled = state.page >= pages - 1;

  if (!total) {
    appendEmpty("No glyphs match current filters.");
    return;
  }

  const from = state.page * PAGE_SIZE;
  const slice = filtered.codes.slice(from, from + PAGE_SIZE);
  renderGlyphCards(slice, filtered.supportedSet, false);
}

function renderInfiniteMode(filtered, forceReset) {
  const modeKey = `${filtered.key}|infinite`;
  if (forceReset || state.lastRenderKey !== modeKey) {
    state.lastRenderKey = modeKey;
    state.infCount = 0;
    ui.glyphs.textContent = "";
    ui.glyphs.scrollTop = 0;
  }

  const total = filtered.codes.length;
  ui.prev.disabled = true;
  ui.next.disabled = true;

  if (!total) {
    ui.page.textContent = "0 / 0";
    appendEmpty("No glyphs match current filters.");
    return;
  }

  if (state.infCount === 0) {
    state.infCount = Math.min(INFINITE_STEP, total);
  }

  const slice = filtered.codes.slice(0, state.infCount);
  renderGlyphCards(slice, filtered.supportedSet, false);
  updateInfinitePageLabel(total);
  fillUntilScrollable();
}

function appendInfiniteChunk() {
  const blockData = selectedBlock();
  if (!blockData) {
    return;
  }

  const filtered = getFilteredGlyphData(blockData);
  if (!filtered.showSupported && !filtered.showUnsupported) {
    return;
  }

  const modeKey = `${filtered.key}|infinite`;
  if (state.lastRenderKey !== modeKey) {
    return;
  }

  if (state.infCount >= filtered.codes.length) {
    return;
  }

  const previous = state.infCount;
  state.infCount = Math.min(state.infCount + INFINITE_STEP, filtered.codes.length);
  const chunk = filtered.codes.slice(previous, state.infCount);
  renderGlyphCards(chunk, filtered.supportedSet, true);
  updateInfinitePageLabel(filtered.codes.length);
}

function updateInfinitePageLabel(totalCount) {
  const loadedPages = Math.max(1, Math.ceil(state.infCount / PAGE_SIZE));
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  ui.page.textContent = `${loadedPages} / ${totalPages}`;
}

function fillUntilScrollable() {
  if (!ui.infiniteMode.checked) {
    return;
  }
  const blockData = selectedBlock();
  if (!blockData) {
    return;
  }
  const filtered = getFilteredGlyphData(blockData);
  if (!filtered.codes.length) {
    return;
  }

  let guard = 0;
  while (!isGlyphContainerScrollable() && state.infCount < filtered.codes.length && guard < 12) {
    const previous = state.infCount;
    state.infCount = Math.min(state.infCount + INFINITE_STEP, filtered.codes.length);
    const chunk = filtered.codes.slice(previous, state.infCount);
    renderGlyphCards(chunk, filtered.supportedSet, true);
    guard += 1;
  }
  updateInfinitePageLabel(filtered.codes.length);
}

function isGlyphContainerScrollable() {
  return ui.glyphs.scrollHeight > ui.glyphs.clientHeight + 2;
}

function renderGlyphCards(codePoints, supportedSet, append) {
  if (!append) {
    ui.glyphs.textContent = "";
  }

  const fragment = document.createDocumentFragment();
  const showIsoName = ui.showIsoName.checked;
  for (const cp of codePoints) {
    const hasGlyph = supportedSet.has(cp);
    const card = document.createElement("div");
    card.className = `g${hasGlyph ? "" : " off"}`;
    const isoName = showIsoName ? getIsoName(cp) : "";
    card.title = `${hex(cp)}${hasGlyph ? "" : " (not mapped)"}${isoName ? `\n${isoName}` : ""}`;

    const char = document.createElement("div");
    char.className = "gc";
    char.textContent = hasGlyph ? glyphPreview(cp) : "";

    const code = document.createElement("div");
    code.className = "gh";
    code.textContent = hex(cp);

    card.append(char, code);
    if (showIsoName && isoName) {
      const name = document.createElement("div");
      name.className = "gn";
      name.textContent = isoName;
      card.append(name);
    }
    fragment.append(card);
  }

  ui.glyphs.append(fragment);
}

function appendEmpty(text) {
  const empty = document.createElement("div");
  empty.className = "empty";
  empty.textContent = text;
  ui.glyphs.append(empty);
}

function sampleText(points) {
  const out = [];
  for (const cp of points) {
    const preview = glyphPreview(cp);
    if (!preview) {
      continue;
    }
    out.push(preview);
    if (out.length >= 42) {
      break;
    }
  }
  return out.length ? out.join(" ") : "No printable sample in mapped code points.";
}

async function ensureUnicodeNameResolver() {
  if (state.unicodeNameFn) {
    return true;
  }
  if (state.unicodeNameFailed) {
    return false;
  }
  if (state.unicodeNameLoading) {
    return state.unicodeNameLoading;
  }

  state.unicodeNameLoading = (async () => {
    for (const url of UNICODE_NAME_MODULE_URLS) {
      try {
        const mod = await import(url);
        const fn =
          (typeof mod.unicodeName === "function" && mod.unicodeName) ||
          (typeof mod.default === "function" && mod.default) ||
          (typeof mod.getName === "function" && mod.getName);
        if (fn) {
          state.unicodeNameFn = fn;
          state.unicodeNameFailed = false;
          return true;
        }
      } catch (_error) {
        continue;
      }
    }

    state.unicodeNameFailed = true;
    setStatus("Unicode names unavailable. Keeping code point labels only.", "warn");
    return false;
  })();

  const loaded = await state.unicodeNameLoading;
  state.unicodeNameLoading = null;
  return loaded;
}

function getIsoName(codePoint) {
  if (state.nameCache.has(codePoint)) {
    return state.nameCache.get(codePoint);
  }

  if (!state.unicodeNameFn) {
    return "";
  }

  let raw = "";
  try {
    raw = String(state.unicodeNameFn(codePoint) || "").trim();
  } catch (_error) {
    raw = "";
  }

  const value = raw ? formatUnicodeName(raw) : "";
  state.nameCache.set(codePoint, value);
  return value;
}

function formatUnicodeName(name) {
  if (!name) {
    return "";
  }
  if (name.startsWith("<") && name.endsWith(">")) {
    return name;
  }
  return name
    .toLowerCase()
    .split(" ")
    .map((token) => (token ? token[0].toUpperCase() + token.slice(1) : token))
    .join(" ");
}

function glyphPreview(codePoint) {
  if (codePoint <= 0x1f || codePoint === 0x7f) {
    return "";
  }
  try {
    const character = String.fromCodePoint(codePoint);
    if (/\p{Mark}/u.test(character)) {
      return `\u25CC${character}`;
    }
    if (/\s/u.test(character)) {
      return "\u2423";
    }
    return character;
  } catch (_error) {
    return "";
  }
}

function setStatus(text, tone = "") {
  ui.status.className = `status${tone ? ` ${tone}` : ""}`;
  ui.status.textContent = text;
}

function readTag(view, offset) {
  assertRange(view, offset, 4, "tag");
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
}

function assertRange(view, offset, length, name) {
  if (
    !Number.isInteger(offset) ||
    !Number.isInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > view.byteLength
  ) {
    throw new Error(`${name} out of bounds.`);
  }
}

function hex(value) {
  return `U+${value.toString(16).toUpperCase().padStart(4, "0")}`;
}

function fmt(value) {
  return new Intl.NumberFormat().format(value);
}

function escapeHtml(text) {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function sanitizeFamilyName(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "preview";
}
