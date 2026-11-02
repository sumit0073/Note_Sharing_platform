"use client";

import { useState } from "react";
import { DEPARTMENTS, SEMESTERS } from "@/lib/constants";

export type ProfileFormValues = {
  name: string;
  department: string | null;
  semester: number | null;
  bio: string | null;
};

export function ProfileForm({ initial }: { initial: ProfileFormValues }) {
  const [message, setMessage] = useState("");

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/profile", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        department: form.get("department") || undefined,
        semester: form.get("semester") || undefined,
        bio: form.get("bio") || undefined,
      }),
    });
    const data = await response.json();
    setMessage(response.ok ? "Profile updated." : data.error ?? "Update failed");
  }

  return (
    <>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <input
          name="name"
          required
          placeholder="Name"
          defaultValue={initial.name}
          className="w-full rounded-xl border border-line bg-paper px-4 py-3"
        />
        <select
          name="department"
          defaultValue={initial.department ?? ""}
          className="w-full rounded-xl border border-line bg-paper px-4 py-3"
        >
          <option value="">Department</option>
          {DEPARTMENTS.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <select
          name="semester"
          defaultValue={initial.semester ? String(initial.semester) : ""}
          className="w-full rounded-xl border border-line bg-paper px-4 py-3"
        >
          <option value="">Semester</option>
          {SEMESTERS.map((item) => (
            <option key={item} value={item}>
              Semester {item}
            </option>
          ))}
        </select>
        <textarea
          name="bio"
          placeholder="Bio"
          defaultValue={initial.bio ?? ""}
          className="h-28 w-full rounded-xl border border-line bg-paper px-4 py-3"
        />
        <button className="rounded-full bg-forest px-6 py-3 text-white">Save</button>
      </form>
      {message && <p className="mt-4 text-sm">{message}</p>}
    </>
  );
}
