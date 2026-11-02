/** Minimal single-page PDF used for seed notes and file restore. */
export function buildSimplePdf(title: string, lines: string[]): Buffer {
  const escapedTitle = title.replace(/[()\\]/g, " ");
  const body = lines
    .map((line) => `0 -22 Td (${line.replace(/[()\\]/g, " ")}) Tj`)
    .join(" ");
  const stream = `BT /F1 20 Tf 50 740 Td (${escapedTitle}) Tj /F1 12 Tf 0 -32 Td ${body} ET`;
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj",
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
  ];
  const content = `%PDF-1.4\n${objects.join("\n")}\ntrailer << /Root 1 0 R >>\n%%EOF`;
  return Buffer.from(content);
}
