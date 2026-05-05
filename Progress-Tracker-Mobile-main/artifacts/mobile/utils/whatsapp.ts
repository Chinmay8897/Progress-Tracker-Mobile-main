import { Linking, Share } from "react-native";

export interface WhatsAppShareResult {
  method: "whatsapp-app" | "whatsapp-web" | "share-sheet";
}

function encode(text: string) {
  return encodeURIComponent(text);
}

/**
 * Tries to share via WhatsApp deep link; falls back to wa.me; then falls back to the system share sheet.
 */
export async function shareToWhatsApp(text: string): Promise<WhatsAppShareResult> {
  const encoded = encode(text);
  const appUrl = `whatsapp://send?text=${encoded}`;
  const webUrl = `https://wa.me/?text=${encoded}`;

  try {
    // Prefer the actual app deep link when WhatsApp is installed.
    await Linking.openURL(appUrl);
    return { method: "whatsapp-app" };
  } catch {
    // ignore and try web fallback
  }

  try {
    await Linking.openURL(webUrl);
    return { method: "whatsapp-web" };
  } catch {
    // Last resort: system share sheet
    await Share.share({ message: text });
    return { method: "share-sheet" };
  }
}
