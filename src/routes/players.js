import { jsonResponse } from '../utils/response.js';

export async function handleGetPlayers(env, authUser) {
  if (!authUser) {
    return jsonResponse({ error: 'Unauthorized' }, {}, 401);
  }

  const players = await env.DB.prepare(
    'SELECT * FROM players ORDER BY total_goals DESC'
  ).all();
  
  if (!players.results || players.results.length === 0) {
    return jsonResponse([]);
  }
  
  for (let player of players.results) {
    try {
      const history = await env.DB.prepare(
        `SELECT mp.*, m.match_date 
         FROM match_performances mp 
         JOIN matches m ON mp.match_id = m.id 
         WHERE mp.player_id = ? 
         ORDER BY m.match_date DESC`
      ).bind(player.id).all();
      
      player.history = (history.results || []).map(h => ({
        date: h.match_date,
        goals: h.goals,
        saves: h.saves,
        assists: h.assists,
        shots_faced: h.shots_faced || 0,
        goals_conceded: h.goals_conceded || 0,
        penalties_saved: h.penalties_saved || 0,
        yellow_cards: h.yellow_cards || 0,
        red_cards: h.red_cards || 0
      }));
    } catch (error) {
      player.history = [];
    }
  }
  
  return jsonResponse(players.results);
}

export async function handleCreatePlayer(request, env, authUser) {
  if (!authUser || authUser.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized' }, {}, 403);
  }

  const { name, position } = await request.json();

  try {
    const result = await env.DB.prepare(
      'INSERT INTO players (name, position, total_goals, total_saves, total_assists, matches_played) VALUES (?, ?, 0, 0, 0, 0)'
    ).bind(name, position || 'Forward').run();

    return jsonResponse({ success: true, id: result.meta.last_row_id });
  } catch (error) {
    return jsonResponse({ error: 'Player already exists or database error' }, {}, 400);
  }
}

export async function handleDeletePlayer(env, authUser, playerId) {
  if (!authUser || authUser.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized' }, {}, 403);
  }

  await env.DB.prepare(
    'DELETE FROM match_performances WHERE player_id = ?'
  ).bind(playerId).run();

  await env.DB.prepare(
    'DELETE FROM players WHERE id = ?'
  ).bind(playerId).run();

  return jsonResponse({ success: true });
}
