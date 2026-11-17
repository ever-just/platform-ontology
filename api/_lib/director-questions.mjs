// The Access Agent director's question bank for Jev (TypeSafe System One). One place for every question and
// threshold so people can review them. The page sends only the state; the questions never come from the client.
// State fields: granted, not_granted, shown (capability ids shown so far), idle_s, last_lines (recent chat), turns.

export const DIRECTOR_QUESTIONS = {
  next_move: {
    type: "choice",
    instructions: {
      question: "An AI guide is giving a new person a hands on tour of what their own device and browser can do. The chat has gone quiet. What should the guide do next to keep the tour useful and lively?",
      inspect: ["`last_lines`", "`granted`", "`not_granted`", "`shown`", "`idle_s`"],
    },
    criteria: {
      demo_capability: { what: "Show one more live capability that has not been shown yet, using access already granted", not_for: "anything needing a new permission" },
      request_permission: { what: "Ask for one more permission, saying what it unlocks, because the most interesting things left need it", not_for: "when the person declined or sounded annoyed by a request" },
      show_insight_card: { what: "Draw a small card that combines readings already flowing into one plain insight", not_for: "when fewer than two things are running" },
      stay_quiet: { what: "Say nothing and wait", not_for: "a tour that just started; use when the person asked for quiet, is busy typing, or the last lines show they want to stop" },
    },
  },
  permission: {
    type: "choice",
    instructions: {
      question: "If the guide asks for one more permission now, which one would unlock the most impressive live demo for this person, given what is already granted?",
      inspect: ["`not_granted`", "`granted`", "`last_lines`"],
    },
    criteria: {
      "place.geolocation": "Location: shows where they are, local weather and time context",
      "capture.camera": "Camera: live video, light level, presence",
      "capture.microphone": "Microphone: sound level and voice features",
      notifications: "Notifications: lets the guide ping them when a watched thing happens",
      none: "No permission request fits right now",
    },
  },
  wants_quiet: {
    type: "noul",
    instructions: "Based on `last_lines`, the person wants the guide to stop offering things or talk less right now.",
  },
};

// Act on next_move only when Jev is this sure; below it the page does nothing.
export const MIN_CONFIDENCE = 0.45;
// Stay quiet whenever wants_quiet is at least this likely, whatever next_move says.
export const QUIET_AT = 0.6;
