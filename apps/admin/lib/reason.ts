// What a reason prompt answered, reduced to "go ahead with this reason" or
// "do nothing".
//
// dialog.prompt() resolves null when the operator cancels (Cancelar, the X, a
// click outside). A caller that wrote `(await dialog.prompt(...)) ?? ''` turned
// that Cancel into an empty note and performed the action anyway — an account
// suspended by the button meant to stop it. So every action that needs a reason
// asks through here: null (cancelled) or blank means the action does not run.
// The server still checks the reason; this only stops the console from sending
// what the operator did not ask for.

/** The trimmed reason, or null when the prompt was cancelled or left blank. */
export function takeReason(answer: string | null | undefined): string | null {
  if (answer == null) return null;
  const reason = answer.trim();
  return reason === '' ? null : reason;
}
