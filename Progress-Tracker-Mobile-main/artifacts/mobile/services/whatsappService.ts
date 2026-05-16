import { Linking, Platform } from "react-native";
import { User } from "../context/AppContext";
import { normalizePhoneNumber } from "../utils/normalizePhoneNumber";

export class WhatsAppService {
  /**
   * Sanitizes a phone number to strictly numeric format.
   * Also ensures it does not start with + since wa.me prefers digits only.
   */
  static formatPhone(phone?: string): string {
    if (!phone) return "";
    return normalizePhoneNumber(phone) || "";
  }

  /**
   * Sends a WhatsApp message using a deep link.
   * Handles app-not-installed scenarios safely.
   */
  static async sendMessage(user: User, message: string): Promise<boolean> {
    const phone = this.formatPhone(user.phoneNumber);
    if (!phone) {
      throw new Error(`User ${user.name} does not have a valid WhatsApp number.`);
    }

    const encodedMessage = encodeURIComponent(message);
    const appUrl = `whatsapp://send?phone=${phone}&text=${encodedMessage}`;
    const webUrl = `https://wa.me/${phone}?text=${encodedMessage}`;

    try {
      const canOpenApp = await Linking.canOpenURL(appUrl);
      if (canOpenApp) {
        await Linking.openURL(appUrl);
        return true;
      }
      
      const canOpenWeb = await Linking.canOpenURL(webUrl);
      if (canOpenWeb) {
        await Linking.openURL(webUrl);
        return true;
      }
      
      throw new Error("WhatsApp does not seem to be installed or accessible.");
    } catch (err: any) {
      if (err.message.includes("does not seem to be") || err.message.includes("valid WhatsApp number")) {
        throw err;
      }
      throw new Error("Failed to open WhatsApp. Please ensure it is installed.");
    }
  }
}
