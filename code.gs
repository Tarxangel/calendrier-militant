/*******************************
 * CONFIGURATIONS
 *******************************/
const SPREADSHEET_ID = "15VRV3RQiz_62SXxzkZ96yRs3Tj1hGxZBUitpdOYTNCI";
const ACTIONS_SHEET  = "Actions";
const FORM_SHEET     = "Réponses au formulaire 1";
const API_KEY        = "FM_Besancon_2025_X4h9!";

/*******************************
 * doGet : Lecture
 *******************************/
function doGet(e) {
  try {
    const p = e && e.parameter ? e.parameter : {};
    if (p.key !== API_KEY) return errorJSON_("Unauthorized");

    const op = p.op || "militants";
    // Si op="militants", on filtre les non-visibles
    const payload = buildPayload_(op === "militants");
    
    return ContentService.createTextOutput(JSON.stringify(payload))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return errorJSON_(String(err));
  }
}

/*******************************
 * doPost : Écriture (Add/Update/Delete)
 *******************************/
function doPost(e) {
  try {
    const p = e && e.parameter ? e.parameter : {};
    if (p.key !== API_KEY) return errorJSON_("Unauthorized");

    const op = p.op;
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const shActions = ss.getSheetByName(ACTIONS_SHEET);
    const shForm = ss.getSheetByName(FORM_SHEET);

    // --- INSCRIPTION DIRECTE ---
    if (op === "register_participant") {
       if (!shForm) throw new Error("Onglet Formulaire introuvable.");
       const idA = (p.idAction || "").trim();
       const nom = (p.nom || "").trim();
       const tel = (p.tel || "").trim();

       if (!idA || !nom) throw new Error("Nom obligatoire.");
       shForm.appendRow([new Date(), nom, tel, idA]);
       return successJSON_({ op:"register" });
    }

    // --- SUPPRESSION PARTICIPANT ---
    if (op === "delete_participant") {
      const idA = (p.idAction || "").trim();
      const nom = (p.nom || "").trim().toLowerCase();
      const data = shForm.getDataRange().getValues();
      for (let i = data.length - 1; i >= 1; i--) {
        if (String(data[i][3]).trim() === idA && String(data[i][1]).trim().toLowerCase() === nom) {
          shForm.deleteRow(i + 1);
          break;
        }
      }
      return successJSON_({ op:"delete_participant" });
    }

    // --- MODIFICATION PARTICIPANT (Tel) ---
    if (op === "update_participant") {
      const idA = (p.idAction || "").trim();
      const nom = (p.nom || "").trim().toLowerCase();
      const newTel = (p.tel || "").trim();
      const data = shForm.getDataRange().getValues();
      for (let i = data.length - 1; i >= 1; i--) {
        if (String(data[i][3]).trim() === idA && String(data[i][1]).trim().toLowerCase() === nom) {
          shForm.getRange(i + 1, 3).setValue(newTel); // Colonne C = téléphone
          return successJSON_({ op:"update_participant" });
        }
      }
      return errorJSON_("Participant non trouvé");
    }

    // --- SUPPRESSION ACTION ---
    if (op === "delete_action") {
      const idA = (p.idAction || "").trim();
      const dataA = shActions.getDataRange().getValues();
      for (let i = 0; i < dataA.length; i++) {
        if (String(dataA[i][0]).trim() === idA) {
          shActions.deleteRow(i + 1);
          break;
        }
      }
      // Nettoyage participants
      const dataF = shForm.getDataRange().getValues();
      for (let j = dataF.length - 1; j >= 1; j--) {
        if (String(dataF[j][3]).trim() === idA) shForm.deleteRow(j + 1);
      }
      return successJSON_({ op:"delete_action" });
    }

    // --- MODIFICATION ACTION ---
    if (op === "update_action") {
      const idU = (p.idAction || "").trim();
      const dataA = shActions.getDataRange().getValues();
      for (let i = 1; i < dataA.length; i++) {
        if (String(dataA[i][0]).trim() === idU) {
          const rowIdx = i + 1;
          if (p.titre) shActions.getRange(rowIdx, 2).setValue(p.titre);
          if (p.lieu)  shActions.getRange(rowIdx, 5).setValue(p.lieu);
          if (p.commentaire !== undefined) shActions.getRange(rowIdx, 8).setValue(p.commentaire);
          
          if (p.date) {
            let dObj = new Date(p.date);
            if (!isNaN(dObj.getTime())) shActions.getRange(rowIdx, 3).setValue(dObj);
          }
          
          // Correction Heure Update : On force le format Texte (@)
          if (p.heure) shActions.getRange(rowIdx, 4).setNumberFormat("@").setValue(p.heure);
          
          if (p.visible) {
             const visValue = (p.visible === "true" || p.visible === true) ? "public" : "prive";
             shActions.getRange(rowIdx, 9).setValue(visValue);
          }
          if (p.capacite !== undefined) {
             const capVal = p.capacite === "" ? "" : parseInt(p.capacite, 10) || "";
             shActions.getRange(rowIdx, 10).setValue(capVal);
          }
          return successJSON_({ op:"update_action" });
        }
      }
    }

    // --- AJOUT ACTION (CORRIGÉ) ---
    if (op === "add_action") {
        const lastRow = shActions.getLastRow();
        let nextNum = 1;
        
        // Calcul ID
        if (lastRow >= 2) {
           const lastId = shActions.getRange(lastRow, 1).getValue();
           const match = String(lastId).match(/A(\d+)/);
           if (match) nextNum = parseInt(match[1], 10) + 1;
        }
        const newId = "A" + ("000" + nextNum).slice(-3);
        const formUrl = "https://docs.google.com/forms/d/e/1FAIpQLSc-8j-z7-UwGJa2X1XgTGPNzRIHU1N_q3-d8NZSvY_2s5rdKg/viewform?usp=pp_url&entry.1683527847=" + newId;
        const visibleVal = (p.visible === "false") ? "prive" : "public";

        // --- LA CORRECTION EST ICI ---
        const targetRow = lastRow + 1;
        
        // 1. On force la colonne D (Heure) en TEXTE BRUT (@) avant d'écrire
        shActions.getRange(targetRow, 4).setNumberFormat("@");

        // 2. On écrit les données (sans utiliser appendRow pour garder le contrôle du format)
        const capaciteVal = p.capacite ? (parseInt(p.capacite, 10) || "") : "";
        shActions.getRange(targetRow, 1, 1, 10).setValues([[
          newId,               // A
          p.titre||"",         // B
          p.date||"",          // C
          p.heure||"",         // D (Sera écrit comme "10:00" texte)
          p.lieu||"",          // E
          formUrl,             // F
          "",                  // G
          p.commentaire||"",   // H
          visibleVal,          // I
          capaciteVal          // J - Capacité (nombre de personnes nécessaires)
        ]]);

        return successJSON_({ op:"add_action", id: newId });
    }

    return errorJSON_("Unknown op");

  } catch (err) {
    return errorJSON_(String(err));
  }
}

