"use client";

import { useState } from "react";
import { buildApiUrl } from "../../lib/api";

export default function CreateListingPage() {
  const [form, setForm] = useState({
    title: "",
    description: "",
    price: "",
    currency: "PLN",
    category: "",
    workspaceId: "workspace-1",
  });

  const [status, setStatus] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("submitting...");

    try {
      const res = await fetch(buildApiUrl("/listings"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, price: Number(form.price) }),
      });

      if (!res.ok) {
        const err = await res.json();
        setStatus(`Error: ${err.message ?? "Unknown error"}`);
        return;
      }

      const data = await res.json();
      setStatus(`Created! ID: ${data.id}`);
    } catch (error) {
      setStatus(`Network error: ${error instanceof Error ? error.message : "Unknown"}`);
    }
  };

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: 20 }}>
      <h1>Create Listing Draft</h1>

      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          Title:
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Description:
          <textarea
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={5}
            required
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Price:
          <input
            type="number"
            min="0"
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            required
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <label>
          Category:
          <input
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
            required
            style={{ width: "100%", padding: 8 }}
          />
        </label>

        <button type="submit" style={{ padding: "12px 24px", fontSize: 16, cursor: "pointer" }}>
          Create Draft
        </button>
      </form>

      {status && (
        <p style={{ marginTop: 16, padding: 12, background: "#f0f0f0", borderRadius: 8 }}>
          {status}
        </p>
      )}
    </main>
  );
}
