// Server-side settings read from the environment.
const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

export const config = {
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  appName: "IT Hub",
  companyName: "Gardeners Dream",
  allowedEmailDomains: list(process.env.ALLOWED_EMAIL_DOMAINS),
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  maxUploadBytes: 10 * 1024 * 1024,
  maxUploadsPerTicket: 5,
  inviteDays: 7,
  providers: {
    google: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
    microsoft: !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
    slack: !!(process.env.SLACK_CLIENT_ID && process.env.SLACK_CLIENT_SECRET),
  },
};

export type Provider = keyof typeof config.providers;

export function emailDomainAllowed(email: string) {
  const domain = email.toLowerCase().split("@")[1] ?? "";
  return config.allowedEmailDomains.includes(domain);
}
