import { isGroupId } from './grouping.js';

export const MAX_OPTIONS = 6;

// Short answers match if they're equal once case, spacing and punctuation are ignored.
export function normalizeAnswer(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// `key` is the option index (choice) or the accepted answers separated by '|' (text). No key = ungraded.
export function isCorrect(question, value, key) {
  if (key === undefined || key === null || key === '') return false;
  if (question.type === 'choice') return String(value) === String(key);
  const given = normalizeAnswer(value);
  return given !== '' && String(key).split('|').some((alt) => normalizeAnswer(alt) === given);
}

// Which answers earn a point. `answers` maps subject (uid or group id) -> { v }.
export function correctSubjects(question, key, answers) {
  return Object.entries(answers ?? {})
    .filter(([, a]) => isCorrect(question, a?.v, key))
    .map(([subject]) => subject);
}

// How many chose each option, for the bar chart on the big screen.
export function tally(optionCount, answers) {
  const counts = Array.from({ length: optionCount }, () => 0);
  for (const a of Object.values(answers ?? {})) {
    const i = Number(a?.v);
    if (Number.isInteger(i) && counts[i] !== undefined) counts[i]++;
  }
  return counts;
}

// Score entries -> ranked rows. Ties share a rank (1, 1, 3). `kind` picks players or groups out of the shared score node.
export function leaderboard(scores, nameOf, kind = 'players') {
  const rows = Object.entries(scores ?? {})
    .filter(([id, points]) => points > 0 && isGroupId(id) === (kind === 'groups'))
    .map(([id, points]) => ({ id, name: nameOf(id), points }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  rows.forEach((row, i) => {
    row.rank = i > 0 && rows[i - 1].points === row.points ? rows[i - 1].rank : i + 1;
  });
  return rows;
}
