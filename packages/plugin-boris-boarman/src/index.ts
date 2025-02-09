import type { Plugin } from "@elizaos/core";
import { analyzeTwitterAccountAction } from "./actions/analyzeTwitterAccount.ts";

export * as actions from "./actions";


export const borisBoarmanPlugin: Plugin = {
    name: "boris-boarman",
    description: "Boris Boarman Plugin",
    actions: [analyzeTwitterAccountAction],
};
export default borisBoarmanPlugin;
