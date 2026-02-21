import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const handler = NextAuth({
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
      authorization: { params: { prompt: "select_account" } },
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      // restringe por domínio do Workspace (ajuste)
      const allowedDomain = process.env.ALLOWED_DOMAIN || "agenciataj.com";
      const email = (profile as any)?.email || "";
      if (!email.endsWith("@" + allowedDomain)) return false;
      return true;
    },
    async session({ session }) {
      // RBAC simples por e-mail (você configura em env)
      const email = session.user?.email || "";
      const gc = (process.env.ROLE_GC || "").split(",").map(s=>s.trim()).filter(Boolean);
      const finYouth = (process.env.ROLE_FIN_YOUTH || "").split(",").map(s=>s.trim()).filter(Boolean);
      const finCore = (process.env.ROLE_FIN_CORE || "").split(",").map(s=>s.trim()).filter(Boolean);

      let role = "viewer";
      if (gc.includes(email)) role = "gc";
      if (finYouth.includes(email)) role = "finance_youth";
      if (finCore.includes(email)) role = "finance_core";

      (session as any).role = role;
      return session;
    },
  },
});

export { handler as GET, handler as POST };
