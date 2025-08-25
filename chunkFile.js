const fs = require("fs");
const path = require("path");
const { PDFDocument } = require("pdf-lib");
const mammoth = require("mammoth");
const fetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");

const SERVER_URL = "http://localhost:4000/upload";

async function sendPage(buffer, fileId, pageNumber, totalPages, filename) {
  const res = await fetch(SERVER_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/pdf",
      "x-file-id": fileId,
      "x-page-number": pageNumber,
      "x-total-pages": totalPages,
      "x-filename": encodeURIComponent(filename),
    },
    body: buffer,
  });

  if (!res.ok) {
    throw new Error(`Error uploading page ${pageNumber}: ${res.statusText}`);
  }

  const json = await res.json();
  console.log("Server response:", json);
}

async function processPdf(filePath, filename) {
  const data = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(data);
  const totalPages = pdfDoc.getPageCount();
  const fileId = uuidv4();

  for (let i = 0; i < totalPages; i++) {
    const newPdf = await PDFDocument.create();
    const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
    newPdf.addPage(copiedPage);

    const pdfBytes = await newPdf.save();
    await sendPage(Buffer.from(pdfBytes), fileId, i + 1, totalPages, filename);
  }
}

async function processDocx(filePath, filename) {
  const data = fs.readFileSync(filePath);

  const { value: html } = await mammoth.extractRawText({ buffer: data });

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage();
  const { height } = page.getSize();
  const font = await pdfDoc.embedFont(PDFDocument.PDFName.of("Helvetica"));
  page.drawText(html.substring(0, 2000), {
    x: 50,
    y: height - 100,
    size: 12,
    font,
  });

  const pdfBytes = await pdfDoc.save();

  const tempPdf = path.join(__dirname, "temp.pdf");
  fs.writeFileSync(tempPdf, pdfBytes);

  await processPdf(tempPdf, filename);

  fs.unlinkSync(tempPdf);
}

async function main(filePath) {
  const filename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    await processPdf(filePath, filename);
  } else if (ext === ".docx") {
    await processDocx(filePath, filename);
  } else {
    console.error("Unsupported file type:", ext);
  }
}

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: node chunkFile.js <file>");
  process.exit(1);
}

main(filePath).catch(err => console.error("Error:", err));
