// Loon Build 988+ local encrypted initplayback transformer.
// Keeps the playback request and response on the selected YouTube route.

(function () {
  "use strict";

  const CONFIG_KEY = "YouTubeConfig";
  const ENCRYPTED_INNERTUBE_RESPONSE = 25;
  const MAX_RESPONSE_BYTES = 24 * 1024 * 1024;
  const MAX_CAPTION_LANGUAGE_CHARS = 32;

  function utf8Encode(value) {
    if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(value);
    const encoded = unescape(encodeURIComponent(value));
    return Uint8Array.from(encoded, (character) => character.charCodeAt(0));
  }

  function utf8Decode(bytes) {
    if (typeof TextDecoder !== "undefined") return new TextDecoder().decode(bytes);
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return decodeURIComponent(escape(binary));
  }

  const PAGEAD_MARKER = utf8Encode("pagead");
  const ADVIEW_MARKER = utf8Encode("adview");
  const GOOGLEADS_MARKER = utf8Encode("googleads");
  const YT_ADS_WEBVIEW_MARKER = utf8Encode("yt-ads-web-view-id");
  const INLINE_INJECTION_ENTRYPOINT_MARKER = utf8Encode("inline_injection_entrypoint_layout.eml");
  const SHOPPING_TIMELY_SHELF_MARKER = utf8Encode("shopping_timely_shelf.eml-fe");
  const PRODUCT_LOCATION_TIMELY_SHELF_MARKER = utf8Encode("PRODUCT_LOCATION_TIMELY_SHELF");

  function concatBytes(...chunks) {
    const length = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.length;
    }
    return result;
  }

  function equalBytes(left, right) {
    if (!left || !right || left.length !== right.length) return false;
    let difference = 0;
    for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
    return difference === 0;
  }

  function toBytes(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return null;
  }

  function decodeBase64(value) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    const lookup = Object.create(null);
    for (let index = 0; index < alphabet.length; index++) lookup[alphabet[index]] = index;
    const input = String(value).replace(/-/g, "+").replace(/_/g, "/").replace(/\s/g, "");
    const output = [];
    let buffer = 0;
    let bits = 0;
    for (const character of input) {
      if (character === "=") break;
      const decoded = lookup[character];
      if (decoded === undefined) throw new Error("Invalid base64 client key");
      buffer = (buffer << 6) | decoded;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        output.push((buffer >>> bits) & 0xff);
      }
    }
    return new Uint8Array(output);
  }

  function readProtoVarint(bytes, offset) {
    const start = offset;
    let value = 0;
    let multiplier = 1;
    for (let count = 0; count < 10 && offset < bytes.length; count++) {
      const byte = bytes[offset++];
      value += (byte & 0x7f) * multiplier;
      if ((byte & 0x80) === 0) return { value, start, end: offset };
      multiplier *= 128;
    }
    throw new Error(`Invalid protobuf varint at ${start}`);
  }

  function encodeProtoVarint(value) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid protobuf varint value");
    const output = [];
    do {
      let byte = value % 128;
      value = Math.floor(value / 128);
      if (value !== 0) byte |= 0x80;
      output.push(byte);
    } while (value !== 0);
    return new Uint8Array(output);
  }

  function parseProto(bytes) {
    const fields = [];
    let offset = 0;
    while (offset < bytes.length) {
      const start = offset;
      const tag = readProtoVarint(bytes, offset);
      offset = tag.end;
      const no = Math.floor(tag.value / 8);
      const wire = tag.value & 7;
      if (no < 1) throw new Error("Invalid protobuf field number");
      let value;
      if (wire === 0) {
        value = readProtoVarint(bytes, offset);
        offset = value.end;
      } else if (wire === 1) {
        offset += 8;
      } else if (wire === 2) {
        const length = readProtoVarint(bytes, offset);
        offset = length.end;
        const end = offset + length.value;
        if (!Number.isSafeInteger(end) || end > bytes.length) throw new Error(`Truncated protobuf field ${no}`);
        value = bytes.subarray(offset, end);
        offset = end;
      } else if (wire === 5) {
        offset += 4;
      } else {
        throw new Error(`Unsupported protobuf wire type ${wire}`);
      }
      if (offset > bytes.length) throw new Error(`Truncated protobuf field ${no}`);
      fields.push({ no, wire, value, raw: bytes.subarray(start, offset) });
    }
    return fields;
  }

  function encodeLengthDelimitedField(no, value) {
    return concatBytes(encodeProtoVarint(no * 8 + 2), encodeProtoVarint(value.length), value);
  }

  function encodeVarintField(no, value) {
    return concatBytes(encodeProtoVarint(no * 8), encodeProtoVarint(value));
  }

  function upsertLengthDelimitedFields(bytes, replacements) {
    const output = [];
    const replaced = new Set();
    for (const field of parseProto(bytes)) {
      if (field.wire === 2 && replacements.has(field.no)) {
        if (!replaced.has(field.no)) {
          output.push(encodeLengthDelimitedField(field.no, replacements.get(field.no)));
          replaced.add(field.no);
        }
      } else {
        output.push(field.raw);
      }
    }
    for (const [no, value] of replacements) {
      if (!replaced.has(no)) output.push(encodeLengthDelimitedField(no, value));
    }
    return concatBytes(...output);
  }

  function replaceLengthDelimitedFields(bytes, replacements) {
    const output = [];
    const replaced = new Set();
    for (const field of parseProto(bytes)) {
      if (field.wire === 2 && replacements.has(field.no) && !replaced.has(field.no)) {
        output.push(encodeLengthDelimitedField(field.no, replacements.get(field.no)));
        replaced.add(field.no);
      } else {
        output.push(field.raw);
      }
    }
    if (replaced.size !== replacements.size) throw new Error("Required encrypted response field is missing");
    return concatBytes(...output);
  }

  function containsBytes(bytes, needle) {
    outer: for (let index = 0; index <= bytes.length - needle.length; index++) {
      for (let offset = 0; offset < needle.length; offset++) {
        if (bytes[index + offset] !== needle[offset]) continue outer;
      }
      return true;
    }
    return false;
  }

  function rewriteLengthDelimitedField(bytes, no, rewriter) {
    const output = [];
    let changed = false;
    for (const field of parseProto(bytes)) {
      if (field.no === no && field.wire === 2) {
        const replacement = rewriter(field.value);
        if (replacement === null) {
          changed = true;
        } else if (!equalBytes(replacement, field.value)) {
          changed = true;
          output.push(encodeLengthDelimitedField(no, replacement));
        } else {
          output.push(field.raw);
        }
      } else {
        output.push(field.raw);
      }
    }
    return changed ? concatBytes(...output) : bytes;
  }

  function firstLengthDelimitedValue(bytes, no) {
    return parseProto(bytes).find((field) => field.no === no && field.wire === 2)?.value;
  }

  function containsRichItemAdSignal(bytes) {
    return containsBytes(bytes, PAGEAD_MARKER)
      || containsBytes(bytes, YT_ADS_WEBVIEW_MARKER)
      || containsBytes(bytes, INLINE_INJECTION_ENTRYPOINT_MARKER);
  }

  function containsStrongStandaloneAdSignal(bytes) {
    return (containsBytes(bytes, PAGEAD_MARKER) && containsBytes(bytes, YT_ADS_WEBVIEW_MARKER))
      || containsBytes(bytes, INLINE_INJECTION_ENTRYPOINT_MARKER);
  }

  function containsTimelyShoppingShelf(bytes) {
    return containsBytes(bytes, PRODUCT_LOCATION_TIMELY_SHELF_MARKER)
      || containsBytes(bytes, SHOPPING_TIMELY_SHELF_MARKER);
  }

  function isWatchNextChipRow(bytes) {
    try {
      const renderer = firstLengthDelimitedValue(bytes, 50195462);
      const content = renderer && firstLengthDelimitedValue(renderer, 5);
      const chipShelf = content && firstLengthDelimitedValue(content, 188360221);
      const chipContent = chipShelf && firstLengthDelimitedValue(chipShelf, 1);
      const chipList = chipContent && firstLengthDelimitedValue(chipContent, 90823135);
      if (!chipList) return false;
      return parseProto(chipList).filter((field) => (
        field.no === 1 && field.wire === 2
        && parseProto(field.value).some((child) => child.no === 91394224 && child.wire === 2)
      )).length >= 2;
    } catch (error) {
      return false;
    }
  }

  function isMoreVideosItemContainer(bytes) {
    try {
      const filterShelf = firstLengthDelimitedValue(bytes, 1);
      const content = filterShelf && firstLengthDelimitedValue(filterShelf, 188360221);
      const chipContent = content && firstLengthDelimitedValue(content, 1);
      const chipList = chipContent && firstLengthDelimitedValue(chipContent, 90823135);
      if (!chipList) return false;
      return parseProto(chipList).filter((field) => (
        field.no === 1 && field.wire === 2
        && parseProto(field.value).some((child) => child.no === 91394224 && child.wire === 2)
      )).length >= 2;
    } catch (error) {
      return false;
    }
  }

  function stripMoreVideosItemContainer(bytes) {
    if (!isMoreVideosItemContainer(bytes)) return { bytes, removed: 0 };
    const output = [];
    let removed = 0;
    for (const field of parseProto(bytes)) {
      const isAd = field.no === 2 && field.wire === 2 && containsBytes(field.value, PAGEAD_MARKER)
        && (containsBytes(field.value, ADVIEW_MARKER) || containsBytes(field.value, GOOGLEADS_MARKER));
      if (isAd) removed++;
      else output.push(field.raw);
    }
    return { bytes: removed ? concatBytes(...output) : bytes, removed };
  }

  function stripMoreVideosAds(bytes, depth = 0) {
    if (!containsBytes(bytes, PAGEAD_MARKER) || depth > 16) return { bytes, removed: 0 };
    let fields;
    try { fields = parseProto(bytes); } catch (error) { return { bytes, removed: 0 }; }
    const output = [];
    let removed = 0;
    let changed = false;
    for (const field of fields) {
      if (field.wire !== 2 || !containsBytes(field.value, PAGEAD_MARKER)) {
        output.push(field.raw);
        continue;
      }
      const result = field.no === 29209665
        ? stripMoreVideosItemContainer(field.value)
        : stripMoreVideosAds(field.value, depth + 1);
      removed += result.removed;
      changed ||= result.removed > 0;
      output.push(result.removed > 0 ? encodeLengthDelimitedField(field.no, result.bytes) : field.raw);
    }
    return { bytes: changed ? concatBytes(...output) : bytes, removed };
  }

  function stripItemSectionRichAds(bytes) {
    let fields;
    try { fields = parseProto(bytes); } catch (error) { return { bytes, removed: 0 }; }
    const output = [];
    let removed = 0;
    for (const field of fields) {
      if (field.no === 1 && field.wire === 2 && containsRichItemAdSignal(field.value)) removed++;
      else output.push(field.raw);
    }
    return { bytes: removed ? concatBytes(...output) : bytes, removed };
  }

  function stripCommentAreaAdRenderers(bytes, depth = 0) {
    if (!containsRichItemAdSignal(bytes) || depth > 16) return { bytes, removed: 0 };
    let fields;
    try { fields = parseProto(bytes); } catch (error) { return { bytes, removed: 0 }; }
    const output = [];
    let removed = 0;
    let changed = false;
    for (const field of fields) {
      if (field.wire !== 2 || !containsRichItemAdSignal(field.value)) {
        output.push(field.raw);
        continue;
      }
      if (field.no === 50195462) {
        const richItems = stripItemSectionRichAds(field.value);
        if (richItems.removed > 0) {
          removed += richItems.removed;
          changed = true;
          if (richItems.bytes.length) output.push(encodeLengthDelimitedField(field.no, richItems.bytes));
          continue;
        }
        if (isWatchNextChipRow(field.raw) || !containsStrongStandaloneAdSignal(field.value)) {
          output.push(field.raw);
          continue;
        }
        removed++;
        changed = true;
        continue;
      }
      const nested = stripCommentAreaAdRenderers(field.value, depth + 1);
      removed += nested.removed;
      changed ||= nested.removed > 0;
      output.push(nested.removed > 0 ? encodeLengthDelimitedField(field.no, nested.bytes) : field.raw);
    }
    return { bytes: changed ? concatBytes(...output) : bytes, removed };
  }

  function stripTimelyShoppingShelf(nextBytes) {
    if (!containsTimelyShoppingShelf(nextBytes)) return { bytes: nextBytes, removed: 0 };
    let nextFields;
    try { nextFields = parseProto(nextBytes); } catch (error) { return { bytes: nextBytes, removed: 0 }; }
    const nextOutput = [];
    let removed = 0;
    let changed = false;
    for (const nextField of nextFields) {
      if (nextField.no !== 14 || nextField.wire !== 2 || !containsTimelyShoppingShelf(nextField.value)) {
        nextOutput.push(nextField.raw);
        continue;
      }
      let frameworkFields;
      try { frameworkFields = parseProto(nextField.value); } catch (error) {
        nextOutput.push(nextField.raw);
        continue;
      }
      const frameworkOutput = [];
      let frameworkChanged = false;
      for (const frameworkField of frameworkFields) {
        if (frameworkField.no !== 78882851 || frameworkField.wire !== 2
            || !containsTimelyShoppingShelf(frameworkField.value)) {
          frameworkOutput.push(frameworkField.raw);
          continue;
        }
        let updateFields;
        try { updateFields = parseProto(frameworkField.value); } catch (error) {
          frameworkOutput.push(frameworkField.raw);
          continue;
        }
        const updateOutput = [];
        let updateChanged = false;
        for (const updateField of updateFields) {
          if (updateField.no === 42 && updateField.wire === 2 && containsTimelyShoppingShelf(updateField.value)) {
            removed++;
            updateChanged = true;
          } else {
            updateOutput.push(updateField.raw);
          }
        }
        frameworkChanged ||= updateChanged;
        frameworkOutput.push(updateChanged
          ? encodeLengthDelimitedField(frameworkField.no, concatBytes(...updateOutput))
          : frameworkField.raw);
      }
      changed ||= frameworkChanged;
      nextOutput.push(frameworkChanged
        ? encodeLengthDelimitedField(nextField.no, concatBytes(...frameworkOutput))
        : nextField.raw);
    }
    return { bytes: changed ? concatBytes(...nextOutput) : nextBytes, removed };
  }

  function stripNextResponseAds(nextBytes) {
    try {
      const ads = stripCommentAreaAdRenderers(nextBytes);
      const moreVideos = stripMoreVideosAds(ads.bytes);
      const shopping = stripTimelyShoppingShelf(moreVideos.bytes);
      return { bytes: shopping.bytes, removed: ads.removed + moreVideos.removed + shopping.removed };
    } catch (error) {
      console.log(`YouTube NextResponse was left unchanged: ${String(error)}`);
      return { bytes: nextBytes, removed: 0 };
    }
  }

  function enhancePlayabilityStatus(playabilityBytes) {
    const pictureInPictureAbility = concatBytes(encodeVarintField(1, 1), encodeVarintField(8, 1));
    return upsertLengthDelimitedFields(playabilityBytes, new Map([
      [11, encodeLengthDelimitedField(64657230, encodeVarintField(1, 1))],
      [21, encodeLengthDelimitedField(151635310, pictureInPictureAbility)],
    ]));
  }

  function normalizeCaptionLanguage(value) {
    const language = String(value || "").trim();
    if (!language || language.toLowerCase() === "off" || language.length > MAX_CAPTION_LANGUAGE_CHARS) return "off";
    if (["on", "true"].includes(language.toLowerCase())) return "zh-Hant";
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(language)) return "off";
    return { "zh-hant": "zh-Hant", "zh-hans": "zh-Hans", "zh-tw": "zh-TW", "zh-cn": "zh-CN" }[
      language.toLowerCase()
    ] || language;
  }

  function encodeStringField(no, value) {
    return encodeLengthDelimitedField(no, utf8Encode(value));
  }

  function captionTrackLanguage(trackBytes) {
    const language = parseProto(trackBytes).find((field) => field.no === 4 && field.wire === 2)?.value;
    return language ? utf8Decode(language) : "";
  }

  function captionTrackBaseUrl(trackBytes) {
    const baseUrl = parseProto(trackBytes).find((field) => field.no === 1 && field.wire === 2)?.value;
    return baseUrl ? utf8Decode(baseUrl) : "";
  }

  function buildEnhanceCaptionTrack(baseUrl, language) {
    const separator = baseUrl.includes("?") ? "&" : "?";
    const run = encodeStringField(1, `Enhance (${language})`);
    return concatBytes(
      encodeStringField(1, `${baseUrl}${separator}tlang=${encodeURIComponent(language)}`),
      encodeLengthDelimitedField(2, encodeLengthDelimitedField(1, run)),
      encodeStringField(3, `.${language}`),
      encodeStringField(4, language),
    );
  }

  function addCaptionTrackIndex(audioTrackBytes, captionTrackIndex) {
    const output = [];
    for (const field of parseProto(audioTrackBytes)) {
      if (![3, 4, 6, 7, 11].includes(field.no)) output.push(field.raw);
    }
    output.push(encodeLengthDelimitedField(2, encodeProtoVarint(captionTrackIndex)));
    output.push(encodeVarintField(11, 2));
    return concatBytes(...output);
  }

  function addEnhanceTrackToRenderer(rendererBytes, captionLanguage) {
    const language = normalizeCaptionLanguage(captionLanguage);
    if (language === "off") return { bytes: rendererBytes, added: false };
    const fields = parseProto(rendererBytes);
    const tracks = fields.filter((field) => field.no === 1 && field.wire === 2);
    if (!tracks.length) return { bytes: rendererBytes, added: false };
    if (tracks.some((track) => captionTrackLanguage(track.value).toLowerCase() === language.toLowerCase())) {
      return { bytes: rendererBytes, added: false };
    }
    let sourceIndex = tracks.findIndex((track) => captionTrackLanguage(track.value).toLowerCase() === "en");
    if (sourceIndex < 0) sourceIndex = 0;
    const baseUrl = captionTrackBaseUrl(tracks[sourceIndex].value);
    if (!baseUrl) return { bytes: rendererBytes, added: false };
    const output = [];
    for (const field of fields) {
      if (field.no === 2 && field.wire === 2) {
        output.push(encodeLengthDelimitedField(2, addCaptionTrackIndex(field.value, tracks.length)));
      } else if (field.no !== 6) {
        output.push(field.raw);
      }
    }
    output.push(encodeLengthDelimitedField(1, buildEnhanceCaptionTrack(baseUrl, language)));
    return { bytes: concatBytes(...output), added: true };
  }

  function addEnhanceCaptionTrack(captionsBytes, captionLanguage) {
    const language = normalizeCaptionLanguage(captionLanguage);
    if (language === "off") return { bytes: captionsBytes, added: false };
    let added = false;
    const bytes = rewriteLengthDelimitedField(captionsBytes, 51621377, (rendererBytes) => {
      const result = addEnhanceTrackToRenderer(rendererBytes, language);
      added ||= result.added;
      return result.bytes;
    });
    return { bytes, added };
  }

  function stripPlayerAds(playerBytes, captionLanguage) {
    const output = [];
    let removed = 0;
    let enhanced = false;
    for (const field of parseProto(playerBytes)) {
      if ((field.no === 7 || field.no === 68) && field.wire === 2) {
        removed++;
      } else if (field.no === 2 && field.wire === 2) {
        const replacement = enhancePlayabilityStatus(field.value);
        enhanced ||= !equalBytes(replacement, field.value);
        output.push(equalBytes(replacement, field.value) ? field.raw : encodeLengthDelimitedField(2, replacement));
      } else if (field.no === 9 && field.wire === 2) {
        const nestedFields = parseProto(field.value);
        const filtered = nestedFields.filter((nested) => nested.no !== 18);
        removed += nestedFields.length - filtered.length;
        output.push(filtered.length === nestedFields.length
          ? field.raw
          : encodeLengthDelimitedField(9, concatBytes(...filtered.map((nested) => nested.raw))));
      } else if (field.no === 10 && field.wire === 2) {
        const captions = addEnhanceCaptionTrack(field.value, captionLanguage);
        enhanced ||= captions.added;
        output.push(captions.added ? encodeLengthDelimitedField(10, captions.bytes) : field.raw);
      } else {
        output.push(field.raw);
      }
    }
    return { bytes: removed || enhanced ? concatBytes(...output) : playerBytes, removed, enhanced };
  }

  function stripOnesieResponseAds(clearBytes, captionLanguage) {
    const output = [];
    let removed = 0;
    let enhanced = 0;
    for (const field of parseProto(clearBytes)) {
      if (field.no !== 4 || field.wire !== 2) {
        output.push(field.raw);
        continue;
      }
      const bodyFields = parseProto(field.value);
      const isPlayerEnvelope = bodyFields.some((item) => item.no === 7 && item.wire === 0)
        && bodyFields.some((item) => item.no === 10 && item.wire === 0);
      if (!isPlayerEnvelope) {
        output.push(field.raw);
        continue;
      }
      const bodyOutput = [];
      let bodyRemoved = 0;
      let bodyEnhanced = 0;
      for (const bodyField of bodyFields) {
        if (bodyField.no === 2 && bodyField.wire === 2) {
          const result = stripPlayerAds(bodyField.value, captionLanguage);
          bodyRemoved += result.removed;
          bodyEnhanced += Number(result.enhanced);
          bodyOutput.push(result.removed || result.enhanced
            ? encodeLengthDelimitedField(bodyField.no, result.bytes) : bodyField.raw);
        } else if (bodyField.no === 3 && bodyField.wire === 2) {
          const result = stripNextResponseAds(bodyField.value);
          bodyRemoved += result.removed;
          bodyOutput.push(result.removed ? encodeLengthDelimitedField(bodyField.no, result.bytes) : bodyField.raw);
        } else {
          bodyOutput.push(bodyField.raw);
        }
      }
      removed += bodyRemoved;
      enhanced += bodyEnhanced;
      output.push(bodyRemoved || bodyEnhanced
        ? encodeLengthDelimitedField(4, concatBytes(...bodyOutput)) : field.raw);
    }
    return { bytes: removed || enhanced ? concatBytes(...output) : clearBytes, removed, enhanced };
  }

  function readUmpVarint(bytes, offset) {
    if (offset >= bytes.length) throw new Error("Truncated UMP varint");
    const first = bytes[offset];
    const size = first < 0x80 ? 1 : first < 0xc0 ? 2 : first < 0xe0 ? 3 : first < 0xf0 ? 4 : 5;
    if (offset + size > bytes.length) throw new Error("Truncated UMP varint");
    let value;
    if (size === 1) value = first;
    else if (size === 2) value = (first & 0x3f) + 64 * bytes[offset + 1];
    else if (size === 3) value = (first & 0x1f) + 32 * (bytes[offset + 1] + 256 * bytes[offset + 2]);
    else if (size === 4) value = (first & 0x0f) + 16 * (bytes[offset + 1] + 256 * (bytes[offset + 2] + 256 * bytes[offset + 3]));
    else value = new DataView(bytes.buffer, bytes.byteOffset + offset + 1, 4).getUint32(0, true);
    return { value, end: offset + size };
  }

  function encodeUmpVarint(value) {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) throw new Error("Invalid UMP varint value");
    if (value < 0x80) return new Uint8Array([value]);
    if (value < 0x4000) return new Uint8Array([(value & 0x3f) | 0x80, value >>> 6]);
    if (value < 0x200000) return new Uint8Array([(value & 0x1f) | 0xc0, (value >>> 5) & 0xff, value >>> 13]);
    if (value < 0x10000000) {
      return new Uint8Array([(value & 0x0f) | 0xe0, (value >>> 4) & 0xff, (value >>> 12) & 0xff, value >>> 20]);
    }
    const output = new Uint8Array(5);
    output[0] = 0xf0;
    new DataView(output.buffer).setUint32(1, value, true);
    return output;
  }

  function parseUmp(bytes) {
    const parts = [];
    let offset = 0;
    while (offset < bytes.length) {
      const type = readUmpVarint(bytes, offset);
      const length = readUmpVarint(bytes, type.end);
      const end = length.end + length.value;
      if (end > bytes.length) throw new Error("Truncated UMP part");
      parts.push({ type: type.value, data: bytes.subarray(length.end, end) });
      offset = end;
    }
    return parts;
  }

  function encodeUmp(parts) {
    return concatBytes(...parts.flatMap((part) => [
      encodeUmpVarint(part.type), encodeUmpVarint(part.data.length), part.data,
    ]));
  }

  function firstProtoField(fields, no, wire) {
    return fields.find((field) => field.no === no && field.wire === wire);
  }

  const SHA256_K = new Uint32Array([
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ]);

  function rotateRight(value, shift) {
    return (value >>> shift) | (value << (32 - shift));
  }

  function sha256(message) {
    const bitLength = message.length * 8;
    const totalLength = Math.ceil((message.length + 9) / 64) * 64;
    const padded = new Uint8Array(totalLength);
    padded.set(message);
    padded[message.length] = 0x80;
    const view = new DataView(padded.buffer);
    view.setUint32(totalLength - 8, Math.floor(bitLength / 0x100000000), false);
    view.setUint32(totalLength - 4, bitLength >>> 0, false);
    const hash = new Uint32Array([
      0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
    ]);
    const words = new Uint32Array(64);
    for (let offset = 0; offset < totalLength; offset += 64) {
      for (let index = 0; index < 16; index++) words[index] = view.getUint32(offset + index * 4, false);
      for (let index = 16; index < 64; index++) {
        const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
        const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
        words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, h] = hash;
      for (let index = 0; index < 64; index++) {
        const sigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
        const choose = (e & f) ^ (~e & g);
        const temporary1 = (h + sigma1 + choose + SHA256_K[index] + words[index]) >>> 0;
        const sigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
        const majority = (a & b) ^ (a & c) ^ (b & c);
        const temporary2 = (sigma0 + majority) >>> 0;
        h = g; g = f; f = e; e = (d + temporary1) >>> 0;
        d = c; c = b; b = a; a = (temporary1 + temporary2) >>> 0;
      }
      hash[0] = (hash[0] + a) >>> 0;
      hash[1] = (hash[1] + b) >>> 0;
      hash[2] = (hash[2] + c) >>> 0;
      hash[3] = (hash[3] + d) >>> 0;
      hash[4] = (hash[4] + e) >>> 0;
      hash[5] = (hash[5] + f) >>> 0;
      hash[6] = (hash[6] + g) >>> 0;
      hash[7] = (hash[7] + h) >>> 0;
    }
    const output = new Uint8Array(32);
    const outputView = new DataView(output.buffer);
    for (let index = 0; index < hash.length; index++) outputView.setUint32(index * 4, hash[index], false);
    return output;
  }

  function hmacSha256(key, message) {
    let normalizedKey = key.length > 64 ? sha256(key) : key;
    if (normalizedKey.length < 64) {
      const padded = new Uint8Array(64);
      padded.set(normalizedKey);
      normalizedKey = padded;
    }
    const innerPad = new Uint8Array(64);
    const outerPad = new Uint8Array(64);
    for (let index = 0; index < 64; index++) {
      innerPad[index] = normalizedKey[index] ^ 0x36;
      outerPad[index] = normalizedKey[index] ^ 0x5c;
    }
    return sha256(concatBytes(outerPad, sha256(concatBytes(innerPad, message))));
  }

  let ivCounter = 0;
  function freshIv(hmacKey, signature, originalIv) {
    ivCounter = (ivCounter + 1) >>> 0;
    const entropy = new Uint8Array(24);
    const view = new DataView(entropy.buffer);
    const now = Date.now();
    view.setUint32(0, Math.floor(now / 0x100000000), false);
    view.setUint32(4, now >>> 0, false);
    view.setUint32(8, ivCounter, false);
    for (let index = 12; index < entropy.length; index++) entropy[index] = Math.floor(Math.random() * 256);
    return hmacSha256(hmacKey, concatBytes(signature, originalIv, entropy)).subarray(0, 16);
  }

  function processEncryptedResponsePart(partBytes, clientKey, captionLanguage) {
    const fields = parseProto(partBytes);
    const ciphertext = firstProtoField(fields, 1, 2)?.value;
    const signature = firstProtoField(fields, 2, 2)?.value;
    const iv = firstProtoField(fields, 3, 2)?.value;
    const compression = firstProtoField(fields, 4, 0)?.value?.value ?? 0;
    if (!ciphertext || !signature || !iv || iv.length !== 16) throw new Error("Incomplete encrypted response part");
    if (compression !== 0 && compression !== 1) throw new Error(`Unsupported compression algorithm ${compression}`);
    const aesKey = clientKey.subarray(0, 16);
    const hmacKey = clientKey.subarray(16);
    if (!equalBytes(signature, hmacSha256(hmacKey, concatBytes(ciphertext, iv)))) {
      throw new Error("Encrypted response HMAC verification failed");
    }
    const decrypted = $crypto.aes.decrypt(ciphertext, { mode: "ctr", key: aesKey, iv });
    const clearBytes = compression === 1 ? $utils.ungzip(decrypted) : decrypted;
    const stripped = stripOnesieResponseAds(clearBytes, captionLanguage);
    if (!stripped.removed && !stripped.enhanced) {
      return { bytes: partBytes, removed: 0, enhanced: 0, changed: false };
    }
    const compressed = compression === 1 ? $utils.gzip(stripped.bytes) : stripped.bytes;
    const nextIv = freshIv(hmacKey, signature, iv);
    const nextCiphertext = $crypto.aes.encrypt(compressed, {
      mode: "ctr", key: aesKey, iv: nextIv,
    }).ciphertext;
    const nextSignature = hmacSha256(hmacKey, concatBytes(nextCiphertext, nextIv));
    return {
      bytes: replaceLengthDelimitedFields(partBytes, new Map([
        [1, nextCiphertext], [2, nextSignature], [3, nextIv],
      ])),
      removed: stripped.removed,
      enhanced: stripped.enhanced,
      changed: true,
    };
  }

  function processUmpResponse(bytes, clientKey, captionLanguage) {
    const parts = parseUmp(bytes);
    let nextDataIsEncryptedResponse = false;
    let encrypted = 0;
    let processed = 0;
    let failed = 0;
    let keyFailures = 0;
    let removed = 0;
    let enhanced = 0;
    let changed = false;
    for (const part of parts) {
      if (part.type === 10) {
        const headerType = firstProtoField(parseProto(part.data), 1, 0)?.value?.value;
        nextDataIsEncryptedResponse = headerType === ENCRYPTED_INNERTUBE_RESPONSE;
        continue;
      }
      if (part.type !== 11 || !nextDataIsEncryptedResponse) continue;
      nextDataIsEncryptedResponse = false;
      encrypted++;
      try {
        const result = processEncryptedResponsePart(part.data, clientKey, captionLanguage);
        part.data = result.bytes;
        processed++;
        removed += result.removed;
        enhanced += result.enhanced;
        changed ||= result.changed;
      } catch (error) {
        failed++;
        if (String(error).includes("HMAC verification failed")) keyFailures++;
        console.log(`YouTube encrypted response part was left unchanged: ${String(error)}`);
      }
    }
    return {
      bytes: changed ? encodeUmp(parts) : bytes,
      encrypted, processed, failed, keyFailures, removed, enhanced, changed,
    };
  }

  function readArguments() {
    const defaults = { captionLang: "off", debug: false };
    if (typeof $argument !== "undefined" && $argument && typeof $argument === "object") {
      if (typeof $argument.captionLang === "string") defaults.captionLang = $argument.captionLang;
      defaults.debug = $argument.debug === true || String($argument.debug).toLowerCase() === "true";
    }
    return defaults;
  }

  function readConfig() {
    try { return JSON.parse($persistentStore.read(CONFIG_KEY) || "{}"); }
    catch (error) { throw new Error(`Config read failed: ${String(error)}`); }
  }

  function clearPlatformConfig(config, platformKey) {
    if (!config[platformKey]) return false;
    delete config[platformKey];
    if (!$persistentStore.write(JSON.stringify(config), CONFIG_KEY)) {
      throw new Error(`Failed to clear stale ${platformKey} client key`);
    }
    return true;
  }

  function findHeader(headers, name) {
    const expected = name.toLowerCase();
    for (const key of Object.keys(headers || {})) {
      if (key.toLowerCase() === expected) return headers[key];
    }
    return "";
  }

  function isMusicRequest(headers) {
    return String(findHeader(headers, "user-agent")).toLowerCase().includes("music");
  }

  function runtimeAvailable() {
    return typeof $crypto !== "undefined" && $crypto.aes
      && typeof $crypto.aes.encrypt === "function" && typeof $crypto.aes.decrypt === "function"
      && typeof $utils !== "undefined" && typeof $utils.gzip === "function"
      && typeof $utils.ungzip === "function";
  }

  function finish(value) {
    $done(value);
  }

  if (typeof globalThis !== "undefined" && globalThis.__YOUTUBE_LOCAL_TEST__) {
    globalThis.__YOUTUBE_LOCAL_TEST__.exports = {
      concatBytes, decodeBase64, encodeLengthDelimitedField, encodeVarintField,
      encodeUmp, hmacSha256, parseProto, parseUmp, processEncryptedResponsePart,
      processUmpResponse, sha256, stripOnesieResponseAds,
    };
  }

  try {
    const startedAt = Date.now();
    const args = readArguments();
    const status = Number($response.status || $response.statusCode || 0);
    const body = toBytes($response.body);
    const contentType = String(findHeader($response.headers, "content-type")).toLowerCase();
    if (status !== 200 || !body || !body.length || body.length > MAX_RESPONSE_BYTES
        || !contentType.includes("application/vnd.yt-ump")) {
      finish({});
    } else if (!runtimeAvailable()) {
      console.log("YouTube local initplayback requires Loon Build 988 or later");
      finish({});
    } else {
      const config = readConfig();
      const platformKey = isMusicRequest($request.headers) ? "youtubeMusic" : "youtube";
      const clientKey = decodeBase64(config[platformKey]?.clientKey || "");
      if (clientKey.length !== 32) {
        if (args.debug) console.log(`YouTube local initplayback has no valid ${platformKey} client key`);
        finish({});
      } else {
        const result = processUmpResponse(body, clientKey, args.captionLang);
        const staleKey = result.encrypted > 0
          && result.processed === 0
          && result.keyFailures === result.failed;
        const clearedStaleKey = staleKey && clearPlatformConfig(config, platformKey);
        if (args.debug) {
          console.log(JSON.stringify({
            message: "YouTube local initplayback",
            platform: platformKey,
            elapsedMs: Date.now() - startedAt,
            responseBytes: body.length,
            encryptedParts: result.encrypted,
            processedParts: result.processed,
            failedParts: result.failed,
            keyFailures: result.keyFailures,
            clearedStaleKey,
            removed: result.removed,
            enhanced: result.enhanced,
            changed: result.changed,
          }));
        }
        finish(result.changed ? { body: result.bytes } : {});
      }
    }
  } catch (error) {
    console.log(`YouTube local initplayback failed open: ${String(error)}`);
    finish({});
  }
})();
