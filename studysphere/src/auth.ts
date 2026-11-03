import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";
import { loginSchema } from "@/lib/validations";
import { verifyTurnstileToken } from "@/lib/turnstile";
import {
  authRedirectBase,
  canonicalAppOrigin,
  ensureProductionAuthUrl,
  isLocalOrigin,
} from "@/lib/app-origin";

ensureProductionAuthUrl();

/** Thrown when Turnstile Siteverify fails — maps to a friendly login message. */
export class TurnstileSignin extends CredentialsSignin {
  code = "turnstile";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        turnstileToken: { label: "Turnstile", type: "text" },
      },
      authorize: async (credentials) => {
        const turnstileOk = await verifyTurnstileToken(credentials?.turnstileToken);
        if (!turnstileOk) {
          throw new TurnstileSignin();
        }

        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const user = await prisma.user.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!user) return null;

        const valid = await compare(parsed.data.password, user.passwordHash);
        if (!valid) return null;

        if (user.status === "SUSPENDED") {
          throw new Error("This account has been suspended.");
        }
        if (user.status === "PENDING_VERIFICATION" || !user.emailVerified) {
          throw new Error("Please verify your email before signing in.");
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role as "STUDENT" | "ADMIN",
          status: user.status,
        };
      },
    }),
  ],
  callbacks: {
    async redirect({ url, baseUrl }) {
      const safeBase = authRedirectBase(baseUrl);
      if (url.startsWith("/")) return `${safeBase}${url}`;
      try {
        const next = new URL(url);
        if (isLocalOrigin(next.origin)) {
          if (process.env.NODE_ENV === "production") {
            return `${safeBase}${next.pathname}${next.search}`;
          }
          return `${next.origin}${next.pathname}${next.search}`;
        }
        const allowed = new Set([
          safeBase,
          canonicalAppOrigin(),
          "https://www.studysphere.space",
          "https://studysphere.space",
        ]);
        if (allowed.has(next.origin)) return next.toString();
      } catch {
        /* fall through */
      }
      return safeBase;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id!;
        token.role = user.role;
        token.status = user.status;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.id);
        session.user.role = token.role as "STUDENT" | "ADMIN";
        session.user.status = String(token.status);
      }
      return session;
    },
  },
});
