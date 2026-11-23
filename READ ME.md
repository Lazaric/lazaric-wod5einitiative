READ ME
# Lazaric's WoD5e Initiative Module

**Compatibility:** Foundry VTT v14 — World of Darkness 5th Edition  
**Module ID:** `lazaric-wod5einitiative`  
**Permissions:** GM required for all manual functions.

## Getting Started

The module automatically calculates initiative whenever the combat round advances. It also provides six functions that can be called manually through Foundry Script macros.

To create a macro, open the **Macro Directory**, create a new macro, set its type to **Script**, paste in the appropriate JavaScript command, and save it. You can then drag the macro to your hotbar.

All public functions are accessed through:

`game.modules.get("lazaric-wod5einitiative").api`

## 1. Push Token to Top

**Function:** `pushTokenTop()`

Moves the currently selected token to the top of the initiative order.

The function finds the highest initiative currently assigned in combat and sets the selected combatant's initiative to one point higher.

**Requirements:** An active combat encounter and a selected token that belongs to that combat. Must be executed by a GM.

**Macro — Move to Top**

```javascript
await game.modules.get("lazaric-wod5einitiative").api.pushTokenTop();
```

**Example:** If the highest initiative is 7, the selected combatant receives initiative 8.

This does not roll dice, create a chat message, or change anyone else's initiative.

## 2. Push Token to Bottom

**Function:** `pushTokenBottom()`

Moves the currently selected token to the bottom of the initiative order.

The function finds the lowest initiative currently assigned in combat and sets the selected combatant's initiative to one point lower.

**Requirements:** An active combat encounter and a selected token belonging to that combat. Must be executed by a GM.

**Macro — Move to Bottom**

```javascript
await game.modules.get("lazaric-wod5einitiative").api.pushTokenBottom();
```

**Example:** If the lowest initiative is 2, the selected combatant receives initiative 1.

This is useful for delaying an enemy's action, applying narrative effects, or manually adjusting the turn order.

## 3. Reroll Selected Token Initiative

**Function:** `rerollTokenInitiative()`

Rerolls initiative for the currently selected token using the initiative rules appropriate to its actor type.

**Standard characters:** Roll Wits + Awareness.

**Storyteller Characters (SPC):** Roll the dice pool specified in their Initiative Trait.

**Defeated combatants:** Receive initiative 0 without rolling.

**Invalid SPC Initiative Trait:** A warning is posted to chat and initiative is set to −10.

**Requirements:** An active combat encounter and a selected participating token. Must be executed by a GM.

**Macro — Reroll Selected Token**

```javascript
await game.modules.get("lazaric-wod5einitiative").api.rerollTokenInitiative();
```

The resulting initiative is posted to chat and immediately applied to the selected combatant.

Other combatants' initiatives remain unchanged.

## 4. Reroll All Initiatives

**Function:** `reRollAllInitiatives()`

Rerolls initiative for every combatant in the active encounter.

Each combatant receives an independent roll, including multiple tokens belonging to the same actor.

The function applies the normal initiative rules, handles defeated combatants and invalid SPC traits, and updates the combat tracker with all the results.

**Requirements:** An active combat encounter. Token selection is not required. Must be executed by a GM.

**Macro — Reroll All Initiatives**

```javascript
await game.modules.get("lazaric-wod5einitiative").api.reRollAllInitiatives();
```

After the initiative rolls, the combat tracker is sorted and the current turn is reset to the first combatant, provided combat has already begun.

**Important:** The function name is deliberately `reRollAllInitiatives`, with a capital R in `Roll`. JavaScript function names are case-sensitive.

## 5. Create Combat Dialog

**Function:** `createCombatDialog()`

Opens a dialog allowing the GM to create a new combat encounter or add tokens to an existing one.

The dialog provides two token selection modes:

- **All Tokens:** Add every eligible token on the current scene.
- **Selected Tokens Only:** Add only tokens currently selected on the canvas.

An additional **Exclude Vehicles** checkbox prevents actors of type `vehicle` from being added.

