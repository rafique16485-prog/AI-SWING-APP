import crypto from "node:crypto";

function signState(payload, secret) {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

export default function handler(req, res) {
  const clientId = process.env.UPSTOX_CLIENT_ID;
  const clientSecret = process.env.UPSTOX_CLIENT_SECRET;
  const redirectUri = process.env.UPSTOX_REDIRECT_URI || `https://${process.env.VERCEL_URL}/api/upstox/callback`;

  if (!clientId || !clientSecret || !redirectUri || redirectUri.includes("undefined")) {
    return res.status(500).json({ ok:false, error:"Missing UPSTOX_CLIENT_ID, UPSTOX_CLIENT_SECRET or UPSTOX_REDIRECT_URI" });
  }

  // Self-contained signed state avoids losing a session cookie during mobile redirects.
  const state = signState({
    nonce: crypto.randomUUID(),
    iat: Math.floor(Date.now() / 1000)
  }, clientSecret);

  const url = new URL("https://api.upstox.com/v2/login/authorization/dialog");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return res.redirect(302, url.toString());
}
