export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      // GET /api/matches - Get all matches
      if (path === '/api/matches' && request.method === 'GET') {
        const matches = await env.DB.prepare(
          'SELECT * FROM matches ORDER BY match_date DESC'
        ).all();
        return jsonResponse(matches.results, corsHeaders);
      }

      // GET /api/players - Get all players
      if (path === '/api/players' && request.method === 'GET') {
        const players = await env.DB.prepare(
          'SELECT * FROM players ORDER BY total_goals DESC'
        ).all();
        
        // Get match history for each player
        for (let player of players.results) {
          const history = await env.DB.prepare(
            `SELECT mp.*, m.match_date 
             FROM match_performances mp 
             JOIN matches m ON mp.match_id = m.id 
             WHERE mp.player_id = ? 
             ORDER BY m.match_date DESC`
          ).bind(player.id).all();
          
          player.history = history.results.map(h => ({
            date: h.match_date,
            goals: h.goals,
            saves: h.saves,
            assists: h.assists
          }));
        }
        
        return jsonResponse(players.results, corsHeaders);
      }

      // POST /api/matches - Create new match
      if (path === '/api/matches' && request.method === 'POST') {
        const data = await request.json();
        const { date, players } = data;

        // Insert match
        const matchResult = await env.DB.prepare(
          'INSERT INTO matches (match_date) VALUES (?)'
        ).bind(date).run();

        const matchId = matchResult.meta.last_row_id;

        // Process each player
        for (let player of players) {
          // Check if player exists
          let playerRecord = await env.DB.prepare(
            'SELECT * FROM players WHERE name = ?'
          ).bind(player.name).first();

          if (!playerRecord) {
            // Create new player
            const playerResult = await env.DB.prepare(
              'INSERT INTO players (name, total_goals, total_saves, total_assists, matches_played) VALUES (?, ?, ?, ?, 1)'
            ).bind(player.name, player.goals, player.saves, player.assists).run();
            
            playerRecord = {
              id: playerResult.meta.last_row_id
            };
          } else {
            // Update existing player
            await env.DB.prepare(
              `UPDATE players 
               SET total_goals = total_goals + ?, 
                   total_saves = total_saves + ?, 
                   total_assists = total_assists + ?,
                   matches_played = matches_played + 1
               WHERE id = ?`
            ).bind(player.goals, player.saves, player.assists, playerRecord.id).run();
          }

          // Insert match performance
          await env.DB.prepare(
            'INSERT INTO match_performances (match_id, player_id, goals, saves, assists) VALUES (?, ?, ?, ?, ?)'
          ).bind(matchId, playerRecord.id, player.goals, player.saves, player.assists).run();
        }

        return jsonResponse({ success: true, matchId }, corsHeaders);
      }

      // DELETE /api/matches/:id - Delete a match
      if (path.startsWith('/api/matches/') && request.method === 'DELETE') {
        const matchId = path.split('/')[3];
        
        // Get match performances to update player stats
        const performances = await env.DB.prepare(
          'SELECT * FROM match_performances WHERE match_id = ?'
        ).bind(matchId).all();

        // Update player stats (subtract the match data)
        for (let perf of performances.results) {
          await env.DB.prepare(
            `UPDATE players 
             SET total_goals = total_goals - ?,
                 total_saves = total_saves - ?,
                 total_assists = total_assists - ?,
                 matches_played = matches_played - 1
             WHERE id = ?`
          ).bind(perf.goals, perf.saves, perf.assists, perf.player_id).run();
        }

        // Delete match performances
        await env.DB.prepare(
          'DELETE FROM match_performances WHERE match_id = ?'
        ).bind(matchId).run();

        // Delete the match
        await env.DB.prepare(
          'DELETE FROM matches WHERE id = ?'
        ).bind(matchId).run();

        return jsonResponse({ success: true, message: 'Match deleted' }, corsHeaders);
      }

      // DELETE /api/players/:id - Delete a player
      if (path.startsWith('/api/players/') && request.method === 'DELETE') {
        const playerId = path.split('/')[3];
        
        // Delete player's match performances
        await env.DB.prepare(
          'DELETE FROM match_performances WHERE player_id = ?'
        ).bind(playerId).run();

        // Delete the player
        await env.DB.prepare(
          'DELETE FROM players WHERE id = ?'
        ).bind(playerId).run();

        return jsonResponse({ success: true, message: 'Player deleted' }, corsHeaders);
      }

      // DELETE /api/reset - Reset all data (for testing)
      if (path === '/api/reset' && request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM match_performances').run();
        await env.DB.prepare('DELETE FROM matches').run();
        await env.DB.prepare('DELETE FROM players').run();
        return jsonResponse({ success: true, message: 'All data deleted' }, corsHeaders);
      }

      return jsonResponse({ error: 'Not found' }, corsHeaders, 404);

    } catch (error) {
      return jsonResponse({ error: error.message }, corsHeaders, 500);
    }
  },
};

function jsonResponse(data, headers = {}, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}
