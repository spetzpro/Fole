Version: 1.0.0
Last-Updated: 2025-11-23
Status: Authoritative Specification (SSOT)

# _AI_GEO_AND_CALIBRATION_SPEC.md
Global → Local Geospatial System, Calibration Rules, and Map Math

This document defines how the FOLE platform handles:
- global Earth coordinates (GPS / WGS84),
- local engineering coordinates,
- multi-floor buildings,
- calibration of maps and drawings,
- transforms between all coordinate spaces,
- geometric accuracy to millimeter level.

Binding for:
- all AI agents,
- all backend modules,
- all rendering engines,
- all import/export operations,
- all map, floor, and sketch features.

--------------------------------------------------------------------

1. PURPOSE

This spec ensures:
- deterministic math,
- consistent coordinates across modules,
- reproducible calibrations,
- mm-accurate spatial alignment,
- safe, reversible transformations.

It is the authoritative document for all geospatial behavior.

--------------------------------------------------------------------

2. COORDINATE SYSTEM OVERVIEW

FOLE uses a **tiered coordinate model**:

2.1 Global: WGS84 Geodetic  
(lat, lon, height) in degrees/meters  
Used for:
- GPS input
- Global project placement
- Importing external surveying data

2.2 Global: WGS84 ECEF  
(x, y, z) center-of-earth cartesian  
Used for:
- stable math
- distance/slope/azimuth between far points
- transforming global → local reference frames

2.3 Local Engineering System (LES)  
Right-handed XY plane, units in meters (mm allowed)  
LES is defined per project or per building root.

2.4 Floor Plan Pixel Coordinates  
2D pixel space of an imported image/drawing.

2.5 Tile Coordinates  
Used by the raster-pyramid engine.

At runtime, all geometry eventually reduces to:
- **LES meters** for math
- **Pixel space** for rendering
- **ECEF/LLH** only for import/export

--------------------------------------------------------------------

3. FORMAL TRANSFORM CHAIN

Every map object supports the following transforms:

Global LLH (φ,λ,h)
→ ECEF (X,Y,Z)
→ Local Engineering System (x_m, y_m, z_m)
→ Map Pixel Coordinates (u, v)
→ Tile Coordinates (tX, tY, zoom)

All transforms must be **invertible**.

3.1 LLH → ECEF  
Use the official WGS84 ellipsoid constants:
- a = 6378137.0
- e² = 6.69437999014e−3

Standard N, X, Y, Z equations REQUIRED.

3.2 ECEF → Local  
LES is defined using:
- Origin ECEF point
- Orientation (yaw rotation)
- Optional pitch/roll if using slope-sensitive modes

Default orientation:  
- LES X points East  
- LES Y points North  
- LES Z points Up  

3.3 Local → Pixels  
Defined by calibration matrix M (see section 6).

3.4 Pixels → Tiles  
Tile system is always square-power-of-2 hierarchy.  
Exactly defined in _AI_FILE_AND_IMAGE_PIPELINE_SPEC.md.

--------------------------------------------------------------------

4. LOCAL ENGINEERING SYSTEM DETAILS

LES is a 3D right-handed system with:
- Units: meters (float64)
- Precision: at least ±0.1 mm within ±100m domain
- Numeric requirement: all transforms must use double precision

LES is stable for buildings, large rooms, outdoor areas.

No slopes or curvature unless explicitly defined.

--------------------------------------------------------------------

5. MAP CALIBRATION MODES (MANDATORY)

All maps must be calibrated using one of the supported modes:

5.1 Two-Point Calibration  
Inputs:
- Pixel A, Pixel B
- Real-world coords A', B' (LES or LLH → converted)
Solves scale + rotation + translation.

5.2 Three-Point Calibration  
Adds shear correction capability.

5.3 Four-Point / Full Affine  
Allows:
- non-uniform scale
- shear
- skew

Recommended for scanned drawings.

5.4 Known-Scale Calibration  
Drawing already specifies scale.  
User only anchors a reference origin on pixel space.

5.5 Georeferenced Calibration  
External survey or CAD with embedded CRS:
- LLH coordinates per anchor
- Direct transform to LES

--------------------------------------------------------------------

6. CALIBRATION MATH

Each calibration yields a **2D affine transform**:

[u; v; 1] = M * [x; y; 1]

M structure:
M = [ a  b  tx
      c  d  ty
      0  0   1 ]

