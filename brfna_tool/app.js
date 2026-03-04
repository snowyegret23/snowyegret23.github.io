
const HEADER_SIZE = 16;
const SECTION_HEADER_SIZE = 8;
const TGLP_HEADER_SIZE = 0x20;
const MAX_BMP = 0xffff;
const HUFFMAN_CLASS = 0x20;
const BRFNA_HUFFMAN_METHOD_QUIRK = 9;

const ENCODING_NAME_TO_BYTE = { utf16: 0, sjis: 1, utf8: 2, cp1252: 3 };
const ENCODING_BYTE_TO_NAME = { 0: "utf16", 1: "sjis", 2: "utf8", 3: "cp1252" };

const state = {
  templateFile: null,
  templateBuffer: null,
  templateInfo: null,
};

const $ = (id) => document.getElementById(id);
const ui = {
  dropBrfna: $("dropBrfna"),
  pickBrfna: $("pickBrfna"),
  fileBrfna: $("fileBrfna"),
  status: $("status"),
  downloadPreview: $("downloadPreview"),
  applyToBuilder: $("applyToBuilder"),
  copyInfoJson: $("copyInfoJson"),
  sectionList: $("sectionList"),

  mFile: $("mFile"),
  mMagic: $("mMagic"),
  mVersion: $("mVersion"),
  mSections: $("mSections"),
  mFileSize: $("mFileSize"),
  mCell: $("mCell"),
  mBaseline: $("mBaseline"),
  mEncoding: $("mEncoding"),
  mMapped: $("mMapped"),
  quickInfo: $("quickInfo"),

  templateName: $("templateName"),
  fontFile: $("fontFile"),
  fontFace: $("fontFace"),
  fontSize: $("fontSize"),
  pickCharList: $("pickCharList"),
  charListFile: $("charListFile"),
  charListMeta: $("charListMeta"),
  charListText: $("charListText"),

  encoding: $("encoding"),
  widthType: $("widthType"),
  fixedWidth: $("fixedWidth"),
  linefeed: $("linefeed"),
  left: $("left"),
  width: $("width"),
  right: $("right"),
  alternateChar: $("alternateChar"),
  glyphCrop: $("glyphCrop"),

  buildDownload: $("buildDownload"),
  resetOptional: $("resetOptional"),
  buildLog: $("buildLog"),
};

init();

function init() {
  bindEvents();
  refreshCharStats();
  toggleFixedWidth();
  loadDefaultCharList();
}

async function loadDefaultCharList() {
  try {
    const fallbackB64 = window.BRFNA_DEFAULT_CHARLIST_B64;
    if (!fallbackB64) {
      return;
    }
    if (String(ui.charListText.value || "").trim().length > 0) {
      return;
    }

    ui.charListText.value = decodeBase64Utf8(fallbackB64);
    refreshCharStats();
    writeBuildLog("Default char list loaded from bundled data.");
  } catch {
    // Keep silent fallback: empty char list is still valid UI state.
  }
}

function decodeBase64Utf8(base64Text) {
  const binary = atob(base64Text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder("utf-8").decode(bytes);
}

async function readCharacterListFileText(file) {
  const arrayBuffer = await file.arrayBuffer();
  return decodeCharacterListBuffer(new Uint8Array(arrayBuffer));
}

function countReplacementChars(text) {
  let count = 0;
  for (const ch of text) {
    if (ch === "\uFFFD") {
      count += 1;
    }
  }
  return count;
}

function hasUtf8Bom(bytes) {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
}

function hasUtf16LeBom(bytes) {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe;
}

function hasUtf16BeBom(bytes) {
  return bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff;
}

function swap16Copy(bytes) {
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i += 2) {
    if (i + 1 < bytes.length) {
      out[i] = bytes[i + 1];
      out[i + 1] = bytes[i];
    } else {
      out[i] = bytes[i];
    }
  }
  return out;
}

function decodeCharacterListBuffer(bytes) {
  if (!(bytes instanceof Uint8Array)) {
    throw new Error("Character list input must be Uint8Array.");
  }
  if (bytes.length === 0) {
    return "";
  }

  if (hasUtf8Bom(bytes)) {
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  }
  if (hasUtf16LeBom(bytes)) {
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  }
  if (hasUtf16BeBom(bytes)) {
    return new TextDecoder("utf-16le").decode(swap16Copy(bytes.subarray(2)));
  }

  const utf8Text = new TextDecoder("utf-8").decode(bytes);
  const utf8Errors = countReplacementChars(utf8Text);
  if (utf8Errors === 0) {
    return utf8Text;
  }

  const utf16leText = new TextDecoder("utf-16le").decode(bytes);
  const utf16leErrors = countReplacementChars(utf16leText);
  return utf16leErrors < utf8Errors ? utf16leText : utf8Text;
}

function bindEvents() {
  window.addEventListener("dragover", (event) => event.preventDefault());

  ui.pickBrfna.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    ui.fileBrfna.click();
  });

  ui.dropBrfna.addEventListener("click", (event) => {
    if (event.target !== event.currentTarget) return;
    ui.fileBrfna.click();
  });

  ui.dropBrfna.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      ui.fileBrfna.click();
    }
  });

  ui.dropBrfna.addEventListener("dragover", (event) => {
    event.preventDefault();
    ui.dropBrfna.classList.add("drag");
  });

  ui.dropBrfna.addEventListener("dragleave", () => ui.dropBrfna.classList.remove("drag"));

  ui.dropBrfna.addEventListener("drop", (event) => {
    event.preventDefault();
    ui.dropBrfna.classList.remove("drag");
    const file = event.dataTransfer && event.dataTransfer.files ? event.dataTransfer.files[0] : null;
    if (file) loadTemplate(file);
  });

  ui.fileBrfna.addEventListener("change", () => {
    const file = ui.fileBrfna.files && ui.fileBrfna.files[0] ? ui.fileBrfna.files[0] : null;
    if (file) loadTemplate(file);
  });

  ui.applyToBuilder.addEventListener("click", applyTemplateToBuilder);
  ui.downloadPreview.addEventListener("click", downloadTemplatePreview);

  ui.copyInfoJson.addEventListener("click", async () => {
    if (!state.templateInfo) return;
    await copyToClipboard(JSON.stringify(state.templateInfo.summary, null, 2));
    setStatus("Template info JSON copied.", "ok");
  });

  ui.pickCharList.addEventListener("click", (event) => {
    event.preventDefault();
    ui.charListFile.click();
  });

  ui.charListFile.addEventListener("change", async () => {
    const file = ui.charListFile.files && ui.charListFile.files[0] ? ui.charListFile.files[0] : null;
    if (!file) return;
    try {
      ui.charListText.value = await readCharacterListFileText(file);
      refreshCharStats();
      setStatus("Character list loaded: " + file.name, "ok");
    } catch (error) {
      setStatus("Failed to read character list: " + errorText(error), "err");
    } finally {
      ui.charListFile.value = "";
    }
  });

  ui.charListText.addEventListener("input", refreshCharStats);
  ui.widthType.addEventListener("change", toggleFixedWidth);

  ui.resetOptional.addEventListener("click", () => {
    ui.encoding.value = "";
    ui.widthType.value = "char";
    ui.fixedWidth.value = "";
    ui.linefeed.value = "";
    ui.left.value = "";
    ui.width.value = "";
    ui.right.value = "0";
    ui.alternateChar.value = "";
    ui.glyphCrop.checked = true;
    toggleFixedWidth();
  });

  ui.buildDownload.addEventListener("click", async () => {
    await buildAndDownload();
  });
}

async function loadTemplate(file) {
  setStatus("Parsing " + file.name + " ...", "warn");
  try {
    const arrayBuffer = await file.arrayBuffer();
    const parsed = parseTemplate(arrayBuffer, file.name);

    state.templateFile = file;
    state.templateBuffer = arrayBuffer;
    state.templateInfo = parsed;

    renderSummary(parsed);
    renderSections(parsed);

    ui.templateName.value = file.name;
    ui.downloadPreview.disabled = false;
    ui.applyToBuilder.disabled = false;
    ui.copyInfoJson.disabled = false;
    ui.buildDownload.disabled = false;

    setStatus("Parsed " + file.name + " (" + fmt(parsed.header.actualFileSize) + " bytes).", "ok");
    writeBuildLog("Template loaded. Output filename is always the same as template filename.");
  } catch (error) {
    state.templateFile = null;
    state.templateBuffer = null;
    state.templateInfo = null;
    renderSummary(null);
    renderSections(null);
    ui.templateName.value = "";
    ui.downloadPreview.disabled = true;
    ui.applyToBuilder.disabled = true;
    ui.copyInfoJson.disabled = true;
    ui.buildDownload.disabled = true;
    setStatus("Template parse failed: " + errorText(error), "err");
    writeBuildLog("Template parse failed.");
  } finally {
    ui.fileBrfna.value = "";
  }
}

function parseTemplate(arrayBuffer, fileName) {
  const view = new DataView(arrayBuffer);
  const bytes = new Uint8Array(arrayBuffer);
  if (view.byteLength < HEADER_SIZE) throw new Error("File too small.");

  const magic = readAscii(bytes, 0, 4);
  if (magic !== "RFNA") throw new Error("Unsupported magic: " + magic);

  const header = {
    magic: magic,
    bom: readU16(view, 4),
    version: readU16(view, 6),
    declaredFileSize: readU32(view, 8),
    headerSize: readU16(view, 12),
    sectionCount: readU16(view, 14),
    actualFileSize: view.byteLength,
  };

  if (header.headerSize < HEADER_SIZE || header.headerSize > view.byteLength) {
    throw new Error("Invalid header size.");
  }
  if (header.bom !== 0xfeff) {
    throw new Error(
      "Unsupported BOM 0x" + header.bom.toString(16).toUpperCase() + " (expected FEFF)",
    );
  }

  const sections = [];
  let cursor = header.headerSize;
  for (let i = 0; i < header.sectionCount; i += 1) {
    if (cursor + SECTION_HEADER_SIZE > view.byteLength) throw new Error("Section header out of range.");
    const id = readAscii(bytes, cursor, 4);
    const size = readU32(view, cursor + 4);
    if (size < SECTION_HEADER_SIZE) throw new Error("Invalid section size.");
    const end = cursor + size;
    if (end > view.byteLength) throw new Error("Section exceeds file bounds.");
    sections.push({
      index: i,
      id: id,
      offset: cursor,
      size: size,
      payloadOffset: cursor + SECTION_HEADER_SIZE,
      payloadSize: size - SECTION_HEADER_SIZE,
    });
    cursor = end;
  }
  const sectionTableEndOffset = cursor;
  const trailingData = cursor < bytes.length ? bytes.slice(cursor) : new Uint8Array(0);

  const findSection = (id) => sections.find((section) => section.id === id) || null;
  const finfSection = findSection("FINF");
  const tglpSection = findSection("TGLP");
  const cwdhSection = findSection("CWDH");
  const glgrSection = findSection("GLGR");
  const cmapSections = sections.filter((section) => section.id === "CMAP");

  if (!finfSection || !tglpSection || !cwdhSection || cmapSections.length === 0) {
    throw new Error("Template must include FINF, TGLP, CWDH and CMAP.");
  }

  const finf = parseFinf(view, finfSection);
  const tglp = parseTglp(view, tglpSection);
  const cwdh = parseCwdh(view, cwdhSection);
  const glgr = glgrSection ? parseGlgr(view, glgrSection) : null;
  const cmap = parseCmapList(view, cmapSections);

  return {
    fileName: fileName,
    header: header,
    sections: sections,
    sectionTableEndOffset: sectionTableEndOffset,
    trailingData: trailingData,
    finf: finf,
    tglp: tglp,
    cwdh: cwdh,
    glgr: glgr,
    cmap: cmap,
    summary: {
      fileName: fileName,
      header: header,
      sectionTableEndOffset: sectionTableEndOffset,
      trailingDataSize: trailingData.length,
      finf: finf,
      tglp: tglp,
      cwdh: { startIndex: cwdh.startIndex, endIndex: cwdh.endIndex, glyphCount: cwdh.glyphCount },
      glgr: glgr,
      cmap: cmap.map((entry) => ({
        sectionIndex: entry.sectionIndex,
        codeBegin: entry.codeBegin,
        codeEnd: entry.codeEnd,
        mappingMethod: entry.mappingMethod,
        mappingName: entry.mappingName,
        scanPairCapacity: entry.scanPairCapacity,
      })),
    },
  };
}

