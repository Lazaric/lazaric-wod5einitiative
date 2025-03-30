



/**
 * WOD Initiative Reroll Script
 *
 * Hooks into each new round to recalculate initiative using Wits + Awareness
 * and provides utility methods to push a selected token's initiative to
 * the top or bottom of the order.
 */

// Called once when Foundry first initializes your module
Hooks.once("ready", () => {
console.log("= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = ");
  console.log("WOD Initiative | Initializing custom Wits + Awareness initiative module");
console.log("= = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = = ");

 // Attach our push functions to the module's API so macros or other scripts can call them
 const mod = game.modules.get("lazaric-wod5einitiative");
 if (!mod) {
    console.warn("Module not found: lazaric-wod5einitiative");
    return;
  }
  if (mod) {
    mod.api = {
      pushTokenTop,
      pushTokenBottom
    };
  }
});

/**
 * Whenever the Combat document updates (i.e. new round),
 * reroll initiative for each combatant using Wits + Awareness.
 */
Hooks.on("updateCombat", async (doc, changed, options, userId) => {

// console.log("Lazaric's WOD Initiative | changed", changed);
// console.log("Lazaric's WOD Initiative | doc", doc);
// console.log("Lazaric's WOD Initiative | changed.round", changed.round);
// console.log("Lazaric's WOD Initiative | doc.round", doc.round);


  // Make sure there's a round update, and that the new round is actually greater
  if (changed.round !== undefined ) {
    let updates = [];

    for (let combatant of doc.turns) {
      let actor = combatant.actor;
      console.log("combatant", combatant);
      console.log("actor", actor);

      if (!actor) continue;

      // Adjust these for how your system stores Wits and Awareness
      let wits = actor.system?.attributes.wits?.value || 0;
      let awareness = actor.system?.skills.awareness?.value || 0;

      console.log("wits", wits);
      console.log("awareness", awareness);

      let dicePool = wits + awareness;

      // Example dice formula: sum of X d10
      let rollFormula = `${dicePool}dwcs>5`;
      //let roll = await new Roll(rollFormula).roll({ async: true });
      let roll = new Roll(rollFormula);
      console.log("roll", roll);

      // await roll.evaluate({ async: false });

      // Send the roll to the Chat Log
      const chatMessage = await roll.toMessage({
        flavor: `${actor.name}'s Initiative (Wits + Awareness)`,
        speaker: ChatMessage.getSpeaker({ actor })
      });

console.log("Lazaric's WOD Initiative | chatMessage", chatMessage);
      // Grab the roll total from the ChatMessage that was just created
      const finalTotal = chatMessage.rolls?.[0]?.total ?? 0;
console.log("Lazaric's WOD Initiative | finalTotal", finalTotal);
      // Use that total for the initiative update
      updates.push({
        _id: combatant.id,
        initiative: finalTotal
      });
    }
    if (updates.length > 0) {
      await doc.updateEmbeddedDocuments("Combatant", updates);
    }
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
