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

      if (authError || !authData.session || !authData.user) {
        throw new Error(authError?.message || "Failed to establish secure session");
      }

      const profile = await ensureUserProfile({
        id: authData.user.id,
        email: authData.user.email!,
        name: payload.name || payload.email!.split("@")[0],
      });

      return {
        token: authData.session.access_token,
        refreshToken: authData.session.refresh_token,
        user: sanitizeUser(profile, true),
      };
    } catch (err: any) {
      console.error("[GoogleAuth] Verification failed:", err);
      throw new Error("Google authentication failed. " + (err.message || ""));
    }
  }
};
