import QRCode from "qrcode";

/** Inline SVG QR code. Server component. */
export async function Qr({ value, label }: { value: string; label: string }) {
  const svg = await QRCode.toString(value, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  return <span className="qr" role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />;
}
