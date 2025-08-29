const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const fetch = require("node-fetch");
const { v4: uuidv4 } = require("uuid");
const libre = require("libreoffice-convert");
const util = require("util");
const convertAsync = util.promisify(libre.convert);

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

async function convertDocxToPdf(filePath) {
  const docxBuf = fs.readFileSync(filePath);
  const pdfBuf = await convertAsync(docxBuf, ".pdf", undefined);

  const tempPdf = path.join(__dirname, "temp-converted.pdf");
  fs.writeFileSync(tempPdf, pdfBuf);
  return tempPdf;
}

async function main(filePath) {
  const filename = path.basename(filePath);
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".pdf") {
    await processPdf(filePath, filename);
  } else if (ext === ".docx") {

    const tempPdf = await convertDocxToPdf(filePath);
    await processPdf(tempPdf, filename);
    fs.unlinkSync(tempPdf); 
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
