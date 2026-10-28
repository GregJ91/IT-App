import { requireIT } from "@/lib/session";
import { Scanner } from "./scanner";

export const metadata = { title: "Scan" };

export default async function Scan() {
  await requireIT();
  return (
    <div className="page narrow">
      <div className="page-head">
        <div>
          <h1>Scan a label</h1>
          <p className="sub">Point the camera at an IT Hub QR label to open the item or shelf.</p>
        </div>
      </div>
      <Scanner />
    </div>
  );
}
