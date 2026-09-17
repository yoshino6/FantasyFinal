import type { Pool } from 'mysql2/promise';
export const initializeTravelRoutes = async(pool:Pool)=>{
  await pool.query(`CREATE TABLE IF NOT EXISTS player_travel_routes (
    character_id BIGINT UNSIGNED PRIMARY KEY, token VARCHAR(36) NOT NULL,
    state ENUM('pending','active') NOT NULL, plan_json JSON NOT NULL,
    expires_at DATETIME NOT NULL,
    FOREIGN KEY(character_id) REFERENCES characters(id) ON DELETE CASCADE
  ) ENGINE=InnoDB`);
};
