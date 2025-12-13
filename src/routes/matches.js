import { jsonResponse } from '../utils/response.js';

export async function handleGetMatches(env, authUser) {
  if (!authUser) {
    return jsonResponse({ error: 'Unauthorized' }, {}, 401);
  }

  const matches = await env.DB.prepare(
    'SELECT * FROM matches ORDER BY match_date DESC'
  ).all();
  return jsonResponse(matches.results || []);
}

export async function handleCreateMatch(request, env, authUser) {
  if (!authUser || authUser.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized - Admin only' }, {}, 403);
  }

  const data = await request.json();
  const { date, players } = data;

  const matchResult = await env.DB.prepare(
    'INSERT INTO matches (match_date) VALUES (?)'
  ).bind(date).run();

  const matchId = matchResult.meta.last_row_id;

  for (let player of players) {
    let playerRecord = await env.DB.prepare(
      'SELECT * FROM players WHERE name = ?'
    ).bind(player.name).first();

    if (!playerRecord) {
      const playerResult = await env.DB.prepare(
        'INSERT INTO players (name, position, total_goals, total_saves, total_assists, matches_played, total_shots_faced, total_goals_conceded, clean_sheets, total_penalties_faced, total_penalties_saved, total_yellow_cards, total_red_cards) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        player.name,
        'Forward',
        player.goals || 0,
        player.saves || 0,
        player.assists || 0,
        player.shots_faced || 0,
        player.goals_conceded || 0,
        (player.goals_conceded === 0 ? 1 : 0),
        player.penalties_faced || 0,
        player.penalties_saved || 0,
        player.yellow_cards || 0,
        player.red_cards || 0
      ).run();
      
      playerRecord = { id: playerResult.meta.last_row_id };
    } else {
      const isCleanSheet = (player.goals_conceded || 0) === 0 ? 1 : 0;
      
      await env.DB.prepare(
        `UPDATE players 
         SET total_goals = total_goals + ?, 
             total_saves = total_saves + ?, 
             total_assists = total_assists + ?,
             total_shots_faced = total_shots_faced + ?,
             total_goals_conceded = total_goals_conceded + ?,
             clean_sheets = clean_sheets + ?,
             total_penalties_faced = total_penalties_faced + ?,
             total_penalties_saved = total_penalties_saved + ?,
             total_yellow_cards = total_yellow_cards + ?,
             total_red_cards = total_red_cards + ?,
             matches_played = matches_played + 1
         WHERE id = ?`
      ).bind(
        player.goals || 0,
        player.saves || 0,
        player.assists || 0,
        player.shots_faced || 0,
        player.goals_conceded || 0,
        isCleanSheet,
        player.penalties_faced || 0,
        player.penalties_saved || 0,
        player.yellow_cards || 0,
        player.red_cards || 0,
        playerRecord.id
      ).run();
    }

    await env.DB.prepare(
      'INSERT INTO match_performances (match_id, player_id, goals, saves, assists, shots_faced, goals_conceded, penalties_faced, penalties_saved, yellow_cards, red_cards) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).bind(
      matchId,
      playerRecord.id,
      player.goals || 0,
      player.saves || 0,
      player.assists || 0,
      player.shots_faced || 0,
      player.goals_conceded || 0,
      player.penalties_faced || 0,
      player.penalties_saved || 0,
      player.yellow_cards || 0,
      player.red_cards || 0
    ).run();
  }

  return jsonResponse({ success: true, matchId });
}

export async function handleDeleteMatch(env, authUser, matchId) {
  if (!authUser || authUser.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized - Admin only' }, {}, 403);
  }

  const performances = await env.DB.prepare(
    'SELECT * FROM match_performances WHERE match_id = ?'
  ).bind(matchId).all();

  for (let perf of (performances.results || [])) {
    const wasCleanSheet = (perf.goals_conceded || 0) === 0 ? 1 : 0;
    
    await env.DB.prepare(
      `UPDATE players 
       SET total_goals = total_goals - ?,
           total_saves = total_saves - ?,
           total_assists = total_assists - ?,
           total_shots_faced = total_shots_faced - ?,
           total_goals_conceded = total_goals_conceded - ?,
           clean_sheets = clean_sheets - ?,
           total_penalties_faced = total_penalties_faced - ?,
           total_penalties_saved = total_penalties_saved - ?,
           total_yellow_cards = total_yellow_cards - ?,
           total_red_cards = total_red_cards - ?,
           matches_played = matches_played - 1
       WHERE id = ?`
    ).bind(
      perf.goals || 0,
      perf.saves || 0,
      perf.assists || 0,
      perf.shots_faced || 0,
      perf.goals_conceded || 0,
      wasCleanSheet,
      perf.penalties_faced || 0,
      perf.penalties_saved || 0,
      perf.yellow_cards || 0,
      perf.red_cards || 0,
      perf.player_id
    ).run();
  }

  await env.DB.prepare(
    'DELETE FROM match_performances WHERE match_id = ?'
  ).bind(matchId).run();

  await env.DB.prepare(
    'DELETE FROM matches WHERE id = ?'
  ).bind(matchId).run();

  return jsonResponse({ success: true });
}
