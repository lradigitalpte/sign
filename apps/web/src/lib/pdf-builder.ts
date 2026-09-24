/**
 * Lightweight, zero-dependency PDF 1.4 vector generator.
 * Produces clean, standards-compliant PDF documents with formatted headings,
 * paragraphs, bullet points, horizontal rules, and signature placeholders.
 */

export type DocumentSection = {
  heading?: string;
  body: string;
};

export type ContractDraft = {
  title: string;
  subtitle?: string;
  effectiveDate?: string;
  partyA?: { name: string; title?: string; company?: string; email?: string };
  partyB?: { name: string; title?: string; company?: string; email?: string };
  sections: DocumentSection[];
  footerNote?: string;
};

function escapePdfText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/[^\x20-\x7E\r\n\t]/g, (char) => {
      // Map common curly quotes and dashes to ascii
      if (char === "“" || char === "”") return '"';
      if (char === "‘" || char === "’") return "'";
      if (char === "—" || char === "–") return "-";
      if (char === "•") return "*";
      return "";
    });
}

function wrapText(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  const paragraphs = text.split("\n");

  for (const para of paragraphs) {
    if (!para.trim()) {
      lines.push("");
      continue;
    }
    const words = para.split(" ");
    let currentLine = "";

    for (const word of words) {
      if ((currentLine + " " + word).trim().length <= maxChars) {
        currentLine = currentLine ? currentLine + " " + word : word;
      } else {
        if (currentLine) lines.push(currentLine);
        currentLine = word;
      }
    }
    if (currentLine) lines.push(currentLine);
  }
  return lines;
}

