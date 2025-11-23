Version: 1.0.0  
Last-Updated: 2025-11-23  
Status: Authoritative Specification (SSOT)

# _AI_FILE_AND_IMAGE_PIPELINE_SPEC.md
File, image, raster, vector, ICC, metadata, tile, and normalization rules.

This document defines:
- how FOLE ingests, parses, normalizes, converts, tiles, and stores all files & images,
- how metadata is handled,
- how ICC profiles and color spaces are processed,
- how EXIF orientation is applied,
- how multi-page formats behave,
- rules for PSD/AI/SVG,
- tile pyramid generation and cache behavior,
- and which operations AI agents are allowed or forbidden to perform.

This spec is binding for all backend logic, renderers, importers, exporters, and AI agents.

---

# 1. PURPOSE & GOALS

1. Provide a deterministic, safe, platform-wide file & image pipeline.
2. Define exact behavior for:
   - EXIF orientation
   - ICC profiles
   - color spaces
   - normalization
   - raster/vector ingestion
   - multi-page files
   - PSD composite extraction
3. Guarantee pixel-perfect reproducibility across systems.
4. Enforce a single canonical output format.
5. Prevent AI agents from bypassing or altering pipeline safety rules.

---

# 2. SUPPORTED INPUT FORMATS

## 2.1 Raster Formats
- JPEG (.jpg, .jpeg)
- PNG (.png)
- TIFF (.tif, .tiff)  
  Supports:
  - multi-page
  - tiled TIFF
  - LZW/ZIP/Deflate
  - 8/16-bit grayscale
  - 8/16-bit RGB
  - CMYK (converted)
  - alpha (straight/premultiplied)
- WebP (.webp)
- AVIF (.avif)
- BMP (.bmp)

## 2.2 Vector & Hybrid Formats
- PDF — page 1 default
- SVG — sanitized
- AI — PDF stream extracted
- PSD — composite only

## 2.3 Forbidden Formats
Reject:
- RAW formats (CR2/NEF/ARW/etc.)
- HEIC/HEIF (unless explicitly supported later)
- EPS (unless manually preflighted)
- Executable formats

AI MUST NOT bypass these rules.

---

# 3. CANONICAL NORMALIZATION PIPELINE

All images MUST be converted into the FOLE Canonical Format.

## FOLE Canonical Format
- Pixel format: 16-bit per-channel
- Color space: **linear sRGB**
- Alpha: **straight alpha**
- Orientation: EXIF normalized
- ICC: stripped and replaced with canonical sRGB profile
- Container: **TIFF**
- Compression: Deflate
- Internal tile size: 256×256 or 512×512

Canonically normalized TIFF is the only long-term storage format.

Everything else is transient.

---

# 4. EXIF & METADATA RULES

## 4.1 EXIF Orientation
On ingestion:
- read EXIF orientation,
- rotate/flip pixel data,
- bake orientation,
- remove EXIF orientation tag,
- record original orientation in metadata.

Orientation MUST NEVER remain as EXIF metadata.

## 4.2 Original Metadata Recording
Store JSON in project.db:
- filename
- format
- width/height
- ICC profile name
- EXIF data (safe subset)
- normalization timestamp

## 4.3 Strip Unsafe Metadata
Remove:
- GPS
- creator info
- software versions
- camera serial numbers
- any XMP block containing identity information

---

# 5. ICC & COLOR SPACE RULES

## 5.1 If ICC profile present
- Read ICC
- Convert to **linear sRGB**
- Replace ICC with canonical sRGB profile

## 5.2 If no ICC
- Assume sRGB
- Convert to linear sRGB

## 5.3 CMYK
- Convert CMYK → sRGB using relative colorimetric intent with black-point compensation.

## 5.4 Legal/Illegal Color Behaviors
Legal:
- convert → linear sRGB
- replace ICC with canonical profile

Illegal:
- preserve CMYK
- output CMYK/Lab
- embed noncanonical ICC in normalized output

AI MUST NOT violate these.

---

# 6. MULTI-PAGE FORMAT BEHAVIOR

## 6.1 TIFF
- import page 1 by default
- allow user to pick other pages

## 6.2 PDF
- import page 1 unless explicitly chosen otherwise

## 6.3 PSD
- extract composite only
- ignore layers

---

# 7. VECTOR RULES

## 7.1 SVG
Sanitize:
- remove JS
- remove external references
- remove embedded fonts
- flatten transforms
- rasterize at import DPI

## 7.2 AI/EPS
- AI → use internal PDF stream
- EPS → reject unless manually trusted

---

# 8. RASTERIZATION RULES

## 8.1 DPI Handling
If DPI known:
- use provided DPI

If unknown:
- assume 96 DPI

Maps with real units:
- DPI = pixels / physical_size

AI MUST NOT hallucinate DPI.

## 8.2 Alpha
- convert premultiplied alpha → straight alpha

## 8.3 Bit Depth
- convert all input to 16-bit per channel

---

# 9. TILE PYRAMID (GLOBAL)

After normalization, system generates tile pyramid:

## 9.1 Levels
L0 = full resolution  
L1 = 50%  
L2 = 25%  
continue until <1 tile

## 9.2 Tile Format
- PNG ONLY
- 512×512

Path:
/tiles/<imageId>/L<level>/<x>_<y>.png


## 9.3 Cache Invalidations
Any change to canonical TIFF:
- clear tile directory
- regenerate tiles lazily

---

# 10. ATOMIC STORAGE RULES

All writes MUST follow `_AI_STORAGE_ARCHITECTURE.md`:

1. write to tmp on same filesystem  
2. fsync files  
3. atomic rename  
4. fsync parent  
5. update DB manifest  

AI MUST NOT bypass tmp → rename pipeline.

---

# 11. PREVIEW RULES

## 11.1 Thumbnails
- rendered only from canonical TIFF  
- max dimension 512px  

## 11.2 Vector Previews
- sanitize → rasterize → preview  

---

# 12. ERROR HANDLING (STRICT)

Reject on:
- corrupt ICC
- corrupt EXIF
- unreadable orientation
- unsupported color space
- unsupported format
- resolution too large
- invalid multi-page index

AI MUST STOP and ask user in these cases.

---

# 13. AI OPERATIONAL RULES

AI MUST:
- load this spec before any file/image action
- never bypass normalization
- never request or generate noncanonical stored formats
- always use DAL/storage API

AI MUST STOP if:
- file type cannot be determined
- DPI unclear
- ICC missing and user did not confirm assumption
- multi-page request ambiguous

AI MUST NOT:
- manipulate ICC manually
- skip sanitization
- write directly to tile directories
- create multi-layer TIFFs
- store WebP/AVIF as canonical format
- alter pyramid level geometry

---

# 14. RELATION TO OTHER SPECS

This spec works with:
- `_AI_STORAGE_ARCHITECTURE.md`
- `_AI_GEO_AND_CALIBRATION_SPEC.md`
- `_AI_TEMPLATES_AND_DEFAULTS.md`
- `_AI_MASTER_RULES.md`

If conflict occurs:  
**This document wins for all file/image behavior paths.**

---

# END OF DOCUMENT
This spec is authoritative.  
All agents and backend services MUST follow it exactly.
