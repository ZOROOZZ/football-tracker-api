import { jsonResponse } from '../utils/response.js';
import { hashPassword } from '../utils/password.js';

export async function handleGetUsers(env, authUser) {
  if (!authUser || authUser.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized' }, {}, 403);
  }

  const users = await env.DB.prepare(
    'SELECT id, username, role, created_at FROM users ORDER BY created_at DESC'
  ).all();

  return jsonResponse(users.results || []);
}

export async function handleResetPassword(request, env, authUser, userId) {
  if (!authUser) {
    return jsonResponse({ error: 'Unauthorized' }, {}, 401);
  }

  if (authUser.role !== 'admin' && authUser.id !== userId) {
    return jsonResponse({ error: 'Unauthorized' }, {}, 403);
  }

  const { password } = await request.json();
  const passwordHash = await hashPassword(password);
  
  await env.DB.prepare(
    'UPDATE users SET password_hash = ? WHERE id = ?'
  ).bind(passwordHash, userId).run();

  return jsonResponse({ success: true, message: 'Password updated' });
}

export async function handleDeleteUser(env, authUser, userId) {
  if (!authUser || authUser.role !== 'admin') {
    return jsonResponse({ error: 'Unauthorized' }, {}, 403);
  }

  if (authUser.id === userId) {
    return jsonResponse({ error: 'Cannot delete your own account' }, {}, 400);
  }

  await env.DB.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
  return jsonResponse({ success: true, message: 'User deleted' });
}
