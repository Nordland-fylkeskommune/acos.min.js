/**
 * ACOS Interact+ -> WebSak - rapportgenerator
 * --------------------------------------------
 * Kjøres på en dialog-designerside i Interact
 * (URL-mønster: /client/design/<24-tegns hex-id>).
 *
 * Scriptet:
 *  1) henter definitionId/tittel for dialogen,
 *  2) henter WebSak-dispatch-mappingen for dialogen,
 *  3) bygger en lesbar rapport (HTML + ren tekst) av alle feltene,
 *  4) legger til en knapp som kopierer rapporten til utklippstavlen
 *     (både som HTML og som ren tekst, slik at den kan limes rett
 *     inn i f.eks. en e-post eller et notat).
 *
 * Krever at man er innlogget slik at sessionStorage inneholder
 * tokens for "dialogue-designer" og "dispatch-service".
 */

/** Viser en enkel toast-melding øverst på siden (brukes for feil og bekreftelser). */
function showModal(message) {
  const existing = document.getElementById("copy-success-modal");
  existing && existing.remove();

  const modal = document.createElement("div");
  modal.id = "copy-success-modal";
  modal.style.cssText =
    "position: fixed; top: 20px; left: 50%; transform: translateX(-50%); " +
    "background-color: #2d3748; color: white; padding: 16px 24px; " +
    "border-radius: 8px; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), " +
    "0 4px 6px -2px rgba(0, 0, 0, 0.05); z-index: 9999; white-space: pre-wrap; " +
    "text-align: center;";

  const messageEl = document.createElement("p");
  messageEl.textContent = message;

  const closeButton = document.createElement("button");
  closeButton.textContent = "Close";
  closeButton.style.cssText =
    "background-color: #4a5568; border: none; padding: 8px 16px; " +
    "border-radius: 6px; margin-top: 12px; cursor: pointer;";

  modal.appendChild(messageEl);
  modal.appendChild(closeButton);
  document.body.appendChild(modal);

  closeButton.onclick = () => modal.remove();
  setTimeout(() => modal.remove(), 5000);
}