export function generateContractPdf(draft: ContractDraft): Uint8Array {
  // A4 dimensions at 72 DPI: 595.28 x 841.89 pt
  const pageWidth = 595.28;
  const pageHeight = 841.89;
  const marginX = 54;
  const marginTop = 54;
  const marginBottom = 54;
  const contentWidth = pageWidth - marginX * 2;
  const maxCharsPerLine = 85;

  type PageCommand = {
    type: "text" | "rule";
    text?: string;
    x?: number;
    y?: number;
    size?: number;
    font?: "F1" | "F2"; // F1 = Regular, F2 = Bold
    color?: [number, number, number];
    width?: number;
  };

  const pages: PageCommand[][] = [];
  let currentPage: PageCommand[] = [];
  let cursorY = pageHeight - marginTop;

  function ensureSpace(requiredPt: number) {
    if (cursorY - requiredPt < marginBottom) {
      pages.push(currentPage);
      currentPage = [];
      cursorY = pageHeight - marginTop;
    }
  }

  // --- Document Header ---
  ensureSpace(60);
  currentPage.push({
    type: "text",
    text: escapePdfText(draft.title.toUpperCase()),
    x: marginX,
    y: cursorY,
    size: 16,
    font: "F2",
    color: [0.1, 0.1, 0.15],
  });
  cursorY -= 20;

  if (draft.subtitle || draft.effectiveDate) {
    const subText = [
      draft.subtitle,
      draft.effectiveDate ? `Effective Date: ${draft.effectiveDate}` : "",
    ]
      .filter(Boolean)
      .join("  |  ");

    currentPage.push({
      type: "text",
      text: escapePdfText(subText),
      x: marginX,
      y: cursorY,
      size: 9.5,
      font: "F1",
      color: [0.4, 0.4, 0.45],
    });
    cursorY -= 14;
  }

  // Divider Rule
  cursorY -= 4;
  currentPage.push({
    type: "rule",
    x: marginX,
    y: cursorY,
    width: contentWidth,
    color: [0.8, 0.8, 0.85],
  });
  cursorY -= 20;

  // --- Parties Involved Block ---
  if (draft.partyA || draft.partyB) {
    ensureSpace(60);
    const colWidth = contentWidth / 2 - 10;

    if (draft.partyA) {
      currentPage.push({
        type: "text",
        text: "FIRST PARTY / DISCLOSER:",
        x: marginX,
        y: cursorY,
        size: 8.5,
        font: "F2",
        color: [0.3, 0.3, 0.35],
      });
      currentPage.push({
        type: "text",
        text: escapePdfText(draft.partyA.name + (draft.partyA.company ? ` (${draft.partyA.company})` : "")),
        x: marginX,
        y: cursorY - 12,
        size: 9.5,
        font: "F1",
        color: [0.15, 0.15, 0.2],
      });
      if (draft.partyA.email) {
        currentPage.push({
          type: "text",
          text: escapePdfText(draft.partyA.email),
          x: marginX,
          y: cursorY - 24,
          size: 8.5,
          font: "F1",
          color: [0.45, 0.45, 0.5],
        });
      }
    }

    if (draft.partyB) {
      const partyBX = marginX + colWidth + 20;
      currentPage.push({
        type: "text",
        text: "SECOND PARTY / RECIPIENT:",
        x: partyBX,
        y: cursorY,
        size: 8.5,
        font: "F2",
        color: [0.3, 0.3, 0.35],
      });
      currentPage.push({
        type: "text",
        text: escapePdfText(draft.partyB.name + (draft.partyB.company ? ` (${draft.partyB.company})` : "")),
        x: partyBX,
        y: cursorY - 12,
        size: 9.5,
        font: "F1",
        color: [0.15, 0.15, 0.2],
      });
      if (draft.partyB.email) {
        currentPage.push({
          type: "text",
          text: escapePdfText(draft.partyB.email),
          x: partyBX,
          y: cursorY - 24,
          size: 8.5,
          font: "F1",
          color: [0.45, 0.45, 0.5],
        });
      }
    }

    cursorY -= 42;
    currentPage.push({
      type: "rule",
      x: marginX,
      y: cursorY,
      width: contentWidth,
      color: [0.9, 0.9, 0.92],
    });
    cursorY -= 16;
  }

  // --- Document Sections ---
  for (let i = 0; i < draft.sections.length; i++) {
    const sec = draft.sections[i];

    if (sec.heading) {
      ensureSpace(28);
      currentPage.push({
        type: "text",
        text: escapePdfText(`${i + 1}. ${sec.heading.toUpperCase()}`),
        x: marginX,
        y: cursorY,
        size: 10.5,
        font: "F2",
        color: [0.15, 0.2, 0.3],
      });
      cursorY -= 15;
    }

    const wrapped = wrapText(sec.body, maxCharsPerLine);
    for (const line of wrapped) {
      if (line === "") {
        cursorY -= 8;
        continue;
      }
      ensureSpace(14);
      currentPage.push({
        type: "text",
        text: escapePdfText(line),
        x: marginX,
        y: cursorY,
        size: 9,
        font: "F1",
        color: [0.2, 0.2, 0.25],
      });
      cursorY -= 12.5;
    }

    cursorY -= 10;
  }

  // --- Signature Area ---
  ensureSpace(120);
  cursorY -= 10;
  currentPage.push({
    type: "rule",
    x: marginX,
    y: cursorY,
    width: contentWidth,
    color: [0.85, 0.85, 0.9],
  });
  cursorY -= 20;

  currentPage.push({
    type: "text",
    text: "IN WITNESS WHEREOF, the parties hereto have executed this Agreement as of the date first written above.",
    x: marginX,
    y: cursorY,
    size: 8.5,
    font: "F1",
    color: [0.4, 0.4, 0.45],
  });
  cursorY -= 32;

  const signColWidth = contentWidth / 2 - 20;
  // Signer 1 Box
  currentPage.push({
    type: "rule",
    x: marginX,
    y: cursorY,
    width: signColWidth,
    color: [0.6, 0.6, 0.65],
  });
  currentPage.push({
    type: "text",
    text: "Party A / Authorized Signature & Date",
    x: marginX,
    y: cursorY - 12,
    size: 8,
    font: "F2",
    color: [0.35, 0.35, 0.4],
  });

  // Signer 2 Box
  const signCol2X = marginX + signColWidth + 40;
  currentPage.push({
    type: "rule",
    x: signCol2X,
    y: cursorY,
    width: signColWidth,
    color: [0.6, 0.6, 0.65],
  });
  currentPage.push({
    type: "text",
    text: "Party B / Authorized Signature & Date",
    x: signCol2X,
    y: cursorY - 12,
    size: 8,
    font: "F2",
    color: [0.35, 0.35, 0.4],
  });

  // Push last page
  pages.push(currentPage);

  // --- Assemble Raw PDF Binary ---
  const totalPages = pages.length;
  const objects: string[] = [];

  // Helper to register object and return 1-based index
  function addObject(content: string): number {
    objects.push(content);
    return objects.length;
  }

  // Obj 1: Catalog
  // Obj 2: Pages root
  // Obj 3: Font Helvetica
  // Obj 4: Font Helvetica-Bold
  const catalogObjId = addObject(""); // Placeholder
  const pagesRootObjId = addObject(""); // Placeholder
  const fontRegularObjId = addObject(
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>`,
  );
  const fontBoldObjId = addObject(
    `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>`,
  );

  const pageObjIds: number[] = [];

  for (let pIndex = 0; pIndex < totalPages; pIndex++) {
    const pageCommands = pages[pIndex];
    let stream = "";

    // Render Page Commands
    for (const cmd of pageCommands) {
      if (cmd.type === "rule" && cmd.x !== undefined && cmd.y !== undefined && cmd.width) {
        const [r, g, b] = cmd.color ?? [0, 0, 0];
        stream += `${r} ${g} ${b} RG\n0.75 w\n${cmd.x.toFixed(2)} ${cmd.y.toFixed(2)} m ${(cmd.x + cmd.width).toFixed(2)} ${cmd.y.toFixed(2)} l\nS\n`;
      } else if (cmd.type === "text" && cmd.text && cmd.x !== undefined && cmd.y !== undefined) {
        const [r, g, b] = cmd.color ?? [0, 0, 0];
        const fontTag = cmd.font ?? "F1";
        const fontSize = cmd.size ?? 10;
        stream += `BT\n/${fontTag} ${fontSize} Tf\n${r} ${g} ${b} rg\n${cmd.x.toFixed(2)} ${cmd.y.toFixed(2)} Td\n(${cmd.text}) Tj\nET\n`;
      }
    }

    // Add Page Number in footer
    const pageNumText = escapePdfText(`Page ${pIndex + 1} of ${totalPages}`);
    stream += `BT\n/F1 8 Tf\n0.5 0.5 0.5 rg\n${(pageWidth - marginX - 50).toFixed(2)} 30.00 Td\n(${pageNumText}) Tj\nET\n`;

    // Footer note if present
    if (draft.footerNote) {
      const footerNote = escapePdfText(draft.footerNote);
      stream += `BT\n/F1 7.5 Tf\n0.55 0.55 0.6 rg\n${marginX.toFixed(2)} 30.00 Td\n(${footerNote}) Tj\nET\n`;
    }

    const streamLength = stream.length;
    const contentsObjId = addObject(
      `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`,
    );

    const pageObjId = addObject(
      `<< /Type /Page /Parent ${pagesRootObjId} 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Contents ${contentsObjId} 0 R /Resources << /Font << /F1 ${fontRegularObjId} 0 R /F2 ${fontBoldObjId} 0 R >> >> >>`,
    );
    pageObjIds.push(pageObjId);
  }

  // Update Catalog & Pages Root
  objects[catalogObjId - 1] = `<< /Type /Catalog /Pages ${pagesRootObjId} 0 R >>`;
  objects[pagesRootObjId - 1] = `<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${totalPages} >>`;

  // Build Final String & XRef Table
  let pdfOutput = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const xrefOffsets: number[] = [0];

  for (let i = 0; i < objects.length; i++) {
    xrefOffsets.push(pdfOutput.length);
    pdfOutput += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefStart = pdfOutput.length;
  pdfOutput += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (let i = 1; i <= objects.length; i++) {
    const offsetStr = String(xrefOffsets[i]).padStart(10, "0");
    pdfOutput += `${offsetStr} 00000 n \n`;
  }

  pdfOutput += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogObjId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  const encoder = new TextEncoder();
  return encoder.encode(pdfOutput);
}

export function createContractPdfFile(draft: ContractDraft, filename?: string): File {
  const bytes = generateContractPdf(draft);
  const cleanName = (filename ?? draft.title.toLowerCase().replace(/[^a-z0-9]+/g, "_")) + ".pdf";
  return new File([bytes.buffer as ArrayBuffer], cleanName, { type: "application/pdf" });
}
