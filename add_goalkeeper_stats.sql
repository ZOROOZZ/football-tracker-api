-- Add goalkeeper-specific columns to match_performances
ALTER TABLE match_performances ADD COLUMN shots_faced INTEGER DEFAULT 0;
ALTER TABLE match_performances ADD COLUMN goals_conceded INTEGER DEFAULT 0;
ALTER TABLE match_performances ADD COLUMN penalties_faced INTEGER DEFAULT 0;
ALTER TABLE match_performances ADD COLUMN penalties_saved INTEGER DEFAULT 0;
ALTER TABLE match_performances ADD COLUMN yellow_cards INTEGER DEFAULT 0;
ALTER TABLE match_performances ADD COLUMN red_cards INTEGER DEFAULT 0;

-- Add goalkeeper stats to players table
ALTER TABLE players ADD COLUMN total_shots_faced INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN total_goals_conceded INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN clean_sheets INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN total_penalties_faced INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN total_penalties_saved INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN total_yellow_cards INTEGER DEFAULT 0;
ALTER TABLE players ADD COLUMN total_red_cards INTEGER DEFAULT 0;
