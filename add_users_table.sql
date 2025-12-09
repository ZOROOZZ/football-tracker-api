-- Users table
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('admin', 'user')),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert default admin (password: admin123)
-- In production, change this immediately!
INSERT INTO users (username, password_hash, role) 
VALUES ('admin', '$2a$10$rJW8Z5L5F5YqhJ5xHJ5xHOz5xHJ5xHJ5xHJ5xHJ5xHJ5xHJ5xHJ5x', 'admin');

-- Insert default user (password: user123)
INSERT INTO users (username, password_hash, role) 
VALUES ('user', '$2a$10$rJW8Z5L5F5YqhJ5xHJ5xHOz5xHJ5xHJ5xHJ5xHJ5xHJ5xHJ5xHJ5x', 'user');