**Requirements:** An active canvas scene. Must be executed by a GM.

**Macro — Create Combat Dialog**

```javascript
await game.modules.get("lazaric-wod5einitiative").api.createCombatDialog();
```

When the GM clicks **Add to Combat**, the module:

1. Collects tokens according to the selected options.
2. Finds an appropriate combat encounter for the current scene, or creates a new one.
3. Excludes tokens already participating in that encounter.
4. Adds the remaining eligible tokens.
5. Displays a notification reporting how many tokens were added.

The dialog does not automatically roll initiative. Use **Reroll All Initiatives** afterwards, or allow the automatic initiative system to run when the round advances.

## 6. Roll a Specific Combatant's Initiative

**Function:** `rollActorInitiative(combatant)`

Rerolls initiative for a specific Foundry Combatant document.

Unlike `rerollTokenInitiative()`, this function does not use the currently selected token. It requires a Combatant object to be supplied directly.

This function is primarily intended for integration with other modules or more advanced macros.

**Requirements:** A valid Combatant object belonging to a combat encounter. Must be executed by a GM.

**Macro — Reroll Specific Combatant**

```javascript
const api = game.modules.get("lazaric-wod5einitiative").api;
const combatant = game.combat?.combatants.get("COMBATANT_ID");

if (combatant) {
  await api.rollActorInitiative(combatant);
} else {
  ui.notifications.warn("Combatant not found.");
}
```

Replace `COMBATANT_ID` with the actual Combatant document ID.

The function rolls initiative, posts the result to chat and immediately updates that combatant's initiative score.

For ordinary manual rerolls, use `rerollTokenInitiative()` instead.

---

## Automatic Initiative Rerolls

In addition to the public functions, the module registers an `updateCombat` hook.

Whenever combat advances to a higher round, the module automatically recalculates initiative for every combatant.

Only the **designated active GM** performs these rolls. This prevents duplicate chat messages and permission errors when several players are connected.

Automatic rerolls do not reset the turn counter separately.

There is no macro required to activate this feature. It runs whenever the module is enabled and a GM is connected.

## Storyteller Character Configuration

Storyteller Characters (`actor.type === "spc"`) do not have the standard attributes and skills required to calculate Wits + Awareness.

Each SPC must therefore have an embedded Trait item configured as follows:

| Property | Required value |
|---|---|
| Item type | `trait` |
| Trait name | `Initiative` |
| Dice pool (`system.dice`) | Positive integer, at least 1 |

The trait name is case-insensitive.

For example, an SPC with an Initiative Trait containing 6 dice rolls:

`6dwcs>5`

If the trait is missing or invalid, the module reports the problem in chat and assigns initiative −10.

This requirement applies to both automatic and manual initiative rolls.

## Dice and Chat Messages

Successful initiative rolls use the WoD5e custom dice formula:

`<dicePool>dwcs>5`

Each result is posted to chat as a Foundry roll message, with a customised display showing the number of dice rolled and the resulting successes.

Because roll data is retained, the result remains available to Foundry's normal roll inspection and compatible dice integrations.

## Permissions and Multiplayer

All manual functions require GM permissions.

Automatic initiative rolls run only on the designated active GM's client. Players do not need elevated permissions, even when the module has been installed in someone else's game.

Installing or authoring the module does not grant the user additional permissions.

If no GM is connected when a round advances, automatic initiative rerolling will not occur.

## Function Summary

| Function | Requires selected token | Purpose |
|---|---|---|
| `pushTokenTop()` | Yes | Move to first initiative position |
| `pushTokenBottom()` | Yes | Move to last initiative position |
| `rerollTokenInitiative()` | Yes | Reroll selected combatant |
| `reRollAllInitiatives()` | No | Reroll all combatants |
| `createCombatDialog()` | No | Create or expand combat |
| `rollActorInitiative(combatant)` | No | Reroll a specified Combatant |

**Note:** Manual initiative adjustments made with the Push to Top or Push to Bottom macros are temporary. They are overwritten when automatic initiative rerolling occurs at the next round advance.