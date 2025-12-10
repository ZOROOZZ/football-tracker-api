-- Delete old users with bcrypt hashes
DELETE FROM users;

-- Insert admin with SHA-256 hash for 'admin123'
INSERT INTO users (username, password_hash, role) 
VALUES ('admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'admin');

-- Insert user with SHA-256 hash for 'user123'
INSERT INTO users (username, password_hash, role) 
VALUES ('user', 'f5bb0c8de146c67b44babbf4e6584cc0dab1c476dcc3c3b4d25b2d20a0e7b5a9', 'user');
