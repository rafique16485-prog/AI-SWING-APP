function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || "").split(";")) {
    const i = part.indexOf("=");
    if (i > -1) out[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim());
  }
  return out;
}
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
export default async function handler(req, res) {
  const { code, state, error, error_description } = req.query || {};
  if (error) return res.status(400).send(page("Upstox login cancelled", error_description || error));
  const cookies = parseCookies(req);
  if (!code || !state || !cookies.upstox_oauth_state || state !== cookies.upstox_oauth_state) {
    return res.status(400).send(page("OAuth state error", "Security validation failed. Please start Connect Upstox again."));
  }

  const clientId = process.env.UPSTOX_CLIENT_ID;
  const clientSecret = process.env.UPSTOX_CLIENT_SECRET;
  const redirectUri = process.env.UPSTOX_REDIRECT_URI || `https://${process.env.VERCEL_URL}/api/upstox/callback`;
  if (!clientId || !clientSecret || !redirectUri || redirectUri.includes("undefined")) {
    return res.status(500).send(page("Server configuration missing", "Add UPSTOX_CLIENT_ID, UPSTOX_CLIENT_SECRET and UPSTOX_REDIRECT_URI in Vercel Production environment variables."));
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
    const clearState = [
      "upstox_oauth_state=",
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      "Max-Age=0",
      secure ? "Secure" : ""
    ].filter(Boolean).join("; ");

    res.setHeader("Set-Cookie", [tokenCookie, clearState]);
    return res.status(200).send(page("Upstox connected ✓", "Your access token is stored in an HttpOnly session cookie. Go back to the app and tap Scan Market Now.", true));
  } catch (e) {
    return res.status(500).send(page("Connection error", e.message || "Unexpected server error."));
  }
}
