// What the person sees right now on the ai host: the white page (with the console covered behind it) or the console.
// VoiceDock sets it; describe_screen reports it so the agent never thinks it cannot reach the console.
export type Sees = "white page" | "console";
let sees: Sees = "console";
export const setPersonSees = (s: Sees) => { sees = s; };
export const personSees = (): Sees => sees;
