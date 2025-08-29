const express = require("express");
const { v4: uuidv4 } = require("uuid");
const fetch = require("node-fetch");

const app = express();
app.use(express.raw({ type: "application/pdf", limit: "200mb" }));

const state = new Map();

app.post("/upload", async (req, res) => {
  const fileId = req.get("x-file-id");
  const pageNumber = Number(req.get("x-page-number"));
  const totalPages = Number(req.get("x-total-pages"));
  const filename = decodeURIComponent(req.get("x-filename"));

  if (!fileId || !pageNumber || !totalPages || !filename) {
    return res.status(400).send("Missing headers");
  }

  const uuid = uuidv4();
  const blobName = `${uuid}.pdf`;
  
  const signedUrlResp = await fetch("http://localhost:8081/Api/V1/Files/URLs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: blobName, contentType: "application/pdf" })
  });
  const signedUrl = await signedUrlResp.json();

  await fetch(signedUrl.url, {
    method: "PUT",
    headers: signedUrl.headers,
    body: req.body
  });

  let fileState = state.get(fileId) || { totalPages, received: 0, filename, pages: [] };
  fileState.received++;
  fileState.pages.push(signedUrl.blobUrl);
  state.set(fileId, fileState);

  if (fileState.received === totalPages) {
    const manifest = {
      originalName: filename,
      totalPages,
      pages: fileState.pages
    };

    const manifestName = `${fileId}-manifest.json`;
    const manifestSignedUrlResp = await fetch("http://localhost:8081/Api/V1/Files/URLs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: manifestName, contentType: "application/json" })
    });
    const manifestSignedUrl = await manifestSignedUrlResp.json();

    await fetch(manifestSignedUrl.url, {
      method: "PUT",
      headers: manifestSignedUrl.headers,
      body: Buffer.from(JSON.stringify(manifest, null, 2))
    });
    

    state.delete(fileId);
    return res.json({
      status: "complete",
      manifestUrl: manifestSignedUrl.blobUrl,
      originalName: filename,
      totalPages
    });
  }

  res.json({ status: "page received", pageNumber });
});

app.listen(4000, () => console.log("Server running on http://localhost:4000"));
