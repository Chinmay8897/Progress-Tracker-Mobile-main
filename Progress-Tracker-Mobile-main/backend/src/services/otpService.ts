import crypto from "crypto";
import nodemailer from "nodemailer";
import { getUserByEmail } from "./supabase/repositories.js";

interface OtpRecord {
  code: string;
  expiresAt: number;
  attempts: number;
  lastResentAt: number;
  verified: boolean;
}

const otpCache = new Map<string, OtpRecord>();
const OTP_TTL = 10 * 60 * 1000; // 10 minutes
const COOLDOWN = 60 * 1000; // 1 minute
const MAX_ATTEMPTS = 5;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.ethereal.email",
  port: parseInt(process.env.SMTP_PORT || "587"),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export const otpService = {
  async generateAndSendOtp(email: string) {
    const user = await getUserByEmail(email);
    if (!user) return true;

    const now = Date.now();
    const existing = otpCache.get(email);
    
    if (existing && now - existing.lastResentAt < COOLDOWN) {
      throw new Error("Please wait before requesting a new OTP.");
    }

    const code = crypto.randomInt(100000, 999999).toString();
    
    otpCache.set(email, {
      code,
      expiresAt: now + OTP_TTL,
      attempts: 0,
      lastResentAt: now,
      verified: false
    });

    try {
      await transporter.sendMail({
        from: '"TaskCommand Auth" <no-reply@taskcommand.app>',
        to: email,
        subject: "Your Password Reset OTP",
        text: `Your OTP for password reset is: ${code}. It expires in 10 minutes.`,
        html: `<b>Your OTP for password reset is: ${code}</b><br>It expires in 10 minutes.`,
      });
      console.log(`[OTP] Sent to ${email}: ${code}`);
    } catch (error) {
      console.error("[OTP] Failed to send email via SMTP:", error);
      if (process.env.NODE_ENV === "production") {
        throw new Error("Failed to send OTP email.");
      }
    }

    return true;
  },

  verifyOtp(email: string, code: string): boolean {
    const record = otpCache.get(email);
    if (!record) throw new Error("No active OTP request found or it has expired.");
    
    const now = Date.now();
    if (now > record.expiresAt) {
      otpCache.delete(email);
      throw new Error("OTP has expired. Please request a new one.");
    }
    
    if (record.attempts >= MAX_ATTEMPTS) {
      otpCache.delete(email);
      throw new Error("Too many failed attempts. Please request a new OTP.");
    }
    
    if (record.code !== code) {
      record.attempts += 1;
      throw new Error("Invalid OTP code.");
    }
    
    record.verified = true;
    return true;
  },

  isVerified(email: string): boolean {
    const record = otpCache.get(email);
    return !!record?.verified && Date.now() <= record.expiresAt;
  },

  clearOtp(email: string) {
    otpCache.delete(email);
  }
};
