// @ts-nocheck  (gewone JavaScript; geen typecontrole nodig)
// Prullenbakmelder – dagmail
// Supabase Edge Function: stuurt elke dag om 15:00 (Nederlandse tijd) een mail met de meldingen van die dag
// als PDF-bijlage (zelfde opmaak als het dagrapport in de app). Wordt elk uur aangeroepen door Supabase Cron
// en doet alleen iets om 15:00 Amsterdam-tijd (zo klopt het ook na de overgang zomer-/wintertijd).
//
// Benodigde secrets (Supabase → Edge Functions → Secrets):
//   RESEND_API_KEY   sleutel van resend.com
//   DAGMAIL_AAN      e-mailadres van de ontvanger
//   DAGMAIL_GEHEIM   willekeurige tekst; alleen nodig voor ?test=1 en ?dag=… (header x-dagmail-geheim)
// De gewone dagmail heeft geen geheim nodig: hij gaat alleen om 15:00 en maximaal één keer per dag
// (tabel dagmail_log, zie dagmail-setup.sql).
// Optioneel: DAGMAIL_UUR (standaard 15), DAGMAIL_VAN (standaard "Prullenbakmelder <onboarding@resend.dev>")
// SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY zet Supabase zelf.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { jsPDF } from "npm:jspdf@2.5.1";

const TZ = "Europe/Amsterdam";
const env = (k, d = "") => Deno.env.get(k) || d;

