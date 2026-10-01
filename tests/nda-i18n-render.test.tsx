import { GlobalRegistrator } from "@happy-dom/global-registrator";
GlobalRegistrator.register({ url: "https://exemple.invalid/" });

import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
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
    render(<p role="alert"><LocalizedValidationMessage value={value} /></p>);

    expect(screen.getByRole("alert").textContent).toBe(
      "Champs à compléter avant génération : Raison sociale du client, Nom du signataire client, Fonction du signataire client.",
    );

    act(() => setLocale("en"));
    expect(screen.getByRole("alert").textContent).toBe(
      "Fields to complete before generation: Client legal name, Client signatory name, Client signatory position.",
    );

    act(() => setLocale("ja"));
    expect(screen.getByRole("alert").textContent).toBe(
      "生成前に入力が必要な項目：顧客の法人名、顧客署名者名、顧客署名者の役職。",
    );
  });
});