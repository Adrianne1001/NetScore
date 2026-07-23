/* =====================================================================
 * NetScore — Sport rule presets
 * Each preset defines the rules the scoring engine uses. Everything here
 * is overridable from the Match Setup dialog (points, win-by, cap, etc.).
 *
 *  points          points needed to win a game
 *  winBy           required lead to close a game (usually 2)
 *  cap             hard ceiling — first to `cap` wins even without the lead
 *                  (0 / null = no cap)
 *  bestOf          number of games in the match; match ends at majority
 *  finalGamePoints points target for the deciding game (e.g. VB 5th set = 15)
 *  serveModel      how the server is determined after each rally:
 *                    'winner'      → rally winner serves next  (badminton, VB)
 *                    'alternate2'  → serve switches every 2 pts,
 *                                    every 1 at deuce            (table tennis)
 *                    'manual'      → operator sets the server    (generic)
 * =================================================================== */
const SPORTS = {
  badminton: {
    key: 'badminton',
    name: 'Badminton',
    emoji: '🏸',
    accent: '#38e07b',
    points: 21, winBy: 2, cap: 30, bestOf: 3,
    finalGamePoints: 21,
    serveModel: 'winner',
    blurb: 'Rally to 21, win by 2, hard cap at 30. Winner of the rally serves.'
  },
  volleyball: {
    key: 'volleyball',
    name: 'Volleyball',
    emoji: '🏐',
    accent: '#f9a03f',
    points: 25, winBy: 2, cap: 0, bestOf: 5,
    finalGamePoints: 15,
    serveModel: 'winner',
    blurb: 'Sets to 25, win by 2. Deciding 5th set is played to 15.'
  },
  pickleball: {
    key: 'pickleball',
    name: 'Pickleball',
    emoji: '🥒',
    accent: '#7cc576',
    points: 11, winBy: 2, cap: 0, bestOf: 3,
    finalGamePoints: 11,
    serveModel: 'sideout',
    scoring: 'sideout',   // only the serving side can score
    doubles: true,        // two servers per team, then side-out
    blurb: 'Traditional side-out: only the serving team scores. Doubles uses 2 servers per team (game starts 0-0-2), then side-out.'
  },
  tabletennis: {
    key: 'tabletennis',
    name: 'Table Tennis',
    emoji: '🏓',
    accent: '#4f9dff',
    points: 11, winBy: 2, cap: 0, bestOf: 5,
    finalGamePoints: 11,
    serveModel: 'alternate2',
    blurb: 'Games to 11, win by 2. Serve alternates every 2 points (every point at deuce).'
  },
  tennis: {
    key: 'tennis',
    name: 'Tennis',
    emoji: '🎾',
    accent: '#c6e34d',
    points: 7, winBy: 2, cap: 0, bestOf: 3,
    finalGamePoints: 10,
    serveModel: 'alternate2',
    blurb: 'Tie-break style: first to 7, win by 2. Super tie-break decider to 10.'
  },
  sepak: {
    key: 'sepak',
    name: 'Sepak Takraw',
    emoji: '🧺',
    accent: '#ff6b9d',
    points: 21, winBy: 2, cap: 25, bestOf: 3,
    finalGamePoints: 15,
    serveModel: 'winner',
    blurb: 'Sets to 21, win by 2, cap 25. Deciding set (tiebreak) played to 15.'
  },
  custom: {
    key: 'custom',
    name: 'Custom',
    emoji: '⚙️',
    accent: '#a78bfa',
    points: 15, winBy: 2, cap: 0, bestOf: 3,
    finalGamePoints: 15,
    serveModel: 'winner',
    blurb: 'Your rules. Configure everything in Match Setup.'
  }
};

const SPORT_ORDER = ['badminton', 'volleyball', 'pickleball', 'tabletennis', 'tennis', 'sepak', 'custom'];
