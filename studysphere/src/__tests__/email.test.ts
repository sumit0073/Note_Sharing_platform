import { afterEach, describe, expect, it } from "vitest";
import { appUrl } from "@/lib/email";
import {
  buildPasswordResetEmail,
  buildVerificationEmail,
} from "@/lib/email-templates";

const env = process.env as Record<string, string | undefined>;
const originalAuthUrl = process.env.AUTH_URL;
const originalNodeEnv = process.env.NODE_ENV;

afterEach(() => {
  if (originalAuthUrl === undefined) delete env.AUTH_URL;
  else env.AUTH_URL = originalAuthUrl;
  env.NODE_ENV = originalNodeEnv;
});

describe("appUrl", () => {
  it("uses AUTH_URL when configured", () => {
    env.AUTH_URL = "https://studysphere.space";
    env.NODE_ENV = "production";
    expect(appUrl("/verify-email?token=abc")).toBe(
      "https://studysphere.space/verify-email?token=abc",
    );
  });

  it("never emits localhost links when AUTH_URL is local", () => {
    env.AUTH_URL = "http://localhost:3000";
    env.NODE_ENV = "development";
    expect(appUrl("/reset-password?token=xyz")).toBe(
      "https://studysphere.space/reset-password?token=xyz",
    );
  });

  it("falls back to studysphere.space when AUTH_URL is missing", () => {
    delete env.AUTH_URL;
    env.NODE_ENV = "development";
    expect(appUrl("/verify-email?token=abc")).toBe(
      "https://studysphere.space/verify-email?token=abc",
    );
  });
});

describe("email templates", () => {
  it("builds a verification email with required copy and absolute logo", () => {
    const mail = buildVerificationEmail({
      name: "Alex",
      verifyUrl: "https://studysphere.space/verify-email?token=abc",
    });
    expect(mail.subject).toBe("Verify your StudySphere email");
    expect(mail.text).toContain("Welcome to StudySphere!");
    expect(mail.text).toContain("expires in 24 hours");
    expect(mail.text).toContain(
      "https://studysphere.space/verify-email?token=abc",
    );
    expect(mail.html).toContain("Verify Email");
    expect(mail.html).toContain(
      "https://studysphere.space/studysphere-logo.png",
    );
    expect(mail.html).toContain("&copy; StudySphere");
  });

  it("builds a password-reset email with required copy", () => {
    const mail = buildPasswordResetEmail({
      resetUrl: "https://studysphere.space/reset-password?token=xyz",
    });
    expect(mail.subject).toBe("Reset your StudySphere password");
    expect(mail.text).toContain("expires in 1 hour");
    expect(mail.text).toContain(
      "If you didn't request a password reset, you can safely ignore this email.",
    );
    expect(mail.html).toContain("Reset Password");
    expect(mail.html).toContain(
      "https://studysphere.space/reset-password?token=xyz",
    );
  });

  it("escapes HTML in the recipient name", () => {
    const mail = buildVerificationEmail({
      name: `<img src=x onerror=alert(1)>`,
      verifyUrl: "https://studysphere.space/verify-email?token=abc",
    });
    expect(mail.html).not.toContain("<img src=x");
    expect(mail.html).toContain("&lt;img src=x");
  });
});
