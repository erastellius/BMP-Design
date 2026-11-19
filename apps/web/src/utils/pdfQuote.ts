import { jsPDF } from "jspdf";
import type { PlacedPart } from "../store/useCanvasStore";

export function downloadPdfQuote(previewUrl: string, parts: PlacedPart[]) {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
  doc.setFillColor(15, 17, 21);
  doc.rect(0, 0, 612, 792, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.text("BMP-Design Pergola Quote", 40, 50);
  doc.setFontSize(10);
  doc.text(`Quote date: ${new Date().toLocaleDateString()}`, 40, 72);

  if (previewUrl) {
    try {
      doc.addImage(previewUrl, "JPEG", 40, 90, 532, 300, undefined, "FAST");
    } catch {
      doc.setFillColor(24, 26, 32);
      doc.rect(40, 90, 532, 300, "F");
    }
  }

  const counts = new Map<string, { name: string; sku: string; qty: number; unitPrice: number }>();
  for (const part of parts) {
    const key = part.sku;
    const row = counts.get(key) || { name: part.name, sku: part.sku, qty: 0, unitPrice: part.unitPrice };
    row.qty++;
    counts.set(key, row);
  }
  let y = 430;
  doc.setFontSize(12);
  doc.text("Manufacturing Bill of Materials", 40, y);
  y += 24;
  doc.setFontSize(9);
  doc.text("SKU", 40, y);
  doc.text("Item", 150, y);
  doc.text("Qty", 430, y);
  doc.text("Subtotal", 480, y);
  y += 12;
  let total = 0;
  for (const row of counts.values()) {
    const subtotal = row.qty * row.unitPrice;
    total += subtotal;
    doc.text(row.sku, 40, y);
    doc.text(row.name.slice(0, 32), 150, y);
    doc.text(String(row.qty), 430, y);
    doc.text(`$${subtotal.toFixed(2)}`, 480, y);
    y += 18;
  }
  doc.setDrawColor(100, 104, 115);
  doc.line(40, y + 4, 572, y + 4);
  doc.setFontSize(13);
  doc.text(`Estimated Total: $${total.toFixed(2)}`, 380, y + 28);
  doc.save("BMP-Design-Quote.pdf");
}
