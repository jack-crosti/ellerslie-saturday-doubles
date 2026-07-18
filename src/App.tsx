"use client";

import "./styles.css";

import { useEffect, useMemo, useRef, useState } from "react";

type Player = { id: string; name: string; skill: number };
type Team = [Player, Player];
type Court = { court: number; teamA: Team; teamB: Team };
type Round = { number: number; courts: Court[]; waiting: Player[] };

const PLAYER_KEY = "saturday-doubles-players-v1";
const INTRO_KEY = "ellerslie-intro-seen-v1";
const DEFAULT_MINUTES = 25;

const starterPlayers: Player[] = [
  ["Amanda", 3], ["Andre", 5], ["Ben", 3], ["Binh", 2],
  ["Brett", 3], ["Cathy", 2], ["Christina", 2], ["England", 3],
  ["Jack", 2], ["Julian", 3], ["Kana", 2], ["Kayoko", 2],
  ["Kevin", 3], ["Mel", 3], ["Nick", 3], ["Rob", 3],
  ["Ruth", 2], ["Tim", 4], ["Tom", 4], ["Vivek", 3],
  ["Yulong", 4],
].map(([name, skill], index) => ({ id: `club-${index}`, name: String(name), skill: Number(skill) }));

function initials(name: string) {
  return name.split(/\s+/).map((word) => word[0]).join("").slice(0, 2).toUpperCase();
}

function pairKey(a: Player, b: Player) {
  return [a.id, b.id].sort().join("|");
}

