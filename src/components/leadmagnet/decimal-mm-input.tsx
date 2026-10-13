import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { parseDecimalMm } from "@/lib/leadmagnet/decimal";

/** Champ millimétrique contrôlé : accepte « 9.6 » et « 9,6 », conserve la
 *  saisie intermédiaire (« 9, ») telle quelle et ne publie un nombre que
 *  lorsqu'il est valide. Vide = inconnu (null), jamais zéro implicite. */
export function DecimalMmInput({
  id,
  value,
  onValue,
}: {
  id: string;
  value: number | null | undefined;
  onValue: (mm: number | null) => void;
}) {
  const [text, setText] = useState(value ? String(value) : "");
  useEffect(() => {
    // Valeur extérieure modifiée (reprise de dossier) : resynchroniser seulement
    // si elle diffère de ce que la saisie représente déjà.
    const parsed = parseDecimalMm(text);
    const outer = value && value > 0 ? value : null;
    if (parsed !== outer) setText(outer === null ? "" : String(outer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  const invalid = text.trim() !== "" && parseDecimalMm(text) === null && !/^\d+[.,]$/.test(text.trim());
  return (
    <Input
      id={id}
      className="t-metric w-32 text-right"
      inputMode="decimal"
      autoComplete="off"
      aria-invalid={invalid || undefined}
      value={text}
      onChange={(e) => {
        const raw = e.target.value;
        if (!/^[0-9.,\s]*$/.test(raw)) return;
        setText(raw);
        const mm = parseDecimalMm(raw);
        if (mm !== null || raw.trim() === "") onValue(mm);
      }}
    />
  );
}
