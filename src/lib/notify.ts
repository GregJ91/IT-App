import nodemailer, { type Transporter } from "nodemailer";
import { config } from "./config";

type Mail = { to: string | string[]; subject: string; text: string };

let transport: Transporter | null = null;
function getTransport() {
  if (!process.env.SMTP_HOST) return null;
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  return transport;
}

/** Sends an email, or prints it to the server log when SMTP isn't set up. Never throws. */
export async function sendMail(mail: Mail) {
  const to = [mail.to].flat().filter(Boolean);
  if (to.length === 0) return;
  const t = getTransport();
  try {
    if (!t) {
      console.log(`[mail] to=${to.join(",")} subject="${mail.subject}"\n${mail.text}\n`);
      return;
    }
    await t.sendMail({ from: process.env.MAIL_FROM ?? `IT Hub <it@localhost>`, to, subject: mail.subject, text: mail.text });
  } catch (err) {
    console.error("[mail] failed to send", err);
  }
}

export const link = (p: string) => `${config.appUrl}${p}`;
