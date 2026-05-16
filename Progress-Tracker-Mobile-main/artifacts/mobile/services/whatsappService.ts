import { Linking, Platform } from "react-native";
import { User } from "../context/AppContext";

export class WhatsAppService {
  /**
   * Sanitizes a phone number to strictly numeric format.
   * Also ensures it does not start with + since wa.me prefers digits only.
   */
  static formatPhone(phone?: string): string {
    if (!phone) return "";
    return phone.replace(/\D/g, "");
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
    const url = `https://wa.me/${phone}?text=${encodedMessage}`;

    try {
      const supported = await Linking.canOpenURL(url);
      if (!supported) {
        throw new Error("WhatsApp does not seem to be installed or accessible.");
      }
      
      await Linking.openURL(url);
      return true;
    } catch (err: any) {
      // Re-throw our custom errors, otherwise wrap unknown errors
      if (err.message.includes("does not seem to be") || err.message.includes("valid WhatsApp number")) {
        throw err;
      }
      throw new Error("Failed to open WhatsApp. Please ensure it is installed.");
    }
  }
}
