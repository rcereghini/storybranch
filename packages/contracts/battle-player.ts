import { choiceCommandSchema, type Save } from "./index";
import { battleIntentSchema, type BattleState } from "./battle";
export const battleContractHeader = "X-Story-Battle";
export const battleContractVersion = "battle-v1";
export const battleCommandSchema = choiceCommandSchema
  .extend({ payload: battleIntentSchema })
  .strict();
export type BattleSave = Save & { battle?: BattleState };