function parseFinf(view, section) {
  if (section.size < 32) throw new Error("FINF too small.");
  const base = section.offset;
  const encodingByte = readU8(view, base + 15);
  return {
    sectionIndex: section.index,
    sectionOffset: base,
    lineFeed: readU8(view, base + 9),
    alternateGlyphIndex: readU16(view, base + 10),
    defaultLeft: readI8(view, base + 12),
    defaultGlyphWidth: readU8(view, base + 13),
    defaultCharWidth: readU8(view, base + 14),
    encodingByte: encodingByte,
    encodingName: ENCODING_BYTE_TO_NAME[encodingByte] || ("unknown(" + encodingByte + ")"),
    lineFeed2: readU8(view, base + 28),
    widthByte: readU8(view, base + 29),
    baselineByte: readU8(view, base + 30),
  };
}

function parseTglp(view, section) {
  if (section.size < TGLP_HEADER_SIZE) throw new Error("TGLP too small.");
  const base = section.offset;
  const end = section.offset + section.size;
  const imageOffsetValue = readU32(view, base + 28);
  let imageDataLocalOffset = -1;
  if (imageOffsetValue >= base && imageOffsetValue < end) imageDataLocalOffset = imageOffsetValue - base;
  else if (imageOffsetValue >= SECTION_HEADER_SIZE && imageOffsetValue < section.size) imageDataLocalOffset = imageOffsetValue;
  else throw new Error("Cannot resolve TGLP image offset.");

  const sheetFormat = readU16(view, base + 18);
  const sheetFormatBase = sheetFormat & 0x7fff;
  const sheetFormatCompressed = (sheetFormat & 0x8000) !== 0;

  return {
    sectionIndex: section.index,
    sectionOffset: base,
    sectionSize: section.size,
    cellWidth: readU8(view, base + 8),
    cellHeight: readU8(view, base + 9),
    baselinePosition: readU8(view, base + 10),
    maxCharacterWidth: readU8(view, base + 11),
    sheetSize: readU32(view, base + 12),
    sheetNum: readU16(view, base + 16),
    sheetFormat: sheetFormat,
    sheetFormatBase: sheetFormatBase,
    sheetFormatCompressed: sheetFormatCompressed,
    sheetFormatName: formatTextureName(sheetFormatBase),
    sheetRow: readU16(view, base + 20),
    sheetLine: readU16(view, base + 22),
    sheetWidth: readU16(view, base + 24),
    sheetHeight: readU16(view, base + 26),
    imageOffsetValue: imageOffsetValue,
    imageDataLocalOffset: imageDataLocalOffset,
  };
}

function parseCwdh(view, section) {
  if (section.size < 16) throw new Error("CWDH too small.");
  const base = section.offset;
  const startIndex = readU16(view, base + 8);
  const endIndex = readU16(view, base + 10);
  if (endIndex < startIndex) throw new Error("Invalid CWDH range.");
  const glyphCount = endIndex - startIndex + 1;
  const entriesOffset = base + 16;
  const entriesSize = glyphCount * 3;
  if (entriesOffset + entriesSize > base + section.size) throw new Error("CWDH entries out of range.");

  const entries = [];
  for (let i = 0; i < glyphCount; i += 1) {
    const at = entriesOffset + i * 3;
    entries.push({
      index: startIndex + i,
      left: readI8(view, at),
      glyphWidth: readU8(view, at + 1),
      charWidth: readU8(view, at + 2),
    });
  }

  return {
    sectionIndex: section.index,
    sectionOffset: base,
    sectionSize: section.size,
    startIndex: startIndex,
    endIndex: endIndex,
    glyphCount: glyphCount,
    entriesOffset: entriesOffset,
    entries: entries,
  };
}

function parseGlgr(view, section) {
  if (section.size < 0x14) throw new Error("GLGR too small.");
  const base = section.offset;
  const groupCount = readU16(view, base + 0x0e);
  const chunkCount = readU16(view, base + 0x10);
  const tableOffset = base + align4(0x14 + groupCount * 2);
  const chunkSizes = [];
  for (let i = 0; i < chunkCount; i += 1) {
    const at = tableOffset + i * 4;
    if (at + 4 > base + section.size) break;
    chunkSizes.push(readU32(view, at));
  }
  return {
    sectionIndex: section.index,
    sectionOffset: base,
    sectionSize: section.size,
    groupCount: groupCount,
    chunkCount: chunkCount,
    tableOffset: tableOffset,
    chunkSizes: chunkSizes,
  };
}

function parseCmapList(view, sections) {
  return sections.map((section) => {
    if (section.size < 20) throw new Error("CMAP too small.");
    const base = section.offset;
    const codeBegin = readU16(view, base + 8);
    const codeEnd = readU16(view, base + 10);
    const mappingMethod = readU16(view, base + 12);
    const dataSize = Math.max(0, section.size - 20);
    const scanPairCapacity = dataSize >= 2 ? Math.floor((dataSize - 2) / 4) : 0;
    return {
      sectionIndex: section.index,
      sectionOffset: base,
      sectionSize: section.size,
      codeBegin: codeBegin,
      codeEnd: codeEnd,
      mappingMethod: mappingMethod,
      mappingName: mappingMethod === 0 ? "sequential" : mappingMethod === 1 ? "table" : mappingMethod === 2 ? "scan" : "unknown",
      scanPairCapacity: scanPairCapacity,
    };
  });
}

function renderSummary(parsed) {
  if (!parsed) {
    ui.mFile.textContent = "-";
    ui.mMagic.textContent = "-";
    ui.mVersion.textContent = "-";
    ui.mSections.textContent = "-";
    ui.mFileSize.textContent = "-";
    ui.mCell.textContent = "-";
    ui.mBaseline.textContent = "-";
    ui.mEncoding.textContent = "-";
    ui.mMapped.textContent = "-";
    ui.quickInfo.textContent = "No file parsed yet.";
    return;
  }

  ui.mFile.textContent = parsed.fileName;
  ui.mMagic.textContent = parsed.header.magic;
  ui.mVersion.textContent = "0x" + parsed.header.version.toString(16).toUpperCase() + " (" + parsed.header.version + ")";
  ui.mSections.textContent = fmt(parsed.sections.length);
  ui.mFileSize.textContent = fmt(parsed.header.actualFileSize) + " bytes";
  ui.mCell.textContent = parsed.tglp.cellWidth + " x " + parsed.tglp.cellHeight;
  ui.mBaseline.textContent = String(parsed.tglp.baselinePosition);
  ui.mEncoding.textContent = parsed.finf.encodingName;
  ui.mMapped.textContent = fmt(sumScanCapacity(parsed.cmap));

  ui.quickInfo.textContent =
    "TGLP sheets=" + parsed.tglp.sheetNum + ", sheet=" + parsed.tglp.sheetWidth + "x" + parsed.tglp.sheetHeight + "\n" +
    "TGLP format=" + parsed.tglp.sheetFormatName + (parsed.tglp.sheetFormatCompressed ? " (compressed)" : " (plain)") + ", raw=0x" + parsed.tglp.sheetFormat.toString(16).toUpperCase() + "\n" +
    "CWDH glyph range=" + parsed.cwdh.startIndex + ".." + parsed.cwdh.endIndex + " (" + parsed.cwdh.glyphCount + ")\n" +
    "CMAP sections=" + parsed.cmap.length + ", scan capacity=" + fmt(sumScanCapacity(parsed.cmap));
}

function renderSections(parsed) {
  ui.sectionList.innerHTML = "";
  if (!parsed) {
    ui.sectionList.innerHTML = '<div class="empty">Section details will appear here.</div>';
    return;
  }

  const cmapByIndex = new Map(parsed.cmap.map((entry) => [entry.sectionIndex, entry]));
  const fragment = document.createDocumentFragment();

  for (const section of parsed.sections) {
    const card = document.createElement("div");
    card.className = "item";

    const heading = document.createElement("div");
    heading.className = "i1";
    heading.innerHTML = "<span>" + String(section.index).padStart(2, "0") + " : " + section.id + "</span><span class=\"pill\">" + fmt(section.size) + " B</span>";

    const details = document.createElement("div");
    details.className = "i2";

    let extra = "";
    if (section.id === "FINF") extra = "encoding=" + parsed.finf.encodingName + ", linefeed=" + parsed.finf.lineFeed;
    else if (section.id === "TGLP") extra = "cell=" + parsed.tglp.cellWidth + "x" + parsed.tglp.cellHeight + ", baseline=" + parsed.tglp.baselinePosition;
    else if (section.id === "CWDH") extra = "glyphRange=" + parsed.cwdh.startIndex + ".." + parsed.cwdh.endIndex;
    else if (section.id === "CMAP") {
      const cmap = cmapByIndex.get(section.index);
      if (cmap) extra = "method=" + cmap.mappingName + ", scanCap=" + cmap.scanPairCapacity;
    }

    details.textContent = "offset=0x" + section.offset.toString(16).toUpperCase() + ", payload=0x" + section.payloadOffset.toString(16).toUpperCase() + "\n" + extra;

    card.appendChild(heading);
    card.appendChild(details);
    fragment.appendChild(card);
  }

  ui.sectionList.appendChild(fragment);
}

function applyTemplateToBuilder() {
  if (!state.templateInfo) return;
  const info = state.templateInfo;
  ui.templateName.value = info.fileName;
  if (!ui.encoding.value) ui.encoding.value = ENCODING_BYTE_TO_NAME[info.finf.encodingByte] || "";
  if (!ui.linefeed.value) ui.linefeed.value = String(info.finf.lineFeed);
  if (!ui.left.value) ui.left.value = String(info.finf.defaultLeft);
  if (!ui.width.value) ui.width.value = String(info.finf.defaultCharWidth);
  writeBuildLog("Applied template defaults to builder fields.");
}

function downloadTemplatePreview() {
  if (!state.templateInfo || !state.templateBuffer || !state.templateFile) {
    setStatus("Load a template BRFNA file first.", "err");
    return;
  }

  try {
    setStatus("Rendering preview image ...", "warn");
    const preview = buildTemplatePreviewCanvas(state.templateBuffer, state.templateInfo);
    const previewCanvas = preview.canvas;
    const sourceName = sanitizeName(state.templateFile.name || "font1.brfna");
    const stem = sourceName.replace(/\.[^.]+$/, "");
    const outputName = stem + "_preview.png";
    downloadCanvasAsPng(previewCanvas, outputName);
    setStatus("Preview downloaded: " + outputName, "ok");
    writeBuildLog(
      "Preview downloaded: " + outputName + "\n" +
      "Image=" + previewCanvas.width + "x" + previewCanvas.height + "\n" +
      "Mapped chars=" + fmt(preview.stats.mappedChars) + ", skipped=" + fmt(preview.stats.skippedChars) + "\n" +
      "Grid layout=" + preview.stats.gridLayoutMode +
      " (start=" + preview.stats.gridStartX + "," + preview.stats.gridStartY +
      ", pitch=" + preview.stats.gridPitchX + "x" + preview.stats.gridPitchY + ")\n" +
      "Overlay: source glyph cells + black grid + CWDH width line (below cell)",
    );
  } catch (error) {
    setStatus("Preview failed: " + errorText(error), "err");
  }
}

function buildTemplatePreviewCanvas(templateBuffer, templateInfo) {
  const tglp = templateInfo.tglp;
  const baseFormat = tglp.sheetFormatBase != null ? tglp.sheetFormatBase : (tglp.sheetFormat & 0x7fff);
  if (baseFormat !== 0) {
    throw new Error("Preview currently supports I4 templates only.");
  }

  const sheetGrayscaleBuffers = decodeTemplateSheetGrayscaleBuffers(templateBuffer, templateInfo);
  if (sheetGrayscaleBuffers.length === 0) {
    throw new Error("No TGLP sheet data found.");
  }

  const cmapPairs = collectCmapPairsForPreview(templateBuffer, templateInfo);
  const rendered = renderGlyphGridPreview(sheetGrayscaleBuffers, templateInfo, cmapPairs);
  const outCanvas = document.createElement("canvas");
  outCanvas.width = rendered.width;
  outCanvas.height = rendered.height;
  const outCtx = outCanvas.getContext("2d", { willReadFrequently: true });
  if (!outCtx) {
    throw new Error("Canvas unavailable.");
  }

  outCtx.putImageData(new ImageData(rendered.rgba, rendered.width, rendered.height), 0, 0);
  return { canvas: outCanvas, stats: rendered.stats };
}

