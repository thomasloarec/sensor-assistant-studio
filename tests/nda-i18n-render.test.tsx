import { GlobalRegistrator } from "@happy-dom/global-registrator";
if (typeof document === "undefined" || typeof window === "undefined") {
  GlobalRegistrator.unregister();
  GlobalRegistrator.register({ url: "https://exemple.invalid/" });
}

import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import * as React from "react";
import { LocalizedValidationMessage } from "../src/components/leadmagnet/localized-validation-message";
import { setLocale } from "../src/lib/i18n/core";

afterEach(() => {
  cleanup();
  setLocale("fr");
});

describe("rendu réactif des validations NDA", () => {
  test("une erreur déjà affichée change entièrement de langue avec la locale", () => {
    setLocale("fr");
    const value = JSON.stringify({
      kind: "nda-missing",
      fields: ["Raison sociale du client", "Nom du signataire client", "Fonction du signataire client"],
    });
    const view = render(<p role="alert"><LocalizedValidationMessage value={value} /></p>);

    expect(view.getByRole("alert").textContent).toBe(
      "Champs à compléter avant génération : Raison sociale du client, Nom du signataire client, Fonction du signataire client.",
    );

    act(() => setLocale("en"));
    expect(view.getByRole("alert").textContent).toBe(
      "Complete these fields before generating: Client legal name, Client signatory name, Client signatory position.",
    );

    act(() => setLocale("ja"));
    expect(view.getByRole("alert").textContent).toBe(
      "生成前に入力する項目：顧客の法人名, 顧客署名者名, 顧客署名者の役職。",
    );
  });
});