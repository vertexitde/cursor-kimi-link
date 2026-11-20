// What this link contributes to an agent runtime, on the client and on an SSH
// host. The marker is what this provider leaves behind, so a second link can
// patch the same file without tripping over the first one's work.
import {patchRuntime} from './patches.mjs';

export const link = 'cursor-kimi-link';
export const prefix = 'kimi/';
export const marker = 't.startsWith("kimi/")';
export {patchRuntime};
