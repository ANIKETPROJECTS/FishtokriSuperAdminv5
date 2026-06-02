import { Router } from "express";
import { createSign } from "node:crypto";

const router = Router();

function normalizePem(raw: string): string {
  const typeMatch = raw.match(/-----BEGIN (.+?)-----/);
  if (!typeMatch) throw new Error("Not a valid PEM string");
  const type = typeMatch[1];
  const b64 = raw
    .replace(/-----BEGIN .+?-----/g, "")
    .replace(/-----END .+?-----/g, "")
    .replace(/\s+/g, "");
  const lines = b64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${type}-----\n${lines.join("\n")}\n-----END ${type}-----`;
}

router.get("/qz-certificate", (_req, res) => {
  const cert = process.env.QZ_CERTIFICATE;
  if (!cert) {
    res.status(503).send("QZ_CERTIFICATE not configured");
    return;
  }
  const parts = cert.split("-----BEGIN CERTIFICATE-----");
  if (parts.length < 2) {
    res.status(503).send("QZ_CERTIFICATE is malformed");
    return;
  }
  const firstCert = "-----BEGIN CERTIFICATE-----\n" + parts[1].trim();
  res.type("text/plain").send(firstCert);
});

router.post("/sign-message", async (req, res) => {
  const privateKey = process.env.QZ_PRIVATE_KEY;
  if (!privateKey) {
    res.status(503).json({ error: "QZ_PRIVATE_KEY not configured" });
    return;
  }

  const message: string =
    typeof req.body === "string" ? req.body : JSON.stringify(req.body);

  try {
    const normalizedKey = normalizePem(privateKey);
    const signer = createSign("SHA512");
    signer.update(message);
    const signature = signer.sign({ key: normalizedKey, dsaEncoding: "der" }, "base64");
    res.type("text/plain").send(signature);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

export default router;
