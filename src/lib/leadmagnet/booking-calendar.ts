/** Créneaux proposés en démonstration : demi-heures d'une journée de travail.
 *  Ce ne sont PAS les disponibilités réelles du responsable : aucun agenda n'est
 *  lu, aucune écriture n'est faite, aucune invitation n'est envoyée. */
const SLOT_MINUTES = [9 * 60, 9 * 60 + 30, 10 * 60, 10 * 60 + 30, 11 * 60, 14 * 60, 14 * 60 + 30, 15 * 60, 15 * 60 + 30, 16 * 60] as const;
const OPEN_DAYS = 10;

/** Jours ouvrés à venir, à partir d'aujourd'hui. Un jour n'est proposé que s'il
 *  lui reste au moins un créneau dans le futur. */
export function demoDays(now: Date, days = OPEN_DAYS): Date[] {
  if (!Number.isFinite(now.getTime()) || !Number.isInteger(days) || days < 0 || days > 60) return [];
  const out: Date[] = [];
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (out.length < days) {
    const weekday = cursor.getDay();
    if (weekday !== 0 && weekday !== 6 && demoSlots(cursor, now).length > 0)
      out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}

/** Créneaux d'un jour, strictement postérieurs à l'instant présent. */
export function demoSlots(day: Date, now: Date): Date[] {
  if (day.getDay() === 0 || day.getDay() === 6) return [];
  return SLOT_MINUTES.map(
    (minutes) =>
      new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(minutes / 60), minutes % 60),
  ).filter((slot) => slot.getTime() > now.getTime());
}

/* --------------------------------------------------------------------------
 * Calendrier : semaine de travail lundi → vendredi, navigation par semaine et
 * par mois. La navigation est purement locale à cet écran : elle ne lit ni
 * n'écrit aucun agenda, et un jour sans créneau futur reste non sélectionnable.
 * ------------------------------------------------------------------------ */
const dayOnly = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Lundi de la semaine contenant `d`. */
export function weekStart(d: Date): Date {
  const base = dayOnly(d);
  const shift = (base.getDay() + 6) % 7; // lundi = 0
  base.setDate(base.getDate() - shift);
  return base;
}

/** Les cinq jours ouvrés de la semaine commençant au lundi `monday`. */
export function workWeek(monday: Date): Date[] {
  const start = weekStart(monday);
  return [0, 1, 2, 3, 4].map((i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return d;
  });
}

/** Premier lundi qui tombe RÉELLEMENT dans le mois de `d`. */
function firstMondayInMonth(d: Date): Date {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const shift = (8 - first.getDay()) % 7; // 0 si le 1er est déjà un lundi
  return dayOnly(new Date(first.getFullYear(), first.getMonth(), 1 + shift));
}

/**
 * Décalage de semaines (`unit: "week"`) ou de mois (`unit: "month"`).
 *
 * Pour un mois, on vise le premier lundi SITUÉ DANS le mois cible. Prendre le
 * lundi de la semaine du 1er ramenait dans le mois précédent (28 septembre pour
 * octobre, 30 novembre pour décembre) et le libellé du mois semblait bloqué.
 */
export function shiftWeek(monday: Date, delta: number, unit: "week" | "month"): Date {
  const d = weekStart(monday);
  if (unit === "week") {
    d.setDate(d.getDate() + delta * 7);
    return weekStart(d);
  }
  // Le mois affiché est celui du lundi de la semaine (libellé monthLabel(monday)).
  return firstMondayInMonth(new Date(d.getFullYear(), d.getMonth() + delta, 1));
}

/** Un jour n'est proposé que s'il lui reste au moins un créneau futur. */
export function daySelectable(day: Date, now: Date): boolean {
  return demoSlots(day, now).length > 0;
}

/**
 * Semaine réellement atteinte : revenir au mois en cours ramène à la semaine
 * courante, pas à un lundi déjà passé. Les deux boutons et leur état désactivé
 * utilisent cette même valeur, donc l'affichage ne peut pas mentir.
 */
export function navigateMonday(monday: Date, now: Date, delta: number, unit: "week" | "month"): Date {
  const target = shiftWeek(monday, delta, unit);
  const floor = weekStart(now);
  if (unit === "month" && target.getTime() < floor.getTime()) {
    const sameMonth =
      target.getFullYear() === now.getFullYear() && target.getMonth() === now.getMonth();
    if (sameMonth) return floor;
  }
  return target;
}

/** Navigation bornée : jamais avant la semaine en cours, jamais au-delà d'un an. */
export function weekNavigable(monday: Date, now: Date, delta: number, unit: "week" | "month"): boolean {
  const target = navigateMonday(monday, now, delta, unit);
  const floor = weekStart(now);
  const ceiling = weekStart(new Date(now.getFullYear() + 1, now.getMonth(), now.getDate()));
  if (target.getTime() === weekStart(monday).getTime()) return false;
  return target.getTime() >= floor.getTime() && target.getTime() <= ceiling.getTime();
}


