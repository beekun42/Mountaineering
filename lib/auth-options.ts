import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { getUserByUsernameKey } from "@/lib/db";
import { parseUsername } from "@/lib/username";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      id: "username",
      name: "ユーザー名",
      credentials: {
        username: { label: "ユーザー名", type: "text" },
      },
      async authorize(credentials) {
        const raw = credentials?.username;
        if (typeof raw !== "string") return null;
        const parsed = parseUsername(raw);
        if (!parsed.ok) return null;
        const user = await getUserByUsernameKey(parsed.key);
        if (!user) return null;
        return { id: user.id, name: user.username };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 60 * 60 * 24 * 30,
  },
  pages: {
    signIn: "/",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.name = user.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.name = (token.name as string) ?? session.user.name;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};
