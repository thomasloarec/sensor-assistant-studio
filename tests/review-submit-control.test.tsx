import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ReviewSubmitControl } from "../src/components/leadmagnet/review-submit-control";

const noop = () => undefined;
const render = (patch: Partial<React.ComponentProps<typeof ReviewSubmitControl>> = {}) =>
  renderToStaticMarkup(
    <ReviewSubmitControl
      busy={false}
      operation={null}
      ndaGuidance={null}
      canRefreshNda={false}
      authenticated={false}
      message={null}
      messageTone="info"
      onSubmit={noop}
      onOpenNda={noop}
      onRefreshNda={noop}
      {...patch}
    />,
  );

describe("contrôle rendu de transmission", () => {
  test("NDA requis non vérifié : CTA cliquable, explication et action accessibles", () => {
    const html = render({ ndaGuidance: "Le NDA est demandé, mais la preuve manque." });
    expect(html).not.toContain("disabled");
    expect(html).toContain('id="review-submit-guidance"');
    expect(html).toContain("Ouvrir Confidentialité et NDA");
  });

  test("NDA vérifié ou non requis : aucun faux blocage", () => {
    const html = render({ ndaGuidance: null });
    expect(html).not.toContain("disabled");
    expect(html).not.toContain("review-submit-guidance");
  });

  test("une vraie opération seule désactive et porte son libellé", () => {
    const html = render({ busy: true, operation: "upload" });
    expect(html).toContain("disabled");
    expect(html).toContain("Dépôt et vérification du fichier 3D en cours");
    expect(html).not.toContain("Envoi en cours");
  });

  test("un échec n'utilise jamais le style succès", () => {
    const html = render({ message: "Envoi refusé", messageTone: "danger" });
    expect(html).toContain("notice-danger");
    expect(html).not.toContain("notice-success");
    expect(html).toContain('role="alert"');
  });
});