function seededShuffle<T>(items: T[], seed: number) {
  const result = [...items];
  let value = seed || 1;
  for (let i = result.length - 1; i > 0; i--) {
    value = (value * 9301 + 49297) % 233280;
    const j = Math.floor((value / 233280) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function matchRound(players: Player[], history: Round[], number: number): Round {
  const games = new Map<string, number>();
  const rests = new Map<string, number>();
  const partners = new Map<string, number>();
  const opponents = new Map<string, number>();
  const lastWaiting = new Set(history.at(-1)?.waiting.map((p) => p.id) ?? []);

  history.forEach((round) => {
    round.waiting.forEach((p) => rests.set(p.id, (rests.get(p.id) ?? 0) + 1));
    round.courts.forEach(({ teamA, teamB }) => {
      [...teamA, ...teamB].forEach((p) => games.set(p.id, (games.get(p.id) ?? 0) + 1));
      [teamA, teamB].forEach(([a, b]) => partners.set(pairKey(a, b), (partners.get(pairKey(a, b)) ?? 0) + 1));
      teamA.forEach((a) => teamB.forEach((b) => opponents.set(pairKey(a, b), (opponents.get(pairKey(a, b)) ?? 0) + 1)));
    });
  });

  const courtCount = Math.min(3, Math.floor(players.length / 4));
  const slots = courtCount * 4;
  const ranked = [...players].sort((a, b) => {
    const gameGap = (games.get(a.id) ?? 0) - (games.get(b.id) ?? 0);
    if (gameGap) return gameGap;
    const waitingGap = Number(lastWaiting.has(b.id)) - Number(lastWaiting.has(a.id));
    if (waitingGap) return waitingGap;
    const restGap = (rests.get(b.id) ?? 0) - (rests.get(a.id) ?? 0);
    return restGap || a.name.localeCompare(b.name);
  });
  const playing = ranked.slice(0, slots);
  const waiting = ranked.slice(slots);

  if (!playing.length) return { number, courts: [], waiting };

  let bestCourts: Court[] = [];
  let bestScore = Infinity;
  const pairings = [[0, 1, 2, 3], [0, 2, 1, 3], [0, 3, 1, 2]];

  for (let attempt = 1; attempt <= 320; attempt++) {
    const order = seededShuffle(playing, number * 1009 + attempt * 37);
    const courts: Court[] = [];
    let score = 0;
    for (let courtIndex = 0; courtIndex < courtCount; courtIndex++) {
      const group = order.slice(courtIndex * 4, courtIndex * 4 + 4);
      let bestPairing = pairings[0];
      let pairingScore = Infinity;
      pairings.forEach((pairing) => {
        const [a, b, c, d] = pairing.map((index) => group[index]);
        const difference = Math.abs(a.skill + b.skill - c.skill - d.skill);
        const repeatedPartners = (partners.get(pairKey(a, b)) ?? 0) + (partners.get(pairKey(c, d)) ?? 0);
        const repeatedOpponents = [a, b].reduce((sum, p) => sum + [c, d].reduce((inner, q) => inner + (opponents.get(pairKey(p, q)) ?? 0), 0), 0);
        const candidate = difference * 28 + repeatedPartners * 24 + repeatedOpponents * 2;
        if (candidate < pairingScore) {
          pairingScore = candidate;
          bestPairing = pairing;
        }
      });
      const [a, b, c, d] = bestPairing.map((index) => group[index]);
      courts.push({ court: courtIndex + 1, teamA: [a, b], teamB: [c, d] });
      score += pairingScore;
    }
    if (score < bestScore) {
      bestScore = score;
      bestCourts = courts;
    }
  }

  return { number, courts: bestCourts, waiting };
}

function Rating({ value, onChange, compact = false }: { value: number; onChange?: (value: number) => void; compact?: boolean }) {
  return (
    <div className={`rating ${compact ? "compact" : ""}`} aria-label={`Skill rating ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((score) => (
        <button key={score} type="button" className={score <= value ? "active" : ""} onClick={() => onChange?.(score)} disabled={!onChange} aria-label={`Set skill to ${score}`} />
      ))}
    </div>
  );
}

function PlayerRow({ player, selected, onToggle, onRemove, onSkill }: { player: Player; selected?: boolean; onToggle?: () => void; onRemove?: () => void; onSkill?: (value: number) => void }) {
  return (
    <div className={`player-row ${selected ? "selected" : ""}`}>
      {onToggle && <button className="check" type="button" onClick={onToggle} aria-label={`${selected ? "Remove" : "Add"} ${player.name} ${selected ? "from" : "to"} attendance`}>{selected ? "✓" : ""}</button>}
      <span className="avatar">{initials(player.name)}</span>
      <button type="button" className="player-name" onClick={onToggle}>{player.name}</button>
      {onSkill ? <Rating value={player.skill} onChange={onSkill} compact /> : <span className="skill-chip">{player.skill}</span>}
      {onRemove && <button className="remove" type="button" onClick={onRemove} aria-label={`Remove ${player.name}`}>×</button>}
    </div>
  );
}

function CourtCard({ court }: { court: Court }) {
  const totalA = court.teamA[0].skill + court.teamA[1].skill;
  const totalB = court.teamB[0].skill + court.teamB[1].skill;
  return (
    <article className="court-card">
      <div className="court-title"><span className="court-mark"><i /><i /></span><strong>COURT {court.court}</strong></div>
      <div className="team">{court.teamA.map((player) => <PlayerRow key={player.id} player={player} />)}</div>
      <div className="versus"><span />VS<span /></div>
      <div className="team">{court.teamB.map((player) => <PlayerRow key={player.id} player={player} />)}</div>
      <div className="balance"><span>{Math.abs(totalA - totalB) <= 1 ? "Balanced" : "Closest match"}</span><b>{totalA} vs {totalB}</b></div>
    </article>
  );
}

export default function Home() {
  const [players, setPlayers] = useState<Player[]>(starterPlayers);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set(starterPlayers.map((p) => p.id)));
  const [roundCount, setRoundCount] = useState(6);
  const [matchMinutes, setMatchMinutes] = useState(DEFAULT_MINUTES);
  const [session, setSession] = useState(false);
  const [history, setHistory] = useState<Round[]>([]);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [leavingIds, setLeavingIds] = useState<Set<string>>(new Set());
  const [seconds, setSeconds] = useState(DEFAULT_MINUTES * 60);
  const [running, setRunning] = useState(false);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<"add" | "manage" | "guide" | null>(null);
  const [showIntro, setShowIntro] = useState(false);
  const [introReady, setIntroReady] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [newName, setNewName] = useState("");
  const [newSkill, setNewSkill] = useState(3);
  const [toast, setToast] = useState("");

  useEffect(() => {
    const stored = localStorage.getItem(PLAYER_KEY);
    if (stored) {
      try {
        const saved: Player[] = JSON.parse(stored);
        const legacyDemoList = saved.length > 0 && saved.every((player) => player.id.startsWith("starter-"));
        const playerList = legacyDemoList ? starterPlayers : saved;
        setPlayers(playerList);
        setSelectedIds(new Set(playerList.map((p) => p.id)));
        if (legacyDemoList) localStorage.setItem(PLAYER_KEY, JSON.stringify(starterPlayers));
      } catch { /* keep starter list */ }
    }
  }, []);

  useEffect(() => {
    if (players !== starterPlayers) localStorage.setItem(PLAYER_KEY, JSON.stringify(players));
  }, [players]);

  useEffect(() => {
    if (!localStorage.getItem(INTRO_KEY)) setShowIntro(true);
  }, []);

  useEffect(() => {
    if (!showIntro) return;
    setIntroReady(false);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timeout = window.setTimeout(() => setIntroReady(true), reducedMotion ? 500 : 4750);
    return () => window.clearTimeout(timeout);
  }, [showIntro]);

  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setSeconds((value) => {
      if (value <= 1) {
        setRunning(false);
        ringBell();
        setToast("Round time is up");
        return 0;
      }
      return value - 1;
    }), 1000);
    return () => window.clearInterval(timer);
  }, [running]);

  useEffect(() => {
    if (!toast) return;
    const timeout = window.setTimeout(() => setToast(""), 2800);
    return () => window.clearTimeout(timeout);
  }, [toast]);

  const selectedPlayers = useMemo(() => players.filter((p) => selectedIds.has(p.id)), [players, selectedIds]);
  const availablePlayers = selectedPlayers.filter((p) => !leavingIds.has(p.id));
  const filteredPlayers = players.filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const playedCounts = useMemo(() => {
    const counts = new Map<string, number>();
    [...history, ...(currentRound ? [currentRound] : [])].forEach((round) => round.courts.flatMap((court) => [...court.teamA, ...court.teamB]).forEach((p) => counts.set(p.id, (counts.get(p.id) ?? 0) + 1)));
    return counts;
  }, [history, currentRound]);

  function getAudioContext() {
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();
    return audioContextRef.current;
  }

  function primeBell() {
    try {
      const context = getAudioContext();
      if (context.state === "suspended") void context.resume();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      gain.gain.value = 0.0001;
      oscillator.connect(gain).connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.02);
    } catch { /* audio is optional on unsupported browsers */ }
  }

  function ringBell() {
    try {
      const context = getAudioContext();
      if (context.state === "suspended") void context.resume();
      const now = context.currentTime;
      [0, 0.22, 0.48].forEach((delay, strike) => {
        [1, 1.5, 2.04].forEach((ratio, harmonic) => {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const start = now + delay;
          oscillator.type = harmonic === 0 ? "sine" : "triangle";
          oscillator.frequency.setValueAtTime((strike === 2 ? 988 : 880) * ratio, start);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(0.34 / (harmonic + 1), start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 1.25 + harmonic * 0.2);
          oscillator.connect(gain).connect(context.destination);
          oscillator.start(start);
          oscillator.stop(start + 1.55 + harmonic * 0.2);
        });
      });
      if ("vibrate" in navigator) navigator.vibrate([280, 120, 280]);
      setToast("Bell test");
    } catch {
      setToast("Turn your device volume on");
    }
  }

  function dismissIntro() {
    localStorage.setItem(INTRO_KEY, "1");
    setShowIntro(false);
  }

  function replayIntro() {
    setModal(null);
    setIntroReady(false);
    window.setTimeout(() => setShowIntro(true), 180);
  }

  function togglePlayer(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function updateSkill(id: string, skill: number) {
    setPlayers((current) => current.map((p) => p.id === id ? { ...p, skill } : p));
  }

  function addPlayer() {
    const name = newName.trim();
    if (!name) return;
    const player = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, name, skill: newSkill };
    setPlayers((current) => [...current, player].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedIds((current) => new Set([...current, player.id]));
    setNewName("");
    setNewSkill(3);
    setModal(null);
    setToast(`${name} saved and selected`);
  }

  function startSession() {
    primeBell();
    if (selectedPlayers.length < 4) {
      setToast("Select at least four players");
      return;
    }
    const first = matchRound(selectedPlayers, [], 1);
    setCurrentRound(first);
    setHistory([]);
    setLeavingIds(new Set());
    setSeconds(matchMinutes * 60);
    setRunning(true);
    setSession(true);
  }

  function finishRound() {
    if (!currentRound) return;
    setRunning(false);
    if (currentRound.number >= roundCount) {
      setHistory((rounds) => [...rounds, currentRound]);
      setCurrentRound(null);
      setToast("Saturday session complete");
      return;
    }
    const completed = [...history, currentRound];
    const nextRound = matchRound(availablePlayers, completed, currentRound.number + 1);
    setHistory(completed);
    setCurrentRound(nextRound);
    setSeconds(matchMinutes * 60);
    setRunning(true);
  }

  function resetSession() {
    setSession(false);
    setCurrentRound(null);
    setHistory([]);
    setLeavingIds(new Set());
    setRunning(false);
    setSeconds(matchMinutes * 60);
  }

  const minute = Math.floor(seconds / 60).toString().padStart(2, "0");
  const second = (seconds % 60).toString().padStart(2, "0");
  const activePlayers = currentRound?.courts.flatMap((court) => [...court.teamA, ...court.teamB]) ?? [];

  return (
    <main className="app-shell">
      <div className="court-lines" aria-hidden="true"><span /><span /><span /></div>
      <header className="topbar">
        <div className="brand"><div className="ball-logo"><i /><i /></div><div><h1>Ellerslie Tennis Club</h1><p>Saturday Doubles</p></div></div>
        <div className="session-meta"><span className="eyebrow">SATURDAY SESSION</span><b>{session ? `Round ${currentRound?.number ?? roundCount} of ${roundCount}` : "Session setup"}</b><small>{matchMinutes} min · {roundCount} rounds · 3 courts</small></div>
        <div className="header-actions">
          <button className="guide-button" type="button" onClick={() => setModal("guide")}>Guide</button>
          <button className="outline-button" type="button" onClick={() => setModal("manage")}>Manage players</button>
        </div>
      </header>

      {!session ? (
        <section className="setup-view page-enter">
          <div className="setup-main">
            <div className="intro-copy"><span className="eyebrow dark">ELLERSLIE TENNIS CLUB</span><h2>Saturday Doubles</h2></div>
            <div className="setup-stats">
              <div><b>{selectedPlayers.length}</b><span>Selected</span></div><div><b>{Math.min(3, Math.floor(selectedPlayers.length / 4))}</b><span>Courts in use</span></div><div><b>{Math.max(0, selectedPlayers.length - 12)}</b><span>Waiting first round</span></div>
            </div>
            <div className="session-settings">
              <div className="setting-control">
                <div><span className="eyebrow dark">ROUNDS</span><h3>Number of rounds</h3></div>
                <div className="stepper"><button type="button" onClick={() => setRoundCount(Math.max(1, roundCount - 1))} aria-label="Reduce number of rounds">−</button><strong>{roundCount}<small>rounds</small></strong><button type="button" onClick={() => setRoundCount(Math.min(20, roundCount + 1))} aria-label="Increase number of rounds">+</button></div>
              </div>
              <div className="setting-control">
                <div><span className="eyebrow dark">MATCH TIME</span><h3>Minutes per match</h3></div>
                <div className="stepper"><button type="button" onClick={() => setMatchMinutes(Math.max(5, matchMinutes - 5))} aria-label="Reduce match duration">−</button><strong>{matchMinutes}<small>minutes</small></strong><button type="button" onClick={() => setMatchMinutes(Math.min(90, matchMinutes + 5))} aria-label="Increase match duration">+</button></div>
              </div>
            </div>
            <button className="primary-button large" type="button" onClick={startSession}><span>▶</span> Create matches <small>{selectedPlayers.length >= 4 ? `${Math.min(3, Math.floor(selectedPlayers.length / 4))} courts ready` : "Select at least 4 players"}</small></button>
          </div>

          <aside className="attendance-panel">
            <div className="panel-heading"><div><span className="eyebrow">ATTENDANCE</span><h3>Players</h3></div><b>{selectedPlayers.length} selected</b></div>
            <div className="search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search saved players" /></div>
            <div className="player-list">
              {filteredPlayers.map((player) => <PlayerRow key={player.id} player={player} selected={selectedIds.has(player.id)} onToggle={() => togglePlayer(player.id)} />)}
              {!filteredPlayers.length && <div className="empty">No saved player found.</div>}
            </div>
            <button className="add-player" type="button" onClick={() => setModal("add")}><span>＋</span> Add new player</button>
          </aside>
        </section>
      ) : (
        <section className="dashboard page-enter">
          <div className="round-area">
            <div className="round-heading">
              <div><span className="eyebrow dark">LIVE SESSION</span><h2>{currentRound ? `Round ${currentRound.number}` : "Session complete"}</h2></div>
              {currentRound && <div className={`timer ${seconds <= 60 ? "urgent" : ""}`}><span>{running ? "● LIVE" : seconds === 0 ? "TIME" : "PAUSED"}</span><b>{minute}:{second}</b><button type="button" onClick={() => setRunning((value) => !value)}>{running ? "Pause" : "Resume"}</button></div>}
            </div>

            {currentRound ? <div className="courts-grid" key={currentRound.number}>{currentRound.courts.map((court) => <CourtCard key={court.court} court={court} />)}</div> : (
              <div className="complete-card"><span>✓</span><h3>Session complete</h3><button className="primary-button" type="button" onClick={resetSession}>New session</button></div>
            )}

            {currentRound && <div className="round-actions"><div className="fairness"><span>FAIRNESS</span><b>{Math.max(...availablePlayers.map((p) => playedCounts.get(p.id) ?? 0), 0) - Math.min(...availablePlayers.map((p) => playedCounts.get(p.id) ?? 0), 0) <= 1 ? "Even court time" : "Balancing next round"}</b></div><button className="primary-button" type="button" onClick={finishRound}>{currentRound.number >= roundCount ? "Finish session" : "Finish round & create next"}<span>→</span></button></div>}
          </div>

          <aside className="live-sidebar">
            <div className="live-panel">
              <div className="panel-heading"><div><span className="eyebrow">ON COURT</span><h3>{activePlayers.length} players</h3></div><span className="live-dot">LIVE</span></div>
              <div className="mini-list">{activePlayers.map((player) => <div key={player.id}><span className="avatar">{initials(player.name)}</span><p><b>{player.name}</b><small>Played {playedCounts.get(player.id) ?? 0} round{(playedCounts.get(player.id) ?? 0) === 1 ? "" : "s"}</small></p><span className="skill-chip">{player.skill}</span><button type="button" className={leavingIds.has(player.id) ? "leaving" : ""} onClick={() => setLeavingIds((current) => { const next = new Set(current); if (next.has(player.id)) next.delete(player.id); else next.add(player.id); return next; })}>{leavingIds.has(player.id) ? "Staying" : "Leaving"}</button></div>)}</div>
            </div>
            <div className="waiting-panel"><div><span className="eyebrow">WAITING / HOLDING</span><b>{currentRound?.waiting.length ?? 0}</b></div>{currentRound?.waiting.length ? currentRound.waiting.map((player) => <PlayerRow key={player.id} player={player} />) : <p>Everyone is on court this round.</p>}</div>
            <button className="text-button" type="button" onClick={resetSession}>End session and return to setup</button>
          </aside>
        </section>
      )}

      {modal && <div className="modal-backdrop" role="presentation" onMouseDown={() => setModal(null)}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" onMouseDown={(event) => event.stopPropagation()}>
        <button className="modal-close" type="button" onClick={() => setModal(null)}>×</button>
        {modal === "add" ? <>
          <span className="eyebrow dark">PLAYER REGISTER</span><h2 id="modal-title">Add player</h2>
          <label>Player name<input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addPlayer(); }} placeholder="Full name" /></label>
          <label>Skill level<Rating value={newSkill} onChange={setNewSkill} /></label>
          <div className="skill-scale"><span>1 · Beginner</span><span>5 · Advanced</span></div>
          <button className="primary-button full" type="button" onClick={addPlayer}>Save and select player</button>
        </> : modal === "manage" ? <>
          <span className="eyebrow dark">PLAYER REGISTER</span><h2 id="modal-title">Manage players</h2>
          <div className="rating-guide">
            <div><b>Skill level</b><span>Use the player&apos;s current doubles level.</span></div>
            <div className="rating-key"><span><i>1</i> Beginner</span><span><i>3</i> Intermediate</span><span><i>5</i> Advanced</span></div>
          </div>
          <div className="manage-list">{players.map((player) => <PlayerRow key={player.id} player={player} onSkill={(value) => updateSkill(player.id, value)} onRemove={() => { setPlayers((current) => current.filter((p) => p.id !== player.id)); setSelectedIds((current) => { const next = new Set(current); next.delete(player.id); return next; }); }} />)}</div>
          <button className="primary-button full" type="button" onClick={() => setModal("add")}>Add another player</button>
        </> : <>
          <span className="eyebrow dark">QUICK GUIDE</span><h2 id="modal-title">Saturday Doubles</h2>
          <div className="guide-steps">
            <div><b>1</b><p><strong>Choose players</strong><span>Select today&apos;s attendance and check each skill level.</span></p></div>
            <div><b>2</b><p><strong>Set the session</strong><span>Choose match time and the number of rounds.</span></p></div>
            <div><b>3</b><p><strong>Create matches</strong><span>The app balances courts and rotates waiting players.</span></p></div>
            <div><b>4</b><p><strong>Finish each round</strong><span>The bell rings, then create the next round.</span></p></div>
          </div>
          <div className="sound-note"><span>♪</span><p><b>Round bell</b>Keep the app open and your device volume turned up.</p></div>
          <div className="guide-actions">
            <button className="secondary-button" type="button" onClick={ringBell}>Test bell</button>
            <button className="secondary-button" type="button" onClick={replayIntro}>Replay intro</button>
          </div>
        </>}
      </section></div>}
      {showIntro && <div className={`intro-screen ${introReady ? "settled" : ""}`} role="dialog" aria-label="Welcome to Ellerslie Saturday Doubles">
        <div className="intro-stage" aria-hidden="true">
          <div className="intro-glow intro-glow-one" />
          <div className="intro-glow intro-glow-two" />
          <div className="intro-court"><i /><i /><i /></div>
          <div className="ball-flight">
            <span className="ball-shadow" />
            <div className="cinematic-ball"><i /><i /></div>
          </div>
        </div>
        <div className={`intro-welcome ${introReady ? "ready" : ""}`}>
          <span>ELLERSLIE TENNIS CLUB</span>
          <h2>Saturday Doubles</h2>
          <p>Balanced matches, fair court time and simple rotations across three courts.</p>
          <div className="intro-mini-guide">
            <div><b>1</b><span>Select today&apos;s players</span></div>
            <div><b>2</b><span>Set match time and rounds</span></div>
            <div><b>3</b><span>Finish each round to rotate</span></div>
          </div>
          <button className="intro-enter" type="button" onClick={dismissIntro}>Enter the courts <span>→</span></button>
        </div>
        <button className="intro-skip" type="button" onClick={dismissIntro}>Skip</button>
      </div>}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