const reportData = await (async function buildReport() {
  try {
    const urlMatch = window.location.href.match(/\/client\/design\/([a-f0-9]{24})/);
    if (!urlMatch || !urlMatch[1]) return;
    const dialogueId = urlMatch[1];

    // --- 2. Hent dialog-info (tittel, friendlyId, definitionId) ---
    const dialogueRes = await fetch(
      `https://interact-production.acossky.no/designer/app/api/v1.0/dialogue/${dialogueId}`,
    );
    const { definitionId, title, friendlyId } = await dialogueRes.json();
    if (!definitionId) return;

    // --- 3. Hent dispatch-definisjonen og plukk ut WebSak-mappingen ---
    const dispatchRes = await fetch(
      `https://interact-production.acossky.no/dispatch/app/api/definition/${definitionId}`,
    );
    const { dispatches } = await dispatchRes.json();
    const websakDispatch = dispatches.find((d) => d.actionType === "websak");
    if (!websakDispatch || !websakDispatch.mapping || !websakDispatch.mapping.targets) return;

    const targets = websakDispatch.mapping.targets.sort((a, b) =>
      a.targetProperty.localeCompare(b.targetProperty)
    );

    /** Slår opp malverdien (template) for en gitt targetProperty, med fallback. */
    const getValue = (propertyName, fallback = "Ikke satt") => {
      const target = targets.find((t) => t.targetProperty === propertyName);
      return target && target.template ? target.template : fallback;
    };

    // --- 4. Enkle feltgrupper: SAK og DOKUMENT ---
    const sakFields = {
      "Saksnr.": getValue("Sak.SaksID"),
      Sakstype: getValue("Sak.Sakstype"),
      Status: getValue("Sak.Saksstatus"),
      "Adm.enhet": getValue("Sak.SaksansvarligEnhet"),
      Saksansvarlig: getValue("Sak.SaksansvarligPerson"),
      Journalenhet: getValue("Sak.Journalenhet"),
      Arkivdel: getValue("Sak.ArkivDel"),
      "Tittel 1": getValue("Sak.Sakstittel_1"),
      "Tittel 2": getValue("Sak.Sakstittel_2"),
      Tilgangskode: getValue("Sak.Tilgangskode"),
      Avskjermingskode: getValue("Sak.SakSkjerming"),
      Paragraf: getValue("Sak.Paragraf"),
      Avleveringsform:
        getValue("Sak.IsSecureZone", "false") === "true"
          ? "ACOS Mottak hente fra Interact"
          : "Send som arkivmelding til ACOS Mottak (standard)",
    };

    const dokumentFields = {
      Doktype: getValue("Journalpost.DokType"),
      Status: getValue("Journalpost.Status"),
      "Tittel 1": getValue("Journalpost.Tittel1"),
      "Tittel 2": getValue("Journalpost.Tittel2"),
      "Adm.enhet": getValue("Journalpost.AnsvarligEnhet"),
      Saksbehandler: getValue("Journalpost.AnsvarligPerson"),
      Tilgangskode: getValue("Journalpost.Tilgangskode"),
      Avskjermingskode: getValue("Journalpost.Avskjerming"),
      Paragraf: getValue("Journalpost.Paragraf"),
      Kategori: getValue("Journalpost.Journalpostkategori"),
      "Beh.type": getValue("Journalpost.Behandlingstype"),
    };

    // --- 5. Indekserte lister: Avsendere / Kopimottakere (Person eller Organisasjon) ---

    /** Finner alle unike indekser brukt for et prefiks, f.eks. "Avsendere[2].SSN" -> "2". */
    const getIndices = (prefix) => {
      const pattern = new RegExp(`^${prefix}\\[(\\d+)\\]`);
      return [
        ...new Set(
          targets
            .map((t) => {
              const m = t.targetProperty.match(pattern);
              return m ? m[1] : null;
            })
            .filter((i) => i !== null)
        ),
      ].sort();
    };

    /** Feltoppsett for en Person (identifisert ved at SSN-feltet finnes). */
    const personMapping = (prefix, i) => ({
      Offentlignummer: getValue(`${prefix}[${i}].SSN`),
      Fornavn: getValue(`${prefix}[${i}].FirstName`),
      Etternavn: getValue(`${prefix}[${i}].Surname`),
      Adresse: getValue(`${prefix}[${i}].Street`),
      Postnummer: getValue(`${prefix}[${i}].Zip`),
      Poststed: getValue(`${prefix}[${i}].City`),
      Telefon: getValue(`${prefix}[${i}].PhonePrivate`),
      Mobil: getValue(`${prefix}[${i}].PhoneMobile`),
      "Telefon arbeid": getValue(`${prefix}[${i}].PhoneWork`),
      Tittel: getValue(`${prefix}[${i}].Title`),
      "E-post": getValue(`${prefix}[${i}].Email`),
      Land: getValue(`${prefix}[${i}].Country`),
      "Kode for mottaker": getValue(`${prefix}[${i}].Recipient`),
      Attention: getValue(`${prefix}[${i}].Attention`),
    });

    /** Feltoppsett for en Organisasjon. */
    const organisasjonMapping = (prefix, i) => ({
      Offentlignummer: getValue(`${prefix}[${i}].OrganizationNumber`),
      Navn: getValue(`${prefix}[${i}].Name`),
      Adresse: getValue(`${prefix}[${i}].Street`),
      Postnummer: getValue(`${prefix}[${i}].Zip`),
      Poststed: getValue(`${prefix}[${i}].City`),
      Telefon: getValue(`${prefix}[${i}].Phone`),
      "E-post": getValue(`${prefix}[${i}].Email`),
      Land: getValue(`${prefix}[${i}].Country`),
      "Kode for mottaker": getValue(`${prefix}[${i}].Recipient`),
      Attention: getValue(`${prefix}[${i}].Attention`),
    });

    /** Bygger en liste av kontakter (Person/Organisasjon) for et gitt prefiks. */
    const buildContactList = (prefix) =>
      getIndices(prefix).map((i) => {
        const isPerson = targets.some((t) => t.targetProperty === `${prefix}[${i}].SSN`);
        return {
          type: isPerson ? "Person" : "Organisasjon",
          index: parseInt(i, 10),
          mapping: isPerson ? personMapping(prefix, i) : organisasjonMapping(prefix, i),
        };
      });

    const senders = buildContactList("Avsendere"); // avsendere
    const copyRecipients = buildContactList("Kopimottakere"); // kopimottakere

    // --- 6. Saksparter ---
    const caseParties = getIndices("Saksparter").map((i) => ({
      index: parseInt(i, 10),
      mapping: {
        Offentlignummer: getValue(`Saksparter[${i}].Offentlignr`),
        Navn: getValue(`Saksparter[${i}].Navn`),
        "Adresse 1": getValue(`Saksparter[${i}].Adresse1`),
        "Adresse 2": getValue(`Saksparter[${i}].Adresse2`),
        "Adresse 3": getValue(`Saksparter[${i}].Adresse3`),
        "Adresse 4": getValue(`Saksparter[${i}].Adresse4`),
        Postnummer: getValue(`Saksparter[${i}].Postnr`),
        Poststed: getValue(`Saksparter[${i}].Poststed`),
        Telefon: getValue(`Saksparter[${i}].Telefon`),
        "E-post": getValue(`Saksparter[${i}].Epost`),
        Land: getValue(`Saksparter[${i}].LandID`),
        Partsforhold: getValue(`Saksparter[${i}].PartsforholdID`),
        Attention: getValue(`Saksparter[${i}].Att`),
        Gårdsnr: getValue(`Saksparter[${i}].Gardsnr`),
        Bruksnr: getValue(`Saksparter[${i}].Bruksnr`),
        Festenr: getValue(`Saksparter[${i}].Festenr`),
        Seksjonsnr: getValue(`Saksparter[${i}].Seksjonsnr`),
      },
    }));

    // --- 7. Generisk gruppering for Klasseringer / Merknadjournalpost ---
    /** Grupperer flate "Prefiks[i].Felt"-targets til en liste av { Felt: verdi } per indeks. */
    const groupIndexedFields = (prefix) => {
      const pattern = new RegExp(`^${prefix}\\[(\\d+)\\]\\.(.*)`);
      return targets
        .filter((t) => t.targetProperty.startsWith(`${prefix}[`))
        .reduce((acc, t) => {
          const m = t.targetProperty.match(pattern);
          if (m) {
            const index = parseInt(m[1], 10);
            const field = m[2];
            acc[index] = acc[index] || {};
            acc[index][field] = t.template;
          }
          return acc;
        }, []);
    };

    const classifications = groupIndexedFields("Klasseringer"); // { FeltNavn, Kode }
    const journalRemarks = groupIndexedFields("Merknadjournalpost"); // { InfoType, Text }

    // --- 8. Bygg HTML-rapporten + tilhørende ren tekst-versjon ---
    let html = `<h1>Rapportering - ${title} (${friendlyId})</h1>`;
    const plainTextLines = [`Rapportering - ${title} (${friendlyId})`, ""];
    let rowIndex = 0;

    const openSection = (heading) => {
      html += `\n<div style="border: 1px solid #e1e1e1; border-radius: 6px; margin-bottom: 16px; background-color: #ffffff; font-family: sans-serif;">\n  <h2 style="margin: 0; padding: 12px 16px; background-color: #f7f7f7; border-bottom: 1px solid #e1e1e1; font-size: 16px; color: #333;">${heading}</h2>`;
    };
    const openTable = () => {
      html += `\n  <table style="width: 100%; border-collapse: collapse;">\n    <tbody>`;
    };
    const closeTable = () => {
      html += "\n    </tbody>\n  </table>";
    };
    const closeSection = () => {
      html += "\n</div>";
    };
    const appendRow = (label, value) => {
      const rowStyle = rowIndex % 2 === 1 ? ' style="background-color: #fafafa;"' : "";
      html += `\n      <tr${rowStyle}>\n        <td style="padding: 8px 16px; width: 30%; color: #555;">${label}</td>\n        <td style="padding: 8px 16px;"><strong>${value}</strong></td>\n      </tr>`;
      plainTextLines.push(`${label}: ${value}`);
      rowIndex++;
    };

    // SAK
    openSection("SAK");
    openTable();
    plainTextLines.push("SAK");
    rowIndex = 0;
    for (const [label, value] of Object.entries(sakFields)) appendRow(label, value);
    closeTable();
    closeSection();
    plainTextLines.push("");

    // DOKUMENT (+ eventuelle merknader på journalposten, i samme tabell)
    openSection("DOKUMENT");
    openTable();
    plainTextLines.push("DOKUMENT");
    rowIndex = 0;
    for (const [label, value] of Object.entries(dokumentFields)) appendRow(label, value);
    if (journalRemarks.length > 0) {
      plainTextLines.push("Merknader:");
      for (const { InfoType, Text } of journalRemarks) appendRow(InfoType, Text);
    }
    closeTable();
    closeSection();
    plainTextLines.push("");

    // KONTAKTER (avsendere)
    // NB: originalscriptet legger uansett til en "KONTAKTER"-overskrift her, og
    // dersom det ikke finnes noen avsendere legges det til enda en identisk
    // overskrift sammen med "Ingen kontakter funnet." Denne duplikate
    // overskriften er bevart som i originalen (ikke rettet, kun beholdt).
    openSection("KONTAKTER");
    closeSection();
    plainTextLines.push("KONTAKTER");
    if (senders.length > 0) {
      senders.forEach((sender) => {
        openSection(`${sender.type} ${sender.index + 1}`);
        openTable();
        plainTextLines.push(`${sender.type} ${sender.index + 1}`);
        rowIndex = 0;
        for (const [label, value] of Object.entries(sender.mapping)) appendRow(label, value);
        closeTable();
        closeSection();
      });
    } else {
      openSection("KONTAKTER");
      html += '\n  <div style="padding: 16px;">Ingen kontakter funnet.</div>';
      closeSection();
      plainTextLines.push("Ingen kontakter funnet.");
    }
    plainTextLines.push("");

    // KOPIMOTTAKERE (kun hvis det finnes noen)
    if (copyRecipients.length > 0) {
      openSection("KOPIMOTTAKERE");
      closeSection();
      plainTextLines.push("KOPIMOTTAKERE");
      copyRecipients.forEach((recipient) => {
        openSection(`${recipient.type} ${recipient.index + 1}`);
        openTable();
        plainTextLines.push(`${recipient.type} ${recipient.index + 1}`);
        rowIndex = 0;
        for (const [label, value] of Object.entries(recipient.mapping)) appendRow(label, value);
        closeTable();
        closeSection();
      });
      plainTextLines.push("");
    }

    // SAKSPARTER (kun hvis det finnes noen)
    if (caseParties.length > 0) {
      openSection("SAKSPARTER");
      closeSection();
      plainTextLines.push("SAKSPARTER");
      caseParties.forEach((party) => {
        openSection(`Sakspart ${party.index + 1}`);
        openTable();
        plainTextLines.push(`Sakspart ${party.index + 1}`);
        rowIndex = 0;
        for (const [label, value] of Object.entries(party.mapping)) appendRow(label, value);
        closeTable();
        closeSection();
      });
      plainTextLines.push("");
    }

    // KLASSERINGER (kun hvis det finnes noen) - én samlet tabell
    if (classifications.length > 0) {
      openSection("KLASSERINGER");
      openTable();
      plainTextLines.push("KLASSERINGER");
      rowIndex = 0;
      for (const { FeltNavn, Kode } of classifications) appendRow(Kode, FeltNavn);
      closeTable();
      closeSection();
    }

    return { generatedHtml: html, generatedPlainText: plainTextLines.join("\n") };
  } catch (err) {
    showModal(`A critical error occurred:\n\n${err.message}\n\nCheck the console for more details.`);
  }
})();