function collectCmapPairsForPreview(templateBuffer, templateInfo) {
  const view = new DataView(templateBuffer);
  const pairs = [];
  const seenCodePoints = new Set();

  const appendPair = (codePoint, glyphIndex) => {
    if (glyphIndex === 0xffff) {
      return;
    }
    if (seenCodePoints.has(codePoint)) {
      return;
    }
    seenCodePoints.add(codePoint);
    pairs.push({ codePoint, glyphIndex });
  };

  for (const cmap of templateInfo.cmap) {
    const base = cmap.sectionOffset;
    const end = base + cmap.sectionSize;
    if (end > view.byteLength || cmap.sectionSize < 20) {
      continue;
    }

    const codeBegin = readU16(view, base + 8);
    const codeEnd = readU16(view, base + 10);
    const mappingMethod = readU16(view, base + 12);
    const dataStart = base + 20;

    if (mappingMethod === 0) {
      if (dataStart + 4 > end || codeEnd < codeBegin) {
        continue;
      }
      const directIndex = readU16(view, dataStart);
      for (let code = codeBegin; code <= codeEnd; code += 1) {
        const glyphIndex = directIndex + (code - codeBegin);
        appendPair(code, glyphIndex);
      }
      continue;
    }

    if (mappingMethod === 1) {
      if (codeEnd < codeBegin) {
        continue;
      }
      const count = codeEnd - codeBegin + 1;
      const tableBytes = count * 2;
      if (dataStart + tableBytes > end) {
        continue;
      }
      for (let i = 0; i < count; i += 1) {
        const glyphIndex = readU16(view, dataStart + i * 2);
        appendPair(codeBegin + i, glyphIndex);
      }
      continue;
    }

    if (mappingMethod === 2) {
      if (dataStart + 2 > end) {
        continue;
      }
      const pairCount = readU16(view, dataStart);
      const pairStart = dataStart + 2;
      const pairBytes = pairCount * 4;
      const safePairCount = pairStart + pairBytes <= end ? pairCount : Math.floor((end - pairStart) / 4);
      for (let i = 0; i < safePairCount; i += 1) {
        const at = pairStart + i * 4;
        if (at + 4 > end) {
          break;
        }
        const code = readU16(view, at);
        const glyphIndex = readU16(view, at + 2);
        appendPair(code, glyphIndex);
      }
    }
  }

  return pairs;
}

function renderGlyphGridPreview(sheetGrayscaleBuffers, templateInfo, cmapPairs) {
  const tglp = templateInfo.tglp;
  const cwdh = templateInfo.cwdh;
  const cellWidth = Math.max(1, tglp.cellWidth);
  const cellHeight = Math.max(1, tglp.cellHeight);
  const layout = resolveTemplateGlyphGridLayout(sheetGrayscaleBuffers, templateInfo);
  const startX = layout.startX;
  const startY = layout.startY;
  const pitchX = layout.pitchX;
  const pitchY = layout.pitchY;
  const glyphsPerSheet = Math.max(1, tglp.sheetRow * tglp.sheetLine);
  const glyphOrigin = cwdh.startIndex;
  const metricsByGlyphIndex = new Map(cwdh.entries.map((entry) => [entry.index, entry]));

  const items = [];
  let skippedChars = 0;
  for (const pair of cmapPairs) {
    const metric = metricsByGlyphIndex.get(pair.glyphIndex);
    if (!metric) {
      skippedChars += 1;
      continue;
    }

    const relative = pair.glyphIndex - glyphOrigin;
    if (relative < 0) {
      skippedChars += 1;
      continue;
    }

    const sheetIndex = Math.floor(relative / glyphsPerSheet);
    if (sheetIndex < 0 || sheetIndex >= sheetGrayscaleBuffers.length) {
      skippedChars += 1;
      continue;
    }

    const local = relative % glyphsPerSheet;
    const srcCol = local % tglp.sheetRow;
    const srcRow = Math.floor(local / tglp.sheetRow);
    const cellX = startX + srcCol * pitchX;
    const cellY = startY + srcRow * pitchY;
    if (cellX < 0 || cellY < 0 || cellX + cellWidth > tglp.sheetWidth || cellY + cellHeight > tglp.sheetHeight) {
      skippedChars += 1;
      continue;
    }

    const cellPixels = extractCellPixels(
      sheetGrayscaleBuffers[sheetIndex],
      tglp.sheetWidth,
      cellX,
      cellY,
      cellWidth,
      cellHeight,
    );
    items.push({
      pixels: cellPixels,
      left: metric.left,
      glyphWidth: metric.glyphWidth,
      charWidth: metric.charWidth,
    });
  }

  // Fallback: if CMAP parsing yields nothing, show raw glyph-index order.
  if (items.length === 0) {
    for (const entry of cwdh.entries) {
      const relative = entry.index - glyphOrigin;
      if (relative < 0) {
        continue;
      }
      const sheetIndex = Math.floor(relative / glyphsPerSheet);
      if (sheetIndex < 0 || sheetIndex >= sheetGrayscaleBuffers.length) {
        continue;
      }
      const local = relative % glyphsPerSheet;
      const srcCol = local % tglp.sheetRow;
      const srcRow = Math.floor(local / tglp.sheetRow);
      const cellX = startX + srcCol * pitchX;
      const cellY = startY + srcRow * pitchY;
      if (cellX < 0 || cellY < 0 || cellX + cellWidth > tglp.sheetWidth || cellY + cellHeight > tglp.sheetHeight) {
        continue;
      }
      const cellPixels = extractCellPixels(
        sheetGrayscaleBuffers[sheetIndex],
        tglp.sheetWidth,
        cellX,
        cellY,
        cellWidth,
        cellHeight,
      );
      items.push({
        pixels: cellPixels,
        left: entry.left,
        glyphWidth: entry.glyphWidth,
        charWidth: entry.charWidth,
      });
    }
  }

  const columns = 16;
  const rows = Math.max(1, Math.ceil(items.length / columns));
  const slotPadX = 4;
  const slotPadY = 3;
  const slotWidth = cellWidth + slotPadX;
  const slotHeight = cellHeight + slotPadY;
  const glyphOffsetX = Math.floor(slotPadX / 2);
  const glyphOffsetY = Math.floor(slotPadY / 2);
  const width = columns * slotWidth;
  const height = rows * slotHeight;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let at = 0; at < rgba.length; at += 4) {
    rgba[at] = 255;
    rgba[at + 1] = 255;
    rgba[at + 2] = 255;
    rgba[at + 3] = 255;
  }

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const dstCol = i % columns;
    const dstRow = Math.floor(i / columns);
    const dstX = dstCol * slotWidth + glyphOffsetX;
    const dstY = dstRow * slotHeight + glyphOffsetY;

    for (let y = 0; y < cellHeight; y += 1) {
      for (let x = 0; x < cellWidth; x += 1) {
        const v = item.pixels[y * cellWidth + x];
        if (v <= 0) {
          continue;
        }
        const at = ((dstY + y) * width + (dstX + x)) * 4;
        const g = 255 - v;
        rgba[at] = g;
        rgba[at + 1] = g;
        rgba[at + 2] = g;
      }
    }

    const left = clampInt(item.left, -128, 127);
    const charWidth = clampInt(item.charWidth, 0, 255);
    const rawStart = left;
    const rawEnd = left + charWidth;
    const clampedStart = clampInt(rawStart, 0, cellWidth);
    const clampedEnd = clampInt(rawEnd, 0, cellWidth);
    if (clampedEnd > clampedStart) {
      const lineStart = dstX + clampedStart;
      const lineY = clampInt(dstY + cellHeight, 0, height - 1);
      for (let x = lineStart; x < dstX + clampedEnd; x += 1) {
        const at = (lineY * width + x) * 4;
        rgba[at] = 255;
        rgba[at + 1] = 28;
        rgba[at + 2] = 28;
      }
    }
  }

  drawPreviewGridPixels(rgba, width, height, slotWidth, slotHeight);

  return {
    rgba,
    width,
    height,
    stats: {
      mappedChars: items.length,
      skippedChars,
      gridStartX: startX,
      gridStartY: startY,
      gridPitchX: pitchX,
      gridPitchY: pitchY,
      gridLayoutMode: layout.mode,
    },
  };
}

function resolveTemplateGlyphGridLayout(sheetGrayscaleBuffers, templateInfo) {
  const tglp = templateInfo.tglp;
  const cwdh = templateInfo.cwdh;
  const cellWidth = Math.max(1, tglp.cellWidth);
  const cellHeight = Math.max(1, tglp.cellHeight);
  const rowCount = Math.max(1, tglp.sheetRow);
  const lineCount = Math.max(1, tglp.sheetLine);
  const glyphsPerSheet = Math.max(1, rowCount * lineCount);
  const pitchX = Math.max(cellWidth, Math.floor(tglp.sheetWidth / rowCount));
  const pitchY = Math.max(cellHeight, Math.floor(tglp.sheetHeight / lineCount));

  const samples = cwdh.entries.slice(0, Math.min(512, cwdh.entries.length));

  const scoreLayout = (startX, startY) => {
    let total = 0;
    let count = 0;
    for (const entry of samples) {
      const relative = entry.index - cwdh.startIndex;
      if (relative < 0) continue;
      const sheetIndex = Math.floor(relative / glyphsPerSheet);
      if (sheetIndex < 0 || sheetIndex >= sheetGrayscaleBuffers.length) continue;
      const local = relative % glyphsPerSheet;
      const col = local % rowCount;
      const row = Math.floor(local / rowCount);
      const cellX = startX + col * pitchX;
      const cellY = startY + row * pitchY;
      if (cellX < 0 || cellY < 0 || cellX + cellWidth > tglp.sheetWidth || cellY + cellHeight > tglp.sheetHeight) {
        continue;
      }
      const sheet = sheetGrayscaleBuffers[sheetIndex];
      total += sumCellEdgeInk(sheet, tglp.sheetWidth, cellX, cellY, cellWidth, cellHeight);
      count += 1;
    }
    if (count === 0) return Number.POSITIVE_INFINITY;
    return total / count;
  };

  const maxStartX = Math.max(0, pitchX - cellWidth);
  const maxStartY = Math.max(0, pitchY - cellHeight);
  let spaced = {
    mode: "sheet-geometry",
    startX: 0,
    startY: 0,
    pitchX,
    pitchY,
    score: Number.POSITIVE_INFINITY,
  };

  for (let startX = 0; startX <= maxStartX; startX += 1) {
    for (let startY = 0; startY <= maxStartY; startY += 1) {
      const score = scoreLayout(startX, startY);
      if (score < spaced.score) {
        spaced = {
          mode: "sheet-geometry",
          startX,
          startY,
          pitchX,
          pitchY,
          score,
        };
      }
    }
  }

  return {
    mode: spaced.mode,
    startX: spaced.startX,
    startY: spaced.startY,
    pitchX: spaced.pitchX,
    pitchY: spaced.pitchY,
  };
}

function sumCellEdgeInk(sheetPixels, sheetWidth, cellX, cellY, cellWidth, cellHeight) {
  let sum = 0;
  const topRowAt = cellY * sheetWidth + cellX;
  const bottomRowAt = (cellY + cellHeight - 1) * sheetWidth + cellX;

  for (let x = 0; x < cellWidth; x += 1) {
    sum += sheetPixels[topRowAt + x];
    sum += sheetPixels[bottomRowAt + x];
  }

  for (let y = 0; y < cellHeight; y += 1) {
    const rowAt = (cellY + y) * sheetWidth + cellX;
    sum += sheetPixels[rowAt];
    sum += sheetPixels[rowAt + cellWidth - 1];
  }

  return sum;
}

function extractCellPixels(sheetPixels, sheetWidth, cellX, cellY, cellWidth, cellHeight) {
  const out = new Uint8Array(cellWidth * cellHeight);
  for (let y = 0; y < cellHeight; y += 1) {
    const srcAt = (cellY + y) * sheetWidth + cellX;
    const dstAt = y * cellWidth;
    out.set(sheetPixels.subarray(srcAt, srcAt + cellWidth), dstAt);
  }
  return out;
}

