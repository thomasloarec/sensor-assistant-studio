import { afterEach, expect, test } from "bun:test";
import React from "react";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
if (typeof document === "undefined") GlobalRegistrator.register({ url: "http://localhost/" });
const { render, cleanup, fireEvent, waitFor } = await import("@testing-library/react");
import { DEFAULT_WORKSHOP } from "../src/lib/standex/magnetic-workshop";
import {
  catalogueFrame,
  catalogueModel,
  cataloguePlacement,
} from "../src/lib/standex/catalogue-pedagogical";
import { illustrativeContact } from "../src/lib/standex/pedagogical-contact";
import {
  ClientPlacementStatus,
  ClientZoneLegend,
} from "../src/components/standex/workshop/client-guidance";
import { setLocale } from "../src/lib/i18n/core";
afterEach(() => {
  cleanup();
  setLocale("fr");
});

test("MK04/M04 starts outside detection then activates: the message follows the same circuit, not a cycle verdict", async () => {
  setLocale("en");
  const c = { ...DEFAULT_WORKSHOP, sensorId: "MK04", magnetModel: "M04" };
  const before = cataloguePlacement(c, catalogueFrame(c, 0).pose),
    near = cataloguePlacement(c, catalogueFrame(c, 0.5).pose);
  const initial = illustrativeContact(before, catalogueModel(c).className),
    active = illustrativeContact(near, catalogueModel(c).className);
  expect(initial).toBe("open");
  expect(active).toBe("closed");
  const { default: Workshop } = await import("../src/components/standex/workshop/workshop");
  const v = render(
    <Workshop
      clientPedagogical
      embedded
      initialConfig={c}
      storageMode="memory"
      onClose={() => {}}
      onSave={async () => {}}
    />,
  );
  expect(v.getByTestId("client-pedagogical-verdict").textContent).toContain("At this position");
  expect(v.getByTestId("client-instant-state").textContent).toBe("Magnet not detected");
  expect(v.getByTestId("client-pedagogical-verdict").textContent).not.toMatch(
    /unfavourable|adapted|check with Standex/i,
  );
  expect(
    v
      .getByTestId("pedagogical-circuit")
      .querySelector("[data-contact]")
      ?.getAttribute("data-contact"),
  ).toBe("open");
  fireEvent.change(v.getByRole("slider", { name: "Position in cycle" }), {
    target: { value: "50" },
  });
  await waitFor(() =>
    expect(v.getByTestId("client-instant-state").textContent).toBe("Magnet detected"),
  );
  expect(
    v
      .getByTestId("pedagogical-circuit")
      .querySelector("[data-contact]")
      ?.getAttribute("data-contact"),
  ).toBe("closed");
  fireEvent.change(v.getByRole("slider", { name: "Position in cycle" }), {
    target: { value: "100" },
  });
  await waitFor(() =>
    expect(v.getByTestId("client-instant-state").textContent).toBe("Magnet not detected"),
  );
});

test("unavailable geometry never appears as a valid open or closed contact", () => {
  const v = render(<ClientPlacementStatus contact={null} cause="overlap" playing={false} />);
  expect(v.getByTestId("client-instant-state").textContent).toBe("Position à ajuster");
  expect(v.getByText("Vérifiez l’espace autour du capteur et de l’aimant.")).toBeTruthy();
  v.rerender(<ClientPlacementStatus contact={null} cause="motion" playing={false} />);
  expect(v.getByText("Définissez le mouvement de votre modèle.")).toBeTruthy();
});

test("model details are available behind one closed disclosure; class A never explains a nonexistent yellow band", () => {
  const v = render(
    <ClientZoneLegend sensor="MK04" magnet="M04" variableZone>
      <p>Modèle 66 adapté</p>
    </ClientZoneLegend>,
  );
  const details = v.getByTestId("client-product-legend").querySelector("details")!;
  expect(details.open).toBe(false);
  expect(details.textContent).toContain("Modèle 66 adapté");
  expect(v.getByText("Détection selon la sensibilité")).toBeTruthy();
  v.rerender(
    <ClientZoneLegend sensor="MK04" magnet="M04" variableZone={false}>
      <p>Modèle 66 adapté</p>
    </ClientZoneLegend>,
  );
  expect(v.queryByText("Détection selon la sensibilité")).toBeNull();
  expect(v.getByTestId("client-product-legend").textContent).not.toContain("zone jaune");
});
