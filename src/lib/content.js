export const INFO = {
  about: {
    title: 'About this project',
    blocks: [
      ['', "I coach a youth team myself, and I was looking for something fast enough for everyday practice: draw a play, animate it, show it — and keep the box score during the game. Nothing I found really fit, so I built it."],
      ['A spare-time project', 'This app was built in my free time, next to practices, games and a day job. There is no company and no team behind it — it is a tool I made for myself and then made available to other coaches.'],
      ['For other coaches', 'If it helps you in the gym, that makes my day. Feedback, feature wishes and bug reports are always welcome — a lot of what is in here came from exactly that.'],
      ['Support', 'The app is free and stays free. If you would like to support its development, use the donate button on the start screen (PayPal link coming soon).'],
    ],
  },
  imprint: {
    title: 'Legal notice',
    blocks: [
      ['Information pursuant to § 5 TMG', 'Ralph Arnold, St. Norbert Straße 1a, 67677 Enkenbach-Alsenborn, Germany'],
      ['Contact', 'Email: ralph.arnold@live.de'],
      ['Responsible for the content', 'Ralph Arnold, address as above.'],
      ['Note', 'A private, non-commercial spare-time project. No goods or services are sold; voluntary donations are not payment for a service.'],
    ],
  },
  privacy: {
    title: 'Privacy',
    blocks: [
      ['No data collection', 'This app collects no personal data. There are no accounts, no tracking, no analytics, no ads and nothing is shared with third parties.'],
      ['Everything stays on your device', 'Plays, roster and game stats are stored only locally in your browser (localStorage). They never leave your device and I cannot see them. Clearing your browser data also deletes them.'],
      ['Exports', 'Images, videos and CSV files are generated directly on your device. Whether and with whom you share them is entirely up to you.'],
      ['Donations', 'Tapping the donate button opens the payment provider (PayPal) in a new tab, where their privacy policy applies.'],
    ],
  },
}

export const HINTS = {
  move: 'Drag players and ball freely (sets the start positions)',
  cut: 'Drag from a player — the cut runs in the selected step',
  dribble: 'Drag from a player to draw a dribble',
  screen: 'Drag a path — ends with a screen bar',
  pass: 'Drag from the ball to a team-mate — he then carries it',
  shot: 'Drag from the ball to the rim — the shot releases the ball',
  addOff: 'Tap the court to add an offensive player',
  addDef: 'Tap the court to add a defender',
  erase: "Tap to remove this step's path, again to remove the player",
}
