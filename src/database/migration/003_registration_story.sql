ALTER TABLE registration_sessions MODIFY stage ENUM('story','audience','destination','danger','choice') NOT NULL DEFAULT 'story';