/* datum/tijd in Nederlandse tijd */
const deel = (d, opt) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, ...opt }).format(d);
const dagKey = d => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const uurNu = () => +deel(new Date(), { hour: "2-digit", hourCycle: "h23" });
const tijd = ts => deel(new Date(ts), { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
// tijd, met datum ervoor als de melding van een andere dag is (bv. gisteren na 15:00)
const wanneer = (m, dag) => (m.dag !== dag ? new Date(m.ts).toLocaleDateString("nl-NL", { timeZone: TZ, day: "numeric", month: "short" }) + " " : "") + tijd(m.ts);
const dagLang = key => { const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("nl-NL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }); };
const mapsUrl = (lat, lon) => `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lon.toFixed(6)}`;
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* PDF: zelfde opbouw als in de app. lijst[i].fotos = [{ data: Uint8Array, w, h }] */
export function maakPdf(jsPDF, dag, lijst, logo) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 15, CW = W - 2 * M;
  const groen = [0, 130, 49], roze = [197, 1, 75], grijs = [93, 107, 98];   // huisstijlkleuren AREA
  const dl = dagLang(dag);
  if (logo) { try { doc.addImage(logo, "JPEG", M, 9, 40, 40 * 288 / 646); } catch (e) { console.warn("logo", e); } }
  doc.setTextColor(...groen); doc.setFont("helvetica", "bold"); doc.setFontSize(17);
  doc.text("Meldingen prullenbakken", W - M, 15, { align: "right" });
  doc.setTextColor(0); doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  doc.text(dl.charAt(0).toUpperCase() + dl.slice(1), W - M, 21.5, { align: "right" });
  doc.setTextColor(...grijs); doc.text(`${lijst.length} melding${lijst.length === 1 ? "" : "en"}`, W - M, 27, { align: "right" });
  doc.setFillColor(...groen); doc.rect(0, 32, W, 2.2, "F"); doc.setFillColor(...roze); doc.rect(M, 32, 30, 2.2, "F");
  let y = 43;
  doc.setFontSize(10);
  const melders = [...new Set(lijst.map(m => m.melder).filter(Boolean))];
  if (melders.length) { doc.setTextColor(...grijs); const r = doc.splitTextToSize(`Gemeld door: ${melders.join(", ")}`, CW); doc.text(r, M, y); y += r.length * 4.6 + 1.5; }
  doc.setTextColor(0); doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Overzicht", M, y); y += 5;
  doc.setFont("helvetica", "normal"); doc.setFontSize(9.5);
  lijst.forEach((m, i) => {
    if (y > H - 20) { doc.addPage(); y = 20; }
    const r = `${i + 1}.  ${wanneer(m, dag)}  ${m.adres || "onbekende plek"}${m.soorten.length ? " — " + m.soorten.join(", ") : ""}${m.verstuurd ? "  (al verstuurd)" : ""}`;
    const regels = doc.splitTextToSize(r, CW); doc.text(regels, M, y); y += regels.length * 4.4 + 1;
  });
  lijst.forEach((m, i) => {
    doc.addPage(); y = 18;
    doc.setFillColor(...groen); doc.circle(M + 4, y - 1.5, 4, "F");
    doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(String(i + 1), M + 4, y, { align: "center" });
    doc.setTextColor(0); doc.setFontSize(14);
    const kop = doc.splitTextToSize(m.adres || "Onbekende plek", CW - 12); doc.text(kop, M + 11, y); y += kop.length * 6 + 1;
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...grijs);
    doc.text(`${dagLang(m.dag)}, ${tijd(m.ts)} uur${m.nummer ? "   ·   Nummer bak: " + m.nummer : ""}${m.melder ? "   ·   " + m.melder : ""}`, M + 11, y); y += 7;
    doc.setTextColor(0);
    const veld = (label, waarde, link) => {
      doc.setFont("helvetica", "bold"); doc.text(label, M, y);
      doc.setFont("helvetica", "normal");
      const regels = doc.splitTextToSize(waarde, CW - 32);
      if (link) { doc.setTextColor(20, 90, 180); doc.textWithLink(regels[0], M + 32, y, { url: link }); doc.setTextColor(0); }
      else doc.text(regels, M + 32, y);
      y += Math.max(1, regels.length) * 4.8 + 1.5;
    };
    if (m.soorten.length) veld("Probleem", m.soorten.join(", "));
    if (m.tekst) veld("Toelichting", m.tekst);
    if (m.lat != null) veld("Coördinaten", `${m.lat.toFixed(6)}, ${m.lon.toFixed(6)}${m.acc ? `  (± ${Math.round(m.acc)} m)` : ""}`);
    if (m.lat != null) veld("Kaart", "Open in Google Maps", mapsUrl(m.lat, m.lon));
    y += 3;
    const fotos = m.fotos.filter(f => f.data && f.w && f.h);
    const n = fotos.length; if (!n) return;
    const ruimte = H - M - y;
    if (n === 1) {
      const f = fotos[0]; const k = Math.min(CW / f.w, ruimte / f.h);
      doc.addImage(f.data, "JPEG", M + (CW - f.w * k) / 2, y, f.w * k, f.h * k, undefined, "FAST");
    } else {
      const kol = 2, gap = 4, cw = (CW - gap) / kol;
      const rijen = Math.ceil(n / kol), rh = (ruimte - gap * (rijen - 1)) / rijen;
      fotos.forEach((f, j) => {
        const k = Math.min(cw / f.w, rh / f.h);
        const x0 = M + (j % kol) * (cw + gap), y0 = y + Math.floor(j / kol) * (rh + gap);
        doc.addImage(f.data, "JPEG", x0 + (cw - f.w * k) / 2, y0, f.w * k, f.h * k, undefined, "FAST");
      });
    }
  });
  const tot = doc.getNumberOfPages();
  for (let p = 1; p <= tot; p++) { doc.setPage(p); doc.setFontSize(8); doc.setTextColor(...grijs);
    doc.text(`Pagina ${p} van ${tot}`, W - M, H - 8, { align: "right" }); doc.text("AREA · Meldingen prullenbakken", M, H - 8); }
  return new Uint8Array(doc.output("arraybuffer"));
}

/* korte samenvatting in de mail zelf */
export function maakHtml(dag, lijst) {
  const rij = m => `<tr><td style="padding:6px 10px;border-bottom:1px solid #ddd;white-space:nowrap">${wanneer(m, dag)}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #ddd"><b>${esc(m.adres || "Onbekende plek")}</b>${m.tekst ? `<br><span style="color:#5d6b62">${esc(m.tekst)}</span>` : ""}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #ddd">${esc(m.soorten.join(", "))}</td>
    <td style="padding:6px 10px;border-bottom:1px solid #ddd">${esc(m.melder)}</td></tr>`;
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#111a14">
    <h2 style="color:#008231;margin:0 0 4px">Meldingen prullenbakken</h2>
    <p style="margin:0 0 14px">${esc(dagLang(dag))} (sinds de vorige mail): <b>${lijst.length} melding${lijst.length === 1 ? "" : "en"}</b>. Het volledige rapport met foto's en kaartlinks zit als PDF in de bijlage.</p>
    <table style="border-collapse:collapse;font-size:13px"><tr style="text-align:left;color:#5d6b62"><th style="padding:6px 10px">Tijd</th><th style="padding:6px 10px">Plek</th><th style="padding:6px 10px">Probleem</th><th style="padding:6px 10px">Melder</th></tr>
    ${lijst.map(rij).join("")}</table></div>`;
}

function base64(bytes) {
  let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

Deno.serve(async req => {
  const url = new URL(req.url);
  // ?test=1 stuurt meteen (handig om te proberen), ?dag=2026-11-24 voor een andere dag: alleen met het geheim
  const test = url.searchParams.has("test") || url.searchParams.has("dag");
  const geheimOk = !!env("DAGMAIL_GEHEIM") && req.headers.get("x-dagmail-geheim") === env("DAGMAIL_GEHEIM");
  if (test && !geheimOk) return new Response("niet toegestaan", { status: 401 });
  if (!test && uurNu() !== +env("DAGMAIL_UUR", "15")) return Response.json({ overgeslagen: "niet het juiste uur", uur: uurNu() });

  const dag = url.searchParams.get("dag") || dagKey(new Date());
  const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

  // gewone dagmail: alles wat sinds de vorige mail (gisteren 15:00) binnenkwam, dus ook meldingen van na 15:00
  // en meldingen die later zijn geüpload (telefoon was offline). Met ?dag=… : alleen die ene dag.
  const tot = new Date(Math.floor(Date.now() / 3600e3) * 3600e3), van = new Date(tot.getTime() - 24 * 3600e3);
  const vraag = sb.from("meldingen").select("*");
  const { data, error } = await (url.searchParams.has("dag") ? vraag.eq("dag", dag)
    : vraag.gte("created_at", van.toISOString()).lt("created_at", tot.toISOString())).order("ts");
  if (error) return Response.json({ fout: error.message }, { status: 500 });
  if (!data.length) return Response.json({ dag, meldingen: 0, verstuurd: false });   // geen meldingen = geen mail
  // gewone dagmail maar één keer per dag (ook als iemand de functie vaker aanroept)
  if (!test) {
    const { error: e } = await sb.from("dagmail_log").insert({ dag });
    if (e) return Response.json({ overgeslagen: "vandaag al verstuurd", dag });
  }
  const vergeet = () => test ? null : sb.from("dagmail_log").delete().eq("dag", dag);   // bij een fout later opnieuw kunnen

  try {
  const lijst = [];
  for (const r of data) {
    const fotos = [];
    for (const f of r.fotos || []) {
      if (!f.path) continue;
      const { data: blob, error: e } = await sb.storage.from("fotos").download(f.path);
      if (!e && blob) fotos.push({ data: new Uint8Array(await blob.arrayBuffer()), w: f.w, h: f.h });
    }
    lijst.push({ ...r, soorten: r.soorten || [], ts: Date.parse(r.ts), fotos });
  }

  let logo = null;   // AREA-logo, staat naast de app op GitHub Pages
  try { const r = await fetch(env("DAGMAIL_LOGO", "https://shotgunhenk.github.io/prullenbakmelder/logo-area.jpg")); if (r.ok) logo = new Uint8Array(await r.arrayBuffer()); } catch (e) {}
  const pdf = maakPdf(jsPDF, dag, lijst, logo);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env("DAGMAIL_VAN", "Prullenbakmelder <onboarding@resend.dev>"),
      to: env("DAGMAIL_AAN").split(",").map(s => s.trim()).filter(Boolean),
      subject: `Meldingen prullenbakken ${dag} (${lijst.length})`,
      html: maakHtml(dag, lijst),
      attachments: [{ filename: `meldingen-prullenbakken-${dag}.pdf`, content: base64(pdf) }],
    }),
  });
  const antwoord = await res.text();
  if (!res.ok) { await vergeet(); return Response.json({ fout: "mail niet verstuurd", resend: antwoord }, { status: 502 }); }
  return Response.json({ dag, meldingen: lijst.length, pdfKb: Math.round(pdf.length / 1024), verstuurd: true });
  } catch (e) { await vergeet(); return Response.json({ fout: String(e?.message || e) }, { status: 500 }); }
});