// --- Legg til en knapp som kopierer rapporten (HTML + ren tekst) til utklippstavlen ---
async function addCopyButton(htmlContent, plainTextContent) {
  const button = document.createElement("button");
  console.log("Adding copy button to the page...");
  button.textContent = "Klikk her for å kopiere rapporten";
  button.style.cssText = `
    position: fixed; top: 20px; left: 50%; transform: translateX(-50%);
    padding: 15px 25px; font-size: 18px; font-weight: bold; color: white;
    background-color: #569299; border: none; border-radius: 8px;
    cursor: pointer; z-index: 99999; box-shadow: 0 4px 14px 0 rgba(0, 0, 0, 0.3);
  `;
  button.onclick = async () => {
    try {
      const htmlBlob = new Blob([htmlContent], { type: "text/html" });
      const textBlob = new Blob([plainTextContent], { type: "text/plain" });
      const clipboardItem = new ClipboardItem({ "text/html": htmlBlob, "text/plain": textBlob });
      await navigator.clipboard.write([clipboardItem]);
      showModal("Rapporten ble kopiert til utklippstavlen!");
      button.remove();
    } catch (err) {
      showModal("FEIL: Kunne ikke kopiere. Sjekk konsollen (F12).");
    }
  };
  document.body.appendChild(button);
}

console.log(reportData);
if (reportData && reportData.generatedHtml) {
  await addCopyButton(reportData.generatedHtml, reportData.generatedPlainText);
}