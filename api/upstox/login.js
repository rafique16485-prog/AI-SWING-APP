export default function handler(req, res) {
  const clientId = process.env.UPSTOX_CLIENT_ID;
  const redirectUri = process.env.UPSTOX_REDIRECT_URI || `https://${process.env.VERCEL_URL}/api/upstox/callback`;

  if (!clientId || !redirectUri || redirectUri.includes("undefined")) {
    return res.status(500).json({ ok:false, error:"Missing UPSTOX_CLIENT_ID or UPSTOX_REDIRECT_URI" });
  }

  const state = crypto.randomUUID();
  const isHttps = req.headers["x-forwarded-proto"] === "https" || process.env.VERCEL === "1";
  const cookie = [
    `upstox_oauth_state=${encodeURIComponent(state)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=600",
    isHttps ? "Secure" : ""
  ].filter(Boolean).join("; ");

  res.setHeader("Set-Cookie", cookie);
  const url = new URL("https://api.upstox.com/v2/login/authorization/dialog");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  return res.redirect(302, url.toString());
}
