import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// Extract the text layer of a generated PDF for golden-file assertions.
//
// Uses pdfjs-dist (the same engine that renders PDFs in the browser) rather
// than pdf-parse, whose bundled pdfjs is old enough to intermittently
// reject pdfkit output ("bad XRef entry") — pdfkit stamps each PDF with a
// live CreationDate and a random document ID, so the buffer differs every
// run and a flaky parser fails nondeterministically.
//
// pdfkit line-wraps justified paragraphs, so the extracted text carries
// hard breaks in unpredictable places. We collapse ALL whitespace to single
// spaces so tests can assert on clause substrings/regexes without caring
// where a line wrapped. Assert with `.includes()` / `.match()` — never on
// exact line equality.
export async function pdfToText(buf: Buffer): Promise<string> {
  const doc = await getDocument({
    data: new Uint8Array(buf),
    // Keep the parse quiet and self-contained in a test/CI environment.
    useSystemFonts: false,
    isEvalSupported: false,
    verbosity: 0,
  }).promise;

  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    out += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + ' ';
  }
  await doc.destroy();
  return collapse(out);
}

export function collapse(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}
