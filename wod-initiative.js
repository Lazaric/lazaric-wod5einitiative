

/** VERSION 1.4
 * Lazaric's WoD5e Initiative Module
 * Foundry VTT v14 | World of Darkness 5th Edition
 *
 * Automatically recalculates initiative whenever the combat round changes.
 * Initiative rolls and combat updates are performed exclusively by the
 * active GM to prevent duplicate rolls and permission errors.
 *
 * INITIATIVE DICE POOLS
 * ---------------------
 * Standard Characters:
 *   Initiative is rolled using Wits + Awareness.
 *
 * Storyteller Characters (actor type "spc"):
 *   SPCs do not have standard attributes and skills. They MUST have an
 *   embedded Trait item named "Initiative" with a positive dice pool.
 *   The module uses this Trait's system.dice value instead of Wits + Awareness.
 *
 *   If the Initiative Trait is missing or invalid, the character's name
 *   and the error are reported in chat, and their initiative roll is skipped.
 *   Multiple tokens using the same actor receive independent rolls.
 *
 * MANUAL INITIATIVE CONTROLS
 * --------------------------
 * The module exposes two functions through its public API, which can be
 * called from Foundry Script macros or the browser console:
 *
 *   Move selected token to the TOP of initiative:
 *   game.modules.get("lazaric-wod5einitiative").api.pushTokenTop();
 *
 *   Move selected token to the BOTTOM of initiative:
 *   game.modules.get("lazaric-wod5einitiative").api.pushTokenBottom();
 *
 *   Reroll initiative for the selected tokens: 
 *   await game.modules.get("lazaric-wod5einitiative").api.rerollTokenInitiative();
 * 
 *    Reroll all initiative
 *   await game.modules.get("lazaric-wod5einitiative").api.reRollAllInitiatives();
 * 
 *    Create Combat Dialog
 *    await game.modules.get("lazaric-wod5einitiative").api.createCombatDialog();
 * 
 * These functions operate on the currently selected canvas token, which
 * must be participating in the active combat. The invoking user must
 * have permission to modify combatant initiative (normally a GM).
 *
 * NOTES
 * -----
 * - Initiative uses the WoD5e dice formula: ${dicePool}dwcs>5
 * - Results are posted to chat and applied to the combat tracker.
 * - An active GM must be connected for automatic initiative rerolls.
 * - Manual initiative adjustments are overwritten on the next round change.
 */

/**
 * Lazaric's WoD5e Initiative Module
 * Foundry VTT v14 | World of Darkness 5th Edition
 *
 * Automatically rerolls initiative when a combat round advances. Only the
 * designated active GM processes automatic rolls (to prevent duplicates).
 *
 * INITIATIVE RULES
 * - Ordinary actors: Wits + Awareness.
 * - Storyteller Characters (actor type "spc"): require an embedded Trait named
 *   "Initiative", with a positive integer in its system.dice field.
 * - Missing/invalid SPC traits: report the problem in chat and assign -10.
 * - Defeated combatants: assign 0, without rolling.
 * - Each combatant (including multiple tokens of one actor) rolls separately.
 *
 * PUBLIC API - Call from a Foundry Script macro (GM permissions required):
 *
 *   const api = game.modules.get("lazaric-wod5einitiative").api;
 *
 *   await api.pushTokenTop();          // Select a token first
 *   await api.pushTokenBottom();       // Select a token first
 *   await api.rerollTokenInitiative(); // Select a token first
 *   await api.reRollAllInitiatives();  // Reroll everyone in the active combat
 *   await api.createCombatDialog();   // Add scene tokens to a combat encounter
 *   await api.rollActorInitiative(combatant); // Reroll a specific Combatant
 *
 * Dice formula: <dicePool>dwcs>5 (the WoD5e custom dice term).
 * Manual initiative adjustments are overwritten at the next round advance.
 */

