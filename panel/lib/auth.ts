import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,

  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: { params: { prompt: "select_account" } },
    }),
  ],

  callbacks: {
    async signIn({ profile }) {
      const allowedDomain = process.env.ALLOWED_DOMAIN || "agenciataj.com";
      const email = (profile as any)?.email || "";
      if (!email.endsWith("@" + allowedDomain)) return false;
      return true;
    },

    async session({ session }) {
      const email = session.user?.email || "";

      const gc = (process.env.ROLE_GC || "")
        .split(",").map(s => s.trim()).filter(Boolean);
      const finYouth = (process.env.ROLE_FIN_YOUTH || "")
        .split(",").map(s => s.trim()).filter(Boolean);
      const finCore = (process.env.ROLE_FIN_CORE || "")
        .split(",").map(s => s.trim()).filter(Boolean);

      let role: "viewer" | "gc" | "finance_youth" | "finance_core" = "viewer";
      if (gc.includes(email)) role = "gc";
      if (finYouth.includes(email)) role = "finance_youth";
      if (finCore.includes(email)) role = "finance_core";

      (session as any).role = role;
      return session;
    },
  },
};