function buildPayload_(isMilitantFilter) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const shActions = ss.getSheetByName(ACTIONS_SHEET);
  const dataA = shActions ? shActions.getDataRange().getValues().slice(1) : [];
  const TIMEZONE = "Europe/Paris";

  // D'abord récupérer tous les participants pour calculer les counts
  const shForm = ss.getSheetByName(FORM_SHEET);
  const participants = [];
  const countByAction = {};

  if (shForm) {
    const dataF = shForm.getDataRange().getValues().slice(1);
    dataF.forEach((row, idx) => {
      const idA = String(row[3] || "").trim();
      if (idA) {
        participants.push({ idAction: idA, nom: row[1], tel: row[2] });
        countByAction[idA] = (countByAction[idA] || 0) + 1;
      }
    });
  }

  const actions = [];
  dataA.forEach(row => {
    const id = String(row[0] || "").trim();
    if (!id) return;
    const visibility = String(row[8] || "public").toLowerCase();
    if (isMilitantFilter && visibility !== "public") return;

    let dateISO = "";
    try {
      if (row[2] instanceof Date) dateISO = Utilities.formatDate(row[2], TIMEZONE, "yyyy-MM-dd");
      else dateISO = String(row[2]);
    } catch(e){}

    let heureTxt = "";
    if (row[3]) {
      if (row[3] instanceof Date) heureTxt = Utilities.formatDate(row[3], TIMEZONE, "HH:mm");
      else heureTxt = String(row[3]).trim();
    }

    const capacite = row[9] ? parseInt(row[9], 10) : null;
    actions.push({
      id: id, titre: row[1], dateISO: dateISO, heureTxt: heureTxt,
      lieu: row[4], lien: row[5], count: countByAction[id] || 0,
      commentaire: row[7], visible: (visibility === "public"),
      capacite: capacite
    });
  });

  return { ok:true, actions:actions, participants:participants };
}

function successJSON_(obj) { return ContentService.createTextOutput(JSON.stringify(Object.assign({ok:true}, obj))).setMimeType(ContentService.MimeType.JSON); }
function errorJSON_(msg) { return ContentService.createTextOutput(JSON.stringify({ok:false, error:msg})).setMimeType(ContentService.MimeType.JSON); }