(() => {
"use strict";

const MODULE_ID = "lazaric-wod5einitiative";

/**
 * Module initialization and public API registration.
 */
Hooks.once("ready", () => {
  const module = game.modules.get(MODULE_ID);

  if (!module) {
    console.warn(`WoD Initiative | Module ${MODULE_ID} not found`);
    return;
  }

  module.api = {
    pushTokenTop,
    pushTokenBottom,
    rollActorInitiative,
    rerollTokenInitiative,
    reRollAllInitiatives,
    createCombatDialog
  };

  console.log(
    `WoD Initiative | Ready. Access functions via game.modules.get("${MODULE_ID}").api`
  );
});


/**
 * Write a shared chat message for an initiative configuration error.
 */
async function postInitiativeError(actor, message) {
  const paragraph = document.createElement("p");
  paragraph.textContent = `${actor.name}: ${message}`;

  await ChatMessage.create({
    speaker: { alias: "WoD Initiative" },
    content: `<div style="border:2px solid #b32424;padding:6px">${paragraph.outerHTML}</div>`
  });
}


/**
 * Calculate and announce one combatant's initiative.
 *
 * This function does not update the Combat document.
 *
 * Returns:
 *   Rolled initiative score
 *   0   - Defeated combatant
 *   -10 - Invalid SPC Initiative Trait
 *   null - No actor or invalid standard dice pool
 *
 * warnedActors prevents duplicate error messages when multiple
 * combatants share the same underlying actor.
 */
async function calculateInitiative(combatant, warnedActors = new Set()) {
  const actor = combatant.actor;

  if (!actor) return null;

  // Defeated combatants do not roll initiative.
  if (combatant.defeated) return 0;

  let dicePool;
  let initiativeLabel;

  if (actor.type === "spc") {

    // Storyteller Characters must have an Initiative Trait.
    const initiativeTrait = actor.items.find(item =>
      item.type === "trait" &&
      item.name?.trim().toLowerCase() === "initiative"
    );

    dicePool = Number(initiativeTrait?.system?.dice);
    initiativeLabel = "Initiative Trait";

    if (!initiativeTrait || !Number.isInteger(dicePool) || dicePool < 1) {

      if (!warnedActors.has(actor.id)) {
        warnedActors.add(actor.id);

        await postInitiativeError(
          actor,
          'Storyteller Character needs a Trait named "Initiative" with at least 1 die. Initiative set to -10.'
        );
      }

      return -10;
    }

  } else {

    // Ordinary characters use Wits + Awareness.
    const wits = Number(actor.system?.attributes?.wits?.value ?? 0);
    const awareness = Number(actor.system?.skills?.awareness?.value ?? 0);

    dicePool = wits + awareness;
    initiativeLabel = "Wits + Awareness";

    if (!Number.isInteger(dicePool) || dicePool < 1) {

      if (!warnedActors.has(actor.id)) {
        warnedActors.add(actor.id);

        await postInitiativeError(
          actor,
          "Wits + Awareness is not a valid positive dice pool. Initiative was not rolled."
        );
      }

      return null;
    }
  }

  // Roll using the WoD5e custom dice formula.
  const roll = await new Roll(`${dicePool}dwcs>5`).evaluate();
  const total = roll.total;

  // Custom chat presentation from the original module.
  const resultBoxStyle =
    "background:#2f4f4f;color:#ffff00;border:2px solid #ffff00;" +
    "border-radius:3px;padding:4px 7px;font-weight:bold;font-size:1.2em";

  const flavor =
    `<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">` +
    `Rolled <span style="${resultBoxStyle}">${dicePool}</span> dice &rArr; ` +
    `<span style="${resultBoxStyle}">${total}</span> successes ` +
    `<small>(${initiativeLabel})</small></div>`;

  // Send a genuine Foundry roll message, retaining the roll data.
  await roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor
  });

  return total;
}


/**
 * Roll initiative for every combatant in the specified combat.
 *
 * All results are committed together in one embedded document update.
 *
 * resetTurn:
 *   false - Leave the current turn alone (automatic round reroll).
 *   true  - Return to the first combatant (manual reroll-all).
 */
