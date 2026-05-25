import { OAuth2Client } from 'google-auth-library';
import { supabaseAuthClient } from './supabase/supabaseClient.js';
import { sanitizeUser } from './supabase/repositories.js';
import { ensureUserProfile } from '../middleware/auth.js';

const client = new OAuth2Client();

export const googleTokenVerificationService = {
  async verifyAndSync(idToken: string) {
    try {
      const ticket = await client.verifyIdToken({
        idToken,
      });
      
      const payload = ticket.getPayload();
      if (!payload || !payload.email) {
        throw new Error("Invalid Google token payload");
      }

      const { data: authData, error: authError } = await supabaseAuthClient.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });

      if (authError || !authData?.session || !authData?.user?.id) {
        throw new Error(authError?.message || "Failed to establish secure session or user data is missing");
      }

      const { profile, isNewUser } = await ensureUserProfile({
        id: authData.user.id,
        email: authData.user.email || payload.email,
        name: payload.name || payload.email.split("@")[0],
      });

      if (!profile || !profile.id) {
        throw new Error("User profile could not be created or retrieved correctly.");
      }

      return {
        token: authData.session.access_token,
        refreshToken: authData.session.refresh_token,
        user: sanitizeUser(profile, true),
        isNewUser,
      };
    } catch (err: any) {
      console.error("[GoogleAuth] Verification failed:", err);
      // If a user registered with email/password tries to login with Google and linking is off,
      // supabase-js or the insert might fail.
      if (err instanceof TypeError && err.message.includes("reading 'id'")) {
         throw new Error("An account with this email already exists. Please log in with your email and password.");
      }
      if (err.code === '23505') {
         throw new Error("An account with this email already exists. Please log in with your email and password.");
      }
      throw new Error("Google authentication failed. " + (err.message || ""));
    }
  }
};