Where:
- a,d represent scaling with rotation components
- b,c represent shear/skew if present
- tx,ty represent pixel translation

Calibration MUST:
- Be stored in the project DB
- Be invertible
- Include numerical stability metadata
- Include RMS error between calibration points

6.1 Inverse Transform  
(x, y, 1) = M⁻¹ (u, v, 1)

M⁻¹ must be precomputed and stored to avoid float accumulation errors.

--------------------------------------------------------------------

7. MULTI-FLOOR STRUCTURE

Each floor has:
- FloorId
- Calibration matrix M
- Elevation offset in LES (z floor)
- Optional vertical scale (for section drawings)
- Optional rotation offset relative to building root

Rules:
- Floors share same LES orientation
- Floors differ only by Z + optional in-floor rotation
- Vertical alignment must be exact (LES z)

--------------------------------------------------------------------

8. LINEAR UNITS, SCALE & RESOLUTION

8.1 Internal math always uses:
- meters (LES)
- double precision

8.2 Pixel resolution for each map:
- stored in metadata
- derived from calibration scaling factors
- must remain constant after calibration

8.3 No hidden scaling anywhere.
Only matrix M may define scale.

--------------------------------------------------------------------

9. IMAGE / TILE GEOMETRY

9.1 Pixel origin = upper-left (0,0)
9.2 LES origin = arbitrary global anchor (usually first calibration anchor)
9.3 Tiles follow:
- size = 256 × 256 px
- zoom levels are powers of two
- tile coordinate rounding rules defined in image pipeline spec

9.4 Sub-pixel accuracy supported:
- double precision pixel coordinates
- mm accuracy in LES

--------------------------------------------------------------------

10. IMPORTING MAPS / DRAWINGS

Supported sources:
- raster images
- PDFs converted to image
- CAD (DXF, DWG) via vector-to-pixel pipeline

Import procedure:
1. Normalize image (color, ICC)
2. Extract metadata (DPI, extents)
3. User performs calibration
4. Engine stores calibration matrix
5. Tiles are generated (atomic write protocol)

--------------------------------------------------------------------

11. EXPORTING GEOMETRY

When exporting:
- Always convert LES → ECEF → LLH when needed
- Include calibration metadata
- Include RMS error
- Include schemaVersion

--------------------------------------------------------------------

12. AI RULES

AI agents must:
- NEVER guess calibration
- ALWAYS load this file before doing geo tasks
- REFUSE operations when:
  - calibration missing
  - calibration ambiguous
  - multiple transforms exist but precedence unclear
  - map has conflicting pixel resolutions
  - user requests impossible geometry

AI must:
- Use LES for all math
- Use double precision
- Use provided transform chain, not ad-hoc math
- Stop if WGS84 constants missing or incorrect

Forbidden:
- Creating a new calibration without user-provided anchors
- Replacing calibration without destructive-change governance
- Inventing or inferring scale

--------------------------------------------------------------------

13. STORAGE RULES (LINK TO STORAGE SPEC)

All calibration matrices MUST be stored in:
project.db → table: map_calibration

Fields:
- mapId
- matrixJSON
- inverseMatrixJSON
- rmsError
- calibrationMode
- version
- createdAt
- createdBy

Atomic write protocols from _AI_STORAGE_ARCHITECTURE.md apply.

--------------------------------------------------------------------

14. NUMERICAL SAFETY RULES

14.1 Use double precision everywhere.  
14.2 Perform validation:
- determinant(M) ≠ 0
- RMS < threshold (default 0.5% of map size)
- No extreme skew unless user confirms

14.3 Round-trips must satisfy:
- |p − untransform(transform(p))| < 0.001 m

--------------------------------------------------------------------

15. LINKED SPECS

This document depends on:
- _AI_MASTER_RULES.md
- _AI_STORAGE_ARCHITECTURE.md
- _AI_TEMPLATES_AND_DEFAULTS.md
- _AI_UI_SYSTEM_SPEC.md
- _AI_FILE_AND_IMAGE_PIPELINE_SPEC.md

Conflicts:
- Calibration math defined here overrides any UI interpretation
- Storage rules override where calibration is saved
- UI spec governs how calibration tools behave

--------------------------------------------------------------------

End of document.
_AI_GEO_AND_CALIBRATION_SPEC.md  
Authoritative.
