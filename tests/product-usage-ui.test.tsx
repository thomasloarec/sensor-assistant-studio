import { GlobalRegistrator } from "@happy-dom/global-registrator";
if (typeof document === "undefined" || typeof window === "undefined") {
  try {
    GlobalRegistrator.register({ url: "https://example.invalid/" });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes("already been globally registered"))
      throw error;
  }
}
import { afterEach, beforeEach, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import * as React from "react";
import {
  ProductUsage,
  USAGE_LABELS,
  type UsageLoader,
} from "../src/components/leadmagnet/product-usage";
import { LANGUAGES, setLocale, t } from "../src/lib/i18n/core";
import messages from "../src/lib/i18n/messages.json";
import type { UsageReport } from "../src/lib/usage/model";
const empty: UsageReport = {
  now: "2026-11-20T12:00:00Z",
  since: "2026-11-14T00:00:00Z",
  sessions: [],
};
beforeEach(async () => {
  // Several legacy suites remove window while retaining document in this process.
  if (typeof window === "undefined" || typeof document === "undefined") {
    try { await GlobalRegistrator.unregister(); } catch {}
    GlobalRegistrator.register({ url: "https://example.invalid/" });
  }
});
afterEach(() => {
  cleanup();
  setLocale("fr");
});

test("the four blocks and their dynamic labels change language without refetching", async () => {
  let calls = 0;
  const loader: UsageLoader = async () => {
    calls++;
    return empty;
  };
  const view = render(<ProductUsage loadReport={loader} />);
  await waitFor(() => expect(view.queryByText(t("Chargement…"))).toBeNull());
  for (const locale of LANGUAGES) {
    act(() => setLocale(locale.id));
    for (const key of [
      "Usage produit",
      "Jusqu’où vont les utilisateurs ?",
      "Où s’arrêtent-ils ?",
      "Difficultés rencontrées",
    ])
      expect(view.getByRole("heading", { name: t(key) })).toBeTruthy();
    expect(view.getByText(t("Visiteurs observés"))).toBeTruthy();
    expect(
      view.getByText(
        t(
          "Aucun usage mesuré sur cette période. Les chiffres apparaîtront après les premières utilisations autorisées.",
        ),
      ),
    ).toBeTruthy();
    for (const key of Object.values(USAGE_LABELS))
      expect((messages as Record<string, string[]>)[key]?.length).toBe(7);
  }
  expect(calls).toBe(1);
});

test("a period change ignores an older request that finishes late", async () => {
  let resolveFirst!: (r: UsageReport) => void;
  const loader: UsageLoader = (days) =>
    days === 7
      ? new Promise((resolve) => {
          resolveFirst = resolve;
        })
      : Promise.resolve(empty);
  const view = render(<ProductUsage loadReport={loader} />);
  fireEvent.change(view.getByRole("combobox"), { target: { value: "30" } });
  await waitFor(() => expect(view.queryByText(t("Chargement…"))).toBeNull());
  await act(async () => resolveFirst({ ...empty, since: "2020-01-01T00:00:00Z" }));
  expect(view.container.textContent).not.toContain("2020");
}, 15000);

test("an unavailable report is not shown as zero usage and its error is translated", async () => {
  const loader: UsageLoader = async () => {
    throw Error("network details should stay private");
  };
  const view = render(<ProductUsage loadReport={loader} />);
  await waitFor(() => expect(view.getByRole("alert")).toBeTruthy());
  expect(view.queryByText(t("Visiteurs observés"))).toBeNull();
  act(() => setLocale("en"));
  expect(view.getByRole("alert").textContent).toBe(
    t("Le suivi des usages n’est pas encore disponible."),
  );
  expect(view.container.textContent).not.toContain("network details");
});
