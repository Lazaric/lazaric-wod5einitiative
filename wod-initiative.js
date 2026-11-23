

/** VERSION 1.3
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


// Called once when Foundry first initializes your module
Hooks.once("ready", () => {
  console.log("= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = ");
  console.log("WOD Initiative | Initializing custom WoD5e initiative module");
  console.log("= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = ");

  // Attach our push functions to the module's API so macros or other scripts can call them
  const mod = game.modules.get("lazaric-wod5einitiative");

  if (!mod) {
    console.warn("Module not found: lazaric-wod5einitiative");
    return;
  }

  mod.api = {
    pushTokenTop,
    pushTokenBottom
  };
});

/**
 * Whenever the Combat document updates (i.e. new round),
 * reroll initiative for each combatant using Wits + Awareness
 * or the SPC Initiative Trait.
 */

Hooks.on("updateCombat", async (doc, changed) => {
  if (changed.round === undefined) return;

  // Only the designated active GM processes initiative.
  // This prevents duplicate rolls and permission errors.
  if (game.users.activeGM?.id !== game.user.id) return;

  const updates = [];
  const warnedActors = new Set();

  for (const combatant of doc.turns) {
    const actor = combatant.actor;
    if (!actor) continue;

    let dicePool;
    let initiativeLabel;

    if (actor.type === "spc") {
      // Storyteller Characters use their Initiative Trait.
      const initiativeTrait = actor.items.find(item =>
        item.type === "trait" &&
        item.name?.trim().toLowerCase() === "initiative"
      );

      const traitDice = Number(initiativeTrait?.system?.dice);

      if (!initiativeTrait || !Number.isInteger(traitDice) || traitDice < 1) {

        // Only report once per actor, even if several tokens use it.
        if (!warnedActors.has(actor.id)) {
          warnedActors.add(actor.id);

          const paragraph = document.createElement("p");
          paragraph.textContent =
            `${actor.name} (Storyteller Character) is missing a valid Initiative Trait. ` +
            `Add a Trait named "Initiative" with a dice pool of at least 1.`;

          await ChatMessage.create({
            speaker: { alias: "WoD Initiative" },
            content: paragraph.outerHTML
          });
        }

        continue;
      }

      dicePool = traitDice;
      initiativeLabel = "Initiative Trait";

    } else {
      // Standard characters use Wits + Awareness.
      const wits = actor.system?.attributes?.wits?.value || 0;
      const awareness = actor.system?.skills?.awareness?.value || 0;

      dicePool = wits + awareness;
      initiativeLabel = "Wits + Awareness";
    }

    // Construct and roll the WoD5e initiative dice pool.
    const roll = new Roll(`${dicePool}dwcs>5`);

    const chatMessage = await roll.toMessage({
      flavor: `${actor.name}'s Initiative (${initiativeLabel})`,
      speaker: ChatMessage.getSpeaker({ actor })
    });

    const finalTotal = chatMessage.rolls?.[0]?.total ?? 0;

    updates.push({
      _id: combatant.id,
      initiative: finalTotal
    });
  }

  // Update all combatant initiatives in one operation.
  if (updates.length > 0) {
    await doc.updateEmbeddedDocuments("Combatant", updates);
  }
});


/*
 * Push the currently selected token to the top of the initiative order.
 */
function pushTokenTop() {
  let combat = game.combat;

  if (!combat) {
    ui.notifications.warn("No active combat found.");
    return;
  }

  let token = canvas.tokens.controlled[0];

  if (!token) {
    ui.notifications.warn("No token selected.");
    return;
  }

  let combatant = combat.getCombatantByToken(token.id);

  if (!combatant) {
    ui.notifications.warn("Selected token is not in the combat.");
    return;
  }

  // Find the highest initiative in the current combat
  let highestInit = combat.combatants.reduce((max, c) => {
    if (c.initiative === null) return max;
    return c.initiative > max ? c.initiative : max;
  }, 0);

  let newInit = highestInit + 1;
  combat.setInitiative(combatant.id, newInit);
}

/*
 * Push the currently selected token to the bottom of the initiative order.
 */
function pushTokenBottom() {
  let combat = game.combat;

  if (!combat) {
    ui.notifications.warn("No active combat found.");
    return;
  }

  let token = canvas.tokens.controlled[0];

  if (!token) {
    ui.notifications.warn("No token selected.");
    return;
  }

  let combatant = combat.getCombatantByToken(token.id);

  if (!combatant) {
    ui.notifications.warn("Selected token is not in the combat.");
    return;
  }

  // Find the lowest initiative in the current combat
  let lowestInit = combat.combatants.reduce((min, c) => {
    if (c.initiative === null) return min;
    return c.initiative < min ? c.initiative : min;
  }, 99);

  let newInit = lowestInit - 1;
  combat.setInitiative(combatant.id, newInit);
}
