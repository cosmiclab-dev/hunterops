// The Pipeline board's four columns, derived from a job's status and Grill Score.
export const COLUMNS = [
  { id: 'scouted', label: 'Scouted', hint: 'Found or saved, under 75' },
  { id: 'grilled', label: 'Grilled 75+', hint: 'Strong matches to apply to' },
  { id: 'applied', label: 'Applied', hint: 'Applied, interviewing or offer' },
  { id: 'rejected', label: 'Rejected', hint: 'Closed' },
] as const;
export type ColumnId = (typeof COLUMNS)[number]['id'];

export const GRILLED_MIN = 75;

export function columnOf(j: { status: string; grillScore: number | null }): ColumnId | null {
  if (j.status === 'APPLIED' || j.status === 'INTERVIEW' || j.status === 'OFFER') return 'applied';
  if (j.status === 'REJECTED') return 'rejected';
  if (j.status === 'NEW' || j.status === 'SAVED') return (j.grillScore ?? 0) >= GRILLED_MIN ? 'grilled' : 'scouted';
  return null;
}

// The status a drop sets, or an error message when the drop is not allowed.
export function dropStatus(j: { status: string; grillScore: number | null }, to: ColumnId): { status: string } | { error: string } {
  const from = columnOf(j);
  if (from === to) return { status: j.status };
  if (to === 'applied') return { status: 'APPLIED' };
  if (to === 'rejected') return { status: 'REJECTED' };
  const score = j.grillScore;
  if (to === 'grilled' && (score ?? 0) < GRILLED_MIN) {
    return { error: score === null ? 'Not scored yet. Set up your profile so the Grill can score it.' : `Grill Score is ${score}. This column is for 75 and up.` };
  }
  if (to === 'scouted' && (score ?? 0) >= GRILLED_MIN) return { error: `Grill Score is ${score}, so it belongs in Grilled 75+.` };
  return { status: 'SAVED' };
}