function drawPreviewGridPixels(rgba, width, height, cellWidth, cellHeight) {
  const r = 0;
  const g = 0;
  const b = 0;

  for (let x = 0; x <= width; x += cellWidth) {
    const drawX = Math.min(width - 1, x);
    for (let y = 0; y < height; y += 1) {
      const at = (y * width + drawX) * 4;
      rgba[at] = r;
      rgba[at + 1] = g;
      rgba[at + 2] = b;
    }
  }

  for (let y = 0; y <= height; y += cellHeight) {
    const drawY = Math.min(height - 1, y);
    for (let x = 0; x < width; x += 1) {
      const at = (drawY * width + x) * 4;
      rgba[at] = r;
      rgba[at + 1] = g;
      rgba[at + 2] = b;
    }
  }
}

function decodeTemplateSheetGrayscaleBuffers(templateBuffer, templateInfo) {
  const view = new DataView(templateBuffer);
  const bytes = new Uint8Array(templateBuffer);
  const tglp = templateInfo.tglp;
  const compressed = tglp.sheetFormatCompressed != null ? tglp.sheetFormatCompressed : ((tglp.sheetFormat & 0x8000) !== 0);
  const sectionEnd = tglp.sectionOffset + tglp.sectionSize;

  let cursor = tglp.sectionOffset + tglp.imageDataLocalOffset;
  const decodedSheets = [];
  for (let i = 0; i < tglp.sheetNum; i += 1) {
    if (cursor + 4 > sectionEnd) {
      throw new Error("TGLP chunk table is truncated at sheet " + i + ".");
    }
    const chunkSize = readU32(view, cursor);
    cursor += 4;
    if (chunkSize <= 0 || cursor + chunkSize > sectionEnd) {
      throw new Error("Invalid TGLP chunk size at sheet " + i + ": " + chunkSize);
    }

    const chunkData = bytes.slice(cursor, cursor + chunkSize);
    cursor += chunkSize;
    const raw = compressed ? decompressNitroHuffman8(chunkData) : chunkData;
    if (raw.length < tglp.sheetSize) {
      throw new Error(
        "Decoded TGLP sheet is too small at sheet " + i + ": " +
          raw.length +
          " < " +
          tglp.sheetSize,
      );
    }

    const rawSheet = raw.length === tglp.sheetSize ? raw : raw.subarray(0, tglp.sheetSize);
    decodedSheets.push(decodeI4(rawSheet, tglp.sheetWidth, tglp.sheetHeight));
  }

  return decodedSheets;
}


