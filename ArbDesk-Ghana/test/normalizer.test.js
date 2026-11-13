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

