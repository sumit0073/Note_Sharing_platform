"use client";

import { useState } from "react";
import { REPORT_REASONS, REPORT_REASON_LABELS } from "@/lib/constants";

export function NoteActions({
  noteId,
  searchId,
  canRate,
  isSignedIn,
  fileAvailable = true,
}: {
  noteId: string;
  searchId?: string;
  canRate: boolean;
  isSignedIn: boolean;
  fileAvailable?: boolean;
}) {
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState("");
  const [shareUrl, setShareUrl] = useState("");
  const [reason, setReason] = useState<(typeof REPORT_REASONS)[number]>("WRONG_INFORMATION");

  function announce(text: string, url = "") {
    setShareUrl(url);
    setMessage(text);
  }

  async function track(clickType: string) {
    if (!searchId) return;
    fetch("/api/search/click", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ searchId, clickType }),
    }).catch(() => {});
  }

  async function bookmark() {
    const response = await fetch("/api/bookmarks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "NOTE", noteId }),
    });
    announce(response.ok ? "Saved to your library." : "Sign in to bookmark notes.");
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      const input = document.createElement("textarea");
      input.value = url;
      input.setAttribute("readonly", "");
      input.style.position = "absolute";
      input.style.left = "0";
      input.style.top = "0";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.focus();
      input.select();
      input.setSelectionRange(0, url.length);
      const ok = document.execCommand("copy");
      document.body.removeChild(input);
      return ok;
    }
  }

  async function share() {
    const url = window.location.href;
    const preferNativeShare =
      typeof navigator.share === "function" &&
      window.matchMedia("(pointer: coarse)").matches;

    if (preferNativeShare) {
      try {
        await navigator.share({ title: "StudySphere note", url });
        announce("Link shared.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
    }

    const copied = await copyLink(url);
    announce(copied ? "Link copied." : "Copy this link.", copied ? "" : url);
  }

  async function rate() {
    const response = await fetch(`/api/notes/${noteId}/rate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, helpful: rating >= 4 }),
    });
    const data = await response.json();
    announce(response.ok ? "Rating saved." : data.error ?? "Could not save rating.");
  }

  async function report() {
    const response = await fetch(`/api/notes/${noteId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    const data = await response.json();
    announce(response.ok ? "Report submitted." : data.error ?? "Could not submit report.");
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {isSignedIn && !fileAvailable ? (
          <span className="rounded-full bg-forest/50 px-4 py-2 text-sm text-white">
            File unavailable
          </span>
        ) : (
          <a
            href={
              isSignedIn
                ? `/api/notes/${noteId}/download`
                : `/login?next=${encodeURIComponent(`/notes/${noteId}`)}`
            }
            onClick={() => {
              if (isSignedIn) track("community");
            }}
            className="rounded-full bg-forest px-4 py-2 text-sm text-white hover:bg-forest-dark"
          >
            Download
          </a>
        )}
        <button type="button" onClick={bookmark} className="rounded-full border border-line px-4 py-2 text-sm">
          Bookmark
        </button>
        <button type="button" onClick={share} className="rounded-full border border-line px-4 py-2 text-sm">
          Share
        </button>
      </div>

      {canRate && (
        <div className="rounded-2xl border border-line bg-paper p-4">
          <p className="text-sm font-medium">Rate this note</p>
          <div className="mt-2 flex gap-1">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                onClick={() => setRating(value)}
                className={`h-9 w-9 rounded-full ${rating >= value ? "bg-gold text-ink" : "bg-parchment"}`}
              >
                {value}
              </button>
            ))}
            <button
              onClick={rate}
              disabled={!rating}
              className="ml-2 rounded-full bg-ink px-3 text-sm text-paper disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-line bg-paper p-4">
        <p className="text-sm font-medium">Report note</p>
        <select
          value={reason}
          onChange={(event) => setReason(event.target.value as typeof reason)}
          className="mt-2 w-full rounded-xl border border-line bg-parchment px-3 py-2 text-sm"
        >
          {REPORT_REASONS.map((item) => (
            <option key={item} value={item}>
              {REPORT_REASON_LABELS[item]}
            </option>
          ))}
        </select>
        <button onClick={report} className="mt-3 rounded-full border border-line px-3 py-1.5 text-sm">
          Submit report
        </button>
      </div>
      {message && (
        <div className="space-y-2" role="status" aria-live="polite">
          <p className="text-sm text-forest">{message}</p>
          {shareUrl ? (
            <input
              readOnly
              value={shareUrl}
              onFocus={(event) => event.currentTarget.select()}
              className="w-full rounded-xl border border-line bg-paper px-3 py-2 text-xs text-ink"
            />
          ) : null}
        </div>
      )}
    </div>
  );
}
