# Docscope

Docscope is a client-side browser tool that lets you inspect Office files (.docx, .xlsx, .pptx) for hidden metadata, tracked changes, and other remnants that might leak sensitive information. Drop a file onto the page and see everything dissected live in your browser—no uploads required.

## Who it's for

- **Consultants** and **lawyers** who email Office files and want to ensure they don't leak client information
- **Journalists** who need to verify the metadata of received documents
- **Developers** who generate Office files and want to confirm what's actually inside

## How to use

1. Visit [Docscope](https://teahubxyz.github.io/time/ventures/docscope/)
2. Drag and drop a .docx, .xlsx, or .pptx file onto the page
3. Explore the interactive exploded diagram of every part of the file
4. Review the leak report for potential issues
5. Click on any part to see its raw XML with annotations

## Honest limits

- Does not yet support PDF or DWG files
- No one-click scrubbing in the free version
- Batch scanning is only in the Pro version
- CI/pre-commit checks are only in the Team/CI version

[Use Docscope now](https://teahubxyz.github.io/time/ventures/docscope/)