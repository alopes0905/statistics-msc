# English corpus provenance

These are complete, unmodified UTF-8 Project Gutenberg texts, downloaded from
the GITenberg archives on 15 October 2026. The direct Gutenberg text endpoints
timed out in the development environment; the documented mirrors were used.
The original headers and full Project Gutenberg license notices are retained.
Gutenberg identifies both works as public domain in the USA. The embedded
Project Gutenberg terms apply to redistribution of these editions; the files
are provided here without charge, with those notices intact.

| Role | Author and work | Gutenberg record | Exact download |
|---|---|---|---|
| Training | Lewis Carroll, *Alice’s Adventures in Wonderland* (1865) | https://www.gutenberg.org/ebooks/11 | https://raw.githubusercontent.com/GITenberg/Alice-s-Adventures-in-Wonderland_11/master/11-0.txt |
| Held-out evaluation | Lewis Carroll, *Through the Looking-Glass* (1871) | https://www.gutenberg.org/ebooks/12 | https://raw.githubusercontent.com/GITenberg/Through-the-Looking-Glass_12/master/12-0.txt |

Local files: `alice.txt` and `looking-glass.txt`. No text is fetched externally at runtime.

SHA-256 of the exact bundled bytes:

The repository attributes preserve these files byte for byte, including their
original CRLF line endings, so Git checkout does not change these checksums.

```text
alice.txt          49a0b2726606e1290ac03a63978fa1dd1bd38a8d805704d98265f393533ea094
looking-glass.txt  24bae70935e7fce7be74357779c53861c0cd04b3687f3005c1a8687f2b909988
```

## Analysis and sampling

`corpusBody` uses the explicit START/END PROJECT GUTENBERG markers. It excludes
publisher wrappers and license text from the analysis; the source files remain
intact. `countLetters` counts only ASCII A–Z/a–z, with case folded for counts.
Training contains 107,785 such letters; evaluation contains 119,699. All 26
training probabilities are positive. No smoothing or external frequency table
is used. Non-ASCII letters are excluded before case conversion.

The entire first book trains the model; the entire second book is held out.
For each length L in 20, 50, 100, 300, 1000, 3000, take 20 windows starting at
`floor(j * (T - L) / 19)` for j = 0..19 in the evaluation letter stream of
length T. Windows do not overlap within a length. Lengths reuse the same book.
Every window is encrypted with each shift 0..25. The recovery algorithm sees
only ciphertext and training frequencies. True shifts are used only afterward
to score correctness; tied predictions count as unsuccessful.

The 26 rotations of a passage are dependent trials. There are 20 text samples
per length, not 520 independent language samples. Both works share an author,
so these accuracies should not be generalized to arbitrary English or other
languages. This is a fixed, reproducible comparison without confidence intervals.

Recorded computation: 494/520 (95%) at 20 letters, and 520/520 (100%) at each
of the other five lengths. No ties. The page recomputes all trials in a local
worker; the tests independently verify counts, scores, corpus hashes, and output.
