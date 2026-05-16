import { Linking, Share } from "react-native";
import { normalizePhoneNumber } from "./normalizePhoneNumber";

export interface WhatsAppShareResult {
  method: "whatsapp-app" | "whatsapp-web" | "share-sheet";
}

function encode(text: string) {
  return encodeURIComponent(text);
}

/**
 * Tries to share via WhatsApp deep link; falls back to wa.me; then falls back to the system share sheet.
 */
export async function shareToWhatsApp(text: string, phoneNumber?: string): Promise<WhatsAppShareResult> {
  const encoded = encode(text);
  const normalizedPhone = normalizePhoneNumber(phoneNumber) || undefined;
  const appUrl = normalizedPhone
    ? `whatsapp://send?phone=${normalizedPhone}&text=${encoded}`
    : `whatsapp://send?text=${encoded}`;
  const webUrl = normalizedPhone
    ? `https://wa.me/${normalizedPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;

  try {
    const canOpenApp = await Linking.canOpenURL(appUrl);
    if (canOpenApp) {
      await Linking.openURL(appUrl);
      return { method: "whatsapp-app" };
    }
  } catch {
    // ignore and try web fallback
  }

  try {
    const canOpenWeb = await Linking.canOpenURL(webUrl);
    if (canOpenWeb) {
      await Linking.openURL(webUrl);
      return { method: "whatsapp-web" };
    }
  } catch {
    // Last resort: system share sheet
  }
  
  await Share.share({ message: text });
  return { method: "share-sheet" };
}
