# PDF Fácil V2

Companion utility for NexOffice Materials.

## Product role

NexOffice Materiais creates commercial material. PDF Fácil performs lightweight PDF operations in the browser. DocWallet remains the document/signature/evidence engine.

## Current V2 capabilities

- OCR editing per selected page, preserving the rest of the PDF
- Merge multiple PDFs
- Extract page ranges (for example: `1-3, 5, 8-10`)
- Rotate one page or the full document
- PDF to PNG (single page or ZIP of all pages)
- Add text/annotations across multiple pages
- Structural PDF optimization using object streams
- Multiple JPG/PNG images to a multipage PDF
- Add `Página X de Y` pagination with position control

## Security and privacy

The PDF bytes are processed in the browser. The page still uses the network to load its JavaScript libraries from CDNs.

Password protection is intentionally disabled in V2 until a real, audited browser-compatible PDF encryption implementation is adopted. The previous implementation called an unsupported `pdf-lib` method and must not be marketed as a security feature.

## Hosting

Production site: `pdffacil.netlify.app`

The Netlify project historically used manual/drop deploys. This source is versioned here so future changes are no longer source-less.
