import { initializeCodeViewers } from './code-viewer.js';

// Modules run after HTML parsing. Pages without source blocks need no enhancement.
await initializeCodeViewers(document);