async function rollAllCombatants(combat, resetTurn = false) {
  const updates = [];
  const warnedActors = new Set();

  for (const combatant of combat.turns) {
    const initiative = await calculateInitiative(combatant, warnedActors);

    if (initiative === null) continue;

    updates.push({
      _id: combatant.id,
      initiative
    });
  }

  if (updates.length > 0) {
    await combat.updateEmbeddedDocuments("Combatant", updates);
  }

  // Explicit reroll-all returns to the first combatant.
  if (resetTurn && updates.length && combat.round > 0) {
    combat.setupTurns();

    if (combat.turns.length) {
      await combat.update({ turn: 0 });
    }
  }
}


/**
 * Automatically reroll initiative when the combat round advances.
 *
 * Only the designated active GM performs these rolls.
 * This prevents duplicate messages and player permission errors.
 */
Hooks.on("updateCombat", async (combat, changed) => {
  if (changed.round === undefined) return;

  // Only the active GM handles automatic initiative.
  if (game.users.activeGM?.id !== game.user.id) return;

  // Only reroll when advancing to a higher round.
  if (changed.round <= (combat.previous?.round ?? 0)) return;

  try {
    await rollAllCombatants(combat);
  } catch (error) {
    console.error(
      "WoD Initiative | Automatic initiative reroll failed",
      error
    );

    ui.notifications.error(
      "WoD Initiative: automatic initiative reroll failed. See console."
    );
  }
});


/**
 * Check whether the current user can manage initiative.
 *
 * Manual initiative controls are restricted to GM users.
 */
function canManageInitiative() {
  if (game.user.isGM) return true;

  ui.notifications.warn(
    "Only a GM can manage initiative using this module."
  );

  return false;
}


/**
 * Resolve the selected canvas token to a combatant.
 *
 * Returns { combat, combatant } or null if selection is invalid.
 */
function getSelectedCombatant() {
  if (!canManageInitiative()) return null;

  const combat = game.combat;

  if (!combat) {
    ui.notifications.warn("No active combat found.");
    return null;
  }

  const token = canvas.tokens.controlled[0];

  if (!token) {
    ui.notifications.warn("Select a token first.");
    return null;
  }

  const combatant = combat.getCombatantsByToken(token.document)
    .find(entry =>
      !entry.sceneId || entry.sceneId === canvas.scene.id
    );

  if (!combatant) {
    ui.notifications.warn(
      "Selected token is not in the active combat."
    );

    return null;
  }

  return { combat, combatant };
}


/**
 * Reroll a specific Combatant.
 *
 * Public API:
 *   await api.rollActorInitiative(combatant);
 *
 * Useful when another script already has a Combatant object.
 */
async function rollActorInitiative(combatant) {
  if (!canManageInitiative()) return;

  const combat = combatant?.parent;

  if (!combat || !combat.combatants.get(combatant.id)) {
    ui.notifications.warn("A valid Combatant is required.");
    return;
  }

  const initiative = await calculateInitiative(combatant);

  if (initiative === null) return;

  await combat.setInitiative(combatant.id, initiative);
}


/**
 * Reroll initiative for the currently selected token.
 *
 * Public API:
 *   await api.rerollTokenInitiative();
 */
async function rerollTokenInitiative() {
  const selected = getSelectedCombatant();

  if (!selected) return;

  await rollActorInitiative(selected.combatant);
}


/**
 * Reroll every combatant in the active encounter.
 *
 * Public API:
 *   await api.reRollAllInitiatives();
 *
 * After rerolling, reset to the first turn.
 */
async function reRollAllInitiatives() {
  if (!canManageInitiative()) return;

  const combat = game.combat;

  if (!combat) {
    ui.notifications.warn("No active combat found.");
    return;
  }

  await rollAllCombatants(combat, true);
}


/**
 * Move the selected token above everyone else in initiative.
 *
 * Public API:
 *   await api.pushTokenTop();
 */
async function pushTokenTop() {
  const selected = getSelectedCombatant();

  if (!selected) return;

  const { combat, combatant } = selected;

  const initiatives = combat.turns
    .map(entry => entry.initiative)
    .filter(Number.isFinite);

  const highestInit = Math.max(0, ...initiatives);

  await combat.setInitiative(combatant.id, highestInit + 1);
}


