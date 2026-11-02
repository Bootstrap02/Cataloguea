// Season week helpers for the BetKing virtual football workflow.
//
// The Cataloguea strategy state itself has no week field. The required week is
// therefore held by the automation workflow (checkpoint/config), never inferred
// from whatever week the website happens to be displaying.
//
// The season runs Week 1 .. Week 38, then restarts at Week 1. Week 39 is not a
// valid game week.

const FIRST_WEEK = 1;
const LAST_WEEK = 38;

const WEEK_ALIGNMENT = Object.freeze({
  ALIGNED: 'ALIGNED',
  NAVIGATION_REQUIRED: 'NAVIGATION_REQUIRED',
  WEEK_UNAVAILABLE: 'WEEK_UNAVAILABLE',
  VISIBLE_WEEK_DISAGREES: 'VISIBLE_WEEK_DISAGREES',
  REQUIRED_WEEK_UNKNOWN: 'REQUIRED_WEEK_UNKNOWN',
});

function isValidWeek(value) {
  return Number.isInteger(value) && value >= FIRST_WEEK && value <= LAST_WEEK;
}

// Accepts 7, "7", "Week 7", "week 07", or a longer round label that contains
// "Week 7". Returns an integer 1..38, or null when no valid week is present
// ("Week 39" and "Week 0" are rejected, not clamped).
function parseWeek(value) {
  if (typeof value === 'number') {
    return isValidWeek(value) ? value : null;
  }
  if (typeof value !== 'string') return null;
  const labelled = /week\s*(\d{1,3})/i.exec(value);
  const bare = /^\s*(\d{1,3})\s*$/.exec(value);
  const raw = labelled ? labelled[1] : bare ? bare[1] : null;
  if (raw === null) return null;
  const week = Number(raw);
  return isValidWeek(week) ? week : null;
}

function nextWeek(currentWeek) {
  if (!isValidWeek(currentWeek)) {
    throw new RangeError(`Cannot advance from invalid week: ${currentWeek}`);
  }
  const rolledOver = currentWeek === LAST_WEEK;
  return {
    fromWeek: currentWeek,
    week: rolledOver ? FIRST_WEEK : currentWeek + 1,
    rolledOver,
  };
}

// Compares three distinct values that must never be conflated:
//   requiredWeek - the week the workflow needs to process (strategy side)
//   visibleWeek  - the week currently shown by the website
//   selectedWeek - the week the automation actually selected/confirmed
// availableWeeks (optional) lists the weeks currently offered by the website.
function assessWeekAlignment({
  requiredWeek,
  visibleWeek = null,
  selectedWeek = null,
  availableWeeks = null,
} = {}) {
  const required = parseWeek(requiredWeek);
  if (required === null) {
    return {
      status: WEEK_ALIGNMENT.REQUIRED_WEEK_UNKNOWN,
      ok: false,
      requiredWeek: null,
      reason: `Required week ${JSON.stringify(requiredWeek)} is not a valid week (${FIRST_WEEK}-${LAST_WEEK}).`,
    };
  }

  const visible = parseWeek(visibleWeek);
  const selected = parseWeek(selectedWeek);

  if (selected === required) {
    if (visible === required) {
      return {
        status: WEEK_ALIGNMENT.ALIGNED,
        ok: true,
        requiredWeek: required,
        visibleWeek: visible,
        selectedWeek: selected,
        reason: `Required, visible, and selected week all equal ${required}.`,
      };
    }
    return {
      status: WEEK_ALIGNMENT.VISIBLE_WEEK_DISAGREES,
      ok: false,
      requiredWeek: required,
      visibleWeek: visible,
      selectedWeek: selected,
      reason: `Week ${required} was selected but the page shows ${visible === null ? 'no readable week' : `week ${visible}`}.`,
    };
  }

  const available = Array.isArray(availableWeeks)
    ? availableWeeks.map(parseWeek).filter((week) => week !== null)
    : null;
  if (available && !available.includes(required)) {
    return {
      status: WEEK_ALIGNMENT.WEEK_UNAVAILABLE,
      ok: false,
      requiredWeek: required,
      visibleWeek: visible,
      selectedWeek: selected,
      availableWeeks: available,
      reason: `Week ${required} is not offered by the website (available: ${available.join(', ') || 'none'}).`,
    };
  }

  return {
    status: WEEK_ALIGNMENT.NAVIGATION_REQUIRED,
    ok: false,
    requiredWeek: required,
    visibleWeek: visible,
    selectedWeek: selected,
    reason: `Week ${required} must be selected before processing (visible: ${visible ?? 'unknown'}, selected: ${selected ?? 'none'}).`,
  };
}

module.exports = {
  FIRST_WEEK,
  LAST_WEEK,
  WEEK_ALIGNMENT,
  assessWeekAlignment,
  isValidWeek,
  nextWeek,
  parseWeek,
};
