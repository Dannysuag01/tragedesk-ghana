import test from 'node:test';
import assert from 'node:assert';
import { cleanTeamName, stringSimilarity, isMatchEqual } from '../src/engine/normalizer.js';

test('normalizes team names by stripping standard noise words', () => {
  assert.strictEqual(cleanTeamName('AEK Athens FC'), 'aek athens');
  assert.strictEqual(cleanTeamName('Manchester United FC'), 'manchester');
  assert.strictEqual(cleanTeamName('PS Kalamata'), 'ps kalamata');
});

test('accurately calculates similarity between variations', () => {
  const sim = stringSimilarity('AEK Athens', 'AEK Athens FC');
  assert.ok(sim > 0.8);
});

test('matches fixtures across bookmakers with different naming', () => {
  const fixtureA = {
    homeTeam: 'Kalamata',
    awayTeam: 'AEK Athens FC',
    startTime: '2026-11-21T17:30:00Z'
  };
  const fixtureB = {
    homeTeam: 'PS Kalamata',
    awayTeam: 'AEK Athens',
    startTime: '2026-11-21T17:30:00Z'
  };

  assert.strictEqual(isMatchEqual(fixtureA, fixtureB), true);
});

test('rejects matches with different start times (>2h)', () => {
  const fixtureA = {
    homeTeam: 'Kalamata',
    awayTeam: 'AEK Athens',
    startTime: '2026-11-21T10:00:00Z'
  };
  const fixtureB = {
    homeTeam: 'Kalamata',
    awayTeam: 'AEK Athens',
    startTime: '2026-11-21T17:30:00Z'
  };

  assert.strictEqual(isMatchEqual(fixtureA, fixtureB), false);
});

test('rejects Women vs Men match mismatch', () => {
  const fixtureA = {
    homeTeam: 'Vonds Ichihara FC Women',
    awayTeam: 'JFA Academy Fukushima Women',
    competition: 'Empress Cup, Women',
    startTime: '2026-11-14T04:00:00Z'
  };
  const fixtureB = {
    homeTeam: 'Vonds Ichihara FC',
    awayTeam: 'J-Lease FC',
    competition: 'Japan Football League',
    startTime: '2026-11-14T04:00:00Z'
  };

  assert.strictEqual(isMatchEqual(fixtureA, fixtureB), false);
});

test('rejects matches when away teams differ', () => {
  const fixtureA = {
    homeTeam: 'Vonds Ichihara FC',
    awayTeam: 'JFA Academy Fukushima',
    startTime: '2026-11-14T04:00:00Z'
  };
  const fixtureB = {
    homeTeam: 'Vonds Ichihara FC',
    awayTeam: 'J-Lease FC',
    startTime: '2026-11-14T04:00:00Z'
  };

  assert.strictEqual(isMatchEqual(fixtureA, fixtureB), false);
});

test('rejects matches from completely different leagues', () => {
  const fixtureA = {
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    competition: 'Premier League',
    country: 'England'
  };
  const fixtureB = {
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    competition: 'La Liga',
    country: 'Spain'
  };

  assert.strictEqual(isMatchEqual(fixtureA, fixtureB), false);
});

test('accepts matches with compatible league naming', () => {
  const fixtureA = {
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    competition: 'Premier League',
    country: 'England'
  };
  const fixtureB = {
    homeTeam: 'Arsenal FC',
    awayTeam: 'Chelsea FC',
    competition: 'England - Premier League',
    country: 'England'
  };

  assert.strictEqual(isMatchEqual(fixtureA, fixtureB), true);
});

test('rejects matches when sports differ', () => {
  const fixtureA = {
    homeTeam: 'Barcelona',
    awayTeam: 'Real Madrid',
    sport: 'Football',
    startTime: '2026-11-21T17:30:00Z'
  };
  const fixtureB = {
    homeTeam: 'Barcelona',
    awayTeam: 'Real Madrid',
    sport: 'Basketball',
    startTime: '2026-11-21T17:30:00Z'
  };

  assert.strictEqual(isMatchEqual(fixtureA, fixtureB), false);
});

test('accepts matches when one bookmaker specifies Football and another specifies Soccer', () => {
  const fixtureA = {
    homeTeam: 'Arsenal',
    awayTeam: 'Chelsea',
    sport: 'Football',
    competition: 'Premier League',
    startTime: '2026-11-21T17:30:00Z'
  };
  const fixtureB = {
    homeTeam: 'Arsenal FC',
    awayTeam: 'Chelsea FC',
    sport: 'Soccer',
    competition: 'Premier League',
    startTime: '2026-11-21T17:30:00Z'
  };

  assert.strictEqual(isMatchEqual(fixtureA, fixtureB), true);
});


