"use client";

import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const SCRIPT_ID = "cf-turnstile-script";
const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: {
      sitekey: string;
      theme?: "light" | "dark" | "auto";
      size?: "normal" | "flexible" | "compact";
      appearance?: "always" | "execute" | "interaction-only";
      callback?: (token: string) => void;
      "error-callback"?: () => void;
      "expired-callback"?: () => void;
      "timeout-callback"?: () => void;
    },
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId?: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

function loadTurnstileScript(): Promise<TurnstileApi> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Turnstile requires a browser"));
  }
  if (window.turnstile) return Promise.resolve(window.turnstile);

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      if (window.turnstile) {
        resolve(window.turnstile);
        return;
      }
      existing.addEventListener("load", () => {
        if (window.turnstile) resolve(window.turnstile);
        else reject(new Error("Turnstile failed to load"));
      });
      existing.addEventListener("error", () =>
        reject(new Error("Turnstile script error")),
      );
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile failed to load"));
    };
    script.onerror = () => reject(new Error("Turnstile script error"));
    document.head.appendChild(script);
  });
}

export type TurnstileFieldProps = {
  /** Form field name submitted to the server. */
  name?: string;
  /** Bump this value to reset the widget (e.g. after a failed submit). */
  resetSignal?: number;
  onTokenChange?: (token: string | null) => void;
  className?: string;
};

/**
 * Cloudflare Turnstile (Managed mode) widget for auth forms.
 * Site key is public; the secret must only be used server-side.
 */
export function TurnstileField({
  name = "turnstileToken",
  resetSignal = 0,
  onTokenChange,
  className,
}: TurnstileFieldProps) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() ?? "";
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onTokenChangeRef = useRef(onTokenChange);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "unconfigured">(
    siteKey ? "loading" : "unconfigured",
  );
  const labelId = useId();
  const statusId = useId();

  useEffect(() => {
    onTokenChangeRef.current = onTokenChange;
  }, [onTokenChange]);

  useEffect(() => {
    if (!siteKey || !containerRef.current) {
      setStatus("unconfigured");
      setToken("");
      onTokenChangeRef.current?.(null);
      return;
    }

    let cancelled = false;

    loadTurnstileScript()
      .then((turnstile) => {
        if (cancelled || !containerRef.current) return;

        if (widgetIdRef.current) {
          try {
            turnstile.remove(widgetIdRef.current);
          } catch {
            /* widget may already be gone */
          }
          widgetIdRef.current = null;
        }

        containerRef.current.innerHTML = "";
        const id = turnstile.render(containerRef.current, {
          sitekey: siteKey,
          theme: "light",
          size: "flexible",
          appearance: "always",
          callback: (value) => {
            setToken(value);
            setStatus("ready");
            onTokenChangeRef.current?.(value);
          },
          "error-callback": () => {
            setToken("");
            setStatus("error");
            onTokenChangeRef.current?.(null);
          },
          "expired-callback": () => {
            setToken("");
            onTokenChangeRef.current?.(null);
            if (widgetIdRef.current) {
              try {
                turnstile.reset(widgetIdRef.current);
              } catch {
                /* ignore */
              }
            }
          },
          "timeout-callback": () => {
            setToken("");
            setStatus("error");
            onTokenChangeRef.current?.(null);
          },
        });
        widgetIdRef.current = id;
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
          setToken("");
          onTokenChangeRef.current?.(null);
        }
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
        widgetIdRef.current = null;
      }
    };
    // Re-render when site key or reset signal changes.
  }, [siteKey, resetSignal]);

  if (!siteKey) {
    return (
      <div
        className={cn(
          "rounded-xl border border-line bg-paper px-4 py-3 text-sm text-muted",
          className,
        )}
        role="status"
      >
        Security check is not configured. Set NEXT_PUBLIC_TURNSTILE_SITE_KEY to
        enable Turnstile.
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <p id={labelId} className="text-sm text-muted">
        Security check
      </p>
      <div
        ref={containerRef}
        className="min-h-[65px]"
        role="group"
        aria-labelledby={labelId}
        aria-describedby={statusId}
        suppressHydrationWarning
      />
      <input type="hidden" name={name} value={token} readOnly />
      <p id={statusId} className="sr-only" aria-live="polite">
        {status === "loading" && "Loading security check"}
        {status === "ready" && (token ? "Security check completed" : "Complete the security check")}
        {status === "error" && "Security check failed. Please try again."}
      </p>
      {status === "error" && (
        <p className="text-sm text-terracotta" role="alert">
          Security check failed. Please try again.
        </p>
      )}
    </div>
  );
}