/**
 * Move the selected token below everyone else in initiative.
 *
 * Public API:
 *   await api.pushTokenBottom();
 */
async function pushTokenBottom() {
  const selected = getSelectedCombatant();

  if (!selected) return;

  const { combat, combatant } = selected;

  const initiatives = combat.turns
    .map(entry => entry.initiative)
    .filter(Number.isFinite);

  const lowestInit = Math.min(0, ...initiatives);

  await combat.setInitiative(combatant.id, lowestInit - 1);
}


/**
 * Create or expand a combat encounter using a Foundry v14 DialogV2.
 *
 * Options:
 * - All scene tokens
 * - Selected tokens only
 * - Exclude vehicles
 *
 * Prevents adding tokens which are already in the encounter.
 *
 * Public API:
 *   await api.createCombatDialog();
 */
async function createCombatDialog() {
  if (!canManageInitiative()) return;

  if (!canvas.scene) {
    ui.notifications.warn("No scene is currently displayed.");
    return;
  }

  const choices = await foundry.applications.api.DialogV2.wait({
    window: {
      title: "Add to and create combat"
    },

    content: `
      <div class="form-group">
        <label for="lazaric-token-selection">
          Token Selection
        </label>

        <select
          id="lazaric-token-selection"
          name="tokenSelection"
        >
          <option value="all">All Tokens</option>
          <option value="selected">Selected Tokens Only</option>
        </select>
      </div>

      <div class="form-group">
        <label>
          <input type="checkbox" name="excludeVehicles">
          Exclude Vehicles
        </label>
      </div>
    `,

    buttons: [
      {
        action: "add",
        label: "Add to Combat",
        icon: "fa-solid fa-plus",
        default: true,

        callback: (event, button) => ({
          tokenSelection:
            button.form.elements.tokenSelection.value,

          excludeVehicles:
            button.form.elements.excludeVehicles.checked
        })
      },

      {
        action: "cancel",
        label: "Cancel",
        icon: "fa-solid fa-xmark"
      }
    ],

    rejectClose: false
  });

  // Dialog cancelled.
  if (!choices || choices === "cancel") return;

  const scene = canvas.scene;

  // Gather tokens according to the selected option.
  let tokens = choices.tokenSelection === "selected"
    ? canvas.tokens.controlled.filter(token => token.actor)
    : canvas.tokens.placeables.filter(token => token.actor);

  // Optionally remove vehicles.
  if (choices.excludeVehicles) {
    tokens = tokens.filter(token =>
      token.actor.type !== "vehicle"
    );
  }

  if (!tokens.length) {
    ui.notifications.warn("No valid tokens found.");
    return;
  }

  // Identify the scene to which an existing combat belongs.
  const getCombatSceneId = entry =>
    typeof entry.scene === "string"
      ? entry.scene
      : (entry.scene?.id ?? entry._source?.scene);

  let combat = game.combat;

  // Don't add tokens to a combat belonging to another scene.
  if (!combat || getCombatSceneId(combat) !== scene.id) {
    combat = game.combats.find(entry =>
      getCombatSceneId(entry) === scene.id &&
      entry.active
    );
  }

  // Create a new encounter if necessary.
  if (!combat) {
    combat = await Combat.create({
      scene: scene.id,
      active: true
    });
  }

  // Filter out tokens which are already in combat.
  const newTokens = tokens.filter(token =>
    !combat.getCombatantsByToken(token.document)
      .some(entry =>
        !entry.sceneId || entry.sceneId === scene.id
      )
  );

  if (!newTokens.length) {
    ui.notifications.info(
      "All eligible tokens are already in combat."
    );
    return;
  }

  // Add all eligible tokens in one operation.
  await combat.createEmbeddedDocuments(
    "Combatant",
    newTokens.map(token => ({
      tokenId: token.id,
      sceneId: scene.id,
      actorId: token.actor.id,
      hidden: token.document.hidden
    }))
  );

  ui.notifications.info(
    `Added ${newTokens.length} token(s) to combat.`
  );
}

})();