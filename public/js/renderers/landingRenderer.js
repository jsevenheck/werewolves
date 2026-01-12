import { loadSession } from '../state/gameState.js';

function renderLanding() {
  const saved = typeof loadSession === 'function' ? loadSession() : null;
  const resumeBlock = saved
    ? `<button id="resume-btn">Resume ${saved.roomCode} as ${saved.name}</button>`
    : '';
  return `
    <section class="panel">
      <h1>Werewolves</h1>
      <p>Host or join a moderator-free social deduction match.</p>
      <form id="create-form">
        <label>
          <span>Your name</span>
          <input name="name" required maxlength="20" placeholder="e.g. Alex" />
        </label>
        <button type="submit">Create Lobby</button>
      </form>
    </section>
    <section class="panel">
      <h2>Join a Lobby</h2>
      <form id="join-form">
        <label>
          <span>Your name</span>
          <input name="name" required maxlength="20" />
        </label>
        <label>
          <span>Room code</span>
          <input name="code" required maxlength="4" placeholder="ABCD" style="text-transform:uppercase" />
        </label>
        <button type="submit">Join Game</button>
      </form>
      ${resumeBlock ? `<div style="margin-top:1rem;display:flex;flex-direction:column;gap:.5rem;">${resumeBlock}</div>` : ''}
    </section>
  `;
}

export { renderLanding };
