import { supabaseAdmin, supabaseAuthClient } from "./supabase/supabaseClient.js";
import { getUserByEmail, getUserById, insertAuditLog, sanitizeUser, type UserRole } from "./supabase/repositories.js";

const AVATAR_COLORS = [
  "#1a6cf5", "#16a34a", "#9333ea", "#dc2626", "#ea580c",
  "#0891b2", "#ca8a04", "#be185d", "#4f46e5", "#059669",
];

export const authService = {
  async register(name: string, email: string, password: string, phoneNumber?: string | null, role: UserRole = "manager") {
    const existing = await getUserByEmail(email);
    if (existing) {
       throw new Error("An account with this email may already exist.");
    }
    
    const createdAuth = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name },
    });
    
    if (createdAuth.error || !createdAuth.data.user?.id) {
      throw new Error(createdAuth.error?.message ?? "Registration failed");
    }
    
    const userId = createdAuth.data.user.id;
    
    try {
      const { data, error } = await supabaseAdmin
        .from("users")
        .insert({
          id: userId,
          name,
          email,
          phone_number: phoneNumber ?? null,
          role,
          avatar_color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
        })
        .select("*")
        .single();
        
      if (error) throw error;
      
      const signedIn = await supabaseAuthClient.auth.signInWithPassword({ email, password });
      if (signedIn.error || !signedIn.data.session) {
         throw new Error("Registration completed but session could not be established");
      }
      
      await insertAuditLog("auth.register", userId, { email });
      
      return {
        token: signedIn.data.session.access_token,
        refreshToken: signedIn.data.session.refresh_token,
        user: sanitizeUser(data, true),
      };
    } catch (err) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw err;
    }
  },

  async login(email: string, password: string) {
    const signedIn = await supabaseAuthClient.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session || !signedIn.data.user?.id) {
      throw new Error("Invalid email or password");
    }

    const profile = await getUserById(signedIn.data.user.id);
    if (!profile) {
      throw new Error("User profile is missing");
    }

    await insertAuditLog("auth.login", profile.id, { email: profile.email });
    
    return {
      token: signedIn.data.session.access_token,
      refreshToken: signedIn.data.session.refresh_token,
      user: sanitizeUser(profile, true),
    };
  },
  
  async resetPassword(email: string, newPassword: string) {
    const profile = await getUserByEmail(email);
    if (!profile) {
      throw new Error("User not found");
    }
    
    const updated = await supabaseAdmin.auth.admin.updateUserById(profile.id, {
      password: newPassword,
    });
    
    if (updated.error) {
      throw new Error(updated.error.message);
    }
    
    await insertAuditLog("auth.reset_password", profile.id);
  }
};
