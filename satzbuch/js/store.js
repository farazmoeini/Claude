// Zustand der App: Pläne, Trainings, laufendes Training, Einstellungen.
// Alles liegt in localStorage unter einem Schlüssel und wird nach jeder Änderung gespeichert.
import { uid, normName, parseZahl } from "./util.js";
import { validierePlan } from "./parser.js";

export const SCHLUESSEL = "satzbuch.v1";

function leererZustand() {
  return {
    version: 1,
    plaene: [],
    aktiverPlanId: null,
    trainings: [],
    aktiv: null,
    einstellungen: { pause: 90, ton: true, apiKey: "", letzteSicherung: null },
  };
}

function istZustand(o) {
  return o && o.version === 1 && Array.isArray(o.plaene) && Array.isArray(o.trainings);
}

function ersteZahl(wdh) {
  const m = String(wdh ?? "").match(/\d+/);
  return m ? Number(m[0]) : null;
}

export function createStore(storage = globalThis.localStorage) {
  let state = leererZustand();
  const roh = storage.getItem(SCHLUESSEL);
  if (roh) {
    try {
      const geladen = JSON.parse(roh);
      if (!istZustand(geladen)) throw new Error("unbekanntes Format");
      state = { ...leererZustand(), ...geladen, einstellungen: { ...leererZustand().einstellungen, ...geladen.einstellungen } };
    } catch {
      // Nichts überschreiben, was sich vielleicht noch retten lässt.
      storage.setItem(SCHLUESSEL + ".defekt", roh);
    }
  }

  const store = {
    get state() {
      return state;
    },
    get aktiv() {
      return state.aktiv;
    },
    save() {
      storage.setItem(SCHLUESSEL, JSON.stringify(state));
    },

    // ---- Pläne ----
    setPlan(plan, { aktivSetzen = true } = {}) {
      const p = validierePlan(plan);
      const i = state.plaene.findIndex((x) => x.id === p.id);
      if (i >= 0) state.plaene[i] = p;
      else state.plaene.push(p);
      if (aktivSetzen || !state.aktiverPlanId) state.aktiverPlanId = p.id;
      store.save();
      return p;
    },
    loeschePlan(id) {
      state.plaene = state.plaene.filter((p) => p.id !== id);
      if (state.aktiverPlanId === id) state.aktiverPlanId = state.plaene[0]?.id ?? null;
      store.save();
    },
    aktiverPlan() {
      return state.plaene.find((p) => p.id === state.aktiverPlanId) ?? null;
    },
    plan(id) {
      return state.plaene.find((p) => p.id === id) ?? null;
    },

    /** Letzte erledigte Sätze einer Übung aus abgeschlossenen Trainings. */
    letzteSaetze(name) {
      const key = normName(name);
      for (let i = state.trainings.length - 1; i >= 0; i--) {
        const e = state.trainings[i].eintraege.find((x) => normName(x.uebungName) === key);
        if (e && e.saetze.length) return e.saetze;
      }
      return null;
    },

    // ---- Training ----
    starteTraining(planId, tagId, jetzt = Date.now()) {
      const plan = store.plan(planId);
      const tag = plan?.tage.find((t) => t.id === tagId);
      if (!tag) throw new Error("Trainingstag nicht gefunden");
      state.aktiv = {
        id: uid(),
        planId,
        tagId,
        tagName: tag.name,
        start: jetzt,
        ende: null,
        timer: null,
        eintraege: tag.uebungen.map((u) => store._neuerEintrag(u)),
      };
      store.save();
      return state.aktiv;
    },
    _neuerEintrag(u) {
      const anzahl = u.saetze || 3;
      const letzte = store.letzteSaetze(u.name);
      const saetze = [];
      for (let i = 0; i < anzahl; i++) {
        const vorlage = letzte ? letzte[Math.min(i, letzte.length - 1)] : null;
        saetze.push({
          kg: vorlage ? vorlage.kg : u.gewicht ?? null,
          wdh: vorlage ? vorlage.wdh : ersteZahl(u.wdh),
          erledigtUm: null,
          pauseVorher: null,
        });
      }
      return { uebungName: u.name, zielWdh: String(u.wdh ?? ""), pause: u.pause || state.einstellungen.pause, notiz: u.notiz || "", saetze };
    },
    uebungHinzufuegen(name) {
      if (!state.aktiv) return;
      state.aktiv.eintraege.push(store._neuerEintrag({ name, saetze: 3, wdh: "10" }));
      store.save();
    },
    uebungEntfernen(eIdx) {
      state.aktiv?.eintraege.splice(eIdx, 1);
      store.save();
    },
    satzHinzufuegen(eIdx) {
      const e = state.aktiv?.eintraege[eIdx];
      if (!e) return;
      const letzter = e.saetze[e.saetze.length - 1];
      e.saetze.push({ kg: letzter?.kg ?? null, wdh: letzter?.wdh ?? null, erledigtUm: null, pauseVorher: null });
      store.save();
    },
    satzEntfernen(eIdx, sIdx) {
      const e = state.aktiv?.eintraege[eIdx];
      if (!e || e.saetze.length <= 1) return;
      e.saetze.splice(sIdx, 1);
      store.save();
    },
    aktualisiereSatz(eIdx, sIdx, { kg, wdh }) {
      const s = state.aktiv?.eintraege[eIdx]?.saetze[sIdx];
      if (!s) return;
      if (kg !== undefined) s.kg = kg === "" || kg === null ? null : parseZahl(kg);
      if (wdh !== undefined) s.wdh = wdh === "" || wdh === null ? null : parseZahl(wdh);
      store.save();
    },
    _letzteErledigung() {
      let max = null;
      for (const e of state.aktiv.eintraege) for (const s of e.saetze) if (s.erledigtUm && (max === null || s.erledigtUm > max)) max = s.erledigtUm;
      return max;
    },
    satzAbhaken(eIdx, sIdx, jetzt = Date.now()) {
      const s = state.aktiv?.eintraege[eIdx]?.saetze[sIdx];
      if (!s) return;
      const vorher = store._letzteErledigung();
      s.pauseVorher = vorher === null ? null : Math.round((jetzt - vorher) / 1000);
      s.erledigtUm = jetzt;
      store.save();
    },
    satzZuruecksetzen(eIdx, sIdx) {
      const s = state.aktiv?.eintraege[eIdx]?.saetze[sIdx];
      if (!s) return;
      s.erledigtUm = null;
      s.pauseVorher = null;
      store.save();
    },
    starteTimer(sekunden, jetzt = Date.now()) {
      if (!state.aktiv) return;
      state.aktiv.timer = { start: jetzt, endetUm: jetzt + sekunden * 1000 };
      store.save();
    },
    verschiebeTimer(sekunden) {
      const t = state.aktiv?.timer;
      if (!t) return;
      t.endetUm += sekunden * 1000;
      store.save();
    },
    stoppeTimer() {
      if (!state.aktiv) return;
      state.aktiv.timer = null;
      store.save();
    },
    abbrechenTraining() {
      state.aktiv = null;
      store.save();
    },
    beendeTraining(jetzt = Date.now()) {
      const a = state.aktiv;
      if (!a) return null;
      state.aktiv = null;
      const eintraege = a.eintraege
        .map((e) => ({ ...e, saetze: e.saetze.filter((s) => s.erledigtUm) }))
        .filter((e) => e.saetze.length);
      if (!eintraege.length) {
        store.save();
        return null;
      }
      const { timer, ...rest } = a;
      const fertig = { ...rest, ende: jetzt, eintraege };
      state.trainings.push(fertig);
      store.save();
      return fertig;
    },
    loescheTraining(id) {
      state.trainings = state.trainings.filter((t) => t.id !== id);
      store.save();
    },
    ersetzeTraining(t) {
      const i = state.trainings.findIndex((x) => x.id === t.id);
      if (i >= 0) state.trainings[i] = t;
      store.save();
    },

    // ---- Sicherung ----
    exportJSON(jetzt = Date.now()) {
      state.einstellungen.letzteSicherung = jetzt;
      store.save();
      const kopie = JSON.parse(JSON.stringify(state));
      kopie.einstellungen.apiKey = "";
      kopie.exportiertAm = jetzt;
      return JSON.stringify(kopie, null, 1);
    },
    importJSON(text) {
      const daten = JSON.parse(text); // wirft bei kaputtem JSON
      if (!istZustand(daten)) throw new Error("Das ist keine Satzbuch-Sicherung");
      daten.plaene.forEach(validierePlan);
      const apiKey = state.einstellungen.apiKey;
      const { exportiertAm, ...rest } = daten;
      state = { ...leererZustand(), ...rest, einstellungen: { ...leererZustand().einstellungen, ...rest.einstellungen, apiKey } };
      store.save();
    },
    allesLoeschen() {
      state = leererZustand();
      store.save();
    },
  };
  return store;
}
