import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "STUDENT" | "ADMIN";
      status: string;
    } & DefaultSession["user"];
  }

  interface User {
    sessionVersion: number;
    role: "STUDENT" | "ADMIN";
    status: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    sessionVersion: number;
    id: string;
    role: "STUDENT" | "ADMIN";
    status: string;
  }
}
