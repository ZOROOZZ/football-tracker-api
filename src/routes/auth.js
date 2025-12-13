import { jsonResponse } from '../utils/response.js';
import { createToken } from '../utils/jwt.js';
import { hashPassword } from '../utils/password.js';

export async function handleLogin(request, env, JWT_SECRET) {
  const { username, password } = await request.json();
  
  const user = await env.DB.prepare(
    'SELECT * FROM users WHERE username = ?'
  ).bind(username).first();

  if (!user) {
    return jsonResponse({ error: 'Invalid credentials' }, {}, 401);
  }

  const passwordHash = await hashPassword(password);
  if (passwordHash !== user.password_hash) {
    return jsonResponse({ error: 'Invalid credentials' }, {}, 401);
  }

  const token = createToken(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET
  );

  return jsonResponse({
    token,
    user: { id: user.id, username: user.username, role: user.role }
  });
}

export async function handleRegister(request, env, authUser) {
  if (!authUser || authUser.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized' }, {}, 403);
  }

  const { username, password, role } = await request.json();
  const passwordHash = await hashPassword(password);

  try {
    await env.DB.prepare(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'
    ).bind(username, passwordHash, role || 'user').run();

    return jsonResponse({ success: true, message: 'User created' });
  } catch (error) {
    return jsonResponse({ error: 'Username already exists' }, {}, 400);
  }
}
