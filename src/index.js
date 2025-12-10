// Simple JWT implementation (no external dependencies)
function base64UrlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function createToken(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = base64UrlEncode(encodedHeader + '.' + encodedPayload + secret);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyToken(token, secret) {
  try {
    const [header, payload, signature] = token.split('.');
    const expectedSignature = base64UrlEncode(header + '.' + payload + secret);
    if (signature !== expectedSignature) return null;
    return JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

// Simple password hashing (in production, use bcrypt)
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const JWT_SECRET = 'your-secret-key-change-this-in-production';

    // Auth middleware
    function getAuthUser(request) {
      const authHeader = request.headers.get('Authorization');
      if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
      const token = authHeader.substring(7);
      return verifyToken(token, JWT_SECRET);
    }

    try {
      // POST /api/auth/login - Login
      if (path === '/api/auth/login' && request.method === 'POST') {
        const { username, password } = await request.json();
        
        const user = await env.DB.prepare(
          'SELECT * FROM users WHERE username = ?'
        ).bind(username).first();

        if (!user) {
          return jsonResponse({ error: 'Invalid credentials' }, corsHeaders, 401);
        }

        const passwordHash = await hashPassword(password);
        if (passwordHash !== user.password_hash) {
          return jsonResponse({ error: 'Invalid credentials' }, corsHeaders, 401);
        }

        const token = createToken(
          { id: user.id, username: user.username, role: user.role },
          JWT_SECRET
        );

        return jsonResponse({
          token,
          user: { id: user.id, username: user.username, role: user.role }
        }, corsHeaders);
      }

      // POST /api/auth/register - Register new user (admin only)
      if (path === '/api/auth/register' && request.method === 'POST') {
        const authUser = getAuthUser(request);
        if (!authUser || authUser.role !== 'admin') {
          return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 403);
        }

        const { username, password, role } = await request.json();
        const passwordHash = await hashPassword(password);

        try {
          await env.DB.prepare(
            'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'
          ).bind(username, passwordHash, role || 'user').run();

          return jsonResponse({ success: true, message: 'User created' }, corsHeaders);
        } catch (error) {
          return jsonResponse({ error: 'Username already exists' }, corsHeaders, 400);
        }
      }

      // GET /api/auth/me - Get current user
      if (path === '/api/auth/me' && request.method === 'GET') {
        const authUser = getAuthUser(request);
        if (!authUser) {
          return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);
        }
        return jsonResponse({ user: authUser }, corsHeaders);
      }

      // GET /api/matches - Get all matches (requires auth)
      if (path === '/api/matches' && request.method === 'GET') {
        const authUser = getAuthUser(request);
        if (!authUser) {
          return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);
        }

        const matches = await env.DB.prepare(
          'SELECT * FROM matches ORDER BY match_date DESC'
        ).all();
        return jsonResponse(matches.results, corsHeaders);
      }

      // GET /api/players - Get all players (requires auth)
      if (path === '/api/players' && request.method === 'GET') {
        const authUser = getAuthUser(request);
        if (!authUser) {
          return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);
        }

        const players = await env.DB.prepare(
          'SELECT * FROM players ORDER BY total_goals DESC'
        ).all();
        
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

      // POST /api/matches - Create match (admin only)
      if (path === '/api/matches' && request.method === 'POST') {
        const authUser = getAuthUser(request);
        if (!authUser || authUser.role !== 'admin') {
          return jsonResponse({ error: 'Unauthorized - Admin only' }, corsHeaders, 403);
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
              'INSERT INTO players (name, total_goals, total_saves, total_assists, matches_played) VALUES (?, ?, ?, ?, 1)'
            ).bind(player.name, player.goals, player.saves, player.assists).run();
            
            playerRecord = { id: playerResult.meta.last_row_id };
          } else {
            await env.DB.prepare(
              `UPDATE players 
               SET total_goals = total_goals + ?, 
                   total_saves = total_saves + ?, 
                   total_assists = total_assists + ?,
                   matches_played = matches_played + 1
               WHERE id = ?`
            ).bind(player.goals, player.saves, player.assists, playerRecord.id).run();
          }

          await env.DB.prepare(
            'INSERT INTO match_performances (match_id, player_id, goals, saves, assists) VALUES (?, ?, ?, ?, ?)'
          ).bind(matchId, playerRecord.id, player.goals, player.saves, player.assists).run();
        }

        return jsonResponse({ success: true, matchId }, corsHeaders);
      }

      // DELETE /api/matches/:id - Delete match (admin only)
      if (path.startsWith('/api/matches/') && request.method === 'DELETE') {
        const authUser = getAuthUser(request);
        if (!authUser || authUser.role !== 'admin') {
          return jsonResponse({ error: 'Unauthorized - Admin only' }, corsHeaders, 403);
        }

        const matchId = path.split('/')[3];
        
        const performances = await env.DB.prepare(
          'SELECT * FROM match_performances WHERE match_id = ?'
        ).bind(matchId).all();

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

        await env.DB.prepare(
          'DELETE FROM match_performances WHERE match_id = ?'
        ).bind(matchId).run();

        await env.DB.prepare(
          'DELETE FROM matches WHERE id = ?'
        ).bind(matchId).run();

        return jsonResponse({ success: true }, corsHeaders);
      }

      // DELETE /api/players/:id - Delete player (admin only)
      if (path.startsWith('/api/players/') && request.method === 'DELETE') {
        const authUser = getAuthUser(request);
        if (!authUser || authUser.role !== 'admin') {
          return jsonResponse({ error: 'Unauthorized - Admin only' }, corsHeaders, 403);
        }

        const playerId = path.split('/')[3];
        
        await env.DB.prepare(
          'DELETE FROM match_performances WHERE player_id = ?'
        ).bind(playerId).run();

        await env.DB.prepare(
          'DELETE FROM players WHERE id = ?'
        ).bind(playerId).run();

        return jsonResponse({ success: true }, corsHeaders);
      }

      // GET /api/users - Get all users (admin only)
      if (path === '/api/users' && request.method === 'GET') {
        const authUser = getAuthUser(request);
        if (!authUser || authUser.role !== 'admin') {
          return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 403);
        }
        const users = await env.DB.prepare(
          'SELECT id, username, role, created_at FROM users ORDER BY created_at DESC'
        ).all();
        return jsonResponse(users.results, corsHeaders);
      }
      
      // PUT /api/users/:id/password - Reset user password (admin or self)
      if (path.match(/^\/api\/users\/\d+\/password$/) && request.method === 'PUT') {
        const authUser = getAuthUser(request);
        if (!authUser) {
          return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 401);
        }
        const userId = parseInt(path.split('/')[3]);
        const { password } = await request.json();
        
        // Check if admin or updating own password
        if (authUser.role !== 'admin' && authUser.id !== userId) {
          return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 403);
        }
        
        const passwordHash = await hashPassword(password);
        await env.DB.prepare(
          'UPDATE users SET password_hash = ? WHERE id = ?'
        ).bind(passwordHash, userId).run();
        
        return jsonResponse({ success: true, message: 'Password updated' }, corsHeaders);
      }
      
      // DELETE /api/users/:id - Delete user (admin only, cannot delete self)
      if (path.match(/^\/api\/users\/\d+$/) && request.method === 'DELETE') {
        const authUser = getAuthUser(request);
        if (!authUser || authUser.role !== 'admin') {
          return jsonResponse({ error: 'Unauthorized' }, corsHeaders, 403);
        }
        
        const userId = parseInt(path.split('/')[3]);
        if (authUser.id === userId) {
          return jsonResponse({ error: 'Cannot delete your own account' }, corsHeaders, 400);
        }
        
        await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
        
        return jsonResponse({ success: true, message: 'User deleted' }, corsHeaders);
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
