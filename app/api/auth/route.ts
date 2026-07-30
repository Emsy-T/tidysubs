import NextAuth from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import { createClient } from '@supabase/supabase-js';
import { encryptToken, decryptToken } from '@/lib/encryption';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!, //service-only, server-only -- Never expose this key!
);

async function refreshAccessToken(token: any) {
  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
      }),
    });

    const refreshed = await response.json();
    if (!response.ok) throw refreshed;

    return {
      ...token,
      accessToken: refreshed.access_token,
      accessTokenExpires: Date.now() + refreshed.expires_in * 1000,
      // Google usually doesn't send a new refresh_token on refresh — keep the old one
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
    };
  } catch (error) {
    // FR-13: treat as expected, not a crash — flag it so the client can prompt reconnect
    console.log('Refresh token invalid or revoked:', error);
    return { ...token, error: 'RefreshAccessTokenError' };
  }
}

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'openid email profile https://www.googleapis.com/auth/youtube',
          access_type: 'offline',
          prompt: 'consent',
        },
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account, profile }) {
      // First sign-in: account and profile are only present on the initial OAuth callback
      if (account && profile) {
        token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token;
        token.accessTokenExpires =
          Date.now() + (account.expires_in as number) * 1000;
        token.googleId = profile.sub;

        // FR-9: persist refresh token server-side, in our own DB
        await supabase.from('users').upsert(
          {
            google_id: profile.sub,
            email: profile.email,
            refresh_token: encryptToken(token.refreshToken as string),
            last_synced_at: new Date().toISOString(),
          },
          { onConflict: 'google_id' },
        );

        return token;
      }

      // Token still valid — nothing to do
      if (Date.now() < (token.accessTokenExpires as number)) {
        return token;
      }

      // Access token expired — refresh it
      return refreshAccessToken(token);
    },

    async session({ session, token }) {
      // Access token stays server-side; only expose what the client needs
      (session as any).error = token.error;
      return session;
    },
  },
});

export { handler as GET, handler as POST };
