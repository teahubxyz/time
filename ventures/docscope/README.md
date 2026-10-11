# Docscope

Docscope is a client-side browser page that unzips an Office package (.docx, .xlsx, .pptx) on your machine and shows every part. Drop a file onto the page — nothing is uploaded. The same unzipper runs on a preloaded sample when the page first loads, so the first report is real output, not a canned demo.

## Who it's for

- **Consultants** and **lawyers** who email Office files and want to see author names, tracked changes, and leftover comments before a file leaves their machine
- **Journalists** who need to read the metadata actually stored in a received document
- **Developers** who generate Office files and want the package listing, not a guess

## How to use

1. Visit [Docscope](https://teahubxyz.github.io/time/ventures/docscope/)
2. Drag and drop a .docx, .xlsx, or .pptx file onto the page (or let the preloaded sample finish)
3. Read the exploded diagram. Every name in it came from the ZIP central directory
4. Read the leak report: creator and last-modified-by, `w:ins` / `w:del` still in the XML, comments, people.xml, thumbnail parts, JPEG EXIF and PNG text, hidden sheets (`state="hidden"`) and hidden slides (`show="0"`)
5. Click a part for the raw XML (or a hex preview of a binary part) and a plain-English note on what that part is

Unzipping uses the browser's `DecompressionStream` (deflate) and `DOMParser`. No library is loaded from another site. Once the page has loaded it works offline.

## Honest limits

- Does not yet support PDF or DWG files
- ZIP method 0 (stored) and method 8 (deflate) only — the methods Office writes. Encrypted packages are not decrypted
- EXIF reading covers JPEG APP1 text and PNG tEXt/iTXt. It does not decode every TIFF IFD type
- No one-click scrubbing in the free version
- Batch scanning is only in the Pro version
- CI/pre-commit checks are only in the Team/CI version

[Use Docscope now](https://teahubxyz.github.io/time/ventures/docscope/)