function downloadCanvasAsPng(canvas, fileName) {
  const link = document.createElement("a");
  link.href = canvas.toDataURL("image/png");
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function refreshCharStats() {
  const stats = parseCharacterList(ui.charListText.value || "");
  ui.charListMeta.textContent = fmt(stats.totalRaw) + " chars | unique BMP " + fmt(stats.uniqueBmp.length) + " | duplicates " + fmt(stats.duplicates) + " | non-BMP " + fmt(stats.nonBmp);
}

function toggleFixedWidth() {
  const enabled = ui.widthType.value === "fixed";
  ui.fixedWidth.disabled = !enabled;
  if (!enabled) ui.fixedWidth.value = "";
}

async function buildAndDownload() {
  if (!state.templateBuffer || !state.templateInfo || !state.templateFile) {
    setStatus("Load a template BRFNA file first.", "err");
    return;
  }

  const fontFile = ui.fontFile.files && ui.fontFile.files[0] ? ui.fontFile.files[0] : null;
  if (!fontFile) {
    setStatus("Select a font file (.ttf/.otf/.ttc).", "err");
    return;
  }

  const charStats = parseCharacterList(ui.charListText.value || "");
  if (charStats.uniqueBmp.length === 0) {
    setStatus("Character list is empty.", "err");
    return;
  }

  let alternateCodePoint = null;
  try {
    alternateCodePoint = parseAlternateInput(ui.alternateChar.value || "");
  } catch (error) {
    setStatus("Invalid alternate char: " + errorText(error), "err");
    return;
  }

  const options = {
    requestedFontSize: clampNumber(readNumber(ui.fontSize.value, 24), 1, 300),
    fontFaceHint: (ui.fontFace.value || "").trim(),
    encodingName: ui.encoding.value || "",
    widthType: ui.widthType.value || "char",
    fixedWidth: parseOptionalInt(ui.fixedWidth.value),
    lineFeed: parseOptionalInt(ui.linefeed.value),
    leftSpace: parseOptionalInt(ui.left.value),
    defaultWidth: parseOptionalInt(ui.width.value),
    rightSpace: parseOptionalInt(ui.right.value) || 0,
    alternateCodePoint,
    glyphCrop: !!ui.glyphCrop.checked,
  };

  setStatus("Building BRFNA in browser ...", "warn");

  let runtimeFont = null;
  try {
    runtimeFont = await loadRuntimeFont(fontFile, options.fontFaceHint);
    const built = buildFontFromTemplate(state.templateBuffer, state.templateInfo, runtimeFont, options, charStats.uniqueBmp);
    const outputName = sanitizeName(state.templateFile.name || "font1.brfna");
    downloadBytes(built.bytes, outputName);

    if (runtimeFont.engine === "opentype") {
      writeBuildLog("FontFace API rejected this font. Using OpenType fallback renderer.");
    }

    writeBuildLog(
      "Output: " + outputName + "\n" +
      "Requested size=" + options.requestedFontSize + ", effective=" + built.metrics.effectiveFontSize + ", fitScale=" + built.metrics.fitScale.toFixed(6) + "\n" +
      "Texture=" + built.metrics.textureFormat + (built.metrics.textureCompressed ? " compressed(nitro-huffman8)" : " plain") + "\n" +
      (built.metrics.compressionFallbackReason
        ? "Texture note: " + built.metrics.compressionFallbackReason + "\n"
        : "") +
      "Mapped glyphs=" + fmt(built.metrics.mappedGlyphCount) + " / " + fmt(built.metrics.glyphCapacity) + "\n" +
      "Skipped unsupported=" + fmt(built.metrics.skippedUnsupported || 0) + "\n" +
      "Truncated chars=" + fmt(built.metrics.truncatedCharacters)
    );

    setStatus("Build complete. Downloaded " + outputName + ".", "ok");
  } catch (error) {
    const rawMessage = errorText(error);
    const hint = /invalid font data/i.test(rawMessage)
      ? " Hint: try another TTF/OTF file, or check if the font file is corrupted."
      : "";
    const message = rawMessage + hint;
    setStatus("Build failed: " + message, "err");
    writeBuildLog("Build failed: " + message);
  } finally {
    if (runtimeFont) releaseRuntimeFont(runtimeFont);
  }
}

function buildFontFromTemplate(templateBuffer, templateInfo, runtimeFont, options, codePoints) {
  const templateBytes = new Uint8Array(templateBuffer);
  const workingBuffer = templateBuffer.slice(0);
  const workingBytes = new Uint8Array(workingBuffer);
  const view = new DataView(workingBuffer);

  const tglp = templateInfo.tglp;
  const cwdh = templateInfo.cwdh;
  const cmap = templateInfo.cmap;
  const finf = templateInfo.finf;

  const baseFormat = tglp.sheetFormatBase != null ? tglp.sheetFormatBase : (tglp.sheetFormat & 0x7fff);
  const templateCompressed = tglp.sheetFormatCompressed != null ? tglp.sheetFormatCompressed : ((tglp.sheetFormat & 0x8000) !== 0);
  if (baseFormat !== 0) {
    throw new Error(
      "Only I4 templates are supported. Current template format is " +
      formatTextureName(baseFormat) +
      " (0x" +
      baseFormat.toString(16).toUpperCase() +
      ").",
    );
  }

  const requestedFallbackCodePoint = options.alternateCodePoint != null ? options.alternateCodePoint : 0x003f;
  const { supportedCodePoints, skippedUnsupported } = filterRenderableCodePoints(runtimeFont, codePoints);
  if (supportedCodePoints.length === 0) {
    throw new Error("No renderable glyphs were found in the selected font for the provided character list.");
  }

  const supportedSet = new Set(supportedCodePoints);
  let fallbackCodePointForPlan = requestedFallbackCodePoint;
  if (!supportedSet.has(fallbackCodePointForPlan) && supportedCodePoints.length > 0) {
    fallbackCodePointForPlan = supportedCodePoints[0];
  }
  const mappedChars = supportedCodePoints.filter((cp) => cp !== fallbackCodePointForPlan);

  const glyphCapacity = cwdh.glyphCount;
  const requiredGlyphCount = mappedChars.length + 1;
  if (requiredGlyphCount > glyphCapacity) {
    throw new Error(
      "Character count (" +
        mappedChars.length +
        ") exceeds glyph capacity (" +
        Math.max(0, glyphCapacity - 1) +
        ").",
    );
  }
  const truncatedCharacters = 0;

  const glyphPlan = [{ glyphIndex: cwdh.startIndex, codePoint: fallbackCodePointForPlan }];
  for (let i = 0; i < mappedChars.length; i += 1) {
    glyphPlan.push({ glyphIndex: cwdh.startIndex + 1 + i, codePoint: mappedChars[i] });
  }

  const altMappedAt = mappedChars.indexOf(requestedFallbackCodePoint);
  const alternateGlyphIndex = altMappedAt >= 0 ? cwdh.startIndex + 1 + altMappedAt : cwdh.startIndex;

  const templateSheetGrayscaleBuffers = decodeTemplateSheetGrayscaleBuffers(templateBuffer, templateInfo);
  const templateGridLayout = resolveTemplateGlyphGridLayout(templateSheetGrayscaleBuffers, templateInfo);
  const fit = estimateFit(runtimeFont, options.requestedFontSize, glyphPlan, tglp, options.glyphCrop);
  const rendered = renderSheets(
    runtimeFont,
    fit.effectiveFontSize,
    glyphPlan,
    tglp,
    options,
    templateGridLayout,
  );

  const rawSheetChunkBuffers = rendered.sheetRawBuffers;
  const outputCompressed = false;
  const compressionFallbackReason = templateCompressed
    ? "Template compressed texture is converted to plain I4 by internal pipeline."
    : "";
  const runtimeTextureNote = compressionFallbackReason;
  const sheetChunkBuffers = rawSheetChunkBuffers;
  const outputSheetFormat = tglp.sheetFormat & 0x7fff;

  const originalTglpSectionBuffer = templateBytes.slice(
    tglp.sectionOffset,
    tglp.sectionOffset + tglp.sectionSize,
  );
  const rebuiltTglpSectionBuffer = buildTglpSectionBuffer(
    originalTglpSectionBuffer,
    tglp,
    sheetChunkBuffers,
    outputSheetFormat,
  );

  patchCwdh(view, cwdh, rendered.metricsByGlyphIndex);
  patchCmap(view, cmap, mappedChars, cwdh.startIndex);
  patchFinf(view, finf, tglp, options, alternateGlyphIndex);
  if (templateInfo.glgr) patchGlgr(view, templateInfo.glgr, sheetChunkBuffers);

  const sectionBuffers = collectSectionBuffers(workingBytes, templateInfo.sections);
  sectionBuffers[tglp.sectionIndex] = rebuiltTglpSectionBuffer;
  const rebuiltBytes = reassembleBrfna(templateBytes, templateInfo, sectionBuffers);

  return {
    bytes: rebuiltBytes,
    metrics: {
      fitScale: fit.fitScale,
      effectiveFontSize: fit.effectiveFontSize,
      glyphCapacity: glyphCapacity,
      mappedGlyphCount: mappedChars.length,
      truncatedCharacters: truncatedCharacters,
      skippedUnsupported: skippedUnsupported,
      textureFormat: formatTextureName(baseFormat),
      textureCompressed: outputCompressed,
      compressionFallbackReason: runtimeTextureNote,
      alternateGlyphIndex: alternateGlyphIndex,
    },
  };
}

function filterRenderableCodePoints(runtimeFont, codePoints) {
  const supported = [];
  let skippedUnsupported = 0;
  for (const cp of codePoints) {
    if (isCodePointRenderable(runtimeFont, cp)) {
      supported.push(cp);
    } else {
      skippedUnsupported += 1;
    }
  }
  return {
    supportedCodePoints: supported,
    skippedUnsupported,
  };
}

function isCodePointRenderable(runtimeFont, codePoint) {
  const openTypeFont = runtimeFont && runtimeFont.openTypeFont ? runtimeFont.openTypeFont : null;
  if (openTypeFont && typeof openTypeFont.charToGlyph === "function") {
    try {
      const glyph = openTypeFont.charToGlyph(String.fromCodePoint(codePoint));
      if (!glyph) {
        return false;
      }
      if (typeof glyph.index === "number") {
        return glyph.index !== 0 || codePoint === 0;
      }
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

function estimateFit(runtimeFont, requestedSize, glyphPlan, tglp, glyphCrop) {
  let maxWidth = 1;
  let maxHeight = 1;
  let maxAscent = 1;
  let maxDescent = 1;

  if (runtimeFont.engine === "opentype") {
    for (const glyph of glyphPlan) {
      const m = measureOpenTypeGlyph(runtimeFont.openTypeFont, glyph.codePoint, requestedSize);
      const ascent = Math.max(0, Number(m.ascent || 0));
      const descent = Math.max(0, Number(m.descent || 0));
      const width = Math.max(1, Number(m.width || 0));
      const height = Math.max(1, ascent + descent);
      maxWidth = Math.max(maxWidth, width);
      maxHeight = Math.max(maxHeight, height);
      maxAscent = Math.max(maxAscent, ascent || 1);
      maxDescent = Math.max(maxDescent, descent || 1);
    }
  } else {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas unavailable.");

    ctx.font = requestedSize + 'px "' + escapeFamily(runtimeFont.familyName) + '"';
    ctx.textBaseline = "alphabetic";

    for (const glyph of glyphPlan) {
      const m = measureNativeGlyph(ctx, glyph.codePoint);
      const ascent = Math.max(0, Number(m.ascent || 0));
      const descent = Math.max(0, Number(m.descent || 0));
      const width = Math.max(1, Number(m.width || 0));
      const height = Math.max(1, ascent + descent);
      maxWidth = Math.max(maxWidth, width);
      maxHeight = Math.max(maxHeight, height);
      maxAscent = Math.max(maxAscent, ascent || 1);
      maxDescent = Math.max(maxDescent, descent || 1);
    }
  }

  let fitScale = 1;
  if (glyphCrop) {
    fitScale = Math.min(fitScale, Math.max(1, tglp.cellWidth - 2) / maxWidth);
    fitScale = Math.min(fitScale, Math.max(1, tglp.cellHeight - 2) / maxHeight);
  } else {
    fitScale = Math.min(fitScale, Math.max(1, tglp.baselinePosition - 1) / maxAscent);
    fitScale = Math.min(fitScale, Math.max(1, tglp.cellHeight - tglp.baselinePosition - 1) / maxDescent);
  }

  fitScale = clampNumber(fitScale, 0.2, 1);
  const effectiveFontSize = Math.max(1, Math.floor(requestedSize * fitScale * 100) / 100);

  return { fitScale, effectiveFontSize };
}

function renderSheets(runtimeFont, effectiveFontSize, glyphPlan, tglp, options, gridLayout) {
  const glyphsPerSheet = tglp.sheetRow * tglp.sheetLine;
  const cellPitchX = gridLayout && Number.isInteger(gridLayout.pitchX)
    ? Math.max(tglp.cellWidth, gridLayout.pitchX)
    : tglp.cellWidth;
  const cellPitchY = gridLayout && Number.isInteger(gridLayout.pitchY)
    ? Math.max(tglp.cellHeight, gridLayout.pitchY)
    : tglp.cellHeight;
  const cellStartX = gridLayout && Number.isInteger(gridLayout.startX)
    ? Math.max(0, gridLayout.startX)
    : 0;
  const cellStartY = gridLayout && Number.isInteger(gridLayout.startY)
    ? Math.max(0, gridLayout.startY)
    : 0;
  const canvases = [];
  const contexts = [];

  for (let i = 0; i < tglp.sheetNum; i += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = tglp.sheetWidth;
    canvas.height = tglp.sheetHeight;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas unavailable.");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (runtimeFont.engine !== "opentype") {
      ctx.font = effectiveFontSize + 'px "' + escapeFamily(runtimeFont.familyName) + '"';
    }
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    ctx.fillStyle = "#fff";
    canvases.push(canvas);
    contexts.push(ctx);
  }

  const metricsByGlyphIndex = new Map();

  for (const glyph of glyphPlan) {
    const relative = glyph.glyphIndex - glyphPlan[0].glyphIndex;
    const sheetIndex = Math.floor(relative / glyphsPerSheet);
    if (sheetIndex < 0 || sheetIndex >= tglp.sheetNum) continue;

    const local = relative % glyphsPerSheet;
    const col = local % tglp.sheetRow;
    const row = Math.floor(local / tglp.sheetRow);
    const originX = cellStartX + col * cellPitchX;
    const originY = cellStartY + row * cellPitchY;
    if (
      originX < 0 ||
      originY < 0 ||
      originX + tglp.cellWidth > tglp.sheetWidth ||
      originY + tglp.cellHeight > tglp.sheetHeight
    ) {
      continue;
    }
    const ctx = contexts[sheetIndex];

    const measuredGlyph = measureGlyph(runtimeFont, ctx, glyph.codePoint, effectiveFontSize);
    const advance = Math.max(0, Math.round(measuredGlyph.advanceWidth || 0));
    let drawX = originX + 1;
    let drawY = originY + tglp.baselinePosition;

    let bbox = drawGlyphToCell(
      ctx,
      runtimeFont,
      glyph.codePoint,
      effectiveFontSize,
      originX,
      originY,
      tglp.cellWidth,
      tglp.cellHeight,
      drawX,
      drawY,
    );
    if (options.glyphCrop && bbox) {
      let shiftX = 0;
      let shiftY = 0;
      if (bbox.minX < 1) shiftX = 1 - bbox.minX;
      if (bbox.maxX + shiftX > tglp.cellWidth - 2) shiftX += (tglp.cellWidth - 2) - (bbox.maxX + shiftX);
      if (bbox.minY < 1) shiftY = 1 - bbox.minY;
      if (bbox.maxY + shiftY > tglp.cellHeight - 2) shiftY += (tglp.cellHeight - 2) - (bbox.maxY + shiftY);
      if (shiftX !== 0 || shiftY !== 0) {
        drawX += shiftX;
        drawY += shiftY;
        bbox = drawGlyphToCell(
          ctx,
          runtimeFont,
          glyph.codePoint,
          effectiveFontSize,
          originX,
          originY,
          tglp.cellWidth,
          tglp.cellHeight,
          drawX,
          drawY,
        );
      }
    }

    const measuredLeft = bbox ? bbox.minX - 1 : advance;
    const measuredGlyphWidth = bbox ? bbox.width : 0;
    const widthEntry = applyWidthPolicy({
      left: measuredLeft,
      glyphWidth: measuredGlyphWidth,
      advanceWidth: advance,
      measuredWidth: advance,
    }, options);

    metricsByGlyphIndex.set(glyph.glyphIndex, widthEntry);
  }

  const sheetRawBuffers = canvases.map((canvas) => {
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas unavailable.");
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const gray = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
      gray[p] = Math.round(data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114);
    }
    return encodeI4(gray, canvas.width, canvas.height);
  });

  return { metricsByGlyphIndex, sheetRawBuffers };
}

function measureGlyph(runtimeFont, ctx, codePoint, fontSize) {
  if (runtimeFont.engine === "opentype") {
    return measureOpenTypeGlyph(runtimeFont.openTypeFont, codePoint, fontSize);
  }
  return measureNativeGlyph(ctx, codePoint);
}

function measureNativeGlyph(ctx, codePoint) {
  const text = String.fromCodePoint(codePoint);
  const m = ctx.measureText(text);
  const ascent = Math.max(0, Number(m.actualBoundingBoxAscent || 0));
  const descent = Math.max(0, Number(m.actualBoundingBoxDescent || 0));
  const width = Math.max(Number(m.width || 0), Number(m.actualBoundingBoxLeft || 0) + Number(m.actualBoundingBoxRight || 0), 1);
  return { width, ascent, descent, advanceWidth: Number(m.width || 0), text };
}

function measureOpenTypeGlyph(openTypeFont, codePoint, fontSize) {
  const text = String.fromCodePoint(codePoint);
  const glyph = openTypeFont.charToGlyph(text);
  const unitsPerEm = Math.max(1, Number(openTypeFont.unitsPerEm || 1000));
  const scale = fontSize / unitsPerEm;
  const advance = Number(glyph && glyph.advanceWidth != null ? glyph.advanceWidth : 0) * scale;
  const bbox = glyph && typeof glyph.getBoundingBox === "function" ? glyph.getBoundingBox() : null;
  const x1 = bbox ? Number(bbox.x1 || 0) : 0;
  const y1 = bbox ? Number(bbox.y1 || 0) : 0;
  const x2 = bbox ? Number(bbox.x2 || 0) : 0;
  const y2 = bbox ? Number(bbox.y2 || 0) : 0;
  const width = Math.max(1, (x2 - x1) * scale, advance);
  const ascent = Math.max(0, y2 * scale);
  const descent = Math.max(0, -y1 * scale);
  return { width, ascent, descent, advanceWidth: Math.max(0, advance), text, glyph };
}

function drawGlyphToCell(ctx, runtimeFont, codePoint, fontSize, originX, originY, cellWidth, cellHeight, drawX, drawY) {
  if (runtimeFont.engine === "opentype") {
    const measured = measureOpenTypeGlyph(runtimeFont.openTypeFont, codePoint, fontSize);
    const glyph = measured.glyph;
    return drawAndScan(
      ctx,
      measured.text,
      originX,
      originY,
      cellWidth,
      cellHeight,
      drawX,
      drawY,
      () => {
        if (!glyph || typeof glyph.getPath !== "function") return;
        const path = glyph.getPath(drawX, drawY, fontSize);
        path.fill = "#fff";
        path.stroke = null;
        path.draw(ctx);
      },
    );
  }
  const text = String.fromCodePoint(codePoint);
  return drawAndScan(ctx, text, originX, originY, cellWidth, cellHeight, drawX, drawY);
}

function drawAndScan(ctx, text, originX, originY, cellWidth, cellHeight, drawX, drawY, customDraw) {
  ctx.fillStyle = "#000";
  ctx.fillRect(originX, originY, cellWidth, cellHeight);
  ctx.fillStyle = "#fff";
  if (typeof customDraw === "function") customDraw();
  else ctx.fillText(text, drawX, drawY);

  const data = ctx.getImageData(originX, originY, cellWidth, cellHeight).data;
  let minX = cellWidth;
  let minY = cellHeight;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < cellHeight; y += 1) {
    for (let x = 0; x < cellWidth; x += 1) {
      const at = (y * cellWidth + x) * 4;
      if (data[at] > 8) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

function buildTglpSectionBuffer(originalSectionBuffer, tglp, sheetChunkBuffers, outputSheetFormat) {
  if (!(originalSectionBuffer instanceof Uint8Array)) {
    throw new Error("buildTglpSectionBuffer expects Uint8Array.");
  }
  if (originalSectionBuffer.length < TGLP_HEADER_SIZE) {
    throw new Error("TGLP section is too small.");
  }
  if (!Number.isInteger(tglp.imageDataLocalOffset) || tglp.imageDataLocalOffset < TGLP_HEADER_SIZE) {
    throw new Error("Invalid TGLP image offset.");
  }

  const finalSheetFormat = Number.isInteger(outputSheetFormat) ? outputSheetFormat : tglp.sheetFormat;
  const imagePayloadSize = sheetChunkBuffers.reduce((sum, chunk) => sum + 4 + chunk.length, 0);
  const requiredSize = tglp.imageDataLocalOffset + imagePayloadSize;
  const rebuiltSectionSize = align4(Math.max(originalSectionBuffer.length, requiredSize));

  const rebuiltSection = new Uint8Array(rebuiltSectionSize);
  const headerCopySize = Math.min(tglp.imageDataLocalOffset, originalSectionBuffer.length);
  rebuiltSection.set(originalSectionBuffer.subarray(0, headerCopySize), 0);

  const rebuiltView = new DataView(
    rebuiltSection.buffer,
    rebuiltSection.byteOffset,
    rebuiltSection.byteLength,
  );
  const originalView = new DataView(
    originalSectionBuffer.buffer,
    originalSectionBuffer.byteOffset,
    originalSectionBuffer.byteLength,
  );

  writeU32(rebuiltView, 4, rebuiltSectionSize);
  writeU8(rebuiltView, 8, clampInt(tglp.cellWidth, 0, 255));
  writeU8(rebuiltView, 9, clampInt(tglp.cellHeight, 0, 255));
  writeU8(rebuiltView, 10, clampInt(tglp.baselinePosition, 0, 255));
  writeU8(
    rebuiltView,
    11,
    clampInt(tglp.maxCharacterWidth != null ? tglp.maxCharacterWidth : tglp.cellWidth, 0, 255),
  );
  writeU32(rebuiltView, 12, tglp.sheetSize >>> 0);
  writeU16(rebuiltView, 16, clampInt(tglp.sheetNum, 0, 0xffff));
  writeU16(rebuiltView, 18, clampInt(finalSheetFormat, 0, 0xffff));
  writeU16(rebuiltView, 20, clampInt(tglp.sheetRow, 0, 0xffff));
  writeU16(rebuiltView, 22, clampInt(tglp.sheetLine, 0, 0xffff));
  writeU16(rebuiltView, 24, clampInt(tglp.sheetWidth, 0, 0xffff));
  writeU16(rebuiltView, 26, clampInt(tglp.sheetHeight, 0, 0xffff));

  const oldImagePointer = readU32(originalView, 28);
  const oldWasAbsolute =
    oldImagePointer >= tglp.sectionOffset &&
    oldImagePointer < tglp.sectionOffset + tglp.sectionSize;
  const newImagePointer = oldWasAbsolute
    ? tglp.sectionOffset + tglp.imageDataLocalOffset
    : tglp.imageDataLocalOffset;
  writeU32(rebuiltView, 28, newImagePointer >>> 0);

  let cursor = tglp.imageDataLocalOffset;
  for (const chunk of sheetChunkBuffers) {
    writeU32(rebuiltView, cursor, chunk.length >>> 0);
    cursor += 4;
    rebuiltSection.set(chunk, cursor);
    cursor += chunk.length;
  }

  return rebuiltSection;
}

function collectSectionBuffers(sourceBytes, sections) {
  if (!(sourceBytes instanceof Uint8Array)) {
    throw new Error("collectSectionBuffers expects Uint8Array.");
  }

  const sectionBuffers = new Array(sections.length);
  for (const section of sections) {
    const sectionEnd = section.offset + section.size;
    if (sectionEnd > sourceBytes.length) {
      throw new Error(
        "Section " +
          section.id +
          " exceeds file bounds while collecting buffers.",
      );
    }

    const buffer = sourceBytes.slice(section.offset, sectionEnd);
    if (buffer.length < SECTION_HEADER_SIZE) {
      throw new Error("Section " + section.id + " is too small.");
    }
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    writeU32(view, 4, buffer.length);
    sectionBuffers[section.index] = buffer;
  }

  return sectionBuffers;
}

function patchLinkedOffsets(sectionBuffers, sections, sectionOffsets) {
  const cwdhIndices = sections
    .filter((section) => section.id === "CWDH")
    .map((section) => section.index);
  for (let i = 0; i < cwdhIndices.length; i += 1) {
    const sectionIndex = cwdhIndices[i];
    const nextSectionIndex = cwdhIndices[i + 1];
    const nextOffset = nextSectionIndex === undefined ? 0 : sectionOffsets[nextSectionIndex] + 8;
    const cwdhView = new DataView(
      sectionBuffers[sectionIndex].buffer,
      sectionBuffers[sectionIndex].byteOffset,
      sectionBuffers[sectionIndex].byteLength,
    );
    writeU32(cwdhView, 12, nextOffset >>> 0);
  }

  const cmapIndices = sections
    .filter((section) => section.id === "CMAP")
    .map((section) => section.index);
  for (let i = 0; i < cmapIndices.length; i += 1) {
    const sectionIndex = cmapIndices[i];
    const nextSectionIndex = cmapIndices[i + 1];
    const nextOffset = nextSectionIndex === undefined ? 0 : sectionOffsets[nextSectionIndex] + 8;
    const cmapView = new DataView(
      sectionBuffers[sectionIndex].buffer,
      sectionBuffers[sectionIndex].byteOffset,
      sectionBuffers[sectionIndex].byteLength,
    );
    writeU32(cmapView, 16, nextOffset >>> 0);
  }

  const finfSection = sections.find((section) => section.id === "FINF");
  if (finfSection) {
    const finfBuffer = sectionBuffers[finfSection.index];
    if (!finfBuffer || finfBuffer.length < 32) {
      throw new Error("FINF section is too small to patch pointers.");
    }
    const finfView = new DataView(
      finfBuffer.buffer,
      finfBuffer.byteOffset,
      finfBuffer.byteLength,
    );
    const firstTglp = sections.find((section) => section.id === "TGLP");
    const firstCwdh = sections.find((section) => section.id === "CWDH");
    const firstCmap = sections.find((section) => section.id === "CMAP");
    writeU32(finfView, 16, firstTglp ? sectionOffsets[firstTglp.index] + 8 : 0);
    writeU32(finfView, 20, firstCwdh ? sectionOffsets[firstCwdh.index] + 8 : 0);
    writeU32(finfView, 24, firstCmap ? sectionOffsets[firstCmap.index] + 8 : 0);
  }

  const tglpSections = sections.filter((section) => section.id === "TGLP");
  for (const tglpSection of tglpSections) {
    const tglpBuffer = sectionBuffers[tglpSection.index];
    if (!tglpBuffer || tglpBuffer.length < 32) {
      throw new Error("TGLP section #" + tglpSection.index + " is too small to patch image pointer.");
    }
    const tglpView = new DataView(
      tglpBuffer.buffer,
      tglpBuffer.byteOffset,
      tglpBuffer.byteLength,
    );
    const oldValue = readU32(tglpView, 28);
    const oldWasAbsolute =
      oldValue >= tglpSection.offset &&
      oldValue < tglpSection.offset + tglpSection.size;
    const localValue = oldWasAbsolute ? oldValue - tglpSection.offset : oldValue;
    const newValue = oldWasAbsolute ? sectionOffsets[tglpSection.index] + localValue : localValue;
    writeU32(tglpView, 28, newValue >>> 0);
  }
}

function reassembleBrfna(templateBytes, templateInfo, sectionBuffers) {
  if (!(templateBytes instanceof Uint8Array)) {
    throw new Error("reassembleBrfna expects Uint8Array template bytes.");
  }
  if (!templateInfo || !templateInfo.header || !Array.isArray(templateInfo.sections)) {
    throw new Error("Template info is invalid.");
  }

  const headerSize = templateInfo.header.headerSize;
  const sections = templateInfo.sections;
  const sectionOffsets = new Array(sections.length);
  let cursor = headerSize;

  for (const section of sections) {
    const sectionBuffer = sectionBuffers[section.index];
    if (!(sectionBuffer instanceof Uint8Array)) {
      throw new Error("Missing section buffer at index " + section.index + ".");
    }
    if (sectionBuffer.length < SECTION_HEADER_SIZE) {
      throw new Error("Section buffer at index " + section.index + " is too small.");
    }

    const sectionId = readAscii(sectionBuffer, 0, 4);
    if (sectionId !== section.id) {
      throw new Error(
        "Section ID mismatch at index " +
          section.index +
          ": expected=" +
          section.id +
          ", actual=" +
          sectionId,
      );
    }

    const sectionView = new DataView(
      sectionBuffer.buffer,
      sectionBuffer.byteOffset,
      sectionBuffer.byteLength,
    );
    writeU32(sectionView, 4, sectionBuffer.length);
    sectionOffsets[section.index] = cursor;
    cursor += sectionBuffer.length;
  }

  patchLinkedOffsets(sectionBuffers, sections, sectionOffsets);

  const trailingData = templateInfo.trailingData instanceof Uint8Array
    ? templateInfo.trailingData
    : new Uint8Array(0);
  const outputSize = cursor + trailingData.length;
  const output = new Uint8Array(outputSize);
  output.set(templateBytes.subarray(0, headerSize), 0);
  if (trailingData.length > 0) {
    output.set(trailingData, cursor);
  }

  const outputView = new DataView(output.buffer, output.byteOffset, output.byteLength);
  writeU32(outputView, 8, outputSize);
  writeU16(outputView, 14, sections.length);

  for (const section of sections) {
    output.set(sectionBuffers[section.index], sectionOffsets[section.index]);
  }

  return output;
}

function patchCwdh(view, cwdh, metricsByGlyphIndex) {
  for (let i = 0; i < cwdh.entries.length; i += 1) {
    const templateEntry = cwdh.entries[i];
    const next = metricsByGlyphIndex.get(templateEntry.index) || templateEntry;
    const at = cwdh.entriesOffset + i * 3;
    writeI8(view, at, clampInt(next.left, -128, 127));
    writeU8(view, at + 1, clampInt(next.glyphWidth, 0, 255));
    writeU8(view, at + 2, clampInt(next.charWidth, 0, 255));
  }
}

function patchCmap(view, cmapList, mappedChars, startIndex) {
  const pairs = mappedChars.map((cp, i) => ({ code: cp, glyphIndex: startIndex + 1 + i })).sort((a, b) => a.code - b.code);
  let cursor = 0;

  for (const cmap of cmapList) {
    const base = cmap.sectionOffset;
    const end = base + cmap.sectionSize;
    if (cmap.sectionSize < 22) {
      continue;
    }
    for (let i = base + 20; i < end; i += 1) writeU8(view, i, 0);

    const remaining = pairs.length - cursor;
    const writeCount = Math.max(0, Math.min(cmap.scanPairCapacity, remaining));
    const chunk = pairs.slice(cursor, cursor + writeCount);
    cursor += writeCount;

    if (chunk.length > 0) {
      writeU16(view, base + 8, chunk[0].code);
      writeU16(view, base + 10, chunk[chunk.length - 1].code);
      writeU16(view, base + 12, 2);
      writeU16(view, base + 20, chunk.length);
      let at = base + 22;
      for (const pair of chunk) {
        writeU16(view, at, pair.code);
        writeU16(view, at + 2, pair.glyphIndex);
        at += 4;
      }
    } else {
      writeU16(view, base + 8, 0);
      writeU16(view, base + 10, 0);
      writeU16(view, base + 12, 2);
      if (base + 22 <= end) writeU16(view, base + 20, 0);
    }
  }
}

function patchFinf(view, finf, tglp, options, alternateGlyphIndex) {
  const base = finf.sectionOffset;
  const lineFeed = options.lineFeed != null ? options.lineFeed : finf.lineFeed;
  const defaultLeft = options.leftSpace != null ? options.leftSpace : finf.defaultLeft;
  const defaultGlyphWidth = options.defaultWidth != null
    ? options.defaultWidth
    : (options.fixedWidth != null ? options.fixedWidth : finf.defaultGlyphWidth);
  const defaultCharWidth = options.defaultWidth != null
    ? options.defaultWidth
    : (options.fixedWidth != null ? options.fixedWidth : finf.defaultCharWidth);
  const encodingByte = options.encodingName && ENCODING_NAME_TO_BYTE[options.encodingName] != null ? ENCODING_NAME_TO_BYTE[options.encodingName] : finf.encodingByte;
  const lineFeed2 = options.lineFeed != null ? options.lineFeed : finf.lineFeed2;
  const widthByte = finf.widthByte != null ? finf.widthByte : tglp.cellWidth;
  const baselineByte = finf.baselineByte != null ? finf.baselineByte : tglp.baselinePosition;

  writeU8(view, base + 9, clampInt(lineFeed, 0, 255));
  writeU16(view, base + 10, clampInt(alternateGlyphIndex, 0, 0xffff));
  writeI8(view, base + 12, clampInt(defaultLeft, -128, 127));
  writeU8(view, base + 13, clampInt(defaultGlyphWidth, 0, 255));
  writeU8(view, base + 14, clampInt(defaultCharWidth, 0, 255));
  writeU8(view, base + 15, clampInt(encodingByte, 0, 255));
  writeU8(view, base + 28, clampInt(lineFeed2, 0, 255));
  writeU8(view, base + 29, clampInt(widthByte, 0, 255));
  writeU8(view, base + 30, clampInt(baselineByte, 0, 255));
}

function patchGlgr(view, glgr, sheetChunkBuffers) {
  if (glgr.chunkCount !== sheetChunkBuffers.length) {
    throw new Error(
      "GLGR chunk count mismatch: header=" + glgr.chunkCount + ", provided=" + sheetChunkBuffers.length,
    );
  }

  const tableSize = glgr.chunkCount * 4;
  const sectionEnd = glgr.sectionOffset + glgr.sectionSize;
  if (glgr.tableOffset + tableSize > sectionEnd) {
    throw new Error(
      "GLGR chunk-size table exceeds section bounds: offset=0x" +
        glgr.tableOffset.toString(16) +
        ", size=0x" +
        tableSize.toString(16) +
        ", sectionEnd=0x" +
        sectionEnd.toString(16),
    );
  }

  for (let i = 0; i < glgr.chunkCount; i += 1) {
    writeU32(view, glgr.tableOffset + i * 4, sheetChunkBuffers[i].length);
  }
}

function parseCharacterList(text) {
  const parsed = parseCharacterListText(text);
  const uniqueBmp = [];
  let nonBmp = 0;
  for (const ch of parsed.characters) {
    const cp = ch.codePointAt(0);
    if (cp > MAX_BMP) {
      nonBmp += 1;
      continue;
    }
    uniqueBmp.push(cp);
  }

  return {
    characters: parsed.characters,
    uniqueCount: parsed.uniqueCount,
    sourceLineCount: parsed.sourceLineCount,
    totalRaw: parsed.totalRaw,
    uniqueBmp,
    nonBmp,
    duplicates: parsed.duplicatesRemoved,
  };
}

function parseCharacterListText(text) {
  if (typeof text !== "string") {
    throw new Error("Character list text must be a string.");
  }

  let normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (normalized.charCodeAt(0) === 0xfeff) {
    normalized = normalized.slice(1);
  }

  const uniqueChars = new Set();
  let duplicatesRemoved = 0;
  let sourceLineCount = 0;
  let totalRaw = 0;

  for (const line of normalized.split("\n")) {
    if (line.length === 0) {
      continue;
    }
    sourceLineCount += 1;
    if (line.trim().toLowerCase() === "eof") {
      continue;
    }
    for (const ch of line) {
      totalRaw += 1;
      if (uniqueChars.has(ch)) {
        duplicatesRemoved += 1;
      } else {
        uniqueChars.add(ch);
      }
    }
  }

  const characters = [...uniqueChars].join("");
  return {
    characters,
    uniqueCount: uniqueChars.size,
    duplicatesRemoved,
    sourceLineCount,
    totalRaw,
  };
}

function parseAlternateInput(text) {
  const raw = String(text || "").trim();
  if (!raw) {
    return null;
  }
  if (raw.length === 1) {
    return raw.codePointAt(0);
  }

  let numeric = NaN;
  if (/^U\+[0-9a-fA-F]+$/.test(raw)) {
    numeric = Number.parseInt(raw.slice(2), 16);
  } else if (/^0x[0-9a-fA-F]+$/.test(raw)) {
    numeric = Number.parseInt(raw.slice(2), 16);
  } else if (/^[0-9]+$/.test(raw)) {
    numeric = Number.parseInt(raw, 10);
  }

  if (!Number.isInteger(numeric) || numeric < 0 || numeric > MAX_BMP) {
    throw new Error("alternate-char must be a BMP code point (0..0xFFFF). Got: " + text);
  }
  return numeric;
}

async function loadRuntimeFont(file, faceHint) {
  const unique = Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  const family = (faceHint && faceHint.trim() ? faceHint.trim() : "brfna_runtime") + "_" + unique;
  const data = await file.arrayBuffer();
  const fontType = detectFontType(file.name, file.type);
  const mimeType = fontType.mimeType;
  const formatHint = fontType.formatHint;

  let fontFace = null;
  let blobUrl = null;
  let styleElement = null;
  let arrayBufferError = null;
  let blobUrlError = null;
  let dataUrlError = null;
  let cssFontFaceError = null;
  let nativeFailure = null;

  try {
    fontFace = new FontFace(family, data);
    await fontFace.load();
  } catch (error) {
    arrayBufferError = error;
    try {
      const blob = new Blob([data], { type: mimeType });
      blobUrl = URL.createObjectURL(blob);
      fontFace = new FontFace(family, buildFontSrc(blobUrl, formatHint));
      await fontFace.load();
    } catch (secondError) {
      blobUrlError = secondError;
      try {
        const dataUrl = arrayBufferToDataUrl(data, mimeType);
        fontFace = new FontFace(family, buildFontSrc(dataUrl, formatHint));
        await fontFace.load();
      } catch (thirdError) {
        dataUrlError = thirdError;
        try {
          if (!blobUrl) {
            const blob = new Blob([data], { type: mimeType });
            blobUrl = URL.createObjectURL(blob);
          }

          styleElement = document.createElement("style");
          styleElement.textContent =
            `@font-face{font-family:"${escapeCssFontFamily(family)}";` +
            `src:${buildFontSrc(blobUrl, formatHint)};font-display:block;}`;
          document.head.appendChild(styleElement);

          const loadedFaces = await document.fonts.load(`16px "${escapeFamily(family)}"`, "A");
          if (!Array.isArray(loadedFaces) || loadedFaces.length === 0) {
            throw new Error("document.fonts.load returned no loaded faces");
          }
        } catch (fourthError) {
          cssFontFaceError = fourthError;
          if (styleElement) {
            styleElement.remove();
            styleElement = null;
          }
          if (blobUrl) {
            URL.revokeObjectURL(blobUrl);
            blobUrl = null;
          }
          nativeFailure = new Error(
            `Failed to load font "${file.name}" (type=${file.type || "unknown"}, mime=${mimeType}, format=${formatHint}). ` +
              `ArrayBuffer: ${errorText(arrayBufferError)} / ` +
              `BlobURL: ${errorText(blobUrlError)} / ` +
              `DataURL: ${errorText(dataUrlError)} / ` +
              `CSSFontFace: ${errorText(cssFontFaceError)}`,
          );
        }
      }
    }
  }

  if (fontFace || styleElement) {
    if (fontFace) {
      document.fonts.add(fontFace);
    }
    let supportOpenTypeFont = null;
    try {
      const openTypeApi = ensureOpenTypeLibrary();
      const parsed = openTypeApi.parse(data.slice(0));
      if (parsed && typeof parsed.charToGlyph === "function") {
        supportOpenTypeFont = parsed;
      }
    } catch {
      supportOpenTypeFont = null;
    }
    return { engine: "native", familyName: family, fontFace, blobUrl, styleElement, openTypeFont: supportOpenTypeFont };
  }

  try {
    const openTypeApi = ensureOpenTypeLibrary();
    const openTypeFont = openTypeApi.parse(data.slice(0));
    if (!openTypeFont || typeof openTypeFont.charToGlyph !== "function") {
      throw new Error("Parsed font object is invalid.");
    }
    return { engine: "opentype", familyName: family, fontFace: null, blobUrl: null, styleElement: null, openTypeFont };
  } catch (openTypeError) {
    const baseMessage = nativeFailure ? errorText(nativeFailure) : `Failed to load font "${file.name}" via browser FontFace API.`;
    throw new Error(baseMessage + " / OpenTypeParser: " + errorText(openTypeError));
  }
}

function releaseRuntimeFont(runtimeFont) {
  if (!runtimeFont || runtimeFont.engine === "opentype") {
    return;
  }
  if (runtimeFont.fontFace) {
    document.fonts.delete(runtimeFont.fontFace);
  }
  if (runtimeFont.styleElement) {
    runtimeFont.styleElement.remove();
  }
  if (runtimeFont.blobUrl) {
    URL.revokeObjectURL(runtimeFont.blobUrl);
  }
}

function ensureOpenTypeLibrary() {
  if (window.opentype && typeof window.opentype.parse === "function") {
    return window.opentype;
  }
  throw new Error("opentype.js is not loaded.");
}

function detectFontType(fileName, browserMimeType) {
  const normalizedMimeType = String(browserMimeType || "").toLowerCase();
  if (normalizedMimeType && normalizedMimeType !== "application/octet-stream") {
    return {
      mimeType: normalizedMimeType,
      formatHint: guessFormatHintFromName(fileName),
    };
  }

  const lowerName = String(fileName || "").toLowerCase();
  if (lowerName.endsWith(".ttf")) return { mimeType: "application/x-font-ttf", formatHint: "truetype" };
  if (lowerName.endsWith(".otf")) return { mimeType: "font/otf", formatHint: "opentype" };
  if (lowerName.endsWith(".ttc")) return { mimeType: "font/collection", formatHint: "truetype-collection" };
  if (lowerName.endsWith(".woff")) return { mimeType: "font/woff", formatHint: "woff" };
  if (lowerName.endsWith(".woff2")) return { mimeType: "font/woff2", formatHint: "woff2" };
  return { mimeType: "application/octet-stream", formatHint: "truetype" };
}

function arrayBufferToDataUrl(arrayBuffer, mimeType) {
  const bytes = new Uint8Array(arrayBuffer);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  const base64 = btoa(binary);
  return `data:${mimeType};base64,${base64}`;
}

function guessFormatHintFromName(fileName) {
  const lowerName = String(fileName || "").toLowerCase();
  if (lowerName.endsWith(".otf")) return "opentype";
  if (lowerName.endsWith(".ttc")) return "truetype-collection";
  if (lowerName.endsWith(".woff2")) return "woff2";
  if (lowerName.endsWith(".woff")) return "woff";
  return "truetype";
}

function buildFontSrc(url, formatHint) {
  return `url("${url}") format("${formatHint}")`;
}

function escapeCssFontFamily(name) {
  return String(name || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function applyWidthPolicy(metric, options) {
  const widthType = options.widthType || "char";
  const fixedWidth = options.fixedWidth;
  const defaultWidth = options.defaultWidth;
  const leftSpace = options.leftSpace;
  const rightSpace = options.rightSpace || 0;
  const advanceWidth = Math.max(0, Math.trunc(metric.advanceWidth != null ? metric.advanceWidth : (metric.measuredWidth || 0)));
  let left = 0;
  let glyphWidth = Math.max(0, Math.trunc(metric.glyphWidth != null ? metric.glyphWidth : 0));
  let charWidth = 0;

  if (widthType === "glyph") {
    left = 0;
    charWidth = glyphWidth;
  } else if (widthType === "keepsp") {
    if (glyphWidth > 0) {
      left = 0;
      charWidth = glyphWidth;
    } else {
      left = advanceWidth;
      charWidth = advanceWidth;
    }
  } else if (widthType === "fixed" && Number.isInteger(fixedWidth)) {
    const target = Math.max(0, Math.trunc(fixedWidth));
    if (glyphWidth > 0) {
      left = Math.floor((target - glyphWidth) / 2);
      charWidth = target;
    } else {
      left = target;
      charWidth = target;
    }
  } else {
    if (glyphWidth > 0) {
      left = Math.trunc(metric.left || 0);
      charWidth = advanceWidth;
    } else {
      left = advanceWidth;
      charWidth = advanceWidth;
    }
  }

  if (Number.isInteger(defaultWidth)) charWidth = defaultWidth;
  if (Number.isInteger(leftSpace)) left = leftSpace;
  if (!Number.isInteger(defaultWidth) && rightSpace !== 0) charWidth += Math.trunc(rightSpace);

  const minChar = left + glyphWidth;
  if (charWidth < minChar) charWidth = minChar;

  return {
    left: clampInt(left, -128, 127),
    glyphWidth: clampInt(glyphWidth, 0, 255),
    charWidth: clampInt(charWidth, 0, 255),
  };
}

function formatTextureName(baseFormat) {
  switch (baseFormat) {
    case 0: return "I4";
    case 1: return "I8";
    case 2: return "IA4";
    case 3: return "IA8";
    case 4: return "RGB565";
    case 5: return "RGB5A3";
    case 6: return "RGBA8";
    default: return "unknown(" + baseFormat + ")";
  }
}

class NitroHuffNode {
  constructor({ value = null, frequency = 0, left = null, right = null } = {}) {
    this.value = value;
    this.frequency = frequency;
    this.left = left;
    this.right = right;
  }

  get isLeaf() {
    return this.left === null && this.right === null;
  }
}

function buildNitroHuffmanTree(sourceBytes) {
  const frequencies = new Array(256).fill(0);
  for (let i = 0; i < sourceBytes.length; i += 1) {
    frequencies[sourceBytes[i]] += 1;
  }

  const queue = [];
  for (let value = 0; value < 256; value += 1) {
    const frequency = frequencies[value];
    if (frequency > 0) {
      queue.push(new NitroHuffNode({ value, frequency }));
    }
  }

  if (queue.length === 0) {
    throw new Error("Cannot compress empty buffer with NITRO Huffman.");
  }

  if (queue.length === 1) {
    const single = queue[0];
    const alt = single.value === 0 ? 1 : 0;
    queue.push(new NitroHuffNode({ value: alt, frequency: 1 }));
  }

  while (queue.length > 1) {
    queue.sort((a, b) => {
      if (a.frequency !== b.frequency) return a.frequency - b.frequency;
      if (a.isLeaf && b.isLeaf) return a.value - b.value;
      if (a.isLeaf) return -1;
      if (b.isLeaf) return 1;
      return 0;
    });

    const left = queue.shift();
    const right = queue.shift();
    queue.push(new NitroHuffNode({ frequency: left.frequency + right.frequency, left, right }));
  }

  return queue[0];
}

function generateNitroCodeTable(node, prefixBits, table) {
  if (node.isLeaf) {
    table[node.value] = prefixBits.length > 0 ? prefixBits.slice() : [0];
    return;
  }

  generateNitroCodeTable(node.left, [...prefixBits, 0], table);
  generateNitroCodeTable(node.right, [...prefixBits, 1], table);
}

function emitNitroTree(node, relOffset) {
  const treeData = [0, 0];

  if (node.left.isLeaf) treeData[0] |= 0x80;
  if (node.right.isLeaf) treeData[0] |= 0x40;

  if (node.left.isLeaf && node.right.isLeaf) {
    treeData[1] = node.left.value;
    treeData.push(node.right.value);
    return treeData;
  }

  treeData[0] |= Math.floor(relOffset / 2);

  if (node.left.isLeaf) {
    treeData[1] = node.left.value;
  } else {
    treeData.push(...emitNitroTree(node.left, relOffset + 2));
  }

  if (node.right.isLeaf) {
    treeData.push(node.right.value);
  } else {
    if (!node.left.isLeaf) {
      relOffset += treeData.length - 2;
    }
    treeData.push(...emitNitroTree(node.right, relOffset + 2));
  }

  return treeData;
}

function encodeNitroBitstream(sourceBytes, codeTable) {
  const output = [];
  let currentByte = 0;
  let currentBitCount = 0;

  for (let i = 0; i < sourceBytes.length; i += 1) {
    const bits = codeTable[sourceBytes[i]];
    if (!bits) {
      throw new Error("Missing Huffman code for byte: " + sourceBytes[i]);
    }

    for (let j = 0; j < bits.length; j += 1) {
      currentByte = (currentByte << 1) | bits[j];
      currentBitCount += 1;
      if (currentBitCount === 8) {
        output.push(currentByte);
        currentByte = 0;
        currentBitCount = 0;
      }
    }
  }

  if (currentBitCount !== 0) {
    output.push(currentByte << (8 - currentBitCount));
  }

  while (output.length % 4 !== 0) {
    output.push(0);
  }

  return Uint8Array.from(output);
}

function compressNitroHuffman8(sourceBytes) {
  if (!(sourceBytes instanceof Uint8Array)) {
    throw new Error("compressNitroHuffman8 expects Uint8Array.");
  }
  if (sourceBytes.length <= 0 || sourceBytes.length > 0xffffff) {
    throw new Error("NITRO Huffman input size must be in [1, 16777215], got " + sourceBytes.length);
  }

  const root = buildNitroHuffmanTree(sourceBytes);
  const codeTable = new Array(256);
  generateNitroCodeTable(root, [], codeTable);

  const treeData = emitNitroTree(root, 0);
  const treeDataSize = Math.floor(treeData.length / 2) - 1;
  if (treeDataSize < 0 || treeDataSize > 255) {
    throw new Error("NITRO Huffman tree is too large: treeDataSize=" + treeDataSize);
  }

  const bitstream = encodeNitroBitstream(sourceBytes, codeTable);
  const output = new Uint8Array(5 + treeData.length + bitstream.length);

  output[0] = 0x28;
  output[1] = sourceBytes.length & 0xff;
  output[2] = (sourceBytes.length >>> 8) & 0xff;
  output[3] = (sourceBytes.length >>> 16) & 0xff;
  output[4] = treeDataSize;
  output.set(Uint8Array.from(treeData), 5);
  output.set(bitstream, 5 + treeData.length);

  return output;
}

function decompressNitroHuffman8(chunkData) {
  if (!(chunkData instanceof Uint8Array)) {
    throw new Error("decompressNitroHuffman8 expects Uint8Array.");
  }
  if (chunkData.length < 8) {
    throw new Error("NITRO Huffman chunk is too small: " + chunkData.length + " bytes");
  }

  const method = chunkData[0];
  const methodClass = method & 0xf0;
  if (methodClass !== HUFFMAN_CLASS) {
    throw new Error(
      "Unsupported compressed chunk type 0x" +
        method.toString(16) +
        " (expected Huffman class 0x2*)",
    );
  }

  const methodBits = method & 0x0f;
  const decodeBits = methodBits === BRFNA_HUFFMAN_METHOD_QUIRK ? 8 : methodBits;
  if (decodeBits !== 8) {
    throw new Error(
      "Unsupported Huffman symbol width " +
        methodBits +
        " (decoded width " +
        decodeBits +
        "); only 8-bit output is supported",
    );
  }

  const outputSize = readUInt24LE(chunkData, 1);
  const treeSizeByte = chunkData[4];
  const treeBaseOffset = 4;
  const rootNodeOffset = treeBaseOffset + 1;
  const treeByteLength = (treeSizeByte + 1) * 2;
  const dataBitstreamOffset = treeBaseOffset + treeByteLength;
  if (dataBitstreamOffset > chunkData.length) {
    throw new Error(
      "Invalid compressed chunk tree size: tree end " +
        dataBitstreamOffset +
        " exceeds chunk size " +
        chunkData.length,
    );
  }

  const working = chunkData.slice();
  const swapOffset = getBitstreamSwapOffset(treeSizeByte);
  if (swapOffset < working.length) {
    swapWordsInPlace(working, swapOffset);
  }

  const output = new Uint8Array(outputSize);
  let outputCursor = 0;
  let sourceCursor = dataBitstreamOffset;
  let bitMask = 0;
  let currentByte = 0;
  let currentNodeOffset = rootNodeOffset;

  while (outputCursor < outputSize) {
    if (bitMask === 0) {
      if (sourceCursor >= working.length) {
        break;
      }
      currentByte = working[sourceCursor];
      sourceCursor += 1;
      bitMask = 0x80;
    }

    if (currentNodeOffset >= working.length) {
      throw new Error("Invalid NITRO Huffman node pointer: 0x" + currentNodeOffset.toString(16));
    }

    const bit = (currentByte & bitMask) !== 0 ? 1 : 0;
    bitMask >>>= 1;

    const nodeControl = working[currentNodeOffset];
    const offset = nodeControl & 0x3f;
    const child0Offset = (currentNodeOffset & ~1) + offset * 2 + 2;
    const childOffset = child0Offset + bit;
    if (childOffset >= dataBitstreamOffset) {
      throw new Error(
        "Invalid Huffman child pointer 0x" +
          childOffset.toString(16) +
          " (tree end: 0x" +
          dataBitstreamOffset.toString(16) +
          ")",
      );
    }

    const isLeaf = bit === 0 ? (nodeControl & 0x80) !== 0 : (nodeControl & 0x40) !== 0;
    if (isLeaf) {
      output[outputCursor] = working[childOffset];
      outputCursor += 1;
      currentNodeOffset = rootNodeOffset;
    } else {
      currentNodeOffset = childOffset;
    }
  }

  return output;
}

function decodeI4(sourceBytes, width, height) {
  if (width % 8 !== 0 || height % 8 !== 0) {
    throw new Error("I4 requires width/height multiple of 8.");
  }

  const expectedSize = (width * height) >> 1;
  if (sourceBytes.length < expectedSize) {
    throw new Error("I4 buffer is too small: " + sourceBytes.length + " < " + expectedSize);
  }

  const out = new Uint8Array(width * height);
  let inAt = 0;
  for (let ty = 0; ty < height; ty += 8) {
    for (let tx = 0; tx < width; tx += 8) {
      for (let y = 0; y < 8; y += 1) {
        const row = ty + y;
        for (let x = 0; x < 8; x += 2) {
          const packed = sourceBytes[inAt++];
          const c0 = tx + x;
          const c1 = tx + x + 1;
          out[row * width + c0] = ((packed >> 4) & 0x0f) * 17;
          out[row * width + c1] = (packed & 0x0f) * 17;
        }
      }
    }
  }

  return out;
}

function encodeI4(pixels, width, height) {
  if (width % 8 !== 0 || height % 8 !== 0) throw new Error("I4 requires width/height multiple of 8.");
  const out = new Uint8Array((width * height) >> 1);
  let outAt = 0;
  for (let ty = 0; ty < height; ty += 8) {
    for (let tx = 0; tx < width; tx += 8) {
      for (let y = 0; y < 8; y += 1) {
        const row = ty + y;
        for (let x = 0; x < 8; x += 2) {
          const c0 = tx + x;
          const c1 = tx + x + 1;
          out[outAt++] = ((pixels[row * width + c0] >> 4) << 4) | (pixels[row * width + c1] >> 4);
        }
      }
    }
  }
  return out;
}

function sumScanCapacity(cmap) {
  return cmap.reduce((sum, entry) => sum + entry.scanPairCapacity, 0);
}

function writeBuildLog(text) { ui.buildLog.textContent = text; }
function setStatus(text, tone) {
  ui.status.className = "status";
  if (tone) ui.status.classList.add(tone);
  ui.status.textContent = text;
}

function readAscii(bytes, offset, length) {
  if (offset < 0 || offset + length > bytes.length) throw new Error("Ascii read out of range.");
  let text = "";
  for (let i = 0; i < length; i += 1) {
    const c = bytes[offset + i];
    text += c >= 32 && c <= 126 ? String.fromCharCode(c) : ".";
  }
  return text;
}

function readUInt24LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function getBitstreamSwapOffset(treeSizeByte) {
  return (((treeSizeByte * 2 + 2) >> 2) + 1) * 4;
}

function swapWordsInPlace(bytes, startOffset) {
  for (let offset = startOffset; offset + 3 < bytes.length; offset += 4) {
    const b0 = bytes[offset];
    const b1 = bytes[offset + 1];
    const b2 = bytes[offset + 2];
    const b3 = bytes[offset + 3];
    bytes[offset] = b3;
    bytes[offset + 1] = b2;
    bytes[offset + 2] = b1;
    bytes[offset + 3] = b0;
  }
}

function readU8(view, offset) { return view.getUint8(offset); }
function readI8(view, offset) { return view.getInt8(offset); }
function readU16(view, offset) { return view.getUint16(offset, false); }
function readU32(view, offset) { return view.getUint32(offset, false); }

function writeU8(view, offset, value) { view.setUint8(offset, value); }
function writeI8(view, offset, value) { view.setInt8(offset, value); }
function writeU16(view, offset, value) { view.setUint16(offset, value, false); }
function writeU32(view, offset, value) { view.setUint32(offset, value, false); }

function align4(value) { return (value + 3) & ~3; }
function clampInt(value, min, max) { return Math.max(min, Math.min(max, Math.trunc(value))); }
function clampNumber(value, min, max) { return Math.max(min, Math.min(max, value)); }
function readNumber(text, fallback) { const n = Number.parseFloat(text); return Number.isFinite(n) ? n : fallback; }
function parseOptionalInt(text) {
  const s = String(text || "").trim();
  if (!s) return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}
function fmt(value) { return new Intl.NumberFormat("en-US").format(value); }
function errorText(error) { return error instanceof Error ? error.message : String(error); }
function sanitizeName(name) { return String(name || "output.brfna").replace(/[\\/:*?"<>|]/g, "_"); }
function escapeFamily(name) { return String(name || "").replace(/"/g, "\\\""); }

function downloadBytes(bytes, fileName) {
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  document.execCommand("copy");
  ta.remove();
}
