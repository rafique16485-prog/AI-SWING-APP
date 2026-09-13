import crypto from "node:crypto";

function page(title, message, ok=false) {
  const color = ok ? "#10b981" : "#ef4444";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>SWINGPRO AI</title></head>
  <body style="margin:0;background:#050b14;color:#e5e7eb;font-family:system-ui;padding:28px">
  <div style="max-width:480px;margin:12vh auto;background:#0b1424;border:1px solid #1e293b;border-radius:20px;padding:24px">
  <div style="color:${color};font-weight:800;font-size:13px">SWINGPRO AI</div><h1 style="margin:8px 0 10px">${title}</h1>
  <p style="color:#94a3b8;line-height:1.5">${message}</p>
  <a href="/" style="display:inline-block;margin-top:12px;padding:12px 16px;border-radius:12px;background:#10b981;color:#04110b;text-decoration:none;font-weight:800">BACK TO APP</a>
  </div></body></html>`;
}

function verifyState(state, secret) {
  if (!state || !secret) return false;
  const dot = state.lastIndexOf(".");
  if (dot <= 0) return false;
  const data = state.slice(0, dot);
  const provided = state.slice(dot + 1);
  try {
    const expected = crypto.createHmac("sha256", secret).update(data).digest("base64url");
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8"));
    const age = Math.floor(Date.now() / 1000) - Number(payload.iat);
    return Number.isFinite(age) && age >= 0 && age <= 600;
  } catch {
    return false;
  }
}

export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query || {};
  if (error) return res.status(400).send(page("Upstox login cancelled", error_description || error));

  const clientId = process.env.UPSTOX_CLIENT_ID;
  const clientSecret = process.env.UPSTOX_CLIENT_SECRET;
  const redirectUri = process.env.UPSTOX_REDIRECT_URI || `https://${process.env.VERCEL_URL}/api/upstox/callback`;

  if (!clientId || !clientSecret || !redirectUri || redirectUri.includes("undefined")) {
    return res.status(500).send(page("Server configuration missing", "Add UPSTOX_CLIENT_ID, UPSTOX_CLIENT_SECRET and UPSTOX_REDIRECT_URI in Vercel Production environment variables."));
  }

  if (!code || !verifyState(state, clientSecret)) {
    return res.status(400).send(page("OAuth state error", "Security validation failed. Please start Connect Upstox again."));
  }

  try {
    const body = new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: "authorization_code"
    });
    const r = await fetch("https://api.upstox.com/v2/login/authorization/token", {
      method:"POST",
      headers:{"accept":"application/json","Content-Type":"application/x-www-form-urlencoded"},
      body
    });
    const data = await r.json();
    if (!r.ok || !data.access_token) {
      return res.status(502).send(page("Upstox token exchange failed", data.message || data.error || "Upstox did not return an access token."));
    }

    const secure = req.headers["x-forwarded-proto"] === "https" || process.env.VERCEL === "1";
    const tokenCookie = [
      `upstox_access_token=${encodeURIComponent(data.access_token)}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=82800",
      secure ? "Secure" : ""
    ].filter(Boolean).join("; ");

    res.setHeader("Set-Cookie", tokenCookie);
    return res.status(200).send(page("Upstox connected ✓", "Your access token is stored in an HttpOnly session cookie. Go back to the app and tap Scan Market Now.", true));
  } catch (e) {
    return res.status(500).send(page("Connection error", e.message || "Unexpected server error."));
  }
